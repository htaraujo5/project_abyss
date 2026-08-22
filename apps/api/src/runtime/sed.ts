import {
  type CmdCtx,
  type ExecResult,
  err,
  out,
  toLines,
} from './shell-types.js';

type Address =
  | { kind: 'none' }
  | { kind: 'line'; n: number }
  | { kind: 'last' }
  | { kind: 'regex'; re: RegExp }
  | { kind: 'step'; first: number; step: number };

type Range = { from: Address; to?: Address; negate: boolean; active?: boolean };

type SedCmd =
  | { range: Range; op: 's'; re: RegExp; replacement: string; global: boolean; print: boolean; nth: number; write?: string }
  | { range: Range; op: 'y'; from: string; to: string }
  | { range: Range; op: 'd' | 'p' | 'P' | 'n' | 'N' | 'D' | 'h' | 'H' | 'g' | 'G' | 'x' | '=' | 'q' | 'Q' | 'l' | 'z' }
  | { range: Range; op: 'a' | 'i' | 'c'; text: string }
  | { range: Range; op: 'r' | 'w' | 'R' | 'W'; file: string }
  | { range: Range; op: 'block'; body: SedCmd[] };

/** Converte uma regex BRE/ERE do sed para JavaScript. */
function toJsRegex(src: string, extended: boolean, ignoreCase: boolean, multiline = false): RegExp {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1];
      if (next === undefined) {
        out += '\\\\';
        break;
      }
      if (!extended && '(){}|+?'.includes(next)) {
        // em BRE, \( \) \{ \} \| \+ \? são os metacaracteres
        out += next;
        i += 1;
        continue;
      }
      if (next === '<' || next === '>') {
        out += '\\b';
        i += 1;
        continue;
      }
      if (next === 'n') {
        out += '\\n';
        i += 1;
        continue;
      }
      if (next === 't') {
        out += '\\t';
        i += 1;
        continue;
      }
      out += '\\' + next;
      i += 1;
      continue;
    }
    if (!extended && '(){}|+?'.includes(ch)) {
      out += '\\' + ch;
      continue;
    }
    out += ch;
  }
  return new RegExp(out, (ignoreCase ? 'i' : '') + (multiline ? 'm' : ''));
}

function parseAddress(script: string, pos: number, extended: boolean): { addr: Address; pos: number } | null {
  const ch = script[pos];
  if (ch === '$') return { addr: { kind: 'last' }, pos: pos + 1 };
  if (/\d/.test(ch)) {
    const m = /^(\d+)(?:~(\d+))?/.exec(script.slice(pos))!;
    if (m[2]) {
      return { addr: { kind: 'step', first: Number(m[1]), step: Number(m[2]) }, pos: pos + m[0].length };
    }
    return { addr: { kind: 'line', n: Number(m[1]) }, pos: pos + m[0].length };
  }
  if (ch === '/' || ch === '\\') {
    const delim = ch === '\\' ? script[pos + 1] : '/';
    let i = ch === '\\' ? pos + 2 : pos + 1;
    let body = '';
    while (i < script.length && script[i] !== delim) {
      if (script[i] === '\\' && script[i + 1] === delim) {
        body += delim;
        i += 2;
        continue;
      }
      body += script[i];
      i += 1;
    }
    i += 1;
    let ic = false;
    while (script[i] === 'I' || script[i] === 'M') {
      if (script[i] === 'I') ic = true;
      i += 1;
    }
    return { addr: { kind: 'regex', re: toJsRegex(body, extended, ic) }, pos: i };
  }
  return null;
}

function parseScript(script: string, extended: boolean): { cmds: SedCmd[] } | { error: string } {
  const cmds: SedCmd[] = [];
  let i = 0;
  const parseList = (stopAtBrace: boolean): SedCmd[] | { error: string } => {
    const list: SedCmd[] = [];
    while (i < script.length) {
      // separadores
      while (i < script.length && /[\s;\n]/.test(script[i])) i += 1;
      if (i >= script.length) break;
      if (script[i] === '}') {
        if (stopAtBrace) {
          i += 1;
          return list;
        }
        i += 1;
        continue;
      }
      if (script[i] === '#') {
        while (i < script.length && script[i] !== '\n') i += 1;
        continue;
      }
      const first = parseAddress(script, i, extended);
      let range: Range = { from: { kind: 'none' }, negate: false };
      if (first) {
        i = first.pos;
        range.from = first.addr;
        if (script[i] === ',') {
          i += 1;
          const second = parseAddress(script, i, extended);
          if (!second) return { error: 'endereço final inválido' };
          i = second.pos;
          range.to = second.addr;
        }
      }
      while (script[i] === '!') {
        range.negate = !range.negate;
        i += 1;
      }
      while (/\s/.test(script[i] ?? '')) i += 1;
      const op = script[i];
      if (op === undefined) break;
      i += 1;
      if (op === '{') {
        const body = parseList(true);
        if ('error' in body) return body;
        list.push({ range, op: 'block', body });
        continue;
      }
      if (op === 's' || op === 'y') {
        const delim = script[i];
        if (!delim) return { error: `comando ${op} sem delimitador` };
        i += 1;
        const readPart = (): string => {
          let body = '';
          while (i < script.length && script[i] !== delim) {
            if (script[i] === '\\' && script[i + 1] === delim) {
              body += delim;
              i += 2;
              continue;
            }
            if (script[i] === '\\' && script[i + 1] === '\\') {
              body += '\\\\';
              i += 2;
              continue;
            }
            body += script[i];
            i += 1;
          }
          i += 1;
          return body;
        };
        const pattern = readPart();
        const replacement = readPart();
        if (op === 'y') {
          list.push({ range, op: 'y', from: pattern, to: replacement });
          continue;
        }
        let global = false;
        let print = false;
        let ic = false;
        let multiline = false;
        let nth = 1;
        let write: string | undefined;
        for (;;) {
          const f = script[i];
          if (f === 'g') global = true;
          else if (f === 'p') print = true;
          else if (f === 'i' || f === 'I') ic = true;
          else if (f === 'm' || f === 'M') multiline = true;
          else if (f && /\d/.test(f)) {
            const m = /^\d+/.exec(script.slice(i))!;
            nth = Number(m[0]);
            i += m[0].length - 1;
          } else if (f === 'w') {
            i += 1;
            while (/\s/.test(script[i] ?? '')) i += 1;
            let file = '';
            while (i < script.length && !/[;\n]/.test(script[i])) {
              file += script[i];
              i += 1;
            }
            write = file.trim();
            break;
          } else break;
          i += 1;
        }
        list.push({
          range,
          op: 's',
          re: toJsRegex(pattern, extended, ic, multiline),
          replacement,
          global,
          print,
          nth,
          write,
        });
        continue;
      }
      if (op === 'a' || op === 'i' || op === 'c') {
        let text = '';
        if (script[i] === '\\') i += 1;
        while (/[ \t]/.test(script[i] ?? '')) i += 1;
        while (i < script.length && script[i] !== '\n' && script[i] !== ';') {
          if (script[i] === '\\' && script[i + 1] === '\n') {
            text += '\n';
            i += 2;
            continue;
          }
          text += script[i];
          i += 1;
        }
        list.push({ range, op, text });
        continue;
      }
      if (op === 'r' || op === 'w' || op === 'R' || op === 'W') {
        while (/\s/.test(script[i] ?? '')) i += 1;
        let file = '';
        while (i < script.length && !/[;\n]/.test(script[i])) {
          file += script[i];
          i += 1;
        }
        list.push({ range, op, file: file.trim() });
        continue;
      }
      if ('dpPnNDhHgGx=qQlz'.includes(op)) {
        // `q` pode ter código de saída; ignoramos o número
        while (/[\s\d]/.test(script[i] ?? '') && script[i] !== '\n' && script[i] !== ';') i += 1;
        list.push({ range, op: op as 'd' });
        continue;
      }
      if (op === 'b' || op === 't' || op === 'T' || op === ':') {
        while (i < script.length && !/[;\n]/.test(script[i])) i += 1;
        continue;
      }
      return { error: `comando desconhecido: '${op}'` };
    }
    return list;
  };
  const list = parseList(false);
  if ('error' in list) return list;
  cmds.push(...list);
  return { cmds };
}

function expandReplacement(replacement: string, match: RegExpMatchArray): string {
  let res = '';
  for (let i = 0; i < replacement.length; i++) {
    const ch = replacement[i];
    if (ch === '\\') {
      const next = replacement[i + 1];
      if (next && /\d/.test(next)) {
        res += match[Number(next)] ?? '';
        i += 1;
        continue;
      }
      if (next === 'n') {
        res += '\n';
        i += 1;
        continue;
      }
      if (next === 't') {
        res += '\t';
        i += 1;
        continue;
      }
      if (next === '&') {
        res += '&';
        i += 1;
        continue;
      }
      if (next === 'U' || next === 'L' || next === 'E') {
        i += 1;
        continue;
      }
      if (next) {
        res += next;
        i += 1;
        continue;
      }
      continue;
    }
    if (ch === '&') {
      res += match[0];
      continue;
    }
    res += ch;
  }
  return res;
}

export function runSed(ctx: CmdCtx): ExecResult {
  const { args, sh, stdin } = ctx;
  const scripts: string[] = [];
  const files: string[] = [];
  let quiet = false;
  let inPlace = false;
  let extended = false;
  let separate = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n' || a === '--quiet' || a === '--silent') quiet = true;
    else if (a === '-i' || a.startsWith('-i')) inPlace = true;
    else if (a === '-E' || a === '-r' || a === '--regexp-extended') extended = true;
    else if (a === '-s') separate = true;
    else if (a === '-e' || a === '--expression') scripts.push(args[++i] ?? '');
    else if (a === '-f') {
      const p = sh.resolve(args[++i] ?? '');
      const c = sh.read(p);
      if (c == null) return err(`sed: não foi possível ler ${p}`);
      scripts.push(c);
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      // flags combinadas como -ni
      for (const ch of a.slice(1)) {
        if (ch === 'n') quiet = true;
        else if (ch === 'i') inPlace = true;
        else if (ch === 'E' || ch === 'r') extended = true;
        else if (ch === 's') separate = true;
      }
    } else if (!scripts.length) scripts.push(a);
    else files.push(a);
  }

  if (!scripts.length) return err('sed: nenhum script informado', 2);
  const parsed = parseScript(scripts.join('\n'), extended);
  if ('error' in parsed) return err(`sed: -e expressão nº1: ${parsed.error}`, 2);

  const inputs: { path: string; text: string }[] = [];
  if (!files.length) inputs.push({ path: '-', text: stdin });
  else {
    for (const f of files) {
      const p = sh.resolve(f);
      const c = sh.read(p);
      if (c == null) return err(`sed: não foi possível ler ${f}: Arquivo ou diretório inexistente`, 2);
      inputs.push({ path: p, text: c });
      sh.touchRead(p);
    }
  }

  let stdout = '';
  const stderr: string[] = [];

  const runOn = (text: string, filePath: string): string => {
    const ls = toLines(text);
    const output: string[] = [];
    let hold = '';
    let quit = false;
    const ranges = new Map<SedCmd, boolean>();

    const matches = (cmd: SedCmd, line: string, idx: number): boolean => {
      const r = cmd.range;
      const test = (addr: Address): boolean => {
        switch (addr.kind) {
          case 'none':
            return true;
          case 'line':
            return idx + 1 === addr.n;
          case 'last':
            return idx === ls.length - 1;
          case 'regex':
            return addr.re.test(line);
          case 'step':
            return addr.step > 0 && idx + 1 >= addr.first && (idx + 1 - addr.first) % addr.step === 0;
        }
      };
      let hit: boolean;
      if (r.from.kind === 'none') hit = true;
      else if (!r.to) hit = test(r.from);
      else {
        const active = ranges.get(cmd) ?? false;
        if (!active) {
          hit = test(r.from);
          if (hit) {
            const endsSameLine = r.to.kind === 'line' && r.to.n <= idx + 1;
            ranges.set(cmd, !endsSameLine);
          }
        } else {
          hit = true;
          if (test(r.to)) ranges.set(cmd, false);
        }
      }
      return r.negate ? !hit : hit;
    };

    for (let idx = 0; idx < ls.length && !quit; idx++) {
      let pattern = ls[idx];
      let deleted = false;
      const appendAfter: string[] = [];

      const execList = (list: SedCmd[]) => {
        for (const cmd of list) {
          if (deleted || quit) return;
          if (!matches(cmd, pattern, idx)) continue;
          switch (cmd.op) {
            case 'block':
              execList(cmd.body);
              break;
            case 's': {
              const re = new RegExp(cmd.re.source, cmd.re.flags.replace('g', '') + 'g');
              let result = '';
              let last = 0;
              let count = 0;
              let changed = false;
              let m: RegExpExecArray | null;
              while ((m = re.exec(pattern))) {
                count += 1;
                const shouldReplace = cmd.global ? count >= cmd.nth : count === cmd.nth;
                if (shouldReplace) {
                  result += pattern.slice(last, m.index) + expandReplacement(cmd.replacement, m);
                  changed = true;
                } else {
                  result += pattern.slice(last, m.index) + m[0];
                }
                last = m.index + m[0].length;
                if (m[0] === '') re.lastIndex += 1;
                if (!cmd.global && count >= cmd.nth) break;
              }
              if (changed) {
                pattern = result + pattern.slice(last);
                if (cmd.print) output.push(pattern);
                if (cmd.write) sh.write(sh.resolve(cmd.write), pattern + '\n');
              }
              break;
            }
            case 'y': {
              const from = [...cmd.from];
              const to = [...cmd.to];
              pattern = [...pattern].map((c) => {
                const i2 = from.indexOf(c);
                return i2 >= 0 ? to[i2] ?? c : c;
              }).join('');
              break;
            }
            case 'd':
              deleted = true;
              break;
            case 'D':
              deleted = true;
              break;
            case 'p':
            case 'P':
              output.push(cmd.op === 'P' ? pattern.split('\n')[0] : pattern);
              break;
            case 'n':
              if (!quiet) output.push(pattern);
              idx += 1;
              pattern = ls[idx] ?? '';
              break;
            case 'N':
              idx += 1;
              pattern = pattern + '\n' + (ls[idx] ?? '');
              break;
            case 'h':
              hold = pattern;
              break;
            case 'H':
              hold = hold + '\n' + pattern;
              break;
            case 'g':
              pattern = hold;
              break;
            case 'G':
              pattern = pattern + '\n' + hold;
              break;
            case 'x': {
              const t = pattern;
              pattern = hold;
              hold = t;
              break;
            }
            case '=':
              output.push(String(idx + 1));
              break;
            case 'q':
              if (!quiet) output.push(pattern);
              quit = true;
              deleted = true;
              break;
            case 'Q':
              quit = true;
              deleted = true;
              break;
            case 'z':
              pattern = '';
              break;
            case 'l':
              output.push(pattern.replace(/\t/g, '\\t') + '$');
              break;
            case 'a':
              appendAfter.push(cmd.text);
              break;
            case 'i':
              output.push(cmd.text);
              break;
            case 'c':
              output.push(cmd.text);
              deleted = true;
              break;
            case 'r': {
              const c = sh.read(sh.resolve(cmd.file));
              if (c != null) appendAfter.push(...toLines(c));
              break;
            }
            case 'R': {
              const c = sh.read(sh.resolve(cmd.file));
              if (c != null) appendAfter.push(toLines(c)[idx] ?? '');
              break;
            }
            case 'w':
              sh.write(sh.resolve(cmd.file), pattern + '\n');
              break;
            case 'W':
              sh.write(sh.resolve(cmd.file), pattern.split('\n')[0] + '\n');
              break;
          }
        }
      };

      execList(parsed.cmds);
      if (!deleted && !quiet) output.push(pattern);
      output.push(...appendAfter);
    }
    return output.length ? output.join('\n') + '\n' : '';
  };

  for (const input of inputs) {
    const res = runOn(input.text, input.path);
    if (inPlace && input.path !== '-') {
      sh.write(input.path, res);
      sh.emit(`file.modified:${input.path}`);
    } else stdout += res;
  }

  return {
    stdout,
    stderr: stderr.length ? stderr.join('\n') + '\n' : '',
    code: stderr.length ? 1 : 0,
  };
}
