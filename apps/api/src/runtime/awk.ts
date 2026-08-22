/**
 * Interpretador AWK (subconjunto amplo do POSIX + extras do gawk usados no jogo).
 *
 * Suporta BEGIN/END, padrões simples e de faixa, blocos com if/else/while/for/
 * for-in/do-while, funções do usuário, arrays associativos, getline, redireção
 * em print/printf, e a biblioteca padrão de funções.
 */
import { type CmdCtx, type ExecResult, err, type ShellApi } from './shell-types.js';

type Value = string | number;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ere'; v: string }
  | { t: 'name'; v: string }
  | { t: 'func'; v: string }
  | { t: 'kw'; v: string }
  | { t: 'op'; v: string }
  | { t: 'nl' }
  | { t: 'eof' };

const KEYWORDS = new Set([
  'BEGIN',
  'END',
  'function',
  'func',
  'if',
  'else',
  'while',
  'for',
  'do',
  'break',
  'continue',
  'next',
  'nextfile',
  'exit',
  'return',
  'delete',
  'in',
  'getline',
  'print',
  'printf',
]);

const BUILTINS = new Set([
  'length',
  'substr',
  'index',
  'split',
  'sub',
  'gsub',
  'gensub',
  'match',
  'sprintf',
  'sin',
  'cos',
  'atan2',
  'exp',
  'log',
  'sqrt',
  'int',
  'rand',
  'srand',
  'tolower',
  'toupper',
  'system',
  'close',
  'fflush',
  'systime',
  'strftime',
  'mktime',
  'toupper',
  'asort',
  'asorti',
]);

const OPS = [
  '**=',
  '>>',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '^=',
  '!~',
  '**',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  ';',
  ',',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '=',
  '<',
  '>',
  '!',
  '?',
  ':',
  '~',
  '$',
  '|',
];

function lex(src: string): Tok[] | { error: string } {
  const toks: Tok[] = [];
  let i = 0;
  const prevAllowsRegex = (): boolean => {
    const last = toks[toks.length - 1];
    if (!last) return true;
    if (last.t === 'num' || last.t === 'str' || last.t === 'name' || last.t === 'ere') return false;
    if (last.t === 'op') return ![')', ']', '++', '--', '$'].includes(last.v);
    return true;
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && src[i + 1] === '\n') {
      i += 2;
      continue;
    }
    if (ch === '\n') {
      toks.push({ t: 'nl' });
      i += 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '"') {
      let v = '';
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          const n = src[i + 1];
          v +=
            n === 'n'
              ? '\n'
              : n === 't'
                ? '\t'
                : n === 'r'
                  ? '\r'
                  : n === '\\'
                    ? '\\'
                    : n === '"'
                      ? '"'
                      : n === '/'
                        ? '/'
                        : n === 'a'
                          ? '\x07'
                          : n === 'b'
                            ? '\b'
                            : n === 'f'
                              ? '\f'
                              : n === 'v'
                                ? '\v'
                                : n === '0'
                                  ? '\0'
                                  : (n ?? '');
          i += 2;
          continue;
        }
        v += src[i];
        i += 1;
      }
      i += 1;
      toks.push({ t: 'str', v });
      continue;
    }
    if (ch === '/' && prevAllowsRegex()) {
      let v = '';
      i += 1;
      let inClass = false;
      while (i < src.length && (src[i] !== '/' || inClass)) {
        if (src[i] === '\\') {
          v += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (src[i] === '[') inClass = true;
        if (src[i] === ']') inClass = false;
        v += src[i];
        i += 1;
      }
      i += 1;
      toks.push({ t: 'ere', v });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const word = m[0];
      i += m[0].length;
      if (KEYWORDS.has(word)) toks.push({ t: 'kw', v: word });
      else if (BUILTINS.has(word)) toks.push({ t: 'func', v: word });
      else toks.push({ t: 'name', v: word });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      toks.push({ t: 'op', v: op === '**' ? '^' : op === '**=' ? '^=' : op });
      i += op.length;
      continue;
    }
    return { error: `caractere inesperado '${ch}'` };
  }
  toks.push({ t: 'eof' });
  return toks;
}

// ---------- AST ----------
type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ere'; v: string }
  | { k: 'var'; name: string }
  | { k: 'field'; index: Expr }
  | { k: 'index'; name: string; subs: Expr[] }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'un'; op: string; e: Expr }
  | { k: 'post'; op: string; target: Expr }
  | { k: 'pre'; op: string; target: Expr }
  | { k: 'assign'; op: string; target: Expr; value: Expr }
  | { k: 'ternary'; cond: Expr; a: Expr; b: Expr }
  | { k: 'match'; neg: boolean; l: Expr; r: Expr }
  | { k: 'in'; subs: Expr[]; array: string }
  | { k: 'call'; name: string; args: Expr[] }
  | { k: 'group'; e: Expr }
  | { k: 'concat'; l: Expr; r: Expr }
  | { k: 'getline'; target?: Expr; from?: { kind: 'file' | 'cmd'; src: Expr } };

type Stmt =
  | { k: 'print'; args: Expr[]; redir?: { mode: '>' | '>>' | '|'; target: Expr } }
  | { k: 'printf'; args: Expr[]; redir?: { mode: '>' | '>>' | '|'; target: Expr } }
  | { k: 'expr'; e: Expr }
  | { k: 'if'; cond: Expr; then: Stmt; else?: Stmt }
  | { k: 'while'; cond: Expr; body: Stmt }
  | { k: 'do'; body: Stmt; cond: Expr }
  | { k: 'for'; init?: Stmt; cond?: Expr; step?: Stmt; body: Stmt }
  | { k: 'forin'; varName: string; array: string; body: Stmt }
  | { k: 'block'; body: Stmt[] }
  | { k: 'next' }
  | { k: 'nextfile' }
  | { k: 'exit'; code?: Expr }
  | { k: 'return'; value?: Expr }
  | { k: 'break' }
  | { k: 'continue' }
  | { k: 'delete'; name: string; subs: Expr[] }
  | { k: 'nop' };

type Rule =
  | { kind: 'begin'; body: Stmt }
  | { kind: 'end'; body: Stmt }
  | { kind: 'pattern'; pattern?: Expr; range?: { from: Expr; to: Expr }; body?: Stmt };

type FuncDecl = { name: string; params: string[]; body: Stmt };

class Parser {
  private p = 0;
  funcs: Record<string, FuncDecl> = {};

  constructor(private toks: Tok[]) {}

  private peek(offset = 0): Tok {
    return this.toks[this.p + offset] ?? { t: 'eof' };
  }
  private next(): Tok {
    return this.toks[this.p++] ?? { t: 'eof' };
  }
  private isOp(v: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.t === 'op' && t.v === v;
  }
  private isKw(v: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.t === 'kw' && t.v === v;
  }
  private eatOp(v: string): boolean {
    if (this.isOp(v)) {
      this.p += 1;
      return true;
    }
    return false;
  }
  private expectOp(v: string) {
    if (!this.eatOp(v)) throw new Error(`esperado '${v}'`);
  }
  private skipNl() {
    while (this.peek().t === 'nl' || this.isOp(';')) this.p += 1;
  }
  private skipNlOnly() {
    while (this.peek().t === 'nl') this.p += 1;
  }

  parseProgram(): Rule[] {
    const rules: Rule[] = [];
    this.skipNl();
    while (this.peek().t !== 'eof') {
      if (this.isKw('function') || this.isKw('func')) {
        this.p += 1;
        const nameTok = this.next();
        const name = nameTok.t === 'name' || nameTok.t === 'func' ? nameTok.v : '';
        this.expectOp('(');
        const params: string[] = [];
        while (!this.isOp(')')) {
          const t = this.next();
          if (t.t === 'name') params.push(t.v);
          this.eatOp(',');
        }
        this.expectOp(')');
        this.skipNlOnly();
        const body = this.parseBlock();
        this.funcs[name] = { name, params, body };
        this.skipNl();
        continue;
      }
      if (this.isKw('BEGIN')) {
        this.p += 1;
        this.skipNlOnly();
        rules.push({ kind: 'begin', body: this.parseBlock() });
        this.skipNl();
        continue;
      }
      if (this.isKw('END')) {
        this.p += 1;
        this.skipNlOnly();
        rules.push({ kind: 'end', body: this.parseBlock() });
        this.skipNl();
        continue;
      }
      if (this.isOp('{')) {
        rules.push({ kind: 'pattern', body: this.parseBlock() });
        this.skipNl();
        continue;
      }
      const first = this.parseExpr();
      if (this.eatOp(',')) {
        this.skipNlOnly();
        const to = this.parseExpr();
        const body = this.isOp('{') ? this.parseBlock() : undefined;
        rules.push({ kind: 'pattern', range: { from: first, to }, body });
      } else {
        const body = this.isOp('{') ? this.parseBlock() : undefined;
        rules.push({ kind: 'pattern', pattern: first, body });
      }
      this.skipNl();
    }
    return rules;
  }

  private parseBlock(): Stmt {
    this.expectOp('{');
    const body: Stmt[] = [];
    this.skipNl();
    while (!this.isOp('}') && this.peek().t !== 'eof') {
      body.push(this.parseStmt());
      this.skipNl();
    }
    this.expectOp('}');
    return { k: 'block', body };
  }

  private parseSimpleOrBlock(): Stmt {
    this.skipNlOnly();
    if (this.isOp('{')) return this.parseBlock();
    return this.parseStmt();
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    if (t.t === 'op' && t.v === '{') return this.parseBlock();
    if (t.t === 'op' && t.v === ';') {
      this.p += 1;
      return { k: 'nop' };
    }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'print':
        case 'printf': {
          this.p += 1;
          const args: Expr[] = [];
          let redir: { mode: '>' | '>>' | '|'; target: Expr } | undefined;
          if (!this.isEndOfStmt() && !this.isOp('>') && !this.isOp('>>') && !this.isOp('|')) {
            args.push(this.parseExpr(true));
            while (this.eatOp(',')) {
              this.skipNlOnly();
              args.push(this.parseExpr(true));
            }
          }
          if (this.isOp('>') || this.isOp('>>') || this.isOp('|')) {
            const mode = (this.next() as { t: 'op'; v: string }).v as '>' | '>>' | '|';
            redir = { mode, target: this.parseExpr(true) };
          }
          return t.v === 'print' ? { k: 'print', args, redir } : { k: 'printf', args, redir };
        }
        case 'if': {
          this.p += 1;
          this.expectOp('(');
          const cond = this.parseExpr();
          this.expectOp(')');
          const then = this.parseSimpleOrBlock();
          const save = this.p;
          this.skipNl();
          if (this.isKw('else')) {
            this.p += 1;
            const otherwise = this.parseSimpleOrBlock();
            return { k: 'if', cond, then, else: otherwise };
          }
          this.p = save;
          return { k: 'if', cond, then };
        }
        case 'while': {
          this.p += 1;
          this.expectOp('(');
          const cond = this.parseExpr();
          this.expectOp(')');
          if (this.isEndOfStmt()) {
            this.p += 1;
            return { k: 'while', cond, body: { k: 'nop' } };
          }
          return { k: 'while', cond, body: this.parseSimpleOrBlock() };
        }
        case 'do': {
          this.p += 1;
          const body = this.parseSimpleOrBlock();
          this.skipNl();
          if (this.isKw('while')) this.p += 1;
          this.expectOp('(');
          const cond = this.parseExpr();
          this.expectOp(')');
          return { k: 'do', body, cond };
        }
        case 'for': {
          this.p += 1;
          this.expectOp('(');
          // for (k in arr)
          if (
            this.peek().t === 'name' &&
            this.isKw('in', 1) &&
            this.peek(2).t === 'name'
          ) {
            const varName = (this.next() as { t: 'name'; v: string }).v;
            this.p += 1; // in
            const array = (this.next() as { t: 'name'; v: string }).v;
            this.expectOp(')');
            return { k: 'forin', varName, array, body: this.parseSimpleOrBlock() };
          }
          if (this.isOp('(') && this.peek(1).t === 'name') {
            // for ((k) in arr) — raro, trata igual
          }
          const init = this.isOp(';') ? undefined : { k: 'expr' as const, e: this.parseExpr() };
          this.expectOp(';');
          const cond = this.isOp(';') ? undefined : this.parseExpr();
          this.expectOp(';');
          const step = this.isOp(')') ? undefined : { k: 'expr' as const, e: this.parseExpr() };
          this.expectOp(')');
          return { k: 'for', init, cond, step, body: this.parseSimpleOrBlock() };
        }
        case 'next':
          this.p += 1;
          return { k: 'next' };
        case 'nextfile':
          this.p += 1;
          return { k: 'nextfile' };
        case 'break':
          this.p += 1;
          return { k: 'break' };
        case 'continue':
          this.p += 1;
          return { k: 'continue' };
        case 'exit': {
          this.p += 1;
          const code = this.isEndOfStmt() ? undefined : this.parseExpr();
          return { k: 'exit', code };
        }
        case 'return': {
          this.p += 1;
          const value = this.isEndOfStmt() ? undefined : this.parseExpr();
          return { k: 'return', value };
        }
        case 'delete': {
          this.p += 1;
          const nameTok = this.next();
          const name = nameTok.t === 'name' ? nameTok.v : '';
          const subs: Expr[] = [];
          if (this.eatOp('[')) {
            subs.push(this.parseExpr());
            while (this.eatOp(',')) subs.push(this.parseExpr());
            this.expectOp(']');
          }
          return { k: 'delete', name, subs };
        }
      }
    }
    const e = this.parseExpr();
    return { k: 'expr', e };
  }

  private isEndOfStmt(): boolean {
    const t = this.peek();
    return t.t === 'eof' || t.t === 'nl' || (t.t === 'op' && (t.v === ';' || t.v === '}'));
  }

  parseExpr(noGt = false): Expr {
    return this.parseAssign(noGt);
  }

  private parseAssign(noGt: boolean): Expr {
    const left = this.parseTernary(noGt);
    const t = this.peek();
    if (t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '^='].includes(t.v)) {
      this.p += 1;
      this.skipNlOnly();
      const value = this.parseAssign(noGt);
      return { k: 'assign', op: t.v, target: left, value };
    }
    return left;
  }

  private parseTernary(noGt: boolean): Expr {
    const cond = this.parseOr(noGt);
    if (this.eatOp('?')) {
      this.skipNlOnly();
      const a = this.parseAssign(noGt);
      this.expectOp(':');
      this.skipNlOnly();
      const b = this.parseAssign(noGt);
      return { k: 'ternary', cond, a, b };
    }
    return cond;
  }

  private parseOr(noGt: boolean): Expr {
    let left = this.parseAnd(noGt);
    while (this.isOp('||')) {
      this.p += 1;
      this.skipNlOnly();
      left = { k: 'bin', op: '||', l: left, r: this.parseAnd(noGt) };
    }
    return left;
  }

  private parseAnd(noGt: boolean): Expr {
    let left = this.parseIn(noGt);
    while (this.isOp('&&')) {
      this.p += 1;
      this.skipNlOnly();
      left = { k: 'bin', op: '&&', l: left, r: this.parseIn(noGt) };
    }
    return left;
  }

  private parseIn(noGt: boolean): Expr {
    let left = this.parseMatch(noGt);
    while (this.isKw('in')) {
      this.p += 1;
      const arr = this.next();
      left = { k: 'in', subs: [left], array: arr.t === 'name' ? arr.v : '' };
    }
    return left;
  }

  private parseMatch(noGt: boolean): Expr {
    let left = this.parseCompare(noGt);
    for (;;) {
      if (this.isOp('~')) {
        this.p += 1;
        left = { k: 'match', neg: false, l: left, r: this.parseCompare(noGt) };
      } else if (this.isOp('!~')) {
        this.p += 1;
        left = { k: 'match', neg: true, l: left, r: this.parseCompare(noGt) };
      } else break;
    }
    return left;
  }

  private parseCompare(noGt: boolean): Expr {
    const left = this.parseConcat(noGt);
    const t = this.peek();
    if (t.t === 'op' && ['<', '<=', '==', '!=', '>=', '>'].includes(t.v)) {
      if (noGt && (t.v === '>' || t.v === '>=')) return left;
      this.p += 1;
      const right = this.parseConcat(noGt);
      return { k: 'bin', op: t.v, l: left, r: right };
    }
    return left;
  }

  private startsValue(): boolean {
    const t = this.peek();
    if (t.t === 'num' || t.t === 'str' || t.t === 'name' || t.t === 'ere' || t.t === 'func') return true;
    if (t.t === 'kw') return t.v === 'getline';
    if (t.t === 'op') return ['(', '$', '!', '-', '+', '++', '--'].includes(t.v);
    return false;
  }

  private parseConcat(noGt: boolean): Expr {
    let left = this.parseAdd(noGt);
    while (this.startsValue()) {
      // `in` e operadores não continuam concatenação
      const t = this.peek();
      if (t.t === 'kw' && t.v !== 'getline') break;
      const right = this.parseAdd(noGt);
      left = { k: 'concat', l: left, r: right };
    }
    return left;
  }

  private parseAdd(noGt: boolean): Expr {
    let left = this.parseMul(noGt);
    for (;;) {
      if (this.isOp('+')) {
        this.p += 1;
        left = { k: 'bin', op: '+', l: left, r: this.parseMul(noGt) };
      } else if (this.isOp('-')) {
        this.p += 1;
        left = { k: 'bin', op: '-', l: left, r: this.parseMul(noGt) };
      } else break;
    }
    return left;
  }

  private parseMul(noGt: boolean): Expr {
    let left = this.parseUnary(noGt);
    for (;;) {
      if (this.isOp('*')) {
        this.p += 1;
        left = { k: 'bin', op: '*', l: left, r: this.parseUnary(noGt) };
      } else if (this.isOp('/')) {
        this.p += 1;
        left = { k: 'bin', op: '/', l: left, r: this.parseUnary(noGt) };
      } else if (this.isOp('%')) {
        this.p += 1;
        left = { k: 'bin', op: '%', l: left, r: this.parseUnary(noGt) };
      } else break;
    }
    return left;
  }

  private parseUnary(noGt: boolean): Expr {
    if (this.isOp('!')) {
      this.p += 1;
      return { k: 'un', op: '!', e: this.parseUnary(noGt) };
    }
    if (this.isOp('-')) {
      this.p += 1;
      return { k: 'un', op: '-', e: this.parseUnary(noGt) };
    }
    if (this.isOp('+')) {
      this.p += 1;
      return { k: 'un', op: '+', e: this.parseUnary(noGt) };
    }
    return this.parsePow(noGt);
  }

  private parsePow(noGt: boolean): Expr {
    const base = this.parsePostfix(noGt);
    if (this.isOp('^')) {
      this.p += 1;
      return { k: 'bin', op: '^', l: base, r: this.parseUnary(noGt) };
    }
    return base;
  }

  private parsePostfix(noGt: boolean): Expr {
    if (this.isOp('++') || this.isOp('--')) {
      const op = (this.next() as { t: 'op'; v: string }).v;
      const target = this.parsePostfix(noGt);
      return { k: 'pre', op, target };
    }
    let e = this.parsePrimary(noGt);
    while (this.isOp('++') || this.isOp('--')) {
      const op = (this.next() as { t: 'op'; v: string }).v;
      e = { k: 'post', op, target: e };
    }
    return e;
  }

  private parsePrimary(noGt: boolean): Expr {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'ere') return { k: 'ere', v: t.v };
    if (t.t === 'op' && t.v === '$') {
      const idx = this.parsePostfix(noGt);
      return { k: 'field', index: idx };
    }
    if (t.t === 'op' && t.v === '(') {
      const first = this.parseExpr();
      if (this.isOp(',')) {
        const subs = [first];
        while (this.eatOp(',')) subs.push(this.parseExpr());
        this.expectOp(')');
        if (this.isKw('in')) {
          this.p += 1;
          const arr = this.next();
          return { k: 'in', subs, array: arr.t === 'name' ? arr.v : '' };
        }
        return { k: 'group', e: first };
      }
      this.expectOp(')');
      let e: Expr = { k: 'group', e: first };
      // (expr) | getline
      if (this.isOp('|') && this.isKw('getline', 1)) {
        this.p += 2;
        let target: Expr | undefined;
        if (this.peek().t === 'name' || this.isOp('$')) target = this.parsePostfix(noGt);
        return { k: 'getline', target, from: { kind: 'cmd', src: e } };
      }
      return e;
    }
    if (t.t === 'kw' && t.v === 'getline') {
      let target: Expr | undefined;
      if (this.peek().t === 'name' || this.isOp('$')) target = this.parsePostfix(true);
      if (this.isOp('<')) {
        this.p += 1;
        const src = this.parseConcat(true);
        return { k: 'getline', target, from: { kind: 'file', src } };
      }
      return { k: 'getline', target };
    }
    if (t.t === 'func') {
      let args: Expr[] = [];
      if (this.eatOp('(')) {
        if (!this.isOp(')')) {
          args.push(this.parseExpr());
          while (this.eatOp(',')) {
            this.skipNlOnly();
            args.push(this.parseExpr());
          }
        }
        this.expectOp(')');
      }
      return { k: 'call', name: t.v, args };
    }
    if (t.t === 'name') {
      if (this.isOp('[')) {
        this.p += 1;
        const subs = [this.parseExpr()];
        while (this.eatOp(',')) subs.push(this.parseExpr());
        this.expectOp(']');
        return { k: 'index', name: t.v, subs };
      }
      if (this.isOp('(') && this.funcs[t.v]) {
        this.p += 1;
        const args: Expr[] = [];
        if (!this.isOp(')')) {
          args.push(this.parseExpr());
          while (this.eatOp(',')) args.push(this.parseExpr());
        }
        this.expectOp(')');
        return { k: 'call', name: t.v, args };
      }
      if (this.isOp('(')) {
        // função definida depois no programa
        this.p += 1;
        const args: Expr[] = [];
        if (!this.isOp(')')) {
          args.push(this.parseExpr());
          while (this.eatOp(',')) args.push(this.parseExpr());
        }
        this.expectOp(')');
        return { k: 'call', name: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    throw new Error(`expressão inesperada perto de ${describeTok(t)}`);
  }
}

function describeTok(t: Tok): string {
  switch (t.t) {
    case 'eof':
      return 'fim do programa';
    case 'nl':
      return 'fim de linha';
    case 'num':
    case 'str':
    case 'ere':
    case 'name':
    case 'func':
    case 'kw':
    case 'op':
      return `'${t.v}'`;
    default:
      return 'token';
  }
}

// ---------- Runtime ----------
class Signal {
  constructor(public kind: 'next' | 'nextfile' | 'exit' | 'break' | 'continue' | 'return', public value?: Value) {}
}

type Cell = { value: Value } | { array: Map<string, Value> };

class Interp {
  globals = new Map<string, Value>();
  arrays = new Map<string, Map<string, Value>>();
  fields: string[] = [];
  record = '';
  outBuf: string[] = [];
  errBuf: string[] = [];
  files = new Map<string, { lines: string[]; pos: number }>();
  writes = new Map<string, string[]>();
  exitCode = 0;
  private scopes: Map<string, Cell>[] = [];
  private seed = 1;

  constructor(
    private funcs: Record<string, FuncDecl>,
    private sh: ShellApi,
  ) {
    this.globals.set('FS', ' ');
    this.globals.set('OFS', ' ');
    this.globals.set('ORS', '\n');
    this.globals.set('RS', '\n');
    this.globals.set('NR', 0);
    this.globals.set('NF', 0);
    this.globals.set('FNR', 0);
    this.globals.set('SUBSEP', '\x1c');
    this.globals.set('RSTART', 0);
    this.globals.set('RLENGTH', -1);
    this.globals.set('CONVFMT', '%.6g');
    this.globals.set('OFMT', '%.6g');
    this.globals.set('FILENAME', '');
  }

  private scope(): Map<string, Cell> | null {
    return this.scopes.length ? this.scopes[this.scopes.length - 1] : null;
  }

  getVar(name: string): Value {
    const s = this.scope();
    if (s?.has(name)) {
      const c = s.get(name)!;
      return 'value' in c ? c.value : '';
    }
    return this.globals.get(name) ?? '';
  }

  setVar(name: string, v: Value) {
    const s = this.scope();
    if (s?.has(name)) {
      s.set(name, { value: v });
      return;
    }
    this.globals.set(name, v);
    if (name === 'NF') this.rebuildRecord();
  }

  getArray(name: string): Map<string, Value> {
    const s = this.scope();
    if (s?.has(name)) {
      const c = s.get(name)!;
      if ('array' in c) return c.array;
      const arr = new Map<string, Value>();
      s.set(name, { array: arr });
      return arr;
    }
    if (!this.arrays.has(name)) this.arrays.set(name, new Map());
    return this.arrays.get(name)!;
  }

  setRecord(line: string) {
    this.record = line;
    const fs = str(this.getVar('FS'));
    let parts: string[];
    if (fs === ' ') parts = line.trim() === '' ? [] : line.trim().split(/[ \t\n]+/);
    else if (fs.length === 1 && !'|.*+?[]()^$\\'.includes(fs)) parts = line.split(fs);
    else if (fs === '') parts = [...line];
    else parts = line.split(new RegExp(fs));
    this.fields = [line, ...parts];
    this.globals.set('NF', parts.length);
  }

  getField(n: number): Value {
    if (n === 0) return this.record;
    return this.fields[n] ?? '';
  }

  setField(n: number, v: Value) {
    if (n === 0) {
      this.setRecord(str(v));
      return;
    }
    while (this.fields.length <= n) this.fields.push('');
    this.fields[n] = str(v);
    this.globals.set('NF', Math.max(num(this.globals.get('NF') ?? 0), n));
    this.rebuildRecord();
  }

  private rebuildRecord() {
    const nf = num(this.globals.get('NF') ?? 0);
    const ofs = str(this.getVar('OFS'));
    const parts = this.fields.slice(1, nf + 1).map((f) => f ?? '');
    this.record = parts.join(ofs);
    this.fields[0] = this.record;
  }

  output(text: string) {
    this.outBuf.push(text);
  }

  writeTo(mode: '>' | '>>' | '|', target: string, text: string) {
    if (mode === '|') {
      const res = this.sh.runLine(target, text);
      this.outBuf.push(res.stdout);
      if (res.stderr) this.errBuf.push(res.stderr);
      return;
    }
    if (target === '/dev/stdout' || target === '-') {
      this.outBuf.push(text);
      return;
    }
    if (target === '/dev/stderr') {
      this.errBuf.push(text);
      return;
    }
    const path = this.sh.resolve(target);
    if (mode === '>' && !this.writes.has(path)) {
      this.writes.set(path, [text]);
      this.sh.write(path, text);
      return;
    }
    const acc = this.writes.get(path) ?? [];
    acc.push(text);
    this.writes.set(path, acc);
    this.sh.append(path, text);
  }

  rand(): number {
    // gerador determinístico (LCG) para reprodutibilidade das investigações
    this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
    return this.seed / 2147483648;
  }

  srand(v?: number): number {
    const prev = this.seed;
    this.seed = v == null ? 42 : Math.floor(v) || 1;
    return prev;
  }

  readLineFrom(kind: 'file' | 'cmd', src: string): string | null {
    const key = kind + ':' + src;
    if (!this.files.has(key)) {
      let text: string | null = null;
      if (kind === 'file') {
        const p = this.sh.resolve(src);
        text = this.sh.read(p);
        if (text != null) this.sh.touchRead(p);
      } else {
        const r = this.sh.runLine(src);
        text = r.stdout;
      }
      if (text == null) return null;
      const ls = text.split('\n');
      if (ls[ls.length - 1] === '') ls.pop();
      this.files.set(key, { lines: ls, pos: 0 });
    }
    const st = this.files.get(key)!;
    if (st.pos >= st.lines.length) return null;
    return st.lines[st.pos++];
  }

  closeStream(src: string) {
    this.files.delete('file:' + src);
    this.files.delete('cmd:' + src);
    this.writes.delete(this.sh.resolve(src));
  }

  callFunction(name: string, args: Expr[], evalExpr: (e: Expr) => Value): Value {
    const fn = this.funcs[name];
    if (!fn) throw new Error(`chamada para função inexistente: ${name}`);
    const frame = new Map<string, Cell>();
    fn.params.forEach((p, i) => {
      const a = args[i];
      if (a && a.k === 'var' && (this.arrays.has(a.name) || this.scope()?.has(a.name))) {
        // arrays são passados por referência
        frame.set(p, { array: this.getArray(a.name) });
        return;
      }
      frame.set(p, { value: a ? evalExpr(a) : '' });
    });
    this.scopes.push(frame);
    try {
      return '';
    } finally {
      // o corpo é executado por quem chamou (precisa de execStmt)
    }
  }

  pushFrame(frame: Map<string, Cell>) {
    this.scopes.push(frame);
  }
  popFrame() {
    this.scopes.pop();
  }
  currentFrame(): Map<string, Cell> | null {
    return this.scope();
  }
  isArrayName(name: string): boolean {
    const s = this.scope();
    if (s?.has(name)) return 'array' in s.get(name)!;
    return this.arrays.has(name);
  }
}

function num(v: Value): number {
  if (typeof v === 'number') return v;
  const m = /^[ \t]*[+-]?(?:0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(v);
  return m ? Number(m[0].trim()) : 0;
}

function str(v: Value): string {
  if (typeof v === 'string') return v;
  if (Number.isInteger(v)) return String(v);
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : Number.isNaN(v) ? 'nan' : '-inf';
  const s = String(Number(v.toPrecision(6)));
  return s;
}

function truthy(v: Value): boolean {
  if (typeof v === 'number') return v !== 0;
  if (v === '') return false;
  // strings numéricas seguem a semântica do awk
  if (/^[ \t]*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[ \t]*$/.test(v)) return Number(v) !== 0;
  return true;
}

function looksNumeric(v: Value): boolean {
  return typeof v === 'number' || /^[ \t]*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[ \t]*$/.test(v);
}

function eregToJs(src: string): RegExp {
  // ERE do awk é praticamente compatível; ajusta classes POSIX
  let out = src
    .replace(/\[:alpha:\]/g, 'a-zA-Z')
    .replace(/\[:digit:\]/g, '0-9')
    .replace(/\[:alnum:\]/g, 'a-zA-Z0-9')
    .replace(/\[:space:\]/g, '\\s')
    .replace(/\[:upper:\]/g, 'A-Z')
    .replace(/\[:lower:\]/g, 'a-z')
    .replace(/\[:punct:\]/g, '!-/:-@\\[-`{-~');
  try {
    return new RegExp(out);
  } catch {
    return new RegExp(out.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&'));
  }
}

function sprintfAwk(fmt: string, args: Value[]): string {
  let out = '';
  let ai = 0;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch !== '%') {
      out += ch;
      continue;
    }
    if (fmt[i + 1] === '%') {
      out += '%';
      i += 1;
      continue;
    }
    const m = /^%([-+ 0#']*)(\*|\d+)?(?:\.(\*|\d+))?([diouxXeEfFgGcs])/.exec(fmt.slice(i));
    if (!m) {
      out += ch;
      continue;
    }
    const [all, flags, widthRaw, precRaw, conv] = m;
    i += all.length - 1;
    let width = widthRaw === '*' ? num(args[ai++] ?? 0) : widthRaw ? Number(widthRaw) : undefined;
    const prec = precRaw === '*' ? num(args[ai++] ?? 0) : precRaw != null ? Number(precRaw) : undefined;
    const arg = args[ai++];
    let text: string;
    switch (conv) {
      case 'd':
      case 'i': {
        const v = Math.trunc(num(arg ?? 0));
        text = String(Math.abs(v));
        if (prec != null) text = text.padStart(prec, '0');
        if (v < 0) text = '-' + text;
        else if (flags.includes('+')) text = '+' + text;
        else if (flags.includes(' ')) text = ' ' + text;
        break;
      }
      case 'o':
        text = Math.trunc(num(arg ?? 0)).toString(8);
        break;
      case 'u':
        text = String(Math.abs(Math.trunc(num(arg ?? 0))));
        break;
      case 'x':
        text = (Math.trunc(num(arg ?? 0)) >>> 0).toString(16);
        if (flags.includes('#')) text = '0x' + text;
        break;
      case 'X':
        text = (Math.trunc(num(arg ?? 0)) >>> 0).toString(16).toUpperCase();
        if (flags.includes('#')) text = '0X' + text;
        break;
      case 'e':
      case 'E': {
        text = num(arg ?? 0).toExponential(prec ?? 6);
        if (conv === 'E') text = text.toUpperCase();
        break;
      }
      case 'f':
      case 'F':
        text = num(arg ?? 0).toFixed(prec ?? 6);
        if (num(arg ?? 0) >= 0 && flags.includes('+')) text = '+' + text;
        break;
      case 'g':
      case 'G': {
        const p = prec ?? 6;
        const v = num(arg ?? 0);
        text = v === 0 ? '0' : String(Number(v.toPrecision(p)));
        if (conv === 'G') text = text.toUpperCase();
        break;
      }
      case 'c': {
        if (arg == null) text = '';
        else if (typeof arg === 'number') text = String.fromCharCode(arg);
        else text = str(arg).charAt(0);
        break;
      }
      default: {
        text = str(arg ?? '');
        if (prec != null) text = text.slice(0, prec);
      }
    }
    if (width != null && text.length < width) {
      if (flags.includes('-')) text = text.padEnd(width);
      else if (flags.includes('0') && 'diouxXeEfFgG'.includes(conv)) {
        const neg = text.startsWith('-') || text.startsWith('+');
        text = neg
          ? text[0] + text.slice(1).padStart(width - 1, '0')
          : text.padStart(width, '0');
      } else text = text.padStart(width);
    }
    out += text;
  }
  return out;
}

function strftime(fmt: string, date: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return fmt.replace(/%([%aAbBcdHIjmMpSUwxXyYZzsFTeD])/g, (_, c: string) => {
    switch (c) {
      case 'Y':
        return String(date.getUTCFullYear());
      case 'y':
        return p2(date.getUTCFullYear() % 100);
      case 'm':
        return p2(date.getUTCMonth() + 1);
      case 'd':
        return p2(date.getUTCDate());
      case 'e':
        return String(date.getUTCDate()).padStart(2, ' ');
      case 'H':
        return p2(date.getUTCHours());
      case 'I':
        return p2(date.getUTCHours() % 12 || 12);
      case 'M':
        return p2(date.getUTCMinutes());
      case 'S':
        return p2(date.getUTCSeconds());
      case 'p':
        return date.getUTCHours() < 12 ? 'AM' : 'PM';
      case 'a':
        return DAY[date.getUTCDay()];
      case 'A':
        return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()];
      case 'b':
        return MON[date.getUTCMonth()];
      case 'B':
        return [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ][date.getUTCMonth()];
      case 'j':
        return String(
          Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000),
        ).padStart(3, '0');
      case 'F':
        return `${date.getUTCFullYear()}-${p2(date.getUTCMonth() + 1)}-${p2(date.getUTCDate())}`;
      case 'T':
        return `${p2(date.getUTCHours())}:${p2(date.getUTCMinutes())}:${p2(date.getUTCSeconds())}`;
      case 'D':
        return `${p2(date.getUTCMonth() + 1)}/${p2(date.getUTCDate())}/${p2(date.getUTCFullYear() % 100)}`;
      case 's':
        return String(Math.floor(date.getTime() / 1000));
      case 'Z':
        return 'UTC';
      case 'z':
        return '+0000';
      case 'w':
        return String(date.getUTCDay());
      case 'c':
        return date.toUTCString();
      case '%':
        return '%';
      default:
        return c;
    }
  });
}

export function runAwk(ctx: CmdCtx): ExecResult {
  const { args, sh, stdin } = ctx;
  let program: string | null = null;
  const files: string[] = [];
  const assigns: [string, string][] = [];
  let fs: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-F') fs = args[++i] ?? ' ';
    else if (a.startsWith('-F') && a.length > 2) fs = a.slice(2);
    else if (a === '-v') {
      const kv = args[++i] ?? '';
      const eq = kv.indexOf('=');
      if (eq > 0) assigns.push([kv.slice(0, eq), kv.slice(eq + 1)]);
    } else if (a.startsWith('-v') && a.length > 2) {
      const kv = a.slice(2);
      const eq = kv.indexOf('=');
      if (eq > 0) assigns.push([kv.slice(0, eq), kv.slice(eq + 1)]);
    } else if (a === '-f' || a === '--file') {
      const p = sh.resolve(args[++i] ?? '');
      const c = sh.read(p);
      if (c == null) return err(`awk: não foi possível abrir o arquivo de programa ${p}`, 2);
      program = (program ?? '') + c;
    } else if (a === '--') continue;
    else if (program == null) program = a;
    else files.push(a);
  }

  if (program == null) return err('awk: uso: awk [-F sep] [-v var=val] \'programa\' [arquivo...]', 2);

  const toks = lex(program);
  if ('error' in toks) return err(`awk: erro de sintaxe: ${toks.error}`, 2);
  const parser = new Parser(toks);
  let rules: Rule[];
  try {
    rules = parser.parseProgram();
  } catch (e) {
    return err(`awk: erro de sintaxe: ${(e as Error).message}`, 2);
  }

  const interp = new Interp(parser.funcs, sh);
  if (fs != null) interp.globals.set('FS', fs === 't' ? '\t' : fs);
  for (const [k, v] of assigns) interp.globals.set(k, looksNumeric(v) ? Number(v) : v);
  const envArr = interp.getArray('ENVIRON');
  for (const [k, v] of Object.entries(sh.env)) envArr.set(k, v);

  // ---- avaliador ----
  const rangeState = new Map<Rule, boolean>();

  const evalExpr = (e: Expr): Value => {
    switch (e.k) {
      case 'num':
        return e.v;
      case 'str':
        return e.v;
      case 'ere':
        return eregToJs(e.v).test(str(interp.getField(0))) ? 1 : 0;
      case 'group':
        return evalExpr(e.e);
      case 'var': {
        if (e.name === 'NF') return num(interp.globals.get('NF') ?? 0);
        return interp.getVar(e.name);
      }
      case 'field':
        return interp.getField(Math.trunc(num(evalExpr(e.index))));
      case 'index': {
        const arr = interp.getArray(e.name);
        const key = subscript(e.subs);
        if (!arr.has(key)) arr.set(key, '');
        return arr.get(key) ?? '';
      }
      case 'concat':
        return str(evalExpr(e.l)) + str(evalExpr(e.r));
      case 'un': {
        const v = evalExpr(e.e);
        if (e.op === '!') return truthy(v) ? 0 : 1;
        if (e.op === '-') return -num(v);
        return num(v);
      }
      case 'bin': {
        if (e.op === '&&') return truthy(evalExpr(e.l)) && truthy(evalExpr(e.r)) ? 1 : 0;
        if (e.op === '||') return truthy(evalExpr(e.l)) || truthy(evalExpr(e.r)) ? 1 : 0;
        const l = evalExpr(e.l);
        const r = evalExpr(e.r);
        switch (e.op) {
          case '+':
            return num(l) + num(r);
          case '-':
            return num(l) - num(r);
          case '*':
            return num(l) * num(r);
          case '/': {
            const d = num(r);
            if (d === 0) throw new Error('divisão por zero');
            return num(l) / d;
          }
          case '%': {
            const d = num(r);
            if (d === 0) throw new Error('divisão por zero em %');
            return num(l) % d;
          }
          case '^':
            return Math.pow(num(l), num(r));
          default: {
            const numeric = looksNumeric(l) && looksNumeric(r);
            const a = numeric ? num(l) : str(l);
            const b = numeric ? num(r) : str(r);
            switch (e.op) {
              case '<':
                return a < b ? 1 : 0;
              case '<=':
                return a <= b ? 1 : 0;
              case '>':
                return a > b ? 1 : 0;
              case '>=':
                return a >= b ? 1 : 0;
              case '==':
                return a === b ? 1 : 0;
              case '!=':
                return a !== b ? 1 : 0;
            }
            return 0;
          }
        }
      }
      case 'match': {
        const target = str(evalExpr(e.l));
        const re = e.r.k === 'ere' ? eregToJs(e.r.v) : eregToJs(str(evalExpr(e.r)));
        const hit = re.test(target);
        return (e.neg ? !hit : hit) ? 1 : 0;
      }
      case 'in': {
        const arr = interp.getArray(e.array);
        return arr.has(subscript(e.subs)) ? 1 : 0;
      }
      case 'ternary':
        return truthy(evalExpr(e.cond)) ? evalExpr(e.a) : evalExpr(e.b);
      case 'assign': {
        let v: Value;
        if (e.op === '=') v = evalExpr(e.value);
        else {
          const cur = num(readTarget(e.target));
          const rhs = num(evalExpr(e.value));
          v =
            e.op === '+='
              ? cur + rhs
              : e.op === '-='
                ? cur - rhs
                : e.op === '*='
                  ? cur * rhs
                  : e.op === '/='
                    ? (() => {
                        if (rhs === 0) throw new Error('divisão por zero');
                        return cur / rhs;
                      })()
                    : e.op === '%='
                      ? cur % rhs
                      : Math.pow(cur, rhs);
        }
        writeTarget(e.target, v);
        return v;
      }
      case 'pre': {
        const v = num(readTarget(e.target)) + (e.op === '++' ? 1 : -1);
        writeTarget(e.target, v);
        return v;
      }
      case 'post': {
        const v = num(readTarget(e.target));
        writeTarget(e.target, v + (e.op === '++' ? 1 : -1));
        return v;
      }
      case 'getline': {
        let line: string | null;
        if (e.from) {
          const src = str(evalExpr(e.from.src));
          line = interp.readLineFrom(e.from.kind, src);
        } else {
          line = nextInputLine();
        }
        if (line == null) return 0;
        if (e.target) writeTarget(e.target, line);
        else {
          interp.setRecord(line);
          interp.globals.set('NR', num(interp.globals.get('NR') ?? 0) + 1);
        }
        if (!e.from) interp.globals.set('FNR', num(interp.globals.get('FNR') ?? 0) + 1);
        return 1;
      }
      case 'call':
        return callFn(e.name, e.args);
    }
  };

  const subscript = (subs: Expr[]): string =>
    subs.map((s) => str(evalExpr(s))).join(str(interp.getVar('SUBSEP')));

  const readTarget = (t: Expr): Value => {
    if (t.k === 'var') return interp.getVar(t.name);
    if (t.k === 'field') return interp.getField(Math.trunc(num(evalExpr(t.index))));
    if (t.k === 'index') return interp.getArray(t.name).get(subscript(t.subs)) ?? '';
    if (t.k === 'group') return readTarget(t.e);
    return evalExpr(t);
  };

  const writeTarget = (t: Expr, v: Value) => {
    if (t.k === 'var') {
      interp.setVar(t.name, v);
      if (t.name === 'NF') {
        const nf = Math.trunc(num(v));
        interp.fields = interp.fields.slice(0, nf + 1);
        while (interp.fields.length <= nf) interp.fields.push('');
        interp.globals.set('NF', nf);
        interp.setField(nf, interp.fields[nf] ?? '');
      }
      return;
    }
    if (t.k === 'field') {
      interp.setField(Math.trunc(num(evalExpr(t.index))), v);
      return;
    }
    if (t.k === 'index') {
      interp.getArray(t.name).set(subscript(t.subs), v);
      return;
    }
    if (t.k === 'group') writeTarget(t.e, v);
  };

  const callFn = (name: string, argExprs: Expr[]): Value => {
    const user = parser.funcs[name];
    if (user) {
      const frame = new Map<string, Cell>();
      user.params.forEach((p, i) => {
        const a = argExprs[i];
        if (a && a.k === 'var' && interp.isArrayName(a.name)) {
          frame.set(p, { array: interp.getArray(a.name) });
          return;
        }
        frame.set(p, { value: a ? evalExpr(a) : '' });
      });
      interp.pushFrame(frame);
      try {
        execStmt(user.body);
        return '';
      } catch (sig) {
        if (sig instanceof Signal && sig.kind === 'return') return sig.value ?? '';
        throw sig;
      } finally {
        interp.popFrame();
      }
    }
    const a = (i: number): Value => (argExprs[i] ? evalExpr(argExprs[i]) : '');
    switch (name) {
      case 'length': {
        if (!argExprs.length) return str(interp.getField(0)).length;
        const target = argExprs[0];
        if (target.k === 'var' && interp.isArrayName(target.name)) return interp.getArray(target.name).size;
        return str(a(0)).length;
      }
      case 'substr': {
        const s = str(a(0));
        const start = Math.trunc(num(a(1)));
        const from = Math.max(1, start) - 1;
        if (argExprs.length < 3) return s.slice(from);
        let len = Math.trunc(num(a(2)));
        if (start < 1) len += start - 1;
        return len <= 0 ? '' : s.substr(from, len);
      }
      case 'index':
        return str(a(0)).indexOf(str(a(1))) + 1;
      case 'split': {
        const s = str(a(0));
        const arrExpr = argExprs[1];
        const arrName = arrExpr && arrExpr.k === 'var' ? arrExpr.name : '__split';
        const arr = interp.getArray(arrName);
        arr.clear();
        const sepRaw = argExprs[2]
          ? argExprs[2].k === 'ere'
            ? argExprs[2].v
            : str(a(2))
          : str(interp.getVar('FS'));
        let parts: string[];
        if (sepRaw === ' ') parts = s.trim() === '' ? [] : s.trim().split(/[ \t\n]+/);
        else if (sepRaw === '') parts = [...s];
        else if (sepRaw.length === 1 && !'|.*+?[]()^$\\'.includes(sepRaw)) parts = s.split(sepRaw);
        else parts = s.split(eregToJs(sepRaw));
        parts.forEach((p, i) => arr.set(String(i + 1), looksNumeric(p) ? p : p));
        return parts.length;
      }
      case 'sub':
      case 'gsub': {
        const reSrc = argExprs[0]?.k === 'ere' ? argExprs[0].v : str(a(0));
        const re = new RegExp(eregToJs(reSrc).source, name === 'gsub' ? 'g' : '');
        const repl = str(a(1));
        const target = argExprs[2] ?? ({ k: 'field', index: { k: 'num', v: 0 } } as Expr);
        const cur = str(readTarget(target));
        let count = 0;
        const next = cur.replace(re, (m0) => {
          count += 1;
          return repl.replace(/\\?&/g, (tok) => (tok === '&' ? m0 : '&'));
        });
        if (count) writeTarget(target, next);
        return count;
      }
      case 'gensub': {
        const reSrc = argExprs[0]?.k === 'ere' ? argExprs[0].v : str(a(0));
        const repl = str(a(1));
        const how = str(a(2) || 'g');
        const target = argExprs[3] ? str(a(3)) : str(interp.getField(0));
        const global = how === 'g' || how === 'G';
        const re = new RegExp(eregToJs(reSrc).source, global ? 'g' : '');
        let n = 0;
        const nth = Number(how) || 0;
        return target.replace(re, (...m) => {
          n += 1;
          if (nth && n !== nth) return m[0] as string;
          return repl.replace(/\\(\d)/g, (_, d) => (m[Number(d)] as string) ?? '');
        });
      }
      case 'match': {
        const s = str(a(0));
        const reSrc = argExprs[1]?.k === 'ere' ? argExprs[1].v : str(a(1));
        const m = eregToJs(reSrc).exec(s);
        interp.globals.set('RSTART', m ? m.index + 1 : 0);
        interp.globals.set('RLENGTH', m ? m[0].length : -1);
        return m ? m.index + 1 : 0;
      }
      case 'sprintf':
        return sprintfAwk(str(a(0)), argExprs.slice(1).map((x) => evalExpr(x)));
      case 'sin':
        return Math.sin(num(a(0)));
      case 'cos':
        return Math.cos(num(a(0)));
      case 'atan2':
        return Math.atan2(num(a(0)), num(a(1)));
      case 'exp':
        return Math.exp(num(a(0)));
      case 'log':
        return Math.log(num(a(0)));
      case 'sqrt':
        return Math.sqrt(num(a(0)));
      case 'int':
        return Math.trunc(num(a(0)));
      case 'rand':
        return interp.rand();
      case 'srand':
        return interp.srand(argExprs.length ? num(a(0)) : undefined);
      case 'tolower':
        return str(a(0)).toLowerCase();
      case 'toupper':
        return str(a(0)).toUpperCase();
      case 'systime':
        return Math.floor(sh.now().getTime() / 1000);
      case 'mktime': {
        const parts = str(a(0)).trim().split(/\s+/).map(Number);
        return Math.floor(
          Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1, parts[3] ?? 0, parts[4] ?? 0, parts[5] ?? 0) /
            1000,
        );
      }
      case 'strftime': {
        const fmt = argExprs.length ? str(a(0)) : '%a %b %e %H:%M:%S %Z %Y';
        const t = argExprs.length > 1 ? num(a(1)) * 1000 : sh.now().getTime();
        return strftime(fmt, new Date(t));
      }
      case 'close':
        interp.closeStream(str(a(0)));
        return 0;
      case 'fflush':
        return 0;
      case 'system': {
        const r = sh.runLine(str(a(0)));
        interp.output(r.stdout);
        return r.code;
      }
      case 'asort':
      case 'asorti': {
        const src = argExprs[0] && argExprs[0].k === 'var' ? interp.getArray(argExprs[0].name) : new Map();
        const values = name === 'asort' ? [...src.values()] : [...src.keys()];
        values.sort((x, y) =>
          looksNumeric(x as Value) && looksNumeric(y as Value)
            ? num(x as Value) - num(y as Value)
            : str(x as Value).localeCompare(str(y as Value)),
        );
        const destExpr = argExprs[1] ?? argExprs[0];
        const dest =
          destExpr && destExpr.k === 'var' ? interp.getArray(destExpr.name) : new Map<string, Value>();
        dest.clear();
        values.forEach((v, i) => dest.set(String(i + 1), v as Value));
        return values.length;
      }
      default:
        throw new Error(`função desconhecida: ${name}`);
    }
  };

  const execStmt = (s: Stmt): void => {
    switch (s.k) {
      case 'block':
        for (const st of s.body) execStmt(st);
        return;
      case 'nop':
        return;
      case 'expr':
        evalExpr(s.e);
        return;
      case 'print': {
        const ofs = str(interp.getVar('OFS'));
        const ors = str(interp.getVar('ORS'));
        const text =
          (s.args.length ? s.args.map((x) => outStr(evalExpr(x))).join(ofs) : str(interp.getField(0))) + ors;
        if (s.redir) interp.writeTo(s.redir.mode, str(evalExpr(s.redir.target)), text);
        else interp.output(text);
        return;
      }
      case 'printf': {
        const fmt = str(evalExpr(s.args[0] ?? { k: 'str', v: '' }));
        const text = sprintfAwk(fmt, s.args.slice(1).map((x) => evalExpr(x)));
        if (s.redir) interp.writeTo(s.redir.mode, str(evalExpr(s.redir.target)), text);
        else interp.output(text);
        return;
      }
      case 'if':
        if (truthy(evalExpr(s.cond))) execStmt(s.then);
        else if (s.else) execStmt(s.else);
        return;
      case 'while': {
        let guard = 0;
        while (truthy(evalExpr(s.cond))) {
          if (++guard > 2_000_000) throw new Error('laço muito longo (limite do runtime)');
          try {
            execStmt(s.body);
          } catch (sig) {
            if (sig instanceof Signal && sig.kind === 'break') break;
            if (sig instanceof Signal && sig.kind === 'continue') continue;
            throw sig;
          }
        }
        return;
      }
      case 'do': {
        let guard = 0;
        do {
          if (++guard > 2_000_000) throw new Error('laço muito longo (limite do runtime)');
          try {
            execStmt(s.body);
          } catch (sig) {
            if (sig instanceof Signal && sig.kind === 'break') break;
            if (sig instanceof Signal && sig.kind === 'continue') continue;
            throw sig;
          }
        } while (truthy(evalExpr(s.cond)));
        return;
      }
      case 'for': {
        if (s.init) execStmt(s.init);
        let guard = 0;
        while (s.cond ? truthy(evalExpr(s.cond)) : true) {
          if (++guard > 2_000_000) throw new Error('laço muito longo (limite do runtime)');
          try {
            execStmt(s.body);
          } catch (sig) {
            if (sig instanceof Signal && sig.kind === 'break') break;
            if (!(sig instanceof Signal && sig.kind === 'continue')) throw sig;
          }
          if (s.step) execStmt(s.step);
        }
        return;
      }
      case 'forin': {
        const arr = interp.getArray(s.array);
        for (const key of [...arr.keys()]) {
          interp.setVar(s.varName, looksNumeric(key) ? key : key);
          try {
            execStmt(s.body);
          } catch (sig) {
            if (sig instanceof Signal && sig.kind === 'break') break;
            if (!(sig instanceof Signal && sig.kind === 'continue')) throw sig;
          }
        }
        return;
      }
      case 'delete': {
        const arr = interp.getArray(s.name);
        if (!s.subs.length) arr.clear();
        else arr.delete(subscript(s.subs));
        return;
      }
      case 'next':
        throw new Signal('next');
      case 'nextfile':
        throw new Signal('nextfile');
      case 'break':
        throw new Signal('break');
      case 'continue':
        throw new Signal('continue');
      case 'return':
        throw new Signal('return', s.value ? evalExpr(s.value) : '');
      case 'exit':
        interp.exitCode = s.code ? Math.trunc(num(evalExpr(s.code))) : 0;
        throw new Signal('exit');
    }
  };

  const outStr = (v: Value): string => {
    if (typeof v === 'number' && !Number.isInteger(v)) {
      return sprintfAwk(str(interp.getVar('OFMT')), [v]);
    }
    return str(v);
  };

  // ---- entrada ----
  type Source = { name: string; lines: string[]; pos: number };
  const sources: Source[] = [];
  const errors: string[] = [];
  const splitRecords = (text: string): string[] => {
    const rs = str(interp.getVar('RS'));
    if (rs === '') return text.split(/\n{2,}/).filter((p) => p !== '');
    const ls = rs.length === 1 ? text.split(rs) : text.split(eregToJs(rs));
    if (ls[ls.length - 1] === '') ls.pop();
    return ls;
  };

  if (!files.length) {
    sources.push({ name: '', lines: splitRecords(stdin), pos: 0 });
  } else {
    for (const f of files) {
      const eq = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(f);
      if (eq) {
        sources.push({ name: `\u0000assign:${eq[1]}=${eq[2]}`, lines: [], pos: 0 });
        continue;
      }
      const p = sh.resolve(f);
      const c = sh.read(p);
      if (c == null) {
        errors.push(`awk: não foi possível abrir o arquivo ${f} (Arquivo ou diretório inexistente)`);
        continue;
      }
      sh.touchRead(p);
      sources.push({ name: p, lines: splitRecords(c), pos: 0 });
    }
  }

  let srcIdx = 0;
  const nextInputLine = (): string | null => {
    while (srcIdx < sources.length) {
      const s = sources[srcIdx];
      if (s.name.startsWith('\u0000assign:')) {
        const [k, v] = s.name.slice(8).split('=');
        interp.globals.set(k, looksNumeric(v) ? Number(v) : v);
        srcIdx += 1;
        continue;
      }
      if (s.pos < s.lines.length) {
        if (s.pos === 0) {
          interp.globals.set('FILENAME', s.name);
          interp.globals.set('FNR', 0);
        }
        return s.lines[s.pos++];
      }
      srcIdx += 1;
    }
    return null;
  };

  // ---- execução ----
  let stopped = false;
  try {
    for (const r of rules) {
      if (r.kind === 'begin') execStmt(r.body);
    }
  } catch (sig) {
    if (sig instanceof Signal && sig.kind === 'exit') stopped = true;
    else return awkError(sig, interp);
  }

  const needsInput = rules.some((r) => r.kind !== 'begin');
  if (!stopped && needsInput) {
    for (;;) {
      const line = nextInputLine();
      if (line == null) break;
      interp.setRecord(line);
      interp.globals.set('NR', num(interp.globals.get('NR') ?? 0) + 1);
      interp.globals.set('FNR', num(interp.globals.get('FNR') ?? 0) + 1);
      try {
        for (const r of rules) {
          if (r.kind !== 'pattern') continue;
          let matched: boolean;
          if (r.range) {
            const active = rangeState.get(r) ?? false;
            if (!active) {
              matched = truthy(evalExpr(r.range.from));
              if (matched) rangeState.set(r, !truthy(evalExpr(r.range.to)));
            } else {
              matched = true;
              if (truthy(evalExpr(r.range.to))) rangeState.set(r, false);
            }
          } else {
            matched = r.pattern ? truthy(evalExpr(r.pattern)) : true;
          }
          if (!matched) continue;
          if (r.body) execStmt(r.body);
          else interp.output(str(interp.getField(0)) + str(interp.getVar('ORS')));
        }
      } catch (sig) {
        if (sig instanceof Signal && sig.kind === 'next') continue;
        if (sig instanceof Signal && sig.kind === 'nextfile') {
          const s = sources[srcIdx];
          if (s) s.pos = s.lines.length;
          continue;
        }
        if (sig instanceof Signal && sig.kind === 'exit') {
          stopped = true;
          break;
        }
        return awkError(sig, interp);
      }
    }
  }

  try {
    for (const r of rules) {
      if (r.kind === 'end') execStmt(r.body);
    }
  } catch (sig) {
    if (!(sig instanceof Signal && sig.kind === 'exit')) return awkError(sig, interp);
  }

  return {
    stdout: interp.outBuf.join(''),
    stderr: [...errors, ...interp.errBuf].filter(Boolean).join('') || (errors.length ? errors.join('\n') + '\n' : ''),
    code: interp.exitCode || (errors.length ? 2 : 0),
  };
}

function awkError(sig: unknown, interp: Interp): ExecResult {
  const message = sig instanceof Error ? sig.message : String(sig);
  return {
    stdout: interp.outBuf.join(''),
    stderr: `awk: erro em tempo de execução: ${message}\n`,
    code: 2,
  };
}
