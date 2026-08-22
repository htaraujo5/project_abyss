import { walkFiles } from './vfs.js';
import {
  type CmdCtx,
  type CommandSpec,
  type ExecResult,
  type ShellApi,
  err,
  lines,
  okEmpty,
  out,
  parseArgs,
  toLines,
  usage,
} from './shell-types.js';
import { runSed } from './sed.js';
import { runAwk } from './awk.js';
import { runJq } from './jq.js';

/** Lê os operandos como entrada concatenada; usa stdin quando não há arquivos. */
function inputOf(
  ctx: CmdCtx,
  files: string[],
): { text: string; errors: string[]; sources: { path: string; text: string }[] } {
  const { sh, stdin, name } = ctx;
  if (!files.length || (files.length === 1 && files[0] === '-')) {
    return { text: stdin, errors: [], sources: [{ path: '-', text: stdin }] };
  }
  const errors: string[] = [];
  const sources: { path: string; text: string }[] = [];
  for (const f of files) {
    const p = sh.resolve(f);
    const node = sh.node(p);
    if (!node) {
      errors.push(`${name}: ${f}: Arquivo ou diretório inexistente`);
      continue;
    }
    if (node.type === 'dir') {
      errors.push(`${name}: ${f}: É um diretório`);
      continue;
    }
    const bytes = sh.bytes(p) ?? Buffer.alloc(0);
    sources.push({ path: p, text: bytes.toString('utf8') });
    sh.touchRead(p);
  }
  return { text: sources.map((s) => s.text).join(''), errors, sources };
}

function withErrors(stdout: string, errors: string[]): ExecResult {
  return {
    stdout,
    stderr: errors.length ? errors.join('\n') + '\n' : '',
    code: errors.length ? 1 : 0,
  };
}

function ensureNl(text: string): string {
  return text === '' || text.endsWith('\n') ? text : text + '\n';
}

export const TEXT_COMMANDS: CommandSpec[] = [
  {
    name: 'cat',
    category: 'texto',
    synopsis: 'cat [-nAsE] [arquivo...]',
    summary: 'concatena e imprime arquivos',
    man: [
      '  -n  numera as linhas de saída',
      '  -b  numera apenas linhas não vazias',
      '  -s  comprime linhas vazias repetidas',
      '  -E  marca o fim de linha com $',
      '  -A  mostra caracteres de controle',
      '',
      'Sem arquivos, lê da entrada padrão (útil em pipes).',
    ],
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args);
      const { text, errors } = inputOf(ctx, operands);
      let body = text;
      if (flags.has('A') || flags.has('v')) {
        body = body.replace(/\t/g, '^I').replace(/\r/g, '^M');
      }
      if (flags.has('s')) body = body.replace(/\n{3,}/g, '\n\n');
      if (flags.has('E') || flags.has('A')) body = body.replace(/\n/g, '$\n');
      if (flags.has('n') || flags.has('b')) {
        let i = 0;
        body = toLines(body)
          .map((l) => {
            if (flags.has('b') && !l.trim()) return `      \t${l}`;
            i += 1;
            return `${String(i).padStart(6)}\t${l}`;
          })
          .join('\n');
        body = ensureNl(body);
      }
      return withErrors(body, errors);
    },
  },
  {
    name: 'tac',
    category: 'texto',
    synopsis: 'tac [arquivo...]',
    summary: 'imprime as linhas na ordem inversa',
    run: (ctx) => {
      const { operands } = parseArgs(ctx.args);
      const { text, errors } = inputOf(ctx, operands);
      return withErrors(ensureNl(toLines(text).reverse().join('\n')), errors);
    },
  },
  {
    name: 'head',
    category: 'texto',
    synopsis: 'head [-n N] [-c N] [arquivo...]',
    summary: 'primeiras linhas de um arquivo',
    run: (ctx) => {
      const { values, operands, flags } = parseArgs(ctx.args, { withValue: ['n', 'c'] });
      const numeric = ctx.args.find((a) => /^-\d+$/.test(a));
      const { sources, errors } = inputOf(ctx, operands);
      const n = Number(values.n ?? (numeric ? numeric.slice(1) : '10'));
      const parts: string[] = [];
      for (const s of sources) {
        const head = values.c
          ? s.text.slice(0, Number(values.c))
          : ensureNl(toLines(s.text).slice(0, n).join('\n'));
        parts.push(sources.length > 1 && !flags.has('q') ? `==> ${s.path} <==\n${head}` : head);
      }
      return withErrors(parts.join(sources.length > 1 ? '\n' : ''), errors);
    },
  },
  {
    name: 'tail',
    category: 'texto',
    synopsis: 'tail [-n N] [-c N] [arquivo...]',
    summary: 'últimas linhas de um arquivo',
    man: [
      '  -n N   número de linhas (aceita +N para começar na linha N)',
      '  -c N   número de bytes',
      '  -f     este runtime não tem fluxo contínuo: retorna o fim atual',
    ],
    run: (ctx) => {
      const { values, operands, flags } = parseArgs(ctx.args, { withValue: ['n', 'c'] });
      const numeric = ctx.args.find((a) => /^-\d+$/.test(a));
      const { sources, errors } = inputOf(ctx, operands);
      const raw = values.n ?? (numeric ? numeric.slice(1) : '10');
      const parts: string[] = [];
      for (const s of sources) {
        let body: string;
        if (values.c) body = s.text.slice(-Number(values.c));
        else if (raw.startsWith('+')) body = ensureNl(toLines(s.text).slice(Number(raw.slice(1)) - 1).join('\n'));
        else body = ensureNl(toLines(s.text).slice(-Number(raw)).join('\n'));
        parts.push(sources.length > 1 && !flags.has('q') ? `==> ${s.path} <==\n${body}` : body);
      }
      const note = flags.has('f') ? '' : '';
      return withErrors(parts.join(sources.length > 1 ? '\n' : '') + note, errors);
    },
  },
  {
    name: 'less',
    category: 'texto',
    synopsis: 'less arquivo',
    summary: 'paginador (imprime tudo neste terminal)',
    run: (ctx) => {
      const { operands } = parseArgs(ctx.args);
      const { text, errors } = inputOf(ctx, operands);
      return withErrors(text, errors);
    },
  },
  {
    name: 'more',
    category: 'texto',
    synopsis: 'more arquivo',
    summary: 'paginador simples',
    run: (ctx) => {
      const { operands } = parseArgs(ctx.args);
      const { text, errors } = inputOf(ctx, operands);
      return withErrors(text, errors);
    },
  },
  {
    name: 'grep',
    category: 'texto',
    synopsis: 'grep [-inrvcloEFwxq] [-A N] [-B N] [-C N] padrão [arquivo...]',
    summary: 'filtra linhas por expressão regular',
    man: [
      '  -i  ignora maiúsculas       -v  inverte a seleção',
      '  -n  prefixa o número da linha  -c  conta as ocorrências',
      '  -l  só nomes de arquivos    -L  só arquivos sem ocorrência',
      '  -r  recursivo em diretórios -o  imprime apenas o trecho casado',
      '  -E  regex estendida         -F  padrão literal',
      '  -w  palavra inteira         -x  linha inteira',
      '  -q  silencioso (só código de saída)',
      '  -A/-B/-C N  linhas de contexto depois/antes/em volta',
      '  -e padrão   pode repetir para múltiplos padrões',
      '  --include=glob / --exclude=glob  filtram arquivos em -r',
      '',
      'Exemplos:',
      '  grep -rn "MARIANA" /home/null',
      '  cat logs.txt | grep -i erro | wc -l',
    ],
    run: (ctx) => {
      const { flags, values, long, operands } = parseArgs(ctx.args, {
        withValue: ['A', 'B', 'C', 'e', 'm'],
        longWithValue: ['include', 'exclude'],
      });
      const patterns: string[] = [];
      if (values.e) patterns.push(values.e);
      let rest = operands;
      if (!patterns.length) {
        if (!operands.length) return usage('grep', 'grep [opções] padrão [arquivo...]');
        patterns.push(operands[0]);
        rest = operands.slice(1);
      }
      const ic = flags.has('i');
      const build = (p: string) => {
        let src = flags.has('F') ? p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : p;
        if (flags.has('w')) src = `\\b(?:${src})\\b`;
        if (flags.has('x')) src = `^(?:${src})$`;
        try {
          return new RegExp(src, (ic ? 'i' : '') + (flags.has('o') ? 'g' : ''));
        } catch {
          return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ic ? 'i' : '');
        }
      };
      const res = patterns.map(build);
      const match = (line: string) => res.some((r) => (r.lastIndex = 0, r.test(line)));

      const targets: { path: string; text: string }[] = [];
      const errors: string[] = [];
      if (flags.has('r') || flags.has('R')) {
        const roots = rest.length ? rest : ['.'];
        for (const r of roots) {
          const base = ctx.sh.resolve(r);
          const node = ctx.sh.node(base);
          if (!node) {
            errors.push(`grep: ${r}: Arquivo ou diretório inexistente`);
            continue;
          }
          if (node.type === 'file') {
            targets.push({ path: base, text: ctx.sh.read(base) ?? '' });
            continue;
          }
          for (const f of walkFiles(node, base)) {
            const name = f.path.split('/').pop() ?? '';
            if (typeof long.include === 'string' && !globTest(long.include, name)) continue;
            if (typeof long.exclude === 'string' && globTest(long.exclude, name)) continue;
            targets.push({ path: f.path, text: f.node.content ?? '' });
          }
        }
      } else if (!rest.length) {
        targets.push({ path: '-', text: ctx.stdin });
      } else {
        for (const f of rest) {
          const p = ctx.sh.resolve(f);
          const node = ctx.sh.node(p);
          if (!node) {
            errors.push(`grep: ${f}: Arquivo ou diretório inexistente`);
            continue;
          }
          if (node.type === 'dir') {
            errors.push(`grep: ${f}: É um diretório`);
            continue;
          }
          targets.push({ path: p, text: ctx.sh.read(p) ?? '' });
          ctx.sh.touchRead(p);
        }
      }

      const showName = targets.length > 1 && !flags.has('h');
      const outLines: string[] = [];
      let total = 0;
      const limit = values.m ? Number(values.m) : Infinity;
      for (const t of targets) {
        const ls = toLines(t.text);
        let count = 0;
        const chosen = new Set<number>();
        ls.forEach((line, i) => {
          const hit = match(line);
          if (flags.has('v') ? !hit : hit) {
            if (count >= limit) return;
            count += 1;
            chosen.add(i);
          }
        });
        total += count;
        if (flags.has('q')) continue;
        if (flags.has('l')) {
          if (count) outLines.push(t.path);
          continue;
        }
        if (flags.has('L')) {
          if (!count) outLines.push(t.path);
          continue;
        }
        if (flags.has('c')) {
          outLines.push(showName ? `${t.path}:${count}` : String(count));
          continue;
        }
        const before = Number(values.B ?? values.C ?? 0);
        const after = Number(values.A ?? values.C ?? 0);
        const emitted = new Set<number>();
        for (const i of [...chosen].sort((a, b) => a - b)) {
          for (let j = Math.max(0, i - before); j <= Math.min(ls.length - 1, i + after); j++) {
            if (emitted.has(j)) continue;
            emitted.add(j);
            const isHit = chosen.has(j);
            const sep = isHit ? ':' : '-';
            let text = ls[j];
            if (flags.has('o') && isHit) {
              const found: string[] = [];
              for (const r of res) {
                const g = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
                let m: RegExpExecArray | null;
                while ((m = g.exec(ls[j]))) {
                  found.push(m[0]);
                  if (m.index === g.lastIndex) g.lastIndex += 1;
                }
              }
              if (!found.length) continue;
              for (const f of found) {
                outLines.push(
                  (showName ? `${t.path}${sep}` : '') + (flags.has('n') ? `${j + 1}${sep}` : '') + f,
                );
              }
              continue;
            }
            outLines.push(
              (showName ? `${t.path}${sep}` : '') + (flags.has('n') ? `${j + 1}${sep}` : '') + text,
            );
          }
        }
      }
      if (errors.length && !targets.length) return err(errors.join('\n'), 2);
      const body = flags.has('q') ? '' : lines(outLines).stdout;
      return { stdout: body, stderr: errors.length ? errors.join('\n') + '\n' : '', code: total ? 0 : 1 };
    },
  },
  {
    name: 'cut',
    category: 'texto',
    synopsis: 'cut -f lista [-d delim] | -c lista [arquivo...]',
    summary: 'extrai colunas de cada linha',
    run: (ctx) => {
      const { values, flags, operands } = parseArgs(ctx.args, { withValue: ['d', 'f', 'c', 'b'] });
      const { text, errors } = inputOf(ctx, operands);
      const delim = values.d ?? '\t';
      const spec = values.f ?? values.c ?? values.b;
      if (!spec) return usage('cut', 'cut -f lista [-d delim] [arquivo]');
      const ranges = spec.split(',').map((r) => {
        const m = /^(\d*)-(\d*)$/.exec(r);
        if (m) return { from: Number(m[1] || 1), to: m[2] ? Number(m[2]) : Infinity };
        const n = Number(r);
        return { from: n, to: n };
      });
      const pick = <T>(arr: T[]): T[] => {
        const res: T[] = [];
        arr.forEach((v, i) => {
          const idx = i + 1;
          const inRange = ranges.some((r) => idx >= r.from && idx <= r.to);
          if (flags.has('-') ? !inRange : inRange) res.push(v);
        });
        return res;
      };
      const body = toLines(text)
        .map((line) => {
          if (values.c || values.b) return pick(line.split('')).join('');
          if (!line.includes(delim)) return flags.has('s') ? null : line;
          return pick(line.split(delim)).join(values['output-delimiter'] ?? delim);
        })
        .filter((l): l is string => l != null)
        .join('\n');
      return withErrors(ensureNl(body), errors);
    },
  },
  {
    name: 'tr',
    category: 'texto',
    synopsis: 'tr [-ds] conjunto1 [conjunto2]',
    summary: 'traduz ou remove caracteres',
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args);
      const set1 = expandSet(operands[0] ?? '');
      const set2 = expandSet(operands[1] ?? '');
      let body = ctx.stdin;
      if (flags.has('d')) {
        const del = new Set(set1);
        body = [...body].filter((c) => (flags.has('c') ? del.has(c) : !del.has(c))).join('');
      } else if (set2.length) {
        const map = new Map<string, string>();
        set1.forEach((c, i) => map.set(c, set2[Math.min(i, set2.length - 1)]));
        body = [...body].map((c) => map.get(c) ?? c).join('');
      }
      if (flags.has('s')) {
        const squeeze = new Set(set2.length ? set2 : set1);
        let res = '';
        for (const c of body) {
          if (squeeze.has(c) && res.endsWith(c)) continue;
          res += c;
        }
        body = res;
      }
      return out(body);
    },
  },
  {
    name: 'sort',
    category: 'texto',
    synopsis: 'sort [-nrufbh] [-k campo] [-t delim] [arquivo...]',
    summary: 'ordena linhas',
    man: [
      '  -n  numérico     -h  numérico com sufixos (1K, 2M)',
      '  -r  inverso      -u  remove duplicatas',
      '  -f  ignora caixa -b  ignora espaços iniciais',
      '  -k N  ordena pelo campo N   -t C  delimitador de campo',
      '  -V  ordem de versão',
    ],
    run: (ctx) => {
      const { flags, values, operands } = parseArgs(ctx.args, { withValue: ['k', 't'] });
      const { text, errors } = inputOf(ctx, operands);
      const delim = values.t;
      const keyOf = (line: string): string => {
        if (!values.k) return line;
        const spec = values.k.split(',')[0];
        const idx = Number(spec.replace(/[^\d].*$/, '')) - 1;
        const fields = delim ? line.split(delim) : line.trim().split(/\s+/);
        return fields[idx] ?? '';
      };
      let ls = toLines(text);
      const num = (s: string) => {
        const m = /-?\d+(?:[.,]\d+)?/.exec(s);
        return m ? Number(m[0].replace(',', '.')) : Number.NEGATIVE_INFINITY;
      };
      const hnum = (s: string) => {
        const m = /(-?\d+(?:\.\d+)?)\s*([KMGTP])?/i.exec(s.trim());
        if (!m) return Number.NEGATIVE_INFINITY;
        const mult: Record<string, number> = { K: 1024, M: 1048576, G: 1073741824, T: 1099511627776 };
        return Number(m[1]) * (m[2] ? mult[m[2].toUpperCase()] ?? 1 : 1);
      };
      ls.sort((a, b) => {
        let ka = keyOf(a);
        let kb = keyOf(b);
        if (flags.has('b')) {
          ka = ka.trimStart();
          kb = kb.trimStart();
        }
        if (flags.has('f')) {
          ka = ka.toLowerCase();
          kb = kb.toLowerCase();
        }
        if (flags.has('n')) return num(ka) - num(kb);
        if (flags.has('h')) return hnum(ka) - hnum(kb);
        if (flags.has('V')) return ka.localeCompare(kb, undefined, { numeric: true });
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      if (flags.has('r')) ls.reverse();
      if (flags.has('u')) {
        const seen = new Set<string>();
        ls = ls.filter((l) => {
          const k = flags.has('f') ? keyOf(l).toLowerCase() : keyOf(l);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
      return withErrors(ensureNl(ls.join('\n')), errors);
    },
  },
  {
    name: 'uniq',
    category: 'texto',
    synopsis: 'uniq [-cdui] [arquivo]',
    summary: 'colapsa linhas repetidas adjacentes',
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args);
      const { text, errors } = inputOf(ctx, operands);
      const ls = toLines(text);
      const groups: { line: string; count: number }[] = [];
      for (const l of ls) {
        const key = flags.has('i') ? l.toLowerCase() : l;
        const last = groups[groups.length - 1];
        if (last && (flags.has('i') ? last.line.toLowerCase() : last.line) === key) last.count += 1;
        else groups.push({ line: l, count: 1 });
      }
      let selected = groups;
      if (flags.has('d')) selected = groups.filter((g) => g.count > 1);
      if (flags.has('u')) selected = groups.filter((g) => g.count === 1);
      const body = selected
        .map((g) => (flags.has('c') ? `${String(g.count).padStart(7)} ${g.line}` : g.line))
        .join('\n');
      return withErrors(ensureNl(body), errors);
    },
  },
  {
    name: 'wc',
    category: 'texto',
    synopsis: 'wc [-lwcmL] [arquivo...]',
    summary: 'conta linhas, palavras e bytes',
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args);
      const { sources, errors } = inputOf(ctx, operands);
      const rows: string[] = [];
      let totals = { l: 0, w: 0, c: 0, m: 0, L: 0 };
      const fmt = (s: { l: number; w: number; c: number; m: number; L: number }, label: string) => {
        const parts: string[] = [];
        const none = !flags.has('l') && !flags.has('w') && !flags.has('c') && !flags.has('m') && !flags.has('L');
        if (flags.has('l') || none) parts.push(String(s.l).padStart(7));
        if (flags.has('w') || none) parts.push(String(s.w).padStart(7));
        if (flags.has('c') || none) parts.push(String(s.c).padStart(7));
        if (flags.has('m')) parts.push(String(s.m).padStart(7));
        if (flags.has('L')) parts.push(String(s.L).padStart(7));
        return parts.join('') + (label && label !== '-' ? ` ${label}` : '');
      };
      for (const s of sources) {
        const ls = toLines(s.text);
        const stat = {
          l: ls.length,
          w: s.text.trim() ? s.text.trim().split(/\s+/).length : 0,
          c: Buffer.byteLength(s.text, 'utf8'),
          m: [...s.text].length,
          L: ls.reduce((m, l) => Math.max(m, l.length), 0),
        };
        totals = {
          l: totals.l + stat.l,
          w: totals.w + stat.w,
          c: totals.c + stat.c,
          m: totals.m + stat.m,
          L: Math.max(totals.L, stat.L),
        };
        rows.push(fmt(stat, s.path));
      }
      if (sources.length > 1) rows.push(fmt(totals, 'total'));
      return withErrors(ensureNl(rows.join('\n')), errors);
    },
  },
  {
    name: 'nl',
    category: 'texto',
    synopsis: 'nl [-ba] [arquivo]',
    summary: 'numera as linhas',
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args, { withValue: ['b'] });
      const { text, errors } = inputOf(ctx, operands);
      let n = 0;
      const body = toLines(text)
        .map((l) => {
          if (!l.trim() && !flags.has('a')) return '       ' + l;
          n += 1;
          return `${String(n).padStart(6)}\t${l}`;
        })
        .join('\n');
      return withErrors(ensureNl(body), errors);
    },
  },
  {
    name: 'rev',
    category: 'texto',
    synopsis: 'rev [arquivo]',
    summary: 'inverte os caracteres de cada linha',
    run: (ctx) => {
      const { operands } = parseArgs(ctx.args);
      const { text, errors } = inputOf(ctx, operands);
      return withErrors(
        ensureNl(
          toLines(text)
            .map((l) => [...l].reverse().join(''))
            .join('\n'),
        ),
        errors,
      );
    },
  },
  {
    name: 'fold',
    category: 'texto',
    synopsis: 'fold [-w N] [-s] [arquivo]',
    summary: 'quebra linhas longas',
    run: (ctx) => {
      const { values, flags, operands } = parseArgs(ctx.args, { withValue: ['w'] });
      const width = Number(values.w ?? '80');
      const { text, errors } = inputOf(ctx, operands);
      const res: string[] = [];
      for (const line of toLines(text)) {
        if (line.length <= width) {
          res.push(line);
          continue;
        }
        let rest = line;
        while (rest.length > width) {
          let cut = width;
          if (flags.has('s')) {
            const sp = rest.lastIndexOf(' ', width);
            if (sp > 0) cut = sp + 1;
          }
          res.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        res.push(rest);
      }
      return withErrors(ensureNl(res.join('\n')), errors);
    },
  },
  {
    name: 'expand',
    category: 'texto',
    synopsis: 'expand [-t N] [arquivo]',
    summary: 'converte tabulações em espaços',
    run: (ctx) => {
      const { values, operands } = parseArgs(ctx.args, { withValue: ['t'] });
      const size = Number(values.t ?? '8');
      const { text, errors } = inputOf(ctx, operands);
      return withErrors(text.replace(/\t/g, ' '.repeat(size)), errors);
    },
  },
  {
    name: 'unexpand',
    category: 'texto',
    synopsis: 'unexpand [-t N] [arquivo]',
    summary: 'converte espaços em tabulações',
    run: (ctx) => {
      const { values, operands } = parseArgs(ctx.args, { withValue: ['t'] });
      const size = Number(values.t ?? '8');
      const { text, errors } = inputOf(ctx, operands);
      return withErrors(text.split(' '.repeat(size)).join('\t'), errors);
    },
  },
  {
    name: 'paste',
    category: 'texto',
    synopsis: 'paste [-d delim] [-s] arquivo...',
    summary: 'junta arquivos lado a lado',
    run: (ctx) => {
      const { values, flags, operands } = parseArgs(ctx.args, { withValue: ['d'] });
      const delim = values.d ?? '\t';
      const { sources, errors } = inputOf(ctx, operands);
      if (flags.has('s')) {
        const body = sources.map((s) => toLines(s.text).join(delim)).join('\n');
        return withErrors(ensureNl(body), errors);
      }
      const cols = sources.map((s) => toLines(s.text));
      const height = Math.max(0, ...cols.map((c) => c.length));
      const rows: string[] = [];
      for (let i = 0; i < height; i++) rows.push(cols.map((c) => c[i] ?? '').join(delim));
      return withErrors(ensureNl(rows.join('\n')), errors);
    },
  },
  {
    name: 'join',
    category: 'texto',
    synopsis: 'join [-1 N] [-2 N] [-t C] arquivo1 arquivo2',
    summary: 'junta linhas com campo em comum',
    run: (ctx) => {
      const { values, operands } = parseArgs(ctx.args, { withValue: ['1', '2', 't', 'j'] });
      if (operands.length < 2) return usage('join', 'join arquivo1 arquivo2');
      const { sources, errors } = inputOf(ctx, operands);
      if (sources.length < 2) return withErrors('', errors);
      const t = values.t;
      const f1 = Number(values['1'] ?? values.j ?? '1') - 1;
      const f2 = Number(values['2'] ?? values.j ?? '1') - 1;
      const split = (l: string) => (t ? l.split(t) : l.trim().split(/\s+/));
      const map = new Map<string, string[][]>();
      for (const l of toLines(sources[1].text)) {
        const f = split(l);
        const key = f[f2] ?? '';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(f);
      }
      const res: string[] = [];
      for (const l of toLines(sources[0].text)) {
        const f = split(l);
        const key = f[f1] ?? '';
        for (const other of map.get(key) ?? []) {
          res.push(
            [
              key,
              ...f.filter((_, i) => i !== f1),
              ...other.filter((_, i) => i !== f2),
            ].join(t ?? ' '),
          );
        }
      }
      return withErrors(ensureNl(res.join('\n')), errors);
    },
  },
  {
    name: 'comm',
    category: 'texto',
    synopsis: 'comm [-123] arquivo1 arquivo2',
    summary: 'compara dois arquivos ordenados linha a linha',
    man: [
      '  Saída em três colunas: só no 1º, só no 2º, em ambos.',
      '  -1 -2 -3 suprimem a coluna correspondente.',
      '',
      'Exemplo: comm -13 antes.txt depois.txt  → só o que apareceu depois',
    ],
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args);
      if (operands.length < 2) return usage('comm', 'comm arquivo1 arquivo2');
      const { sources, errors } = inputOf(ctx, operands);
      if (sources.length < 2) return withErrors('', errors);
      const a = toLines(sources[0].text);
      const b = toLines(sources[1].text);
      let i = 0;
      let j = 0;
      const res: string[] = [];
      const emit = (col: 1 | 2 | 3, line: string) => {
        if (flags.has(String(col))) return;
        let indent = '';
        if (col >= 2 && !flags.has('1')) indent += '\t';
        if (col === 3 && !flags.has('2')) indent += '\t';
        res.push(indent + line);
      };
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
          emit(3, a[i]);
          i += 1;
          j += 1;
        } else if (a[i] < b[j]) {
          emit(1, a[i]);
          i += 1;
        } else {
          emit(2, b[j]);
          j += 1;
        }
      }
      while (i < a.length) emit(1, a[i++]);
      while (j < b.length) emit(2, b[j++]);
      return withErrors(ensureNl(res.join('\n')), errors);
    },
  },
  {
    name: 'diff',
    category: 'texto',
    synopsis: 'diff [-u] [-q] [-i] [-w] arquivo1 arquivo2',
    summary: 'compara arquivos linha a linha',
    man: [
      '  -u  formato unificado (com cabeçalho @@)',
      '  -q  apenas informa se diferem',
      '  -i  ignora diferença de caixa',
      '  -w  ignora espaços em branco',
      '  -y  colunas lado a lado',
      '',
      'Aceita process substitution: diff <(cmd1) <(cmd2)',
    ],
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args);
      if (operands.length < 2) return usage('diff', 'diff arquivo1 arquivo2');
      const pa = ctx.sh.resolve(operands[0]);
      const pb = ctx.sh.resolve(operands[1]);
      const ca = ctx.sh.read(pa);
      const cb = ctx.sh.read(pb);
      if (ca == null) return err(`diff: ${operands[0]}: Arquivo ou diretório inexistente`, 2);
      if (cb == null) return err(`diff: ${operands[1]}: Arquivo ou diretório inexistente`, 2);
      ctx.sh.touchRead(pa);
      ctx.sh.touchRead(pb);
      const norm = (s: string) => {
        let v = s;
        if (flags.has('i')) v = v.toLowerCase();
        if (flags.has('w')) v = v.replace(/\s+/g, '');
        return v;
      };
      const A = toLines(ca);
      const B = toLines(cb);
      const same = A.length === B.length && A.every((l, i) => norm(l) === norm(B[i]));
      if (flags.has('q')) {
        return same
          ? okEmpty()
          : { stdout: `Os arquivos ${operands[0]} e ${operands[1]} são diferentes\n`, stderr: '', code: 1 };
      }
      if (same) return okEmpty();
      const hunks = diffLines(A, B, norm);
      if (flags.has('y')) {
        const width = Math.max(...A.map((l) => l.length), 20) + 2;
        const rows = hunks.map((h) => {
          if (h.kind === 'same') return `${h.a!.padEnd(width)}  ${h.b}`;
          if (h.kind === 'del') return `${h.a!.padEnd(width)}<`;
          if (h.kind === 'add') return `${''.padEnd(width)}> ${h.b}`;
          return `${(h.a ?? '').padEnd(width)}| ${h.b ?? ''}`;
        });
        return { stdout: ensureNl(rows.join('\n')), stderr: '', code: 1 };
      }
      if (flags.has('u')) {
        const body = [
          `--- ${operands[0]}`,
          `+++ ${operands[1]}`,
          `@@ -1,${A.length} +1,${B.length} @@`,
          ...hunks.flatMap((h) => {
            if (h.kind === 'same') return [` ${h.a}`];
            if (h.kind === 'del') return [`-${h.a}`];
            if (h.kind === 'add') return [`+${h.b}`];
            return [`-${h.a}`, `+${h.b}`];
          }),
        ];
        ctx.sh.emit(`command.output:diff:${pa}:${pb}`);
        return { stdout: ensureNl(body.join('\n')), stderr: '', code: 1 };
      }
      const res: string[] = [];
      hunks.forEach((h, i) => {
        if (h.kind === 'same') return;
        if (h.kind === 'del') res.push(`${i + 1}d`, `< ${h.a}`);
        else if (h.kind === 'add') res.push(`${i + 1}a`, `> ${h.b}`);
        else res.push(`${i + 1}c${i + 1}`, `< ${h.a}`, '---', `> ${h.b}`);
      });
      ctx.sh.emit(`command.output:diff:${pa}:${pb}`);
      return { stdout: ensureNl(res.join('\n')), stderr: '', code: 1 };
    },
  },
  {
    name: 'tee',
    category: 'texto',
    synopsis: 'tee [-a] arquivo...',
    summary: 'copia a entrada para arquivos e para a saída',
    run: (ctx) => {
      const { flags, operands } = parseArgs(ctx.args);
      for (const a of operands) {
        const p = ctx.sh.resolve(a);
        if (flags.has('a')) ctx.sh.append(p, ctx.stdin);
        else ctx.sh.write(p, ctx.stdin);
        ctx.sh.emit(`file.modified:${p}`);
      }
      return out(ctx.stdin);
    },
  },
  {
    name: 'xargs',
    category: 'shell',
    synopsis: 'xargs [-n N] [-I marca] [-d delim] comando',
    summary: 'monta comandos a partir da entrada padrão',
    run: (ctx) => {
      const { values, operands } = parseArgs(ctx.args, { withValue: ['n', 'I', 'd', 'P'] });
      const base = operands.length ? operands : ['echo'];
      const items = values.d
        ? ctx.stdin.split(values.d).filter(Boolean)
        : ctx.stdin.split(/\s+/).filter(Boolean);
      if (!items.length) return okEmpty();
      const chunks: string[][] = [];
      if (values.I) {
        for (const it of items) chunks.push([it]);
      } else {
        const n = Number(values.n ?? String(items.length));
        for (let i = 0; i < items.length; i += n) chunks.push(items.slice(i, i + n));
      }
      let stdout = '';
      let stderr = '';
      let code = 0;
      for (const chunk of chunks) {
        const line = values.I
          ? base.map((t) => t.split(values.I!).join(chunk[0])).join(' ')
          : [...base, ...chunk].join(' ');
        const r = ctx.sh.runLine(line);
        stdout += r.stdout;
        stderr += r.stderr;
        if (r.code !== 0) code = r.code;
      }
      return { stdout, stderr, code };
    },
  },
  {
    name: 'seq',
    category: 'shell',
    synopsis: 'seq [primeiro [passo]] último',
    summary: 'imprime sequências numéricas',
    run: ({ args }) => {
      const nums = args.filter((a) => !a.startsWith('-')).map(Number);
      let from = 1;
      let step = 1;
      let to = 0;
      if (nums.length === 1) to = nums[0];
      else if (nums.length === 2) [from, to] = nums;
      else if (nums.length >= 3) [from, step, to] = nums;
      if (!Number.isFinite(from) || !Number.isFinite(to) || !step) return err('seq: argumento inválido');
      const res: string[] = [];
      if (step > 0) for (let v = from; v <= to + 1e-9; v += step) res.push(trimNum(v));
      else for (let v = from; v >= to - 1e-9; v += step) res.push(trimNum(v));
      if (res.length > 20000) return err('seq: sequência muito longa para este runtime');
      return lines(res);
    },
  },
  {
    name: 'shuf',
    category: 'texto',
    synopsis: 'shuf [-n N] [arquivo]',
    summary: 'embaralha linhas (determinístico por save)',
    run: (ctx) => {
      const { values, operands } = parseArgs(ctx.args, { withValue: ['n'] });
      const { text, errors } = inputOf(ctx, operands);
      const ls = toLines(text);
      const rnd = ctx.sh.rand('shuf:' + ls.length);
      for (let i = ls.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [ls[i], ls[j]] = [ls[j], ls[i]];
      }
      const n = values.n ? Number(values.n) : ls.length;
      return withErrors(ensureNl(ls.slice(0, n).join('\n')), errors);
    },
  },
  {
    name: 'column',
    category: 'texto',
    synopsis: 'column [-t] [-s sep]',
    summary: 'alinha colunas',
    run: (ctx) => {
      const { values, operands } = parseArgs(ctx.args, { withValue: ['s'] });
      const { text, errors } = inputOf(ctx, operands);
      const sep = values.s ?? /\s+/;
      const rows = toLines(text).map((l) => l.split(sep as string));
      const widths: number[] = [];
      for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, c.length)));
      const body = rows
        .map((r) => r.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ').trimEnd())
        .join('\n');
      return withErrors(ensureNl(body), errors);
    },
  },
  {
    name: 'fmt',
    category: 'texto',
    synopsis: 'fmt [-w N]',
    summary: 'reflui parágrafos',
    run: (ctx) => {
      const { values, operands } = parseArgs(ctx.args, { withValue: ['w'] });
      const width = Number(values.w ?? '75');
      const { text, errors } = inputOf(ctx, operands);
      const res: string[] = [];
      for (const para of text.split(/\n\s*\n/)) {
        const words = para.split(/\s+/).filter(Boolean);
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > width) {
            res.push(line.trim());
            line = w;
          } else line += ' ' + w;
        }
        if (line.trim()) res.push(line.trim());
        res.push('');
      }
      while (res[res.length - 1] === '') res.pop();
      return withErrors(ensureNl(res.join('\n')), errors);
    },
  },
  {
    name: 'dos2unix',
    category: 'texto',
    synopsis: 'dos2unix [arquivo...]',
    summary: 'remove CR de fim de linha',
    run: (ctx) => {
      const { operands } = parseArgs(ctx.args);
      if (!operands.length) return out(ctx.stdin.replace(/\r\n/g, '\n'));
      for (const a of operands) {
        const p = ctx.sh.resolve(a);
        const c = ctx.sh.read(p);
        if (c == null) return err(`dos2unix: ${a}: Arquivo ou diretório inexistente`);
        ctx.sh.write(p, c.replace(/\r\n/g, '\n'));
      }
      return out(`dos2unix: convertendo ${operands.length} arquivo(s)\n`);
    },
  },
  {
    name: 'sed',
    category: 'texto',
    synopsis: "sed [-n] [-i] [-E] [-e] 'script' [arquivo...]",
    summary: 'editor de fluxo (substituição, exclusão, impressão)',
    man: [
      '  -n  não imprime automaticamente (use com p)',
      '  -i  edita o arquivo no lugar',
      '  -E  expressões regulares estendidas',
      '  -e  acrescenta outro comando ao script',
      '',
      'Comandos suportados: s/re/rep/[gip], p, d, a\\, i\\, c\\, y///, q, =, n, N',
      'Endereços: número, $, /regex/, faixas N,M e /re1/,/re2/',
      '',
      'Exemplos:',
      "  sed -n '5,10p' arquivo.log",
      "  sed 's/\\(0x[0-9a-f]*\\)/[\\1]/g' dump.txt",
      "  sed -n '/ERROR/,/RECOVER/p' kernel.log",
    ],
    run: (ctx) => runSed(ctx),
  },
  {
    name: 'awk',
    category: 'texto',
    synopsis: "awk [-F sep] [-v var=val] 'programa' [arquivo...]",
    summary: 'processador de campos e registros',
    man: [
      '  -F sep      separador de campos (aceita regex)',
      '  -v var=val  define variável antes da execução',
      '',
      'Suporta: BEGIN/END, padrões (regex, expressões, faixas), blocos com',
      'if/else, for, while, arrays associativos, print/printf, getline de',
      'arquivo, next, exit, e as funções length, substr, index, split, sub,',
      'gsub, match, sprintf, tolower, toupper, sin, cos, int, sqrt, exp, log,',
      'rand, srand, systime, strftime.',
      '',
      'Variáveis: NR, NF, FS, OFS, ORS, RS, FILENAME, $0..$NF.',
      '',
      'Exemplos:',
      "  awk -F, '{ print $2, $5 }' dados.csv",
      "  awk '$3 > 100 { total += $3 } END { print total }' latencias.txt",
      "  awk '/DROP/ { c[$2]++ } END { for (k in c) print k, c[k] }' fw.log",
    ],
    run: (ctx) => runAwk(ctx),
  },
  {
    name: 'jq',
    category: 'dados',
    synopsis: "jq [-r] [-c] [-s] 'filtro' [arquivo...]",
    summary: 'consulta e transforma JSON',
    man: [
      '  -r  saída crua (sem aspas em strings)',
      '  -c  saída compacta',
      '  -s  agrega toda a entrada num array (slurp)',
      '  -e  código de saída 1 quando o resultado é nulo/falso',
      '',
      'Filtros suportados: ., .campo, .a.b, .[i], .[], .[a:b], pipes,',
      'vírgula, construção de objeto/array, keys, values, length, type,',
      'select, map, has, to_entries, from_entries, add, sort, sort_by,',
      'group_by, unique, min, max, reverse, join, split, tostring, tonumber,',
      'ascii_downcase, ascii_upcase, contains, test, startswith, endswith,',
      'first, last, any, all, flatten, empty, not, recurse, paths, tojson,',
      'fromjson, env, e os operadores // == != > < >= <= and or + - * / %.',
      '',
      'Exemplos:',
      "  jq '.services[] | select(.latency > 100) | .name' trace.json",
      "  jq -r '.keys | to_entries[] | \"\\(.key)=\\(.value)\"' vault.json",
    ],
    run: (ctx) => runJq(ctx),
  },
];

function trimNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
}

function globTest(glob: string, name: string): boolean {
  const re = new RegExp(
    '^' +
      glob
        .split('')
        .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
        .join('') +
      '$',
  );
  return re.test(name);
}

function expandSet(spec: string): string[] {
  const classes: Record<string, string> = {
    '[:alpha:]': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '[:lower:]': 'abcdefghijklmnopqrstuvwxyz',
    '[:upper:]': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '[:digit:]': '0123456789',
    '[:alnum:]': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    '[:space:]': ' \t\n\r\f\v',
    '[:punct:]': '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  };
  let text = spec;
  for (const [k, v] of Object.entries(classes)) text = text.split(k).join(v);
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const n = text[i + 1];
      out.push(n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n);
      i += 1;
      continue;
    }
    if (text[i + 1] === '-' && i + 2 < text.length) {
      const from = text.charCodeAt(i);
      const to = text.charCodeAt(i + 2);
      for (let c = from; c <= to; c++) out.push(String.fromCharCode(c));
      i += 2;
      continue;
    }
    out.push(text[i]);
  }
  return out;
}

type Hunk = { kind: 'same' | 'add' | 'del' | 'chg'; a?: string; b?: string };

/** LCS clássico, suficiente para os tamanhos de arquivo do jogo. */
function diffLines(A: string[], B: string[], norm: (s: string) => string): Hunk[] {
  const n = A.length;
  const m = B.length;
  if (n * m > 4_000_000) {
    // arquivos grandes: comparação posicional
    const res: Hunk[] = [];
    for (let i = 0; i < Math.max(n, m); i++) {
      if (i < n && i < m) {
        res.push(norm(A[i]) === norm(B[i]) ? { kind: 'same', a: A[i], b: B[i] } : { kind: 'chg', a: A[i], b: B[i] });
      } else if (i < n) res.push({ kind: 'del', a: A[i] });
      else res.push({ kind: 'add', b: B[i] });
    }
    return res;
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = norm(A[i]) === norm(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const res: Hunk[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(A[i]) === norm(B[j])) {
      res.push({ kind: 'same', a: A[i], b: B[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      res.push({ kind: 'del', a: A[i] });
      i += 1;
    } else {
      res.push({ kind: 'add', b: B[j] });
      j += 1;
    }
  }
  while (i < n) res.push({ kind: 'del', a: A[i++] });
  while (j < m) res.push({ kind: 'add', b: B[j++] });
  return res;
}

export { inputOf, ensureNl, withErrors };
export type { ShellApi };
