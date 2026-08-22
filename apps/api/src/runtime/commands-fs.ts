import type { VfsNode } from '@abyss/shared';
import {
  getNode,
  nodeMode,
  nodeMtime,
  nodeSize,
  parentOf,
  walkFiles,
} from './vfs.js';
import {
  type CommandSpec,
  type ExecResult,
  err,
  lines,
  okEmpty,
  out,
  parseArgs,
  toLines,
  usage,
} from './shell-types.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtTime(d: Date): string {
  const mm = MONTHS[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, ' ');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm} ${day} ${hh}:${mi}`;
}

export function human(n: number): string {
  if (n < 1024) return `${n}`;
  const units = ['K', 'M', 'G', 'T'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}${units[i]}`;
}

/** Percorre recursivamente a partir de um caminho, incluindo diretórios. */
function walkAll(
  root: VfsNode,
  path: string,
  fn: (p: string, n: VfsNode, depth: number) => void,
  depth = 0,
  maxDepth = Infinity,
) {
  const node = getNode(root, path);
  if (!node) return;
  fn(path, node, depth);
  if (node.type === 'dir' && depth < maxDepth) {
    for (const name of Object.keys(node.children ?? {}).sort()) {
      walkAll(root, `${path === '/' ? '' : path}/${name}`, fn, depth + 1, maxDepth);
    }
  }
}

export const FS_COMMANDS: CommandSpec[] = [
  {
    name: 'ls',
    category: 'navegação',
    synopsis: 'ls [-alhrtSR1d] [caminho...]',
    summary: 'lista o conteúdo de diretórios',
    man: [
      '  -a  inclui entradas que começam com ponto',
      '  -l  formato longo (modo, dono, tamanho, data)',
      '  -h  tamanhos legíveis (com -l)',
      '  -r  ordem inversa      -t  ordena por data',
      '  -S  ordena por tamanho -R  recursivo',
      '  -1  uma entrada por linha',
      '  -d  mostra o diretório em si, não o conteúdo',
      '  -F  marca tipos com sufixo (/ para diretório)',
      '  -i  mostra o número de inode',
    ],
    run: ({ args, sh }) => {
      const { flags, operands } = parseArgs(args);
      const all = flags.has('a');
      const long = flags.has('l');
      const one = flags.has('1');
      const hum = flags.has('h');
      const rec = flags.has('R');
      const dirOnly = flags.has('d');
      const targets = operands.length ? operands : ['.'];
      const chunks: string[] = [];
      const errors: string[] = [];

      const render = (dirPath: string, showHeader: boolean) => {
        const node = sh.node(dirPath);
        if (!node) {
          errors.push(`ls: não foi possível acessar '${dirPath}': arquivo ou diretório inexistente`);
          return;
        }
        if (node.type === 'file' || dirOnly) {
          chunks.push(renderEntries(dirPath, [{ name: dirPath, node }]));
          return;
        }
        const names = Object.keys(node.children ?? {}).filter((n) => all || !n.startsWith('.'));
        let entries = names.map((n) => ({
          name: n,
          node: node.children![n],
        }));
        if (flags.has('t')) {
          entries.sort(
            (a, b) =>
              nodeMtime(`${dirPath}/${b.name}`, b.node).getTime() -
              nodeMtime(`${dirPath}/${a.name}`, a.node).getTime(),
          );
        } else if (flags.has('S')) {
          entries.sort((a, b) => nodeSize(b.node) - nodeSize(a.node));
        } else {
          entries.sort((a, b) => a.name.localeCompare(b.name));
        }
        if (flags.has('r')) entries = entries.reverse();
        if (all) {
          entries = [
            { name: '.', node },
            { name: '..', node: sh.node(parentOf(dirPath).parent) ?? node },
            ...entries,
          ];
        }
        if (showHeader) chunks.push(`${dirPath}:\n` + renderEntries(dirPath, entries));
        else chunks.push(renderEntries(dirPath, entries));
        if (rec) {
          for (const e of entries) {
            if (e.node.type === 'dir' && e.name !== '.' && e.name !== '..') {
              render(sh.resolve(`${dirPath}/${e.name}`), true);
            }
          }
        }
      };

      const renderEntries = (dirPath: string, entries: { name: string; node: VfsNode }[]) => {
        if (long) {
          const total = entries.reduce((s, e) => s + Math.ceil(nodeSize(e.node) / 1024), 0);
          const rows = entries.map((e) => {
            const size = nodeSize(e.node);
            const links = e.node.type === 'dir' ? Object.keys(e.node.children ?? {}).length + 2 : 1;
            return [
              nodeMode(e.node, e.name),
              String(links).padStart(2),
              'null',
              'null',
              (hum ? human(size) : String(size)).padStart(hum ? 5 : 7),
              fmtTime(nodeMtime(`${dirPath}/${e.name}`, e.node)),
              e.name + (flags.has('F') && e.node.type === 'dir' ? '/' : ''),
            ].join(' ');
          });
          return `total ${total}\n` + rows.join('\n');
        }
        const names = entries.map(
          (e) => e.name + ((flags.has('F') || !long) && e.node.type === 'dir' ? '/' : ''),
        );
        if (one || names.length <= 1) return names.join('\n');
        // colunas simples de 80 caracteres
        const width = Math.max(...names.map((n) => n.length)) + 2;
        const cols = Math.max(1, Math.floor(80 / width));
        const rows: string[] = [];
        for (let i = 0; i < names.length; i += cols) {
          rows.push(
            names
              .slice(i, i + cols)
              .map((n) => n.padEnd(width))
              .join('')
              .trimEnd(),
          );
        }
        return rows.join('\n');
      };

      for (const t of targets) {
        const expanded = sh.glob(t);
        const list = expanded.length ? expanded : [sh.resolve(t)];
        for (const p of list) render(p, targets.length > 1 || expanded.length > 1);
      }
      const body = chunks.filter(Boolean).join('\n\n');
      return {
        stdout: body ? body + '\n' : '',
        stderr: errors.length ? errors.join('\n') + '\n' : '',
        code: errors.length ? 2 : 0,
      };
    },
  },
  {
    name: 'tree',
    category: 'navegação',
    synopsis: 'tree [-a] [-L nível] [caminho]',
    summary: 'mostra a árvore de diretórios',
    run: ({ args, sh }) => {
      const { flags, values, operands } = parseArgs(args, { withValue: ['L'] });
      const maxDepth = values.L ? Number(values.L) : Infinity;
      const start = sh.resolve(operands[0] ?? '.');
      const node = sh.node(start);
      if (!node) return err(`tree: ${start}: arquivo ou diretório inexistente`);
      const outLines: string[] = [start];
      let dirs = 0;
      let files = 0;
      const walk = (path: string, prefix: string, depth: number) => {
        if (depth > maxDepth) return;
        const n = sh.node(path);
        if (!n || n.type !== 'dir') return;
        const names = Object.keys(n.children ?? {})
          .filter((x) => flags.has('a') || !x.startsWith('.'))
          .sort();
        names.forEach((name, i) => {
          const last = i === names.length - 1;
          const child = n.children![name];
          outLines.push(`${prefix}${last ? '└── ' : '├── '}${name}${child.type === 'dir' ? '/' : ''}`);
          if (child.type === 'dir') {
            dirs += 1;
            walk(`${path === '/' ? '' : path}/${name}`, prefix + (last ? '    ' : '│   '), depth + 1);
          } else files += 1;
        });
      };
      walk(start, '', 1);
      outLines.push('', `${dirs} diretórios, ${files} arquivos`);
      return lines(outLines);
    },
  },
  {
    name: 'stat',
    category: 'arquivos',
    synopsis: 'stat [-c formato] arquivo...',
    summary: 'exibe metadados de arquivos',
    run: ({ args, sh }) => {
      const { values, operands } = parseArgs(args, { withValue: ['c'] });
      if (!operands.length) return usage('stat', 'stat arquivo...');
      const outLines: string[] = [];
      const errors: string[] = [];
      for (const a of operands) {
        const p = sh.resolve(a);
        const node = sh.node(p);
        if (!node) {
          errors.push(`stat: não foi possível ler '${a}': arquivo ou diretório inexistente`);
          continue;
        }
        const size = nodeSize(node);
        const mtime = nodeMtime(p, node);
        const mode = nodeMode(node, p.split('/').pop() ?? '');
        const octal = modeToOctal(mode);
        if (values.c) {
          outLines.push(
            values.c
              .replace(/%n/g, p)
              .replace(/%s/g, String(size))
              .replace(/%F/g, node.type === 'dir' ? 'directory' : 'regular file')
              .replace(/%a/g, octal)
              .replace(/%U/g, 'null')
              .replace(/%G/g, 'null')
              .replace(/%Y/g, String(Math.floor(mtime.getTime() / 1000))),
          );
          continue;
        }
        const inode = 1000000 + (hash(p) % 8000000);
        outLines.push(
          `  Arquivo: ${p}`,
          `  Tamanho: ${size}\tBlocos: ${Math.ceil(size / 512)}\tBloco de E/S: 4096\t${
            node.type === 'dir' ? 'diretório' : 'arquivo comum'
          }`,
          `Dispositivo: 0,42\tInode: ${inode}\tLinks: ${node.type === 'dir' ? 2 : 1}`,
          `Acesso: (${octal}/${mode})  Uid: ( 1000/    null)   Gid: ( 1000/    null)`,
          `Modific.: ${mtime.toISOString().replace('T', ' ').replace('Z', ' +0000')}`,
        );
      }
      return {
        stdout: outLines.length ? outLines.join('\n') + '\n' : '',
        stderr: errors.length ? errors.join('\n') + '\n' : '',
        code: errors.length ? 1 : 0,
      };
    },
  },
  {
    name: 'file',
    category: 'arquivos',
    synopsis: 'file arquivo...',
    summary: 'identifica o tipo de um arquivo pelo conteúdo',
    run: ({ args, sh }) => {
      const { operands } = parseArgs(args);
      if (!operands.length) return usage('file', 'file arquivo...');
      const res: string[] = [];
      for (const a of operands) {
        const p = sh.resolve(a);
        const node = sh.node(p);
        if (!node) {
          res.push(`${a}: cannot open (No such file or directory)`);
          continue;
        }
        if (node.type === 'dir') {
          res.push(`${a}: directory`);
          continue;
        }
        res.push(`${a}: ${describeFile(p, sh.bytes(p) ?? Buffer.alloc(0))}`);
      }
      return lines(res);
    },
  },
  {
    name: 'du',
    category: 'arquivos',
    synopsis: 'du [-sh] [--max-depth=N] [caminho...]',
    summary: 'espaço ocupado por diretórios',
    run: ({ args, sh }) => {
      const { flags, long, operands } = parseArgs(args, { longWithValue: ['max-depth'] });
      const targets = operands.length ? operands : ['.'];
      const maxDepth = typeof long['max-depth'] === 'string' ? Number(long['max-depth']) : Infinity;
      const res: string[] = [];
      for (const t of targets) {
        const base = sh.resolve(t);
        const sizes = new Map<string, number>();
        walkAll(sh.root, base, (p, n) => {
          const size = n.type === 'file' ? Math.max(1, Math.ceil(nodeSize(n) / 1024)) : 1;
          let cur = p;
          for (;;) {
            sizes.set(cur, (sizes.get(cur) ?? 0) + size);
            if (cur === base || cur === '/') break;
            cur = parentOf(cur).parent || '/';
            if (!cur.startsWith(base)) break;
          }
        });
        const entries = [...sizes.entries()]
          .filter(([p]) => {
            if (flags.has('s')) return p === base;
            const depth = p === base ? 0 : p.slice(base.length).split('/').filter(Boolean).length;
            return depth <= maxDepth && (flags.has('a') || sh.node(p)?.type === 'dir' || p === base);
          })
          .sort((a, b) => a[0].localeCompare(b[0]));
        for (const [p, kb] of entries) {
          res.push(`${flags.has('h') ? human(kb * 1024).padEnd(6) : String(kb).padEnd(8)}${p}`);
        }
      }
      return lines(res);
    },
  },
  {
    name: 'df',
    category: 'sistema',
    synopsis: 'df [-h] [caminho]',
    summary: 'uso dos sistemas de arquivos montados',
    run: ({ args, sh }) => {
      const { flags } = parseArgs(args);
      const used = walkFiles(sh.root).reduce((s, f) => s + nodeSize(f.node), 0);
      const usedKb = Math.ceil(used / 1024) + 184320;
      const rows: [string, number, number, string][] = [
        ['/dev/mapper/quarantine-root', 8388608, usedKb, '/'],
        ['tmpfs', 1048576, 1284, '/tmp'],
        ['tmpfs', 524288, 0, '/dev/shm'],
        ['abyss-overlay', 4194304, 92160, '/mnt/abyss'],
      ];
      const fmt = (kb: number) => (flags.has('h') ? human(kb * 1024) : String(kb));
      const head = flags.has('h')
        ? 'Sist. Arq.                  Tam. Usado Disp. Uso% Montado em'
        : 'Sist. Arq.                 1K-blocos    Usado     Disp. Uso% Montado em';
      const body = rows.map(([fs, total, u, mount]) => {
        const avail = total - u;
        const pct = Math.round((u / total) * 100);
        return `${fs.padEnd(26)} ${fmt(total).padStart(9)} ${fmt(u).padStart(8)} ${fmt(avail).padStart(9)} ${String(
          pct,
        ).padStart(3)}% ${mount}`;
      });
      return lines([head, ...body]);
    },
  },
  {
    name: 'find',
    category: 'navegação',
    synopsis: 'find [caminho] [-name padrão] [-type f|d] [-size ±N] [-maxdepth N] [-exec cmd {} ;]',
    summary: 'busca recursiva por arquivos e diretórios',
    man: [
      '  -name / -iname   casa o nome com um glob',
      '  -path            casa o caminho completo com um glob',
      '  -type f|d        filtra por tipo',
      '  -size +N / -N    tamanho em blocos de 512 (c para bytes: -size +100c)',
      '  -maxdepth N      limita a profundidade',
      '  -newer arquivo   modificado depois do arquivo dado',
      '  -empty           arquivos vazios',
      '  -exec cmd {} \\;  executa um comando para cada resultado',
      '  -delete          remove os resultados',
    ],
    run: ({ args, sh }) => {
      let start = '.';
      let idx = 0;
      if (args[0] && !args[0].startsWith('-')) {
        start = args[0];
        idx = 1;
      }
      const base = sh.resolve(start);
      if (!sh.exists(base)) return err(`find: '${start}': arquivo ou diretório inexistente`);
      let namePat: string | null = null;
      let iname = false;
      let pathPat: string | null = null;
      let type: 'f' | 'd' | null = null;
      let maxDepth = Infinity;
      let minDepth = 0;
      let sizeExpr: string | null = null;
      let newerThan: number | null = null;
      let empty = false;
      let execCmd: string[] | null = null;
      let doDelete = false;
      let grepPat: string | null = null;

      for (let i = idx; i < args.length; i++) {
        const a = args[i];
        switch (a) {
          case '-name':
            namePat = args[++i] ?? '';
            break;
          case '-iname':
            namePat = args[++i] ?? '';
            iname = true;
            break;
          case '-path':
          case '-wholename':
            pathPat = args[++i] ?? '';
            break;
          case '-type':
            type = (args[++i] ?? 'f') as 'f' | 'd';
            break;
          case '-maxdepth':
            maxDepth = Number(args[++i] ?? '1');
            break;
          case '-mindepth':
            minDepth = Number(args[++i] ?? '0');
            break;
          case '-size':
            sizeExpr = args[++i] ?? '';
            break;
          case '-empty':
            empty = true;
            break;
          case '-newer': {
            const ref = sh.resolve(args[++i] ?? '');
            const n = sh.node(ref);
            newerThan = n ? nodeMtime(ref, n).getTime() : null;
            break;
          }
          case '-delete':
            doDelete = true;
            break;
          case '-print':
          case '-print0':
            break;
          case '-exec': {
            const rest: string[] = [];
            i += 1;
            while (i < args.length && args[i] !== ';' && args[i] !== '\\;') {
              rest.push(args[i]);
              i += 1;
            }
            execCmd = rest;
            break;
          }
          default:
            if (a === '-grep') grepPat = args[++i] ?? '';
        }
      }

      const results: string[] = [];
      walkAll(
        sh.root,
        base,
        (p, n, depth) => {
          if (depth < minDepth) return;
          const name = p.split('/').pop() ?? '';
          if (namePat) {
            const re = globRe(iname ? namePat.toLowerCase() : namePat);
            if (!re.test(iname ? name.toLowerCase() : name)) return;
          }
          if (pathPat && !globRe(pathPat).test(p)) return;
          if (type === 'f' && n.type !== 'file') return;
          if (type === 'd' && n.type !== 'dir') return;
          if (empty && nodeSize(n) !== 0 && n.type === 'file') return;
          if (newerThan != null && nodeMtime(p, n).getTime() <= newerThan) return;
          if (sizeExpr) {
            const m = /^([+-]?)(\d+)([ckMG]?)$/.exec(sizeExpr);
            if (m) {
              const unit = m[3] === 'c' ? 1 : m[3] === 'k' ? 1024 : m[3] === 'M' ? 1048576 : m[3] === 'G' ? 1073741824 : 512;
              const want = Number(m[2]) * unit;
              const size = nodeSize(n);
              if (m[1] === '+' && !(size > want)) return;
              if (m[1] === '-' && !(size < want)) return;
              if (!m[1] && Math.ceil(size / unit) !== Number(m[2])) return;
            }
          }
          if (grepPat) {
            const c = n.type === 'file' ? sh.read(p) : null;
            if (c == null || !new RegExp(grepPat).test(c)) return;
          }
          results.push(p);
        },
        0,
        maxDepth,
      );

      if (execCmd?.length) {
        const collected: string[] = [];
        let code = 0;
        for (const r of results) {
          const line = execCmd.map((t) => (t === '{}' ? r : t)).join(' ');
          const res = sh.runLine(line);
          collected.push(res.stdout);
          if (res.stderr) collected.push(res.stderr);
          if (res.code !== 0) code = res.code;
        }
        return { stdout: collected.join(''), stderr: '', code };
      }
      if (doDelete) {
        for (const r of [...results].reverse()) sh.remove(r);
        return okEmpty();
      }
      return lines(results);
    },
  },
  {
    name: 'locate',
    category: 'navegação',
    synopsis: 'locate padrão',
    summary: 'busca no índice de caminhos do volume',
    run: ({ args, sh }) => {
      const pat = args[0];
      if (!pat) return usage('locate', 'locate padrão');
      const hits = walkFiles(sh.root)
        .map((f) => f.path)
        .filter((p) => p.toLowerCase().includes(pat.toLowerCase()));
      return lines(hits);
    },
  },
  {
    name: 'mkdir',
    category: 'arquivos',
    synopsis: 'mkdir [-p] diretório...',
    summary: 'cria diretórios',
    run: ({ args, sh }) => {
      const { flags, operands } = parseArgs(args);
      if (!operands.length) return usage('mkdir', 'mkdir [-p] diretório...');
      const errors: string[] = [];
      for (const a of operands) {
        const p = sh.resolve(a);
        if (sh.exists(p)) {
          if (!flags.has('p')) errors.push(`mkdir: não foi possível criar o diretório '${a}': Arquivo existe`);
          continue;
        }
        const { parent } = parentOf(p);
        if (!flags.has('p') && !sh.exists(parent)) {
          errors.push(`mkdir: não foi possível criar o diretório '${a}': Arquivo ou diretório inexistente`);
          continue;
        }
        sh.mkdirp(p);
        sh.emit(`file.modified:${p}`);
      }
      return errors.length ? err(errors.join('\n')) : okEmpty();
    },
  },
  {
    name: 'rmdir',
    category: 'arquivos',
    synopsis: 'rmdir diretório...',
    summary: 'remove diretórios vazios',
    run: ({ args, sh }) => {
      const { operands } = parseArgs(args);
      const errors: string[] = [];
      for (const a of operands) {
        const p = sh.resolve(a);
        const n = sh.node(p);
        if (!n) errors.push(`rmdir: falha ao remover '${a}': Arquivo ou diretório inexistente`);
        else if (n.type !== 'dir') errors.push(`rmdir: falha ao remover '${a}': Não é um diretório`);
        else if (Object.keys(n.children ?? {}).length) errors.push(`rmdir: falha ao remover '${a}': Diretório não vazio`);
        else sh.remove(p);
      }
      return errors.length ? err(errors.join('\n')) : okEmpty();
    },
  },
  {
    name: 'rm',
    category: 'arquivos',
    synopsis: 'rm [-rfv] arquivo...',
    summary: 'remove arquivos e diretórios',
    run: ({ args, sh }) => {
      const { flags, operands } = parseArgs(args);
      if (!operands.length && !flags.has('f')) return usage('rm', 'rm [-rf] arquivo...');
      const errors: string[] = [];
      const outLines: string[] = [];
      for (const a of operands) {
        const p = sh.resolve(a);
        const n = sh.node(p);
        if (!n) {
          if (!flags.has('f')) errors.push(`rm: não foi possível remover '${a}': Arquivo ou diretório inexistente`);
          continue;
        }
        if (n.type === 'dir' && !flags.has('r') && !flags.has('R')) {
          errors.push(`rm: não foi possível remover '${a}': É um diretório`);
          continue;
        }
        if (p === '/' || p === '/home' || p === '/home/null') {
          errors.push(`rm: recusando remover '${p}': proteção do runtime`);
          continue;
        }
        sh.remove(p);
        sh.emit(`file.deleted:${p}`);
        if (flags.has('v')) outLines.push(`removido '${a}'`);
      }
      return {
        stdout: outLines.length ? outLines.join('\n') + '\n' : '',
        stderr: errors.length ? errors.join('\n') + '\n' : '',
        code: errors.length ? 1 : 0,
      };
    },
  },
  {
    name: 'cp',
    category: 'arquivos',
    synopsis: 'cp [-rv] origem... destino',
    summary: 'copia arquivos e diretórios',
    run: ({ args, sh }) => {
      const { flags, operands } = parseArgs(args);
      if (operands.length < 2) return usage('cp', 'cp [-r] origem... destino');
      const dest = sh.resolve(operands[operands.length - 1]);
      const sources = operands.slice(0, -1);
      const destNode = sh.node(dest);
      const destIsDir = destNode?.type === 'dir';
      const errors: string[] = [];
      const outLines: string[] = [];
      for (const s of sources) {
        const src = sh.resolve(s);
        const node = sh.node(src);
        if (!node) {
          errors.push(`cp: não foi possível abrir '${s}' para leitura: Arquivo ou diretório inexistente`);
          continue;
        }
        if (node.type === 'dir' && !flags.has('r') && !flags.has('R')) {
          errors.push(`cp: -r não especificado; omitindo diretório '${s}'`);
          continue;
        }
        const target = destIsDir ? `${dest === '/' ? '' : dest}/${src.split('/').pop()}` : dest;
        copyInto(sh, src, target);
        sh.emit(`file.modified:${target}`);
        if (flags.has('v')) outLines.push(`'${s}' -> '${target}'`);
      }
      return {
        stdout: outLines.length ? outLines.join('\n') + '\n' : '',
        stderr: errors.length ? errors.join('\n') + '\n' : '',
        code: errors.length ? 1 : 0,
      };
    },
  },
  {
    name: 'mv',
    category: 'arquivos',
    synopsis: 'mv origem... destino',
    summary: 'move ou renomeia arquivos',
    run: ({ args, sh }) => {
      const { flags, operands } = parseArgs(args);
      if (operands.length < 2) return usage('mv', 'mv origem... destino');
      const dest = sh.resolve(operands[operands.length - 1]);
      const destIsDir = sh.node(dest)?.type === 'dir';
      const errors: string[] = [];
      const outLines: string[] = [];
      for (const s of operands.slice(0, -1)) {
        const src = sh.resolve(s);
        if (!sh.exists(src)) {
          errors.push(`mv: não foi possível mover '${s}': Arquivo ou diretório inexistente`);
          continue;
        }
        const target = destIsDir ? `${dest === '/' ? '' : dest}/${src.split('/').pop()}` : dest;
        copyInto(sh, src, target);
        sh.remove(src);
        sh.emit(`file.modified:${target}`);
        if (flags.has('v')) outLines.push(`'${s}' -> '${target}'`);
      }
      return {
        stdout: outLines.length ? outLines.join('\n') + '\n' : '',
        stderr: errors.length ? errors.join('\n') + '\n' : '',
        code: errors.length ? 1 : 0,
      };
    },
  },
  {
    name: 'ln',
    category: 'arquivos',
    synopsis: 'ln [-s] alvo nome',
    summary: 'cria ligações (simbólicas copiam conteúdo neste runtime)',
    run: ({ args, sh }) => {
      const { operands } = parseArgs(args);
      if (operands.length < 2) return usage('ln', 'ln [-s] alvo nome');
      const target = sh.resolve(operands[0]);
      const name = sh.resolve(operands[1]);
      if (!sh.exists(target)) return err(`ln: falha ao acessar '${operands[0]}': Arquivo ou diretório inexistente`);
      copyInto(sh, target, name);
      return okEmpty();
    },
  },
  {
    name: 'touch',
    category: 'arquivos',
    synopsis: 'touch arquivo...',
    summary: 'cria arquivos vazios ou atualiza a data',
    run: ({ args, sh }) => {
      const { operands } = parseArgs(args, { withValue: ['d', 't', 'r'] });
      if (!operands.length) return usage('touch', 'touch arquivo...');
      for (const a of operands) {
        const p = sh.resolve(a);
        if (!sh.exists(p)) {
          sh.write(p, '');
          sh.emit(`file.modified:${p}`);
        }
      }
      return okEmpty();
    },
  },
  {
    name: 'truncate',
    category: 'arquivos',
    synopsis: 'truncate -s N arquivo...',
    summary: 'ajusta o tamanho de um arquivo',
    run: ({ args, sh }) => {
      const { values, operands } = parseArgs(args, { withValue: ['s'] });
      const size = Number((values.s ?? '0').replace(/[^\d]/g, ''));
      for (const a of operands) {
        const p = sh.resolve(a);
        const c = sh.read(p) ?? '';
        sh.write(p, c.length > size ? c.slice(0, size) : c + '\0'.repeat(size - c.length));
      }
      return okEmpty();
    },
  },
  {
    name: 'basename',
    category: 'shell',
    synopsis: 'basename caminho [sufixo]',
    summary: 'retira o diretório de um caminho',
    run: ({ args }) => {
      if (!args[0]) return usage('basename', 'basename caminho [sufixo]');
      let base = args[0].replace(/\/+$/, '').split('/').pop() ?? '';
      if (args[1] && base.endsWith(args[1])) base = base.slice(0, -args[1].length);
      return out(base + '\n');
    },
  },
  {
    name: 'dirname',
    category: 'shell',
    synopsis: 'dirname caminho',
    summary: 'retira o último componente de um caminho',
    run: ({ args }) => {
      if (!args[0]) return usage('dirname', 'dirname caminho');
      const parts = args[0].replace(/\/+$/, '').split('/');
      parts.pop();
      return out((parts.join('/') || (args[0].startsWith('/') ? '/' : '.')) + '\n');
    },
  },
  {
    name: 'realpath',
    category: 'shell',
    synopsis: 'realpath caminho...',
    summary: 'resolve um caminho absoluto canônico',
    run: ({ args, sh }) => {
      if (!args.length) return usage('realpath', 'realpath caminho...');
      const res: string[] = [];
      const errors: string[] = [];
      for (const a of args) {
        const p = sh.resolve(a);
        if (!sh.exists(p)) errors.push(`realpath: ${a}: Arquivo ou diretório inexistente`);
        else res.push(p);
      }
      return errors.length
        ? { stdout: res.join('\n') + (res.length ? '\n' : ''), stderr: errors.join('\n') + '\n', code: 1 }
        : lines(res);
    },
  },
  {
    name: 'readlink',
    category: 'shell',
    synopsis: 'readlink [-f] caminho',
    summary: 'mostra o destino de uma ligação',
    run: ({ args, sh }) => {
      const { operands } = parseArgs(args);
      if (!operands.length) return usage('readlink', 'readlink [-f] caminho');
      return out(sh.resolve(operands[0]) + '\n');
    },
  },
  {
    name: 'chmod',
    category: 'arquivos',
    synopsis: 'chmod modo arquivo...',
    summary: 'altera permissões',
    run: ({ args, sh }) => {
      const { operands } = parseArgs(args);
      if (operands.length < 2) return usage('chmod', 'chmod modo arquivo...');
      const [modeArg, ...targets] = operands;
      const errors: string[] = [];
      for (const t of targets) {
        const p = sh.resolve(t);
        const node = sh.node(p);
        if (!node) {
          errors.push(`chmod: não foi possível acessar '${t}': Arquivo ou diretório inexistente`);
          continue;
        }
        node.mode = applyMode(nodeMode(node, p.split('/').pop() ?? ''), modeArg);
        sh.emit(`file.chmod:${p}`);
      }
      return errors.length ? err(errors.join('\n')) : okEmpty();
    },
  },
  {
    name: 'chown',
    category: 'arquivos',
    synopsis: 'chown dono[:grupo] arquivo...',
    summary: 'altera o dono (restrito neste host)',
    run: ({ args, sh }) => {
      const { operands } = parseArgs(args);
      if (operands.length < 2) return usage('chown', 'chown dono arquivo...');
      const owner = operands[0];
      if (owner !== 'null' && owner !== 'null:null') {
        return err(`chown: alterando dono de '${operands[1]}': Operação não permitida`);
      }
      return okEmpty();
    },
  },
  {
    name: 'mktemp',
    category: 'arquivos',
    synopsis: 'mktemp [-d] [molde]',
    summary: 'cria arquivo ou diretório temporário',
    run: ({ args, sh }) => {
      const { flags } = parseArgs(args);
      const rnd = Math.floor(sh.rand('mktemp' + sh.history.length)() * 1e6)
        .toString(36)
        .padStart(6, '0');
      const p = `/tmp/tmp.${rnd}`;
      if (flags.has('d')) sh.mkdirp(p);
      else sh.write(p, '');
      return out(p + '\n');
    },
  },
  {
    name: 'split',
    category: 'arquivos',
    synopsis: 'split [-l N] [-b N] arquivo [prefixo]',
    summary: 'divide um arquivo em partes',
    run: ({ args, sh }) => {
      const { values, operands } = parseArgs(args, { withValue: ['l', 'b'] });
      const src = operands[0];
      if (!src) return usage('split', 'split [-l N] arquivo [prefixo]');
      const content = sh.read(sh.resolve(src));
      if (content == null) return err(`split: ${src}: Arquivo ou diretório inexistente`);
      const prefix = operands[1] ?? 'x';
      const chunks: string[] = [];
      if (values.b) {
        const n = Number(values.b);
        for (let i = 0; i < content.length; i += n) chunks.push(content.slice(i, i + n));
      } else {
        const n = Number(values.l ?? '1000');
        const ls = toLines(content);
        for (let i = 0; i < ls.length; i += n) chunks.push(ls.slice(i, i + n).join('\n') + '\n');
      }
      const names = 'abcdefghijklmnopqrstuvwxyz';
      chunks.forEach((c, i) => {
        const suffix = names[Math.floor(i / 26)] + names[i % 26];
        sh.write(sh.resolve(`${prefix}${suffix}`), c);
      });
      return okEmpty();
    },
  },
  {
    name: 'lsof',
    category: 'processos',
    synopsis: 'lsof [-p pid] [-i]',
    summary: 'arquivos e sockets abertos',
    run: ({ args, sh }) => {
      const { flags, values } = parseArgs(args, { withValue: ['p'] });
      const procs = sh.procs();
      const rows = ['COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF   NODE NAME'];
      for (const p of procs) {
        if (values.p && String(p.pid) !== values.p) continue;
        const cmd = p.command.split(' ')[0].split('/').pop() ?? 'proc';
        if (!flags.has('i')) {
          rows.push(
            `${cmd.slice(0, 9).padEnd(9)} ${String(p.pid).padStart(4)} null  cwd    DIR   0,42     4096 ${
              1000000 + (p.pid * 977) % 8000000
            } /`,
          );
        }
        if (/orpheus|kernel|sshd|node|daemon/.test(p.command)) {
          rows.push(
            `${cmd.slice(0, 9).padEnd(9)} ${String(p.pid).padStart(4)} null  ${
              flags.has('i') ? '  4u  IPv4' : '  3r   REG'
            } 0,42        0 ${1000000 + p.pid} ${
              flags.has('i') ? `10.13.0.4:${40000 + (p.pid % 2000)}->10.13.0.9:443 (ESTABLISHED)` : '/var/log/orpheus.log'
            }`,
          );
        }
      }
      return lines(rows);
    },
  },
  {
    name: 'mount',
    category: 'sistema',
    synopsis: 'mount',
    summary: 'lista sistemas de arquivos montados',
    run: () =>
      lines([
        '/dev/mapper/quarantine-root on / type ext4 (rw,relatime)',
        'proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)',
        'sysfs on /sys type sysfs (ro,nosuid,nodev,noexec)',
        'tmpfs on /tmp type tmpfs (rw,nosuid,nodev,size=1048576k)',
        'abyss-overlay on /mnt/abyss type overlay (ro,lowerdir=/var/lib/abyss/base)',
      ]),
  },
  {
    name: 'umount',
    category: 'sistema',
    synopsis: 'umount ponto',
    summary: 'desmonta um sistema de arquivos',
    run: ({ args }) => err(`umount: ${args[0] ?? '/'}: alvo está ocupado (quarentena ativa)`),
  },
  {
    name: 'sync',
    category: 'sistema',
    synopsis: 'sync',
    summary: 'descarrega buffers para o volume',
    run: () => okEmpty(),
  },
  {
    name: 'shred',
    category: 'arquivos',
    synopsis: 'shred [-u] arquivo',
    summary: 'sobrescreve um arquivo antes de removê-lo',
    run: ({ args, sh }) => {
      const { flags, operands } = parseArgs(args);
      const p = sh.resolve(operands[0] ?? '');
      if (!sh.exists(p)) return err(`shred: ${operands[0]}: Arquivo ou diretório inexistente`);
      const size = nodeSize(sh.node(p)!);
      sh.write(p, '\0'.repeat(size));
      if (flags.has('u')) sh.remove(p);
      sh.emit(`file.shredded:${p}`);
      return okEmpty();
    },
  },
];

function copyInto(
  sh: { node: (p: string) => VfsNode | null; write: (p: string, c: string) => void; writeBytes: (p: string, b: Buffer) => void; mkdirp: (p: string) => void; bytes: (p: string) => Buffer | null; list: (p: string, all: boolean) => { name: string }[] },
  src: string,
  dest: string,
) {
  const node = sh.node(src);
  if (!node) return;
  if (node.type === 'file') {
    if (node.binaryBase64 != null) sh.writeBytes(dest, Buffer.from(node.binaryBase64, 'base64'));
    else sh.write(dest, node.content ?? '');
    return;
  }
  sh.mkdirp(dest);
  for (const child of sh.list(src, true)) {
    copyInto(sh, `${src === '/' ? '' : src}/${child.name}`, `${dest === '/' ? '' : dest}/${child.name}`);
  }
}

function globRe(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else if (ch === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end < 0) out += '\\[';
      else {
        out += `[${glob.slice(i + 1, end)}]`;
        i = end;
      }
    } else out += ch.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

function modeToOctal(mode: string): string {
  const bits = mode.slice(1);
  let res = '';
  for (let i = 0; i < 9; i += 3) {
    const chunk = bits.slice(i, i + 3);
    res += String(
      (chunk[0] === 'r' ? 4 : 0) + (chunk[1] === 'w' ? 2 : 0) + (chunk[2] === 'x' || chunk[2] === 's' ? 1 : 0),
    );
  }
  return '0' + res;
}

function applyMode(current: string, spec: string): string {
  const prefix = current[0];
  if (/^\d{3,4}$/.test(spec)) {
    const digits = spec.slice(-3).split('').map(Number);
    return (
      prefix +
      digits
        .map((d) => `${d & 4 ? 'r' : '-'}${d & 2 ? 'w' : '-'}${d & 1 ? 'x' : '-'}`)
        .join('')
    );
  }
  const m = /^([ugoa]*)([+-=])([rwx]+)$/.exec(spec);
  if (!m) return current;
  const who = m[1] || 'a';
  const op = m[2];
  const perms = m[3];
  const chars = current.slice(1).split('');
  const zones: Record<string, number> = { u: 0, g: 3, o: 6 };
  const targets = who === 'a' ? ['u', 'g', 'o'] : who.split('');
  for (const w of targets) {
    const base = zones[w];
    if (base == null) continue;
    for (const p of perms) {
      const idx = base + (p === 'r' ? 0 : p === 'w' ? 1 : 2);
      chars[idx] = op === '-' ? '-' : p;
    }
    if (op === '=') {
      for (const p of ['r', 'w', 'x']) {
        if (!perms.includes(p)) {
          chars[base + (p === 'r' ? 0 : p === 'w' ? 1 : 2)] = '-';
        }
      }
    }
  }
  return prefix + chars.join('');
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function describeFile(path: string, bytes: Buffer): string {
  const name = path.split('/').pop() ?? '';
  const head = bytes.subarray(0, 16);
  const hex = head.toString('hex');
  if (hex.startsWith('89504e47')) return 'PNG image data';
  if (hex.startsWith('ffd8ff')) return 'JPEG image data';
  if (hex.startsWith('47494638')) return 'GIF image data';
  if (hex.startsWith('1f8b')) return 'gzip compressed data';
  if (hex.startsWith('425a68')) return 'bzip2 compressed data';
  if (hex.startsWith('fd377a58')) return 'XZ compressed data';
  if (hex.startsWith('504b0304')) return 'Zip archive data';
  if (hex.startsWith('7f454c46')) return 'ELF 64-bit LSB executable, x86-64';
  if (hex.startsWith('53514c69')) return 'SQLite 3.x database';
  const text = bytes.toString('utf8');
  if (/^ustar/.test(bytes.subarray(257, 262).toString('latin1'))) return 'POSIX tar archive';
  if (bytes.length === 0) return 'empty';
  const nonPrintable = [...bytes.subarray(0, 512)].filter((b) => b < 9 || (b > 13 && b < 32)).length;
  if (nonPrintable > 8) return 'data';
  if (/^#!\s*\/\S*(bash|sh)\b/.test(text)) return 'Bourne-Again shell script, ASCII text executable';
  if (/^#!\s*\/\S*python/.test(text)) return 'Python script, ASCII text executable';
  if (/^#!\s*\/\S*node/.test(text)) return 'Node.js script, ASCII text executable';
  if (name.endsWith('.json') || /^\s*[[{]/.test(text)) {
    try {
      JSON.parse(text);
      return 'JSON text data';
    } catch {
      /* segue como texto */
    }
  }
  if (name.endsWith('.md')) return 'ASCII text (Markdown document)';
  if (name.endsWith('.csv')) return 'CSV text';
  if (name.endsWith('.log')) return 'ASCII text (log)';
  if (/[^\x00-\x7f]/.test(text)) return 'UTF-8 Unicode text';
  return 'ASCII text';
}
