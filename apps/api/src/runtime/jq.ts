/**
 * Interpretador jq (subconjunto amplo usado no jogo PROJECT_ABYSS).
 *
 * Suporta flags -r -c -s -e -n -f, filtros com pipes/vírgula, acesso a campos,
 * índices, iteração, objetos/arrays, operadores, builtins e interpolação \(...\).
 */
import {
  type CmdCtx,
  type ExecResult,
  err,
  parseArgs,
  toLines,
} from './shell-types.js';

type JValue = null | boolean | number | string | JValue[] | JObj;
type JObj = { [key: string]: JValue };

type StringPart = { k: 'text'; v: string } | { k: 'embed'; f: Filter };

type Filter =
  | { k: 'identity' }
  | { k: 'literal'; v: JValue }
  | { k: 'string'; parts: StringPart[] }
  | { k: 'postfix'; base: Filter; ops: PostfixOp[] }
  | { k: 'pipe'; l: Filter; r: Filter }
  | { k: 'comma'; l: Filter; r: Filter }
  | { k: 'object'; fields: ObjField[] }
  | { k: 'array'; items: Filter[] }
  | { k: 'binary'; op: string; l: Filter; r: Filter }
  | { k: 'unary'; op: string; e: Filter }
  | { k: 'call'; name: string; args: Filter[] };

type PostfixOp =
  | { k: 'field'; name: string }
  | { k: 'index'; idx: Filter }
  | { k: 'slice'; start?: Filter; end?: Filter }
  | { k: 'iter' };

type ObjField = { key: string | Filter; val: Filter };

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string; parts?: StringPart[] }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'dot' }
  | { t: 'eof' };

const KEYWORDS = new Set([
  'null',
  'true',
  'false',
  'and',
  'or',
  'not',
  'empty',
  'recurse',
  'paths',
  'env',
]);

const BUILTINS = new Set([
  'keys',
  'values',
  'length',
  'type',
  'select',
  'map',
  'has',
  'to_entries',
  'from_entries',
  'add',
  'sort',
  'sort_by',
  'group_by',
  'unique',
  'min',
  'max',
  'reverse',
  'join',
  'split',
  'tostring',
  'tonumber',
  'ascii_downcase',
  'ascii_upcase',
  'contains',
  'test',
  'startswith',
  'endswith',
  'first',
  'last',
  'any',
  'all',
  'flatten',
  'tojson',
  'fromjson',
]);

const OPS = ['//', '|', '==', '!=', '<=', '>=', 'and', 'or', '+', '-', '*', '/', '%', '<', '>', '(', ')', '[', ']', '{', '}', ':', ',', '.'];

// ---- JSON parsing ----

function isObj(v: JValue): v is JObj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseJsonValue(src: string, pos: number): { v: JValue; pos: number } | { error: string } {
  let i = pos;
  while (i < src.length && /\s/.test(src[i]!)) i += 1;
  if (i >= src.length) return { error: 'JSON inesperadamente terminou' };
  const ch = src[i]!;

  if (ch === 'n' && src.startsWith('null', i)) return { v: null, pos: i + 4 };
  if (ch === 't' && src.startsWith('true', i)) return { v: true, pos: i + 4 };
  if (ch === 'f' && src.startsWith('false', i)) return { v: false, pos: i + 5 };

  if (ch === '"') {
    let s = '';
    i += 1;
    while (i < src.length) {
      const c = src[i]!;
      if (c === '"') return { v: s, pos: i + 1 };
      if (c === '\\') {
        const n = src[i + 1];
        if (n === undefined) return { error: 'string JSON inválida' };
        if (n === 'n') s += '\n';
        else if (n === 'r') s += '\r';
        else if (n === 't') s += '\t';
        else if (n === 'b') s += '\b';
        else if (n === 'f') s += '\f';
        else if (n === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (!/^[\da-fA-F]{4}$/.test(hex)) return { error: 'escape unicode inválido' };
          s += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        } else s += n;
        i += 2;
        continue;
      }
      s += c;
      i += 1;
    }
    return { error: 'string JSON não terminada' };
  }

  if (ch === '[') {
    const arr: JValue[] = [];
    i += 1;
    while (i < src.length && /\s/.test(src[i]!)) i += 1;
    if (src[i] === ']') return { v: arr, pos: i + 1 };
    for (;;) {
      const el = parseJsonValue(src, i);
      if ('error' in el) return el;
      arr.push(el.v);
      i = el.pos;
      while (i < src.length && /\s/.test(src[i]!)) i += 1;
      if (src[i] === ']') return { v: arr, pos: i + 1 };
      if (src[i] !== ',') return { error: 'array JSON inválido' };
      i += 1;
    }
  }

  if (ch === '{') {
    const obj: JObj = {};
    i += 1;
    while (i < src.length && /\s/.test(src[i]!)) i += 1;
    if (src[i] === '}') return { v: obj, pos: i + 1 };
    for (;;) {
      while (i < src.length && /\s/.test(src[i]!)) i += 1;
      if (src[i] !== '"') return { error: 'chave de objeto JSON inválida' };
      const keyRes = parseJsonValue(src, i);
      if ('error' in keyRes || typeof keyRes.v !== 'string') return { error: 'chave de objeto JSON inválida' };
      i = keyRes.pos;
      while (i < src.length && /\s/.test(src[i]!)) i += 1;
      if (src[i] !== ':') return { error: 'objeto JSON inválido' };
      i += 1;
      const valRes = parseJsonValue(src, i);
      if ('error' in valRes) return valRes;
      obj[keyRes.v] = valRes.v;
      i = valRes.pos;
      while (i < src.length && /\s/.test(src[i]!)) i += 1;
      if (src[i] === '}') return { v: obj, pos: i + 1 };
      if (src[i] !== ',') return { error: 'objeto JSON inválido' };
      i += 1;
    }
  }

  if (ch === '-' || /\d/.test(ch)) {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (!m) return { error: 'número JSON inválido' };
    return { v: Number(m[0]), pos: i + m[0].length };
  }

  return { error: `JSON inválido em '${ch}'` };
}

function parseJsonStream(text: string): JValue[] | { error: string } {
  const values: JValue[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i += 1;
    if (i >= text.length) break;
    const res = parseJsonValue(text, i);
    if ('error' in res) return res;
    values.push(res.v);
    i = res.pos;
  }
  return values;
}

function jsonType(v: JValue): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function deepEqual(a: JValue, b: JValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number' || typeof a === 'string' || typeof a === 'boolean') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]!));
  }
  if (isObj(a) && isObj(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(a[k]!, b[k]!));
  }
  return false;
}

function stringifyJson(v: JValue, compact: boolean): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'null';
    return Number.isInteger(v) ? String(v) : String(v);
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    const inner = v.map((x) => stringifyJson(x, compact));
    return compact ? `[${inner.join(',')}]` : `[${inner.map((s) => (compact ? s : '\n  ' + s)).join(',')}]\n`;
  }
  const keys = Object.keys(v);
  if (compact) {
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyJson(v[k]!, true)}`).join(',')}}`;
  }
  if (keys.length === 0) return '{}';
  return `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${stringifyJson(v[k]!, false)}`).join(',\n')}\n}`;
}

function formatOutput(v: JValue, raw: boolean, _compact: boolean): string {
  if (raw && typeof v === 'string') return v;
  return stringifyJson(v, true);
}

function isFalse(v: JValue): boolean {
  return v === false || v === null;
}

function truthy(v: JValue): boolean {
  return v !== false && v !== null;
}

function toNumber(v: JValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (v === true) return 1;
  if (v === false || v === null) return 0;
  return NaN;
}

function compareValues(a: JValue, b: JValue): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

// ---- Lexer ----

function lexFilter(src: string): Tok[] | { error: string } {
  const toks: Tok[] = [];
  let i = 0;

  const readString = (quote: '"' | "'"): { tok: Tok; pos: number } | { error: string } => {
    const start = i + 1;
    i += 1;
    const parts: StringPart[] = [];
    let text = '';
    const flush = () => {
      if (text) {
        parts.push({ k: 'text', v: text });
        text = '';
      }
    };

    while (i < src.length) {
      const c = src[i]!;
      if (c === quote) {
        flush();
        i += 1;
        if (parts.length === 1 && parts[0]!.k === 'text') {
          return { tok: { t: 'str', v: parts[0]!.v }, pos: i };
        }
        return { tok: { t: 'str', v: parts.map((p) => (p.k === 'text' ? p.v : '')).join(''), parts }, pos: i };
      }
      if (c === '\\') {
        const n = src[i + 1];
        if (n === '(') {
          flush();
          i += 2;
          let depth = 1;
          const startExpr = i;
          while (i < src.length && depth > 0) {
            if (src[i] === '(') depth += 1;
            else if (src[i] === ')') depth -= 1;
            if (depth > 0) i += 1;
          }
          if (depth > 0) return { error: 'interpolação \\(...) não terminada' };
          const exprSrc = src.slice(startExpr, i);
          i += 1;
          const exprToks = lexFilter(exprSrc);
          if ('error' in exprToks) return exprToks;
          const parser = new Parser(exprToks);
          try {
            const f = parser.parseExpr();
            if (!parser.atEnd()) return { error: 'expressão extra em interpolação' };
            parts.push({ k: 'embed', f });
          } catch (e) {
            return { error: (e as Error).message };
          }
          continue;
        }
        if (n === quote || n === '\\') {
          text += n;
          i += 2;
          continue;
        }
        if (n === 'n') {
          text += '\n';
          i += 2;
          continue;
        }
        if (n === 't') {
          text += '\t';
          i += 2;
          continue;
        }
        if (n === 'r') {
          text += '\r';
          i += 2;
          continue;
        }
        text += n ?? '';
        i += 2;
        continue;
      }
      text += c;
      i += 1;
    }
    return { error: 'string não terminada' };
  };

  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i += 1;
      continue;
    }
    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '.') {
      if (/\d/.test(src[i + 1] ?? '')) {
        const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
        if (m) {
          toks.push({ t: 'num', v: Number(m[0]) });
          i += m[0].length;
          continue;
        }
      }
      toks.push({ t: 'dot' });
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const s = readString(ch);
      if ('error' in s) return s;
      toks.push(s.tok);
      i = s.pos;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(i))!;
      const word = m[0];
      if (KEYWORDS.has(word) || BUILTINS.has(word)) toks.push({ t: 'ident', v: word });
      else toks.push({ t: 'ident', v: word });
      i += m[0].length;
      continue;
    }

    if (/[\d-]/.test(ch)) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (m) {
        toks.push({ t: 'num', v: Number(m[0]) });
        i += m[0].length;
        continue;
      }
    }

    let matched = false;
    for (const op of OPS.sort((a, b) => b.length - a.length)) {
      if (src.startsWith(op, i)) {
        toks.push({ t: 'op', v: op });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    return { error: `caractere inesperado '${ch}'` };
  }

  toks.push({ t: 'eof' });
  return toks;
}

// ---- Parser ----

class Parser {
  private pos = 0;

  constructor(private toks: Tok[]) {}

  atEnd(): boolean {
    return this.cur().t === 'eof';
  }

  private cur(): Tok {
    return this.toks[this.pos] ?? { t: 'eof' };
  }

  private peek(n = 1): Tok {
    return this.toks[this.pos + n] ?? { t: 'eof' };
  }

  private isDot(): boolean {
    const t = this.cur();
    return t.t === 'dot' || (t.t === 'op' && t.v === '.');
  }

  private eatDot(): void {
    if (!this.isDot()) {
      throw new Error(`esperado '.', encontrado '${this.cur().t}'`);
    }
    this.pos += 1;
  }

  private eat(expected?: string): Tok {
    const t = this.cur();
    if (expected && (t.t !== 'op' || t.v !== expected)) {
      throw new Error(`esperado '${expected}', encontrado '${t.t === 'ident' ? t.v : t.t === 'op' ? t.v : t.t}'`);
    }
    this.pos += 1;
    return t;
  }

  parseExpr(): Filter {
    return this.parseComma();
  }

  private parseComma(): Filter {
    let left = this.parsePipe();
    while (this.cur().t === 'op' && this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ',') {
      this.eat(',');
      left = { k: 'comma', l: left, r: this.parsePipe() };
    }
    return left;
  }

  private parsePipe(): Filter {
    let left = this.parseAlt();
    while (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '|') {
      this.eat('|');
      left = { k: 'pipe', l: left, r: this.parseAlt() };
    }
    return left;
  }

  private parseAlt(): Filter {
    let left = this.parseOr();
    while (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '//') {
      this.eat('//');
      left = { k: 'binary', op: '//', l: left, r: this.parseOr() };
    }
    return left;
  }

  private parseOr(): Filter {
    let left = this.parseAnd();
    while (this.cur().t === 'ident' && (this.cur() as { t: 'ident'; v: string }).v === 'or') {
      this.pos += 1;
      left = { k: 'binary', op: 'or', l: left, r: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Filter {
    let left = this.parseCompare();
    while (this.cur().t === 'ident' && (this.cur() as { t: 'ident'; v: string }).v === 'and') {
      this.pos += 1;
      left = { k: 'binary', op: 'and', l: left, r: this.parseCompare() };
    }
    return left;
  }

  private parseCompare(): Filter {
    let left = this.parseAdd();
    for (;;) {
      const c = this.cur();
      if (c.t !== 'op') break;
      if (!['==', '!=', '<', '>', '<=', '>='].includes(c.v)) break;
      this.pos += 1;
      left = { k: 'binary', op: c.v, l: left, r: this.parseAdd() };
    }
    return left;
  }

  private parseAdd(): Filter {
    let left = this.parseMul();
    for (;;) {
      const c = this.cur();
      if (c.t !== 'op' || (c.v !== '+' && c.v !== '-')) break;
      this.pos += 1;
      left = { k: 'binary', op: c.v, l: left, r: this.parseMul() };
    }
    return left;
  }

  private parseMul(): Filter {
    let left = this.parseUnary();
    for (;;) {
      const c = this.cur();
      if (c.t !== 'op' || !['*', '/', '%'].includes(c.v)) break;
      this.pos += 1;
      left = { k: 'binary', op: c.v, l: left, r: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Filter {
    if (this.cur().t === 'ident' && (this.cur() as { t: 'ident'; v: string }).v === 'not') {
      this.pos += 1;
      return { k: 'unary', op: 'not', e: this.parseUnary() };
    }
    if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '-') {
      this.pos += 1;
      return { k: 'unary', op: '-', e: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Filter {
    let base = this.parsePrimary();
    const ops: PostfixOp[] = [];

    for (;;) {
      if (this.isDot()) {
        this.eatDot();
        if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '[') {
          this.eat('[');
          if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']') {
            this.eat(']');
            ops.push({ k: 'iter' });
            continue;
          }
          const first = this.parseExpr();
          if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ':') {
            this.eat(':');
            const end = this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']' ? undefined : this.parseExpr();
            this.eat(']');
            ops.push({ k: 'slice', start: first, end });
            continue;
          }
          this.eat(']');
          ops.push({ k: 'index', idx: first });
          continue;
        }
        if (this.cur().t === 'ident') {
          ops.push({ k: 'field', name: (this.cur() as { t: 'ident'; v: string }).v });
          this.pos += 1;
          continue;
        }
        if (this.cur().t === 'str') {
          ops.push({ k: 'field', name: (this.cur() as { t: 'str'; v: string }).v });
          this.pos += 1;
          continue;
        }
        throw new Error('esperado campo ou índice após .');
      }

      if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '[') {
        this.eat('[');
        if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']') {
          this.eat(']');
          ops.push({ k: 'iter' });
          continue;
        }
        const first = this.parseExpr();
        if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ':') {
          this.eat(':');
          const end = this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']' ? undefined : this.parseExpr();
          this.eat(']');
          ops.push({ k: 'slice', start: first, end });
          continue;
        }
        this.eat(']');
        ops.push({ k: 'index', idx: first });
        continue;
      }
      break;
    }

    if (ops.length) return { k: 'postfix', base, ops };
    return base;
  }

  private parsePrimary(): Filter {
    const t = this.cur();

    if (this.isDot()) {
      this.eatDot();
      if (this.cur().t === 'ident') {
        const name = (this.cur() as { t: 'ident'; v: string }).v;
        this.pos += 1;
        return { k: 'postfix', base: { k: 'identity' }, ops: [{ k: 'field', name }] };
      }
      if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '[') {
        const base: Filter = { k: 'identity' };
        this.pos -= 1;
        return this.parsePostfixFrom(base);
      }
      return { k: 'identity' };
    }

    if (t.t === 'num') {
      this.pos += 1;
      return { k: 'literal', v: t.v };
    }

    if (t.t === 'str') {
      this.pos += 1;
      if (t.parts && t.parts.length) return { k: 'string', parts: t.parts };
      return { k: 'literal', v: t.v };
    }

    if (t.t === 'ident') {
      const name = t.v;
      this.pos += 1;
      if (name === 'null') return { k: 'literal', v: null };
      if (name === 'true') return { k: 'literal', v: true };
      if (name === 'false') return { k: 'literal', v: false };
      if (name === 'empty') return { k: 'call', name: 'empty', args: [] };
      if (name === 'recurse') return { k: 'call', name: 'recurse', args: [] };
      if (name === 'paths') return { k: 'call', name: 'paths', args: [] };

      const args: Filter[] = [];
      if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '(') {
        this.eat('(');
        if (!(this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ')')) {
          args.push(this.parseExpr());
          while (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ',') {
            this.eat(',');
            args.push(this.parseExpr());
          }
        }
        this.eat(')');
      }
      return { k: 'call', name, args };
    }

    if (t.t === 'op' && t.v === '(') {
      this.eat('(');
      const e = this.parseExpr();
      this.eat(')');
      return this.parsePostfixFrom(e);
    }

    if (t.t === 'op' && t.v === '{') {
      return this.parseObject();
    }

    if (t.t === 'op' && t.v === '[') {
      return this.parseArray();
    }

    throw new Error(`token inesperado '${JSON.stringify(t)}'`);
  }

  private parsePostfixFrom(base: Filter): Filter {
    this.pos -= 1;
    this.pos += 1;
    const ops: PostfixOp[] = [];
    for (;;) {
      if (this.isDot()) {
        this.eatDot();
        if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '[') {
          this.eat('[');
          if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']') {
            this.eat(']');
            ops.push({ k: 'iter' });
            continue;
          }
          const first = this.parseExpr();
          if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ':') {
            this.eat(':');
            const end = this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']' ? undefined : this.parseExpr();
            this.eat(']');
            ops.push({ k: 'slice', start: first, end });
            continue;
          }
          this.eat(']');
          ops.push({ k: 'index', idx: first });
          continue;
        }
        if (this.cur().t === 'ident') {
          ops.push({ k: 'field', name: (this.cur() as { t: 'ident'; v: string }).v });
          this.pos += 1;
          continue;
        }
        if (this.cur().t === 'str') {
          ops.push({ k: 'field', name: (this.cur() as { t: 'str'; v: string }).v });
          this.pos += 1;
          continue;
        }
        throw new Error('esperado campo ou índice após .');
      }
      if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '[') {
        this.eat('[');
        if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']') {
          this.eat(']');
          ops.push({ k: 'iter' });
          continue;
        }
        const first = this.parseExpr();
        if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ':') {
          this.eat(':');
          const end = this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']' ? undefined : this.parseExpr();
          this.eat(']');
          ops.push({ k: 'slice', start: first, end });
          continue;
        }
        this.eat(']');
        ops.push({ k: 'index', idx: first });
        continue;
      }
      break;
    }
    return ops.length ? { k: 'postfix', base, ops } : base;
  }

  private parseObject(): Filter {
    this.eat('{');
    const fields: ObjField[] = [];
    while (!(this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '}')) {
      let key: string | Filter;
      if (this.cur().t === 'ident') {
        const name = (this.cur() as { t: 'ident'; v: string }).v;
        if (this.peek().t === 'op' && (this.peek() as { t: 'op'; v: string }).v === ':') {
          key = name;
          this.pos += 1;
        } else {
          key = name;
        }
      } else if (this.cur().t === 'str') {
        key = (this.cur() as { t: 'str'; v: string }).v;
        this.pos += 1;
      } else if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '(') {
        this.eat('(');
        key = this.parseExpr();
        this.eat(')');
      } else {
        throw new Error('chave de objeto inválida');
      }
      this.eat(':');
      fields.push({ key, val: this.parsePipe() });
      if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ',') {
        this.eat(',');
        if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === '}') break;
      } else break;
    }
    this.eat('}');
    return { k: 'object', fields };
  }

  private parseArray(): Filter {
    this.eat('[');
    const items: Filter[] = [];
    if (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ']') {
      this.eat(']');
      return { k: 'array', items };
    }
    items.push(this.parsePipe());
    while (this.cur().t === 'op' && (this.cur() as { t: 'op'; v: string }).v === ',') {
      this.eat(',');
      items.push(this.parsePipe());
    }
    this.eat(']');
    return { k: 'array', items };
  }
}

// ---- Evaluator ----

type Env = { shellEnv: Record<string, string> };

function applyPostfix(input: JValue, ops: PostfixOp[], evalF: (f: Filter, v: JValue) => JValue[]): JValue[] {
  let stream = [input];
  for (const op of ops) {
    const next: JValue[] = [];
    for (const v of stream) {
      switch (op.k) {
        case 'field': {
          if (isObj(v)) next.push(v[op.name] ?? null);
          else next.push(null);
          break;
        }
        case 'index': {
          const idxVals = evalF(op.idx, v);
          for (const idxV of idxVals) {
            if (Array.isArray(v) && typeof idxV === 'number') next.push(v[idxV] ?? null);
            else if (isObj(v) && typeof idxV === 'string') next.push(v[idxV] ?? null);
            else if (Array.isArray(v) && typeof idxV === 'string') {
              const n = Number(idxV);
              next.push(Number.isInteger(n) ? (v[n] ?? null) : null);
            } else next.push(null);
          }
          break;
        }
        case 'slice': {
          if (!Array.isArray(v)) break;
          const startVals = op.start ? evalF(op.start, v) : [0];
          const endVals = op.end ? evalF(op.end, v) : [v.length];
          for (const s of startVals.length ? startVals : [0]) {
            for (const e of endVals.length ? endVals : [v.length]) {
              const si = Math.trunc(toNumber(s));
              const ei = Math.trunc(toNumber(e));
              next.push(v.slice(si, ei));
            }
          }
          break;
        }
        case 'iter': {
          if (Array.isArray(v)) next.push(...v);
          else if (isObj(v)) next.push(...Object.values(v));
          break;
        }
      }
    }
    stream = next;
  }
  return stream;
}

function evalFilter(filter: Filter, input: JValue, env: Env): JValue[] {
  const ev = (f: Filter, v: JValue) => evalFilter(f, v, env);

  switch (filter.k) {
    case 'identity':
      return [input];
    case 'literal':
      return [filter.v];
    case 'string': {
      let s = '';
      for (const p of filter.parts) {
        if (p.k === 'text') s += p.v;
        else {
          const parts = ev(p.f, input);
          for (const x of parts) {
            if (typeof x === 'string') s += x;
            else if (typeof x === 'number' || typeof x === 'boolean' || x === null) s += String(x);
            else s += stringifyJson(x, true);
          }
        }
      }
      return [s];
    }
    case 'postfix': {
      const bases = ev(filter.base, input);
      const out: JValue[] = [];
      for (const b of bases) out.push(...applyPostfix(b, filter.ops, ev));
      return out;
    }
    case 'pipe': {
      const left = ev(filter.l, input);
      const out: JValue[] = [];
      for (const v of left) out.push(...ev(filter.r, v));
      return out;
    }
    case 'comma': {
      return [...ev(filter.l, input), ...ev(filter.r, input)];
    }
    case 'object': {
      const obj: JObj = {};
      for (const field of filter.fields) {
        let key: string;
        if (typeof field.key === 'string') key = field.key;
        else {
          const ks = ev(field.key, input);
          key = ks.length ? String(ks[0]) : '';
        }
        const vals = ev(field.val, input);
        obj[key] = vals.length ? vals[0]! : null;
      }
      return [obj];
    }
    case 'array': {
      const arr: JValue[] = [];
      for (const item of filter.items) {
        const vals = ev(item, input);
        arr.push(vals.length ? vals[0]! : null);
      }
      return [arr];
    }
    case 'unary': {
      const vals = ev(filter.e, input);
      const out: JValue[] = [];
      for (const v of vals) {
        if (filter.op === 'not') out.push(!truthy(v));
        else if (filter.op === '-') out.push(-toNumber(v));
      }
      return out;
    }
    case 'binary': {
      const lefts = ev(filter.l, input);
      const out: JValue[] = [];
      for (const l of lefts) {
        const rights = ev(filter.r, l);
        for (const r of rights) {
          switch (filter.op) {
            case '//':
              if (l === null || l === false) out.push(r);
              else out.push(l);
              break;
            case 'or':
              out.push(truthy(l) || truthy(r));
              break;
            case 'and':
              out.push(truthy(l) && truthy(r));
              break;
            case '==':
              out.push(deepEqual(l, r));
              break;
            case '!=':
              out.push(!deepEqual(l, r));
              break;
            case '+':
              if (typeof l === 'string' || typeof r === 'string') out.push(String(l ?? '') + String(r ?? ''));
              else if (Array.isArray(l) && Array.isArray(r)) out.push([...l, ...r]);
              else out.push(toNumber(l) + toNumber(r));
              break;
            case '-':
              out.push(toNumber(l) - toNumber(r));
              break;
            case '*':
              out.push(toNumber(l) * toNumber(r));
              break;
            case '/':
              out.push(toNumber(l) / toNumber(r));
              break;
            case '%':
              out.push(toNumber(l) % toNumber(r));
              break;
            case '<':
            case '>':
            case '<=':
            case '>=': {
              const c = compareValues(l, r);
              if (c === null) out.push(false);
              else if (filter.op === '<') out.push(c < 0);
              else if (filter.op === '>') out.push(c > 0);
              else if (filter.op === '<=') out.push(c <= 0);
              else out.push(c >= 0);
              break;
            }
          }
        }
      }
      return out;
    }
    case 'call':
      return evalBuiltin(filter.name, filter.args, input, ev, env);
    default:
      return [input];
  }
}

function evalBuiltin(
  name: string,
  args: Filter[],
  input: JValue,
  ev: (f: Filter, v: JValue) => JValue[],
  env: Env,
): JValue[] {
  switch (name) {
    case 'empty':
      return [];
    case 'keys': {
      if (!isObj(input)) return [[]];
      return [Object.keys(input).sort()];
    }
    case 'values': {
      if (!isObj(input)) return [[]];
      return [Object.keys(input).sort().map((k) => input[k]!)];
    }
    case 'length': {
      if (typeof input === 'string' || Array.isArray(input)) return [input.length];
      if (isObj(input)) return [Object.keys(input).length];
      return [0];
    }
    case 'type':
      return [jsonType(input)];
    case 'select': {
      const f = args[0];
      if (!f) return [input];
      const res = ev(f, input);
      return res.some(truthy) ? [input] : [];
    }
    case 'map': {
      const f = args[0];
      if (!f || !Array.isArray(input)) return [input];
      const out: JValue[] = [];
      for (const el of input) out.push(...ev(f, el));
      return [out];
    }
    case 'has': {
      const f = args[0];
      if (!f) return [false];
      const ks = ev(f, input);
      const key = ks[0];
      if (typeof key !== 'string' || !isObj(input)) return [false];
      return [Object.prototype.hasOwnProperty.call(input, key)];
    }
    case 'to_entries': {
      if (!isObj(input)) return [[]];
      return [Object.keys(input).sort().map((k) => ({ key: k, value: input[k]! }))];
    }
    case 'from_entries': {
      if (!Array.isArray(input)) return [null];
      const obj: JObj = {};
      for (const item of input) {
        if (isObj(item) && typeof item.key === 'string') obj[item.key] = item.value ?? null;
      }
      return [obj];
    }
    case 'add': {
      if (Array.isArray(input)) {
        if (input.every((x) => typeof x === 'number')) return [input.reduce((a, b) => a + (b as number), 0)];
        if (input.every((x) => typeof x === 'string')) return [input.join('')];
        return [input.flat()];
      }
      if (typeof input === 'number') return [input];
      return [input];
    }
    case 'sort': {
      if (!Array.isArray(input)) return [input];
      const copy = [...input];
      copy.sort((a, b) => {
        const c = compareValues(a, b);
        if (c !== null) return c;
        return String(a).localeCompare(String(b));
      });
      return [copy];
    }
    case 'sort_by': {
      const f = args[0];
      if (!f || !Array.isArray(input)) return [input];
      const keyed = input.map((x) => ({ x, k: ev(f, x)[0] ?? null }));
      keyed.sort((a, b) => {
        const c = compareValues(a.k, b.k);
        if (c !== null) return c;
        return 0;
      });
      return [keyed.map((e) => e.x)];
    }
    case 'group_by': {
      const f = args[0];
      if (!f || !Array.isArray(input)) return [[]];
      const groups = new Map<string, JValue[]>();
      for (const item of input) {
        const k = ev(f, item)[0];
        const key = typeof k === 'string' ? k : stringifyJson(k ?? null, true);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }
      return [Array.from(groups.values())];
    }
    case 'unique': {
      if (!Array.isArray(input)) return [input];
      const out: JValue[] = [];
      for (const v of input) {
        if (!out.some((x) => deepEqual(x, v))) out.push(v);
      }
      return [out];
    }
    case 'min': {
      if (!Array.isArray(input) || input.length === 0) return [null];
      let best: JValue = input[0]!;
      for (const v of input.slice(1)) {
        const c = compareValues(v, best);
        if (c !== null && c < 0) best = v;
      }
      return [best];
    }
    case 'max': {
      if (!Array.isArray(input) || input.length === 0) return [null];
      let best: JValue = input[0]!;
      for (const v of input.slice(1)) {
        const c = compareValues(v, best);
        if (c !== null && c > 0) best = v;
      }
      return [best];
    }
    case 'reverse': {
      if (typeof input === 'string') return [input.split('').reverse().join('')];
      if (Array.isArray(input)) return [[...input].reverse()];
      return [input];
    }
    case 'join': {
      const sepF = args[0];
      const sep = sepF ? (ev(sepF, input)[0] ?? '') : '';
      if (!Array.isArray(input)) return [String(input)];
      return [input.map((x) => (typeof x === 'string' ? x : stringifyJson(x, true))).join(String(sep))];
    }
    case 'split': {
      const sepF = args[0];
      if (!sepF || typeof input !== 'string') return [input];
      const sep = ev(sepF, input)[0];
      return [input.split(typeof sep === 'string' ? sep : String(sep ?? ''))];
    }
    case 'tostring':
      if (typeof input === 'string') return [input];
      return [stringifyJson(input, true)];
    case 'tonumber': {
      if (typeof input === 'number') return [input];
      if (typeof input === 'string') {
        const n = Number(input);
        return [Number.isFinite(n) ? n : null];
      }
      return [null];
    }
    case 'ascii_downcase':
      return [typeof input === 'string' ? input.toLowerCase() : input];
    case 'ascii_upcase':
      return [typeof input === 'string' ? input.toUpperCase() : input];
    case 'contains': {
      const f = args[0];
      if (!f) return [false];
      const needle = ev(f, input)[0];
      if (typeof input === 'string' && typeof needle === 'string') return [input.includes(needle)];
      if (Array.isArray(input)) return [input.some((x) => deepEqual(x, needle ?? null))];
      return [false];
    }
    case 'test': {
      const f = args[0];
      if (!f || typeof input !== 'string') return [false];
      const pat = ev(f, input)[0];
      if (typeof pat !== 'string') return [false];
      try {
        return [new RegExp(pat).test(input)];
      } catch {
        return [false];
      }
    }
    case 'startswith': {
      const f = args[0];
      if (!f || typeof input !== 'string') return [false];
      const pre = ev(f, input)[0];
      return [typeof pre === 'string' ? input.startsWith(pre) : false];
    }
    case 'endswith': {
      const f = args[0];
      if (!f || typeof input !== 'string') return [false];
      const suf = ev(f, input)[0];
      return [typeof suf === 'string' ? input.endsWith(suf) : false];
    }
    case 'first': {
      if (Array.isArray(input)) return input.length ? [input[0]!] : [];
      return [input];
    }
    case 'last': {
      if (Array.isArray(input)) return input.length ? [input[input.length - 1]!] : [];
      return [input];
    }
    case 'any': {
      const f = args[0];
      if (!f || !Array.isArray(input)) return [false];
      return [input.some((x) => ev(f, x).some(truthy))];
    }
    case 'all': {
      const f = args[0];
      if (!f || !Array.isArray(input)) return [true];
      return [input.every((x) => ev(f, x).some(truthy))];
    }
    case 'flatten': {
      const depthArg = args[0] ? ev(args[0], input)[0] : -1;
      const depth = typeof depthArg === 'number' ? depthArg : -1;
      const flat = (arr: JValue[], d: number): JValue[] => {
        if (!Array.isArray(arr)) return [arr];
        if (d === 0) return [arr];
        const out: JValue[] = [];
        for (const v of arr) {
          if (Array.isArray(v) && d !== 0) out.push(...flat(v, d < 0 ? -1 : d - 1));
          else out.push(v);
        }
        return out;
      };
      if (!Array.isArray(input)) return [input];
      return [flat(input, depth)];
    }
    case 'recurse': {
      const f: Filter = args[0] ?? { k: 'postfix', base: { k: 'identity' }, ops: [{ k: 'iter' }] };
      const out: JValue[] = [];
      const seen = new Set<JValue>();
      const walk = (v: JValue) => {
        if (seen.has(v)) return;
        if (typeof v === 'object' && v !== null) seen.add(v);
        out.push(v);
        for (const x of ev(f, v)) walk(x);
      };
      walk(input);
      return out;
    }
    case 'paths': {
      const out: JValue[] = [];
      const walk = (v: JValue, path: JValue[]) => {
        out.push(path);
        if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i]));
        else if (isObj(v)) Object.keys(v).sort().forEach((k) => walk(v[k]!, [...path, k]));
      };
      walk(input, []);
      return out;
    }
    case 'tojson':
      return [stringifyJson(input, true)];
    case 'fromjson': {
      if (typeof input !== 'string') return [input];
      try {
        const parsed = parseJsonStream(input);
        if ('error' in parsed) return [null];
        return parsed.length ? [parsed[0]!] : [null];
      } catch {
        return [null];
      }
    }
    case 'env': {
      const f = args[0];
      if (!f) return [null];
      const key = ev(f, input)[0];
      if (typeof key !== 'string') return [null];
      return [env.shellEnv[key] ?? null];
    }
    default:
      return [input];
  }
}

// ---- CLI ----

function loadInputs(
  sh: CmdCtx['sh'],
  stdin: string,
  files: string[],
  slurp: boolean,
  nullInput: boolean,
): JValue[] | { error: string } {
  if (nullInput) return [null];

  const chunks: string[] = [];
  if (stdin) chunks.push(stdin);
  for (const f of files) {
    const p = sh.resolve(f);
    const c = sh.read(p);
    if (c == null) return { error: `jq: erro: Could not open file ${f}: No such file or directory` };
    sh.touchRead(p);
    chunks.push(c);
  }

  if (chunks.length === 0) return [null];

  const all: JValue[] = [];
  for (const text of chunks) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const parsed = parseJsonStream(text);
    if ('error' in parsed) {
      // fallback: uma linha = um JSON
      for (const line of toLines(text)) {
        if (!line.trim()) continue;
        try {
          all.push(JSON.parse(line) as JValue);
        } catch {
          return { error: `jq: parse error: ${parsed.error}` };
        }
      }
      continue;
    }
    all.push(...parsed);
  }

  if (slurp) return [all];
  return all.length ? all : [null];
}

export function runJq(ctx: CmdCtx): ExecResult {
  const { args, sh, stdin } = ctx;
  const { flags, values, operands } = parseArgs(args, { withValue: ['f'] });

  const raw = flags.has('r');
  const compact = flags.has('c');
  const slurp = flags.has('s');
  const exitFalse = flags.has('e');
  const nullInput = flags.has('n');

  let filterSrc: string | null = null;
  if (values['f']) {
    const p = sh.resolve(values['f']);
    const c = sh.read(p);
    if (c == null) return err(`jq: error: Could not open ${values['f']}: No such file or directory`, 2);
    sh.touchRead(p);
    filterSrc = c.trim();
  }

  const fileOperands = values['f'] ? operands : operands.slice(1);
  if (!filterSrc) {
    if (operands.length === 0) return err('jq: uso: jq [-r] [-c] [-s] [-e] [-n] [-f arquivo] \'filtro\' [arquivo...]', 2);
    filterSrc = operands[0]!;
  }

  const toks = lexFilter(filterSrc);
  if ('error' in toks) return err(`jq: error: ${toks.error}`, 3);

  let filter: Filter;
  try {
    const parser = new Parser(toks);
    filter = parser.parseExpr();
    if (!parser.atEnd()) throw new Error('tokens extras após expressão');
  } catch (e) {
    return err(`jq: error: ${(e as Error).message}`, 3);
  }

  const inputs = loadInputs(sh, stdin, fileOperands, slurp, nullInput);
  if ('error' in inputs) return err(inputs.error, 2);

  const env: Env = { shellEnv: sh.env };
  const lines: string[] = [];

  for (const input of inputs) {
    const results = evalFilter(filter, input, env);
    for (const r of results) {
      lines.push(formatOutput(r, raw, compact));
    }
  }

  if (exitFalse && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    if (last === 'false' || last === 'null') {
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 1 };
    }
  }

  return {
    stdout: lines.length ? lines.join('\n') + '\n' : '',
    stderr: '',
    code: 0,
  };
}
