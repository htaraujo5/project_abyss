/**
 * Parser de shell no estilo POSIX para o runtime do jogo.
 *
 * Suporta: listas (`;`, nova linha), `&&`/`||`, pipelines, redirecionamentos
 * (`>`, `>>`, `<`, `2>`, `2>>`, `&>`, `2>&1`, `>&2`, `<<<`, heredoc), aspas
 * simples/duplas, escape com barra invertida, expansão de til, chaves, variáveis,
 * substituição de comando (`$(...)` e crases) e process substitution (`<(...)`).
 *
 * A expansão em si acontece no shell (precisa de env, VFS e execução aninhada);
 * aqui apenas preservamos a estrutura e a informação de aspas.
 */

export type Quote = 'none' | 'single' | 'double';
export type WordPart = { text: string; quote: Quote };
export type Word = WordPart[];

export type Redir =
  | { kind: 'write'; fd: 1 | 2; word: Word; append: boolean }
  | { kind: 'read'; word: Word }
  | { kind: 'dup'; fd: 1 | 2; target: 1 | 2 }
  | { kind: 'heredoc'; text: string; expand: boolean };

export type SimpleCommand = { words: Word[]; redirs: Redir[] };
export type Pipeline = { commands: SimpleCommand[] };
export type AndOr = { op: '&&' | '||' | null; pipeline: Pipeline };
/** Uma lista é uma sequência de pipelines ligados por `&&`/`||`. */
export type List = { items: AndOr[]; background: boolean };
export type Script = { lists: List[] };

export type ParseError = { error: string };

const OPERATORS = [
  '2>>',
  '&>>',
  '2>&1',
  '1>&2',
  '>&2',
  '<<<',
  '||',
  '&&',
  '>>',
  '<<',
  '2>',
  '&>',
  ';;',
  '|',
  ';',
  '&',
  '>',
  '<',
  '\n',
] as const;

type Token =
  | { type: 'word'; word: Word }
  | { type: 'op'; op: string }
  | { type: 'io'; fd: 1 | 2 };

const GLOB_CHARS = /[*?[]/;

export function hasGlob(text: string): boolean {
  return GLOB_CHARS.test(text);
}

/** Extrai o texto delimitado a partir de `start` (que aponta para o abre). */
function scanBalanced(src: string, start: number, open: string, close: string): number {
  let depth = 0;
  let q: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '\\' && q === '"') i += 1;
      else if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tokenize(src: string): Token[] | ParseError {
  const tokens: Token[] = [];
  let i = 0;
  let cur: Word = [];
  let curText = '';
  let curQuote: Quote = 'none';

  const flushPart = () => {
    if (curText) {
      cur.push({ text: curText, quote: curQuote });
      curText = '';
    }
    curQuote = 'none';
  };
  const flushWord = () => {
    flushPart();
    if (cur.length) {
      tokens.push({ type: 'word', word: cur });
      cur = [];
    }
  };

  while (i < src.length) {
    const ch = src[i];

    // comentário
    if (ch === '#' && !cur.length && !curText) {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      flushWord();
      i += 1;
      continue;
    }

    if (ch === '\\') {
      const next = src[i + 1];
      if (next === '\n' || next === undefined) {
        i += 2;
        continue;
      }
      curText += next;
      if (curQuote === 'none') curQuote = 'double'; // escapado: não sofre glob
      i += 2;
      continue;
    }

    if (ch === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) return { error: 'aspas simples não fechadas' };
      flushPart();
      cur.push({ text: src.slice(i + 1, end), quote: 'single' });
      i = end + 1;
      continue;
    }

    if (ch === '"') {
      flushPart();
      let text = '';
      let j = i + 1;
      let closed = false;
      while (j < src.length) {
        const c = src[j];
        if (c === '\\') {
          const n = src[j + 1];
          if (n && '$`"\\\n'.includes(n)) {
            if (n !== '\n') text += n;
            j += 2;
            continue;
          }
          text += c;
          j += 1;
          continue;
        }
        if (c === '"') {
          closed = true;
          break;
        }
        if (c === '$' && src[j + 1] === '(') {
          const end = scanBalanced(src, j + 1, '(', ')');
          if (end < 0) return { error: 'substituição de comando não fechada' };
          text += src.slice(j, end + 1);
          j = end + 1;
          continue;
        }
        text += c;
        j += 1;
      }
      if (!closed) return { error: 'aspas duplas não fechadas' };
      cur.push({ text, quote: 'double' });
      i = j + 1;
      continue;
    }

    // substituição de comando e process substitution entram no texto cru
    if (ch === '$' && src[i + 1] === '(') {
      const end = scanBalanced(src, i + 1, '(', ')');
      if (end < 0) return { error: 'substituição de comando não fechada' };
      curText += src.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end < 0) return { error: 'crase não fechada' };
      curText += '$(' + src.slice(i + 1, end) + ')';
      i = end + 1;
      continue;
    }
    if ((ch === '<' || ch === '>') && src[i + 1] === '(') {
      const end = scanBalanced(src, i + 1, '(', ')');
      if (end < 0) return { error: 'process substitution não fechada' };
      curText += src.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // operadores
    const rest = src.slice(i);
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) {
      // `2>` só é redirecionamento se o dígito estiver isolado
      flushWord();
      tokens.push({ type: 'op', op });
      i += op.length;
      continue;
    }

    // fd explícito antes de > (ex.: `2> file` já coberto; `1>file`)
    if (/^[12]>/.test(rest)) {
      flushWord();
      tokens.push({ type: 'op', op: rest[1] === '>' && rest[2] === '>' ? '>>' : '>' });
      i += rest[2] === '>' ? 3 : 2;
      continue;
    }

    curText += ch;
    i += 1;
  }
  flushWord();
  return tokens;
}

function wordText(w: Word): string {
  return w.map((p) => p.text).join('');
}

export function parse(src: string): Script | ParseError {
  // heredocs: extrai antes de tokenizar
  const heredocs: { tag: string; text: string; expand: boolean }[] = [];
  let text = src;
  const hdRe = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;
  for (;;) {
    const m = hdRe.exec(text);
    if (!m) break;
    const tag = m[2];
    const after = text.slice(m.index + m[0].length);
    const nl = after.indexOf('\n');
    if (nl < 0) break;
    const bodyStart = nl + 1;
    const endRe = new RegExp(`^\\s*${tag}\\s*$`, 'm');
    const bodyRest = after.slice(bodyStart);
    const em = endRe.exec(bodyRest);
    const body = em ? bodyRest.slice(0, em.index) : bodyRest;
    heredocs.push({ tag, text: body, expand: m[1] === '' });
    text =
      text.slice(0, m.index) +
      `\u0000HD${heredocs.length - 1}\u0000` +
      after.slice(0, nl) +
      (em ? bodyRest.slice(em.index + em[0].length) : '');
  }

  const tokens = tokenize(text);
  if ('error' in tokens) return tokens;

  const lists: List[] = [];
  let items: AndOr[] = [];
  let commands: SimpleCommand[] = [];
  let current: SimpleCommand = { words: [], redirs: [] };
  let pendingOp: '&&' | '||' | null = null;
  let background = false;

  const endCommand = () => {
    if (current.words.length || current.redirs.length) commands.push(current);
    current = { words: [], redirs: [] };
  };
  const endPipeline = () => {
    endCommand();
    if (commands.length) {
      items.push({ op: pendingOp, pipeline: { commands } });
      commands = [];
    }
    pendingOp = null;
  };
  const endList = () => {
    endPipeline();
    if (items.length) lists.push({ items, background });
    items = [];
    background = false;
  };

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    if (tok.type === 'word') {
      const raw = wordText(tok.word);
      const hd = /^\u0000HD(\d+)\u0000$/.exec(raw);
      if (hd) {
        const doc = heredocs[Number(hd[1])];
        if (doc) current.redirs.push({ kind: 'heredoc', text: doc.text, expand: doc.expand });
        continue;
      }
      current.words.push(tok.word);
      continue;
    }
    if (tok.type === 'io') continue;

    const op = tok.op;
    if (op === '|') {
      endCommand();
      continue;
    }
    if (op === '&&' || op === '||') {
      endPipeline();
      pendingOp = op;
      continue;
    }
    if (op === ';' || op === '\n' || op === ';;') {
      endList();
      continue;
    }
    if (op === '&') {
      background = true;
      endList();
      continue;
    }
    if (op === '2>&1') {
      current.redirs.push({ kind: 'dup', fd: 2, target: 1 });
      continue;
    }
    if (op === '1>&2' || op === '>&2') {
      current.redirs.push({ kind: 'dup', fd: 1, target: 2 });
      continue;
    }
    if (op === '<<<') {
      const next = tokens[t + 1];
      if (next?.type === 'word') {
        current.redirs.push({ kind: 'heredoc', text: wordText(next.word) + '\n', expand: true });
        t += 1;
      }
      continue;
    }
    if (op === '<<') {
      // heredoc sem corpo capturado: ignora o delimitador
      const next = tokens[t + 1];
      if (next?.type === 'word') t += 1;
      continue;
    }
    if (op === '>' || op === '>>' || op === '2>' || op === '2>>' || op === '&>' || op === '&>>') {
      const next = tokens[t + 1];
      if (!next || next.type !== 'word') return { error: `redirecionamento sem destino após ${op}` };
      const append = op.endsWith('>>');
      const fd: 1 | 2 = op.startsWith('2') ? 2 : 1;
      current.redirs.push({ kind: 'write', fd, word: next.word, append });
      if (op.startsWith('&')) current.redirs.push({ kind: 'dup', fd: 2, target: 1 });
      t += 1;
      continue;
    }
    if (op === '<') {
      const next = tokens[t + 1];
      if (!next || next.type !== 'word') return { error: 'redirecionamento sem origem após <' };
      current.redirs.push({ kind: 'read', word: next.word });
      t += 1;
      continue;
    }
  }
  endList();

  return { lists };
}

/** Expansão de chaves: `a{1,2}b` → `a1b a2b`; `{1..4}` → `1 2 3 4`. */
export function expandBraces(input: string): string[] {
  const open = input.indexOf('{');
  if (open < 0) return [input];
  const close = scanBalanced(input, open, '{', '}');
  if (close < 0) return [input];
  const prefix = input.slice(0, open);
  const body = input.slice(open + 1, close);
  const suffix = input.slice(close + 1);
  const range = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(body);
  let variants: string[];
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    const step = Math.abs(Number(range[3] ?? 1)) || 1;
    variants = [];
    if (from <= to) for (let v = from; v <= to; v += step) variants.push(String(v));
    else for (let v = from; v >= to; v -= step) variants.push(String(v));
  } else {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of body) {
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    parts.push(cur);
    if (parts.length < 2) return [input];
    variants = parts;
  }
  const out: string[] = [];
  for (const v of variants) {
    for (const tail of expandBraces(suffix)) out.push(prefix + v + tail);
  }
  return out;
}

/** Converte um glob shell em regex ancorada. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else if (ch === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end < 0) out += '\\[';
      else {
        let cls = glob.slice(i + 1, end);
        if (cls.startsWith('!')) cls = '^' + cls.slice(1);
        out += `[${cls}]`;
        i = end;
      }
    } else out += ch.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}
