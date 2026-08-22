import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { nodeSize, walkFiles } from './vfs.js';
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

// ─── helpers ────────────────────────────────────────────────────────────────

function human(n: number): string {
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

function readText(ctx: CmdCtx, files: string[]): { text: string; errors: string[]; path?: string } {
  const { sh, stdin, name } = ctx;
  if (!files.length || (files.length === 1 && files[0] === '-')) {
    return { text: stdin, errors: [] };
  }
  const errors: string[] = [];
  const parts: string[] = [];
  let lastPath = '';
  for (const f of files) {
    const p = sh.resolve(f);
    const node = sh.node(p);
    if (!node || node.type === 'dir') {
      errors.push(`${name}: ${f}: Arquivo ou diretório inexistente`);
      continue;
    }
    const buf = sh.bytes(p) ?? Buffer.alloc(0);
    parts.push(buf.toString('utf8'));
    lastPath = p;
    sh.touchRead(p);
  }
  return { text: parts.join(''), errors, path: lastPath };
}

function readBuf(ctx: CmdCtx, file?: string): { buf: Buffer | null; path: string; errMsg?: string } {
  const { sh, stdin } = ctx;
  if (!file || file === '-') return { buf: Buffer.from(stdin, 'utf8'), path: '-' };
  const p = sh.resolve(file);
  const node = sh.node(p);
  if (!node || node.type === 'dir') return { buf: null, path: p, errMsg: `${ctx.name}: ${file}: Arquivo ou diretório inexistente` };
  const buf = sh.bytes(p) ?? Buffer.alloc(0);
  sh.touchRead(p);
  return { buf, path: p };
}

function hexLine(offset: number, slice: Buffer, cols: number, group: number): string {
  const hexParts: string[] = [];
  for (let i = 0; i < slice.length; i += group) {
    hexParts.push(
      [...slice.subarray(i, i + group)].map((b) => b.toString(16).padStart(2, '0')).join(''),
    );
  }
  const hex = hexParts.join(' ');
  const asc = [...slice].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
  return `${offset.toString(16).padStart(8, '0')}: ${hex.padEnd(Math.ceil(cols / group) * (group * 2 + 1), ' ')}  ${asc}`;
}

function formatXxd(buf: Buffer, opts: { cols: number; group: number; skip: number; len: number; plain: boolean }): string {
  const start = opts.skip;
  const end = opts.len > 0 ? Math.min(buf.length, start + opts.len) : buf.length;
  const slice = buf.subarray(start, end);
  if (opts.plain) return [...slice].map((b) => b.toString(16).padStart(2, '0')).join('') + '\n';
  const rows: string[] = [];
  for (let i = 0; i < slice.length; i += opts.cols) {
    rows.push(hexLine(start + i, slice.subarray(i, i + opts.cols), opts.cols, opts.group));
  }
  return rows.join('\n') + (rows.length ? '\n' : '');
}

function parseHexReverse(text: string): Buffer {
  const cleaned = text.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length % 2) throw new Error('invalid hex');
  return Buffer.from(cleaned, 'hex');
}

function cksumBuf(buf: Buffer): { crc: number; len: number } {
  let crc = 0;
  for (const b of buf) crc = (crc + b) & 0xffff;
  return { crc, len: buf.length };
}

function sumBuf(buf: Buffer): number {
  let s = 0;
  for (const b of buf) s = (s + b) & 0xffff;
  return s;
}

function bzip2Wrap(data: Buffer): Buffer {
  return Buffer.concat([Buffer.from('BZh9'), Buffer.from(data.toString('base64'), 'ascii')]);
}
function bzip2Unwrap(data: Buffer): Buffer {
  if (!data.subarray(0, 3).equals(Buffer.from('BZh'))) throw new Error('not bzip2');
  return Buffer.from(data.subarray(4).toString('ascii'), 'base64');
}
function xzWrap(data: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]), Buffer.from(data.toString('base64'), 'ascii')]);
}
function xzUnwrap(data: Buffer): Buffer {
  if (!data.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]))) throw new Error('not xz');
  return Buffer.from(data.subarray(6).toString('ascii'), 'base64');
}

function simpleZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const hdr = Buffer.alloc(30);
    hdr.writeUInt32LE(0x04034b50, 0);
    hdr.writeUInt16LE(20, 4);
    hdr.writeUInt16LE(0, 6);
    hdr.writeUInt16LE(0, 8);
    hdr.writeUInt16LE(0, 10);
    hdr.writeUInt32LE(0, 12);
    hdr.writeUInt32LE(f.data.length, 16);
    hdr.writeUInt32LE(f.data.length, 20);
    hdr.writeUInt16LE(name.length, 24);
    hdr.writeUInt16LE(0, 26);
    parts.push(hdr, name, f.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(f.data.length, 20);
    cd.writeUInt32LE(f.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + f.data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, end]);
}

function listZip(buf: Buffer): string[] {
  const out: string[] = [];
  let i = 0;
  while (i + 30 <= buf.length) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const comp = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nlen = buf.readUInt16LE(i + 26);
    const name = buf.subarray(i + 30, i + 30 + nlen).toString('utf8');
    out.push(`  ${size}  ${comp === 0 ? 'stor' : '----'}  ${name}`);
    i += 30 + nlen + size;
  }
  return out;
}

function extractZip(buf: Buffer): { name: string; data: Buffer }[] {
  const files: { name: string; data: Buffer }[] = [];
  let i = 0;
  while (i + 30 <= buf.length) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const size = buf.readUInt32LE(i + 18);
    const nlen = buf.readUInt16LE(i + 26);
    const name = buf.subarray(i + 30, i + 30 + nlen).toString('utf8');
    const data = buf.subarray(i + 30 + nlen, i + 30 + nlen + size);
    files.push({ name, data });
    i += 30 + nlen + size;
  }
  return files;
}

function ustarChecksum(hdr: Buffer): void {
  hdr.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of hdr) sum += b;
  hdr.write(octal(sum, 6), 148, 8, 'ascii');
}

function octal(n: number, w: number): string {
  return n.toString(8).padStart(w - 1, '0') + '\0';
}

function tarCreate(files: { path: string; data: Buffer }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const hdr = Buffer.alloc(512, 0);
    const name = f.path.replace(/^\.\//, '').slice(0, 100);
    hdr.write(name, 0, 'ascii');
    hdr.write(octal(f.data.length, 12), 124, 12, 'ascii');
    hdr.write(octal(0o644, 8), 100, 8, 'ascii');
    hdr.write('ustar\x00', 257, 6, 'ascii');
    hdr.write('null\x00', 263, 32, 'ascii');
    ustarChecksum(hdr);
    blocks.push(hdr);
    blocks.push(f.data);
    const pad = 512 - (f.data.length % 512);
    if (pad < 512) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(512));
  blocks.push(Buffer.alloc(512));
  return Buffer.concat(blocks);
}

function tarParse(buf: Buffer): { name: string; data: Buffer; offset: number }[] {
  const entries: { name: string; data: Buffer; offset: number }[] = [];
  let i = 0;
  while (i + 512 <= buf.length) {
    const hdr = buf.subarray(i, i + 512);
    if (hdr.every((b) => b === 0)) break;
    const name = hdr.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(hdr.subarray(124, 136).toString('utf8').replace(/\0/g, ''), 8) || 0;
    i += 512;
    const data = buf.subarray(i, i + size);
    entries.push({ name, data, offset: i - 512 });
    i += size + ((512 - (size % 512)) % 512);
  }
  return entries;
}

function resolveHost(sh: ShellApi, target: string): { host: string; site: import('./shell-types.js').SiteEntry } | null {
  let host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase();
  if (host === 'localhost') host = 'null-machine.local';
  const site = sh.hosts.get(host);
  if (!site) return null;
  return { host, site };
}

function buildOutPath(src: string): string {
  return src.replace(/\.[a-zA-Z0-9]+$/, '') + '.out';
}

function fakeElfHeader(source: string): string {
  const h = createHash('sha256').update(source).digest('hex').slice(0, 16);
  return `ABYSS ELF\nsource:${source}\nhash:${h}\narch:x86_64\n`;
}

function analyzeOut(buf: Buffer): { symbols: string[]; sections: string[]; headers: string[] } {
  const text = buf.toString('utf8');
  const hash = text.match(/hash:([a-f0-9]+)/)?.[1] ?? '00000000';
  return {
    symbols: [`0000000000401000 T _start`, `0000000000401020 T main`, `0000000000402000 D .data`, `                 U abyss_${hash.slice(0, 6)}`],
    sections: ['Idx Name          Size      VMA               LMA', '  0 .text         00000120  0000000000401000', '  1 .data         00000040  0000000000402000', '  2 .bss          00000020  0000000000402040'],
    headers: [
      'ELF Header:',
      '  Magic:   7f 45 4c 46 02 01 01 00',
      '  Class:                             ELF64',
      '  Data:                              2\'s complement, little endian',
      `  Type:                              EXEC (Executable file)`,
      `  Machine:                           Advanced Micro Devices X86-64`,
      `  Entry point address:               0x401000`,
    ],
  };
}

function runTest(args: string[], sh: ShellApi): ExecResult {
  const ops = ['-eq', '-ne', '-lt', '-le', '-gt', '-ge', '=', '!=', '<', '>', '-z', '-n'];
  let i = 0;
  const unary = (flag: string, val: string) => {
    if (flag === '-f') return sh.node(val)?.type === 'file' ? 0 : 1;
    if (flag === '-d') return sh.node(val)?.type === 'dir' ? 0 : 1;
    if (flag === '-e') return sh.exists(val) ? 0 : 1;
    if (flag === '-s') {
      const n = sh.node(val);
      return n && nodeSize(n) > 0 ? 0 : 1;
    }
    if (flag === '-z') return val === '' ? 0 : 1;
    if (flag === '-n') return val !== '' ? 0 : 1;
    return 2;
  };
  if (args[0]?.startsWith('-') && ['-f', '-d', '-e', '-s', '-z', '-n'].includes(args[0])) {
    const p = args[1] ? sh.resolve(args[1]) : '';
    return { stdout: '', stderr: '', code: unary(args[0], args[0] === '-z' || args[0] === '-n' ? (args[1] ?? '') : p) };
  }
  if (args.includes('-a')) {
    const missing = args.filter((a) => a.startsWith('-') && a !== '-a').some((f) => {
      const p = sh.resolve(args[args.length - 1] ?? '.');
      return unary(f, p) !== 0;
    });
    return { stdout: '', stderr: '', code: missing ? 1 : 0 };
  }
  if (args.includes('-o')) {
    for (let j = 0; j < args.length; j++) {
      if (args[j] === '-o' && j > 0) {
        const a = args[j - 1];
        const b = args[j + 1];
        if (sh.exists(sh.resolve(a)) || sh.exists(sh.resolve(b ?? ''))) return { stdout: '', stderr: '', code: 0 };
      }
    }
  }
  for (let j = 0; j < args.length; j++) {
    const op = ops.find((o) => args[j] === o);
    if (op && j > 0 && j < args.length - 1) {
      const a = args[j - 1];
      const b = args[j + 1];
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) {
        const cmp = na - nb;
        const ok =
          (op === '-eq' || op === '=') ? cmp === 0 :
          (op === '-ne' || op === '!=') ? cmp !== 0 :
          op === '-lt' || op === '<' ? cmp < 0 :
          op === '-le' ? cmp <= 0 :
          op === '-gt' || op === '>' ? cmp > 0 :
          op === '-ge' ? cmp >= 0 : false;
        return { stdout: '', stderr: '', code: ok ? 0 : 1 };
      }
      return { stdout: '', stderr: '', code: a === b ? 0 : 1 };
    }
  }
  return { stdout: '', stderr: '', code: args.length ? 0 : 1 };
}

function runPython(code: string, sh: ShellApi): ExecResult {
  const logs: string[] = [];
  const printRe = /print\s*\(\s*(['"])(.*?)\1\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = printRe.exec(code))) logs.push(m[2]);
  const openRe = /open\s*\(\s*(['"])(.*?)\1\s*\)\s*\.\s*read\s*\(\s*\)/g;
  while ((m = openRe.exec(code))) {
    const p = sh.resolve(m[2]);
    const t = sh.read(p);
    if (t != null) {
      sh.touchRead(p);
      logs.push(t.replace(/\n$/, ''));
    }
  }
  const forRe = /for\s+\w+\s+in\s+range\s*\(\s*(\d+)\s*\)\s*:\s*\n\s*print\s*\(\s*\w+\s*\)/;
  const fm = forRe.exec(code);
  if (fm) {
    const n = Number(fm[1]);
    for (let i = 0; i < n; i++) logs.push(String(i));
  }
  return out(logs.join('\n') + (logs.length ? '\n' : ''));
}

function runGit(ctx: CmdCtx): ExecResult {
  const { args, sh } = ctx;
  const sub = args[0];
  const repo = sh.resolve(args.includes('-C') ? args[args.indexOf('-C') + 1] ?? '.' : '.');
  const objectsPath = sh.resolve(`${repo === '/' ? '' : repo}/.git/objects`.replace(/\/+/g, '/'));
  const listObjects = (): string[] => {
    const dir = sh.node(objectsPath);
    if (!dir || dir.type !== 'dir') return [];
    return Object.keys(dir.children ?? {}).sort();
  };
  const findObject = (hash: string): string | null => {
    for (const name of listObjects()) {
      if (name === hash || name.endsWith(hash)) return `${objectsPath}/${name}`.replace(/\/+/g, '/');
    }
    return null;
  };

  if (sub === 'status') return out('On branch main\nnothing to commit, working tree clean\n');
  if (sub === 'branch') return out('* main\n');
  if (sub === 'rev-parse') return out((args[1] ?? 'HEAD') + '\n');
  if (sub === 'log') {
    const rows = listObjects().map((n) => {
      const c = sh.read(`${objectsPath}/${n}`) ?? '';
      const first = c.split('\n')[0] ?? n;
      return `${n.slice(-7)} ${first}`;
    });
    return lines(rows.length ? rows : ['fatal: your current branch \'main\' does not have any commits yet']);
  }
  if (sub === 'show' || (sub === 'cat-file' && args[1] === '-p')) {
    const hash = sub === 'show' ? args[1] : args[2];
    if (!hash) return usage('git', 'git show <object>');
    const p = findObject(hash);
    if (!p) return err(`fatal: bad object ${hash}`);
    sh.touchRead(p);
    return out(sh.read(p) ?? '');
  }
  if (sub === 'diff') {
    return out('diff --git a/file b/file\n(no changes)\n');
  }
  return out(`git ${sub ?? ''} (subset — status, log, show, cat-file -p, branch, diff, rev-parse)\n`);
}

function cmd(
  name: string,
  category: CommandSpec['category'],
  synopsis: string,
  summary: string,
  run: (ctx: CmdCtx) => ExecResult,
  man?: string[],
): CommandSpec {
  return { name, category, synopsis, summary, run, man };
}

// ─── binary / data ──────────────────────────────────────────────────────────

const BINARY_DATA: CommandSpec[] = [
  cmd('xxd', 'binário', 'xxd [-r] [-p] [-g N] [-l N] [-s N] [-c N] [arquivo]', 'dump hexadecimal', ({ args, stdin, sh, name }) => {
    const { flags, values, operands } = parseArgs(args, { withValue: ['g', 'l', 's', 'c'] });
    if (flags.has('r')) {
      const { text, errors } = readText({ name, args, stdin, sh }, operands);
      if (errors.length) return err(errors.join('\n'));
      try {
        const data = flags.has('p') ? parseHexReverse(text) : parseHexReverse(text.replace(/^[^:]*:\s*/gm, '').replace(/\s+/g, ' '));
        if (operands[0] && operands[0] !== '-') sh.writeBytes(sh.resolve(operands[0]), data);
        else return out(data.toString('utf8'));
        return okEmpty();
      } catch {
        return err('xxd: invalid hex');
      }
    }
    const file = operands[0];
    const { buf, errMsg } = readBuf({ name, args, stdin, sh }, file);
    if (errMsg) return err(errMsg);
    const b = buf ?? Buffer.alloc(0);
    return out(formatXxd(b, {
      cols: Number(values.c ?? '16'),
      group: Number(values.g ?? '2'),
      skip: Number(values.s ?? '0'),
      len: Number(values.l ?? '0'),
      plain: flags.has('p'),
    }));
  }, ['  -r  reverte hex para binário', '  -p  saída hex contínua', '  -g  tamanho do grupo', '  -l  comprimento', '  -s  deslocamento', '  -c  colunas']),
  cmd('od', 'binário', 'od [-An] [-tx1] [-tc] [-c] [arquivo]', 'dump octal/hex', ({ args, stdin, sh, name }) => {
    const { flags, operands } = parseArgs(args);
    const { buf, errMsg } = readBuf({ name, args, stdin, sh }, operands[0]);
    if (errMsg) return err(errMsg);
    const b = buf ?? Buffer.alloc(0);
    const rows: string[] = [];
    for (let i = 0; i < b.length; i += 16) {
      const slice = b.subarray(i, i + 16);
      const parts: string[] = [];
      if (!flags.has('A')) parts.push(String(i).padStart(8, '0'));
      if (flags.has('t') || flags.has('x')) parts.push([...slice].map((x) => x.toString(16).padStart(2, '0')).join(' '));
      if (flags.has('c')) parts.push([...slice].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '\\' + x.toString(8).padStart(3, '0'))).join(' '));
      if (!flags.has('t') && !flags.has('c') && !flags.has('x')) parts.push([...slice].map((x) => x.toString(8).padStart(3, '0')).join(' '));
      rows.push(parts.join('  '));
    }
    return lines(rows);
  }),
  cmd('hexdump', 'binário', 'hexdump [-C] [-n N] [-s N] [arquivo]', 'dump hexadecimal estilo BSD', ({ args, stdin, sh, name }) => {
    const { flags, values, operands } = parseArgs(args, { withValue: ['n', 's'] });
    const { buf, errMsg } = readBuf({ name, args, stdin, sh }, operands[0]);
    if (errMsg) return err(errMsg);
    let b = buf ?? Buffer.alloc(0);
    const skip = Number(values.s ?? '0');
    const len = values.n ? Number(values.n) : b.length;
    b = b.subarray(skip, skip + len);
    if (flags.has('C')) {
      const rows: string[] = [];
      for (let i = 0; i < b.length; i += 16) {
        const slice = b.subarray(i, i + 16);
        const hex = [...slice].map((x) => x.toString(16).padStart(2, '0')).join(' ');
        const asc = [...slice].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('');
        rows.push(`${(skip + i).toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  |${asc}|`);
      }
      return lines(rows);
    }
    return out(formatXxd(b, { cols: 16, group: 2, skip: 0, len: 0, plain: false }));
  }),
  cmd('strings', 'binário', 'strings [-n N] arquivo', 'extrai strings imprimíveis', ({ args, sh, name }) => {
    const { values, operands } = parseArgs(args, { withValue: ['n'] });
    const min = Number(values.n ?? '4');
    const { buf, errMsg } = readBuf({ name, args, stdin: '', sh }, operands[0]);
    if (errMsg || !buf) return err(errMsg ?? 'strings: missing file');
    const re = new RegExp(`[\\x20-\\x7e]{${min},}`, 'g');
    const hits = buf.toString('latin1').match(re) ?? [];
    return lines(hits);
  }),
  cmd('base64', 'dados', 'base64 [-d] [--decode] [-w N] [arquivo]', 'codifica/decodifica base64', ({ args, stdin, sh, name }) => {
    const { flags, long, values, operands } = parseArgs(args, { withValue: ['w'], longWithValue: ['decode'] });
    const decode = flags.has('d') || long.decode === true;
    const { text, errors } = readText({ name, args, stdin, sh }, operands);
    if (errors.length) return err(errors.join('\n'));
    try {
      if (decode) return out(Buffer.from(text.replace(/\s/g, ''), 'base64').toString('utf8') + '\n');
      let enc = Buffer.from(text, 'utf8').toString('base64');
      const w = Number(values.w ?? '0');
      if (w > 0) enc = enc.match(new RegExp(`.{1,${w}}`, 'g'))?.join('\n') ?? enc;
      return out(enc + '\n');
    } catch {
      return err('base64: entrada inválida');
    }
  }),
  cmd('base32', 'dados', 'base32 [-d] [arquivo]', 'codifica/decodifica base32', ({ args, stdin, sh, name }) => {
    const { flags, operands } = parseArgs(args);
    const { text, errors } = readText({ name, args, stdin, sh }, operands);
    if (errors.length) return err(errors.join('\n'));
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    if (flags.has('d')) {
      const clean = text.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
      let bits = '';
      for (const c of clean) {
        const v = alpha.indexOf(c);
        if (v < 0) return err('base32: invalid input');
        bits += v.toString(2).padStart(5, '0');
      }
      const bytes: number[] = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
      return out(Buffer.from(bytes).toString('utf8') + '\n');
    }
    const buf = Buffer.from(text, 'utf8');
    let bits = [...buf].map((b) => b.toString(2).padStart(8, '0')).join('');
    let enc = '';
    for (let i = 0; i < bits.length; i += 5) {
      const chunk = bits.slice(i, i + 5).padEnd(5, '0');
      enc += alpha[parseInt(chunk, 2)];
    }
    while (enc.length % 8) enc += '=';
    return out(enc + '\n');
  }),
];

function hashCmd(algo: string, label: string): CommandSpec {
  return cmd(label, 'cripto', `${label} [arquivo...]`, `calcula ${algo.toUpperCase()}`, ({ args, stdin, sh, name }) => {
    const { operands } = parseArgs(args);
    const files = operands.length ? operands : ['-'];
    const rows: string[] = [];
    for (const f of files) {
      const { buf, errMsg, path } = readBuf({ name, args, stdin, sh }, f);
      if (errMsg) return err(errMsg);
      const digest = createHash(algo).update(buf ?? Buffer.alloc(0)).digest('hex');
      rows.push(`${digest}  ${f === '-' ? '-' : path.split('/').pop()}`);
    }
    return lines(rows);
  });
}

const CRYPTO: CommandSpec[] = [
  hashCmd('md5', 'md5sum'),
  hashCmd('sha1', 'sha1sum'),
  hashCmd('sha256', 'sha256sum'),
  hashCmd('sha512', 'sha512sum'),
  cmd('cksum', 'cripto', 'cksum [arquivo...]', 'CRC e contagem de bytes', ({ args, stdin, sh, name }) => {
    const { operands } = parseArgs(args);
    const files = operands.length ? operands : ['-'];
    const rows: string[] = [];
    for (const f of files) {
      const { buf, errMsg, path } = readBuf({ name, args, stdin, sh }, f);
      if (errMsg) return err(errMsg);
      const { crc, len } = cksumBuf(buf ?? Buffer.alloc(0));
      rows.push(`${crc} ${len} ${f === '-' ? '-' : path.split('/').pop()}`);
    }
    return lines(rows);
  }),
  cmd('sum', 'cripto', 'sum [arquivo...]', 'checksum e blocos', ({ args, stdin, sh, name }) => {
    const { operands } = parseArgs(args);
    const files = operands.length ? operands : ['-'];
    const rows: string[] = [];
    for (const f of files) {
      const { buf, errMsg, path } = readBuf({ name, args, stdin, sh }, f);
      if (errMsg) return err(errMsg);
      const s = sumBuf(buf ?? Buffer.alloc(0));
      const blocks = Math.ceil((buf?.length ?? 0) / 512) || 1;
      rows.push(`${s} ${blocks} ${f === '-' ? '-' : path.split('/').pop()}`);
    }
    return lines(rows);
  }),
  cmd('cmp', 'dados', 'cmp [-s] arquivo1 arquivo2', 'compara dois arquivos', ({ args, sh, name }) => {
    const { flags, operands } = parseArgs(args);
    if (operands.length < 2) return usage('cmp', 'cmp arquivo1 arquivo2');
    const a = readBuf({ name, args, stdin: '', sh }, operands[0]);
    const b = readBuf({ name, args, stdin: '', sh }, operands[1]);
    if (a.errMsg) return err(a.errMsg);
    if (b.errMsg) return err(b.errMsg);
    const eq = Buffer.compare(a.buf ?? Buffer.alloc(0), b.buf ?? Buffer.alloc(0)) === 0;
    if (eq) return okEmpty();
    if (flags.has('s')) return { stdout: '', stderr: '', code: 1 };
    return err(`cmp: ${operands[0]} ${operands[1]} diferem: byte 1, linha 1`);
  }),
];

// ─── compression ────────────────────────────────────────────────────────────

function compressFile(sh: ShellApi, src: string, wrap: (b: Buffer) => Buffer, ext: string): ExecResult {
  const p = sh.resolve(src);
  const { buf, errMsg } = readBuf({ name: 'compress', args: [], stdin: '', sh }, src);
  if (errMsg || !buf) return err(errMsg ?? 'compress: missing file');
  const outPath = p + ext;
  sh.writeBytes(outPath, wrap(buf));
  sh.emit(`file.compressed:${outPath}`);
  return okEmpty();
}

function decompressFile(sh: ShellApi, src: string, unwrap: (b: Buffer) => Buffer, ext: string, name: string): ExecResult {
  const p = sh.resolve(src);
  const buf = sh.bytes(p);
  if (!buf) return err(`${name}: ${src}: Arquivo ou diretório inexistente`);
  sh.touchRead(p);
  try {
    const data = unwrap(buf);
    const outPath = p.endsWith(ext) ? p.slice(0, -ext.length) : p + '.out';
    sh.writeBytes(outPath, data);
    return okEmpty();
  } catch {
    return err(`${name}: ${src}: formato inválido`);
  }
}

const COMPRESSION: CommandSpec[] = [
  cmd('gzip', 'compressão', 'gzip [-k] arquivo...', 'comprime com gzip', ({ args, sh }) => {
    const { operands } = parseArgs(args);
    for (const f of operands) {
      const p = sh.resolve(f);
      const buf = sh.bytes(p);
      if (!buf) return err(`gzip: ${f}: Arquivo ou diretório inexistente`);
      sh.touchRead(p);
      sh.writeBytes(p + '.gz', gzipSync(buf));
      sh.remove(p);
    }
    return okEmpty();
  }),
  cmd('gunzip', 'compressão', 'gunzip arquivo.gz...', 'descomprime gzip', ({ args, sh }) => {
    for (const f of parseArgs(args).operands) {
      const p = sh.resolve(f);
      const buf = sh.bytes(p);
      if (!buf) return err(`gunzip: ${f}: Arquivo ou diretório inexistente`);
      sh.touchRead(p);
      try {
        const data = gunzipSync(buf);
        const outPath = p.replace(/\.gz$/, '');
        sh.writeBytes(outPath || p + '.out', data);
        sh.remove(p);
      } catch {
        return err(`gunzip: ${f}: not in gzip format`);
      }
    }
    return okEmpty();
  }),
  cmd('zcat', 'compressão', 'zcat arquivo.gz', 'exibe conteúdo gzip', ({ args, sh }) => {
    const f = parseArgs(args).operands[0];
    if (!f) return usage('zcat', 'zcat arquivo.gz');
    const buf = sh.bytes(sh.resolve(f));
    if (!buf) return err(`zcat: ${f}: Arquivo ou diretório inexistente`);
    sh.touchRead(sh.resolve(f));
    return out(gunzipSync(buf).toString('utf8'));
  }),
  cmd('bzip2', 'compressão', 'bzip2 arquivo...', 'comprime (formato sintético BZh)', ({ args, sh }) => {
    for (const f of parseArgs(args).operands) {
      const r = compressFile(sh, f, bzip2Wrap, '.bz2');
      if (r.code) return r;
    }
    return okEmpty();
  }),
  cmd('bunzip2', 'compressão', 'bunzip2 arquivo.bz2', 'descomprime bzip2 sintético', ({ args, sh }) => {
    const f = parseArgs(args).operands[0];
    if (!f) return usage('bunzip2', 'bunzip2 arquivo.bz2');
    return decompressFile(sh, f, bzip2Unwrap, '.bz2', 'bunzip2');
  }),
  cmd('xz', 'compressão', 'xz arquivo...', 'comprime (formato sintético xz)', ({ args, sh }) => {
    for (const f of parseArgs(args).operands) {
      const r = compressFile(sh, f, xzWrap, '.xz');
      if (r.code) return r;
    }
    return okEmpty();
  }),
  cmd('unxz', 'compressão', 'unxz arquivo.xz', 'descomprime xz sintético', ({ args, sh }) => {
    const f = parseArgs(args).operands[0];
    if (!f) return usage('unxz', 'unxz arquivo.xz');
    return decompressFile(sh, f, xzUnwrap, '.xz', 'unxz');
  }),
  cmd('zip', 'compressão', 'zip [-r] arquivo.zip entradas...', 'cria arquivo zip (store)', ({ args, sh }) => {
    const { flags, operands } = parseArgs(args);
    if (operands.length < 2) return usage('zip', 'zip arquivo.zip arquivos...');
    const [zipName, ...entries] = operands;
    const files: { name: string; data: Buffer }[] = [];
    for (const e of entries) {
      const p = sh.resolve(e);
      const node = sh.node(p);
      if (!node) return err(`zip: ${e}: Arquivo ou diretório inexistente`);
      if (node.type === 'file') {
        files.push({ name: e.replace(/^\.\//, ''), data: sh.bytes(p) ?? Buffer.alloc(0) });
        sh.touchRead(p);
      } else if (flags.has('r')) {
        for (const f of walkFiles(node, p)) {
          files.push({ name: f.path.replace(/^\//, ''), data: sh.bytes(f.path) ?? Buffer.from(f.node.content ?? '') });
        }
      }
    }
    sh.writeBytes(sh.resolve(zipName), simpleZip(files));
    return okEmpty();
  }),
  cmd('unzip', 'compressão', 'unzip [-l] arquivo.zip [entrada]', 'extrai ou lista zip', ({ args, sh }) => {
    const { flags, operands } = parseArgs(args);
    const zipPath = sh.resolve(operands[0] ?? '');
    const buf = sh.bytes(zipPath);
    if (!buf) return err(`unzip: cannot find ${operands[0]}`);
    sh.touchRead(zipPath);
    if (flags.has('l')) return lines(['Archive:', ...listZip(buf)]);
    const target = operands[1];
    for (const f of extractZip(buf)) {
      if (target && f.name !== target && !f.name.endsWith('/' + target)) continue;
      sh.writeBytes(sh.resolve(f.name), f.data);
    }
    return okEmpty();
  }),
  cmd('tar', 'compressão', 'tar -cf|-xf|-tf arquivo [entradas...]', 'arquivo tar ustar mínimo', ({ args, sh, name }) => {
    const { flags, values, operands } = parseArgs(args, { withValue: ['f', 'C'] });
    const fIdx = args.indexOf('-f');
    const archive = fIdx >= 0 ? args[fIdx + 1] : values.f ?? operands[operands.length - 1];
    if (!archive) return usage('tar', 'tar -cf arquivo entradas | -tf arquivo | -xf arquivo');
    const ap = sh.resolve(archive);
    if (flags.has('c')) {
      const inputs = operands.filter((o) => o !== archive);
      const files: { path: string; data: Buffer }[] = [];
      for (const e of inputs) {
        const p = sh.resolve(e);
        const node = sh.node(p);
        if (!node) return err(`tar: ${e}: Arquivo ou diretório inexistente`);
        if (node.type === 'file') {
          files.push({ path: e.replace(/^\.\//, ''), data: sh.bytes(p) ?? Buffer.alloc(0) });
          sh.touchRead(p);
        } else {
          for (const f of walkFiles(node, p)) {
            files.push({ path: f.path.replace(/^\//, ''), data: sh.bytes(f.path) ?? Buffer.from(f.node.content ?? '') });
          }
        }
      }
      sh.writeBytes(ap, tarCreate(files));
      return okEmpty();
    }
    const buf = sh.bytes(ap);
    if (!buf) return err(`tar: ${archive}: Arquivo ou diretório inexistente`);
    sh.touchRead(ap);
    const entries = tarParse(buf);
    if (flags.has('t')) return lines(entries.map((e) => e.name));
    if (flags.has('x')) {
      for (const e of entries) sh.writeBytes(sh.resolve(e.name), e.data);
      return okEmpty();
    }
    return usage('tar', 'tar -c|-x|-t -f arquivo');
  }),
  cmd('compress', 'compressão', 'compress arquivo', 'comprime .Z (wrap simples)', ({ args, sh }) => {
    const f = parseArgs(args).operands[0];
    if (!f) return usage('compress', 'compress arquivo');
    const p = sh.resolve(f);
    const buf = sh.bytes(p);
    if (!buf) return err(`compress: ${f}: Arquivo ou diretório inexistente`);
    sh.touchRead(p);
    sh.writeBytes(p + '.Z', Buffer.concat([Buffer.from([0x1f, 0x9d]), gzipSync(buf)]));
    return out(`compress: ${f} → ${f}.Z (LZW stub — use gzip para interoperabilidade)\n`);
  }),
  cmd('uncompress', 'compressão', 'uncompress arquivo.Z', 'descomprime .Z', ({ args, sh }) => {
    const f = parseArgs(args).operands[0];
    if (!f) return usage('uncompress', 'uncompress arquivo.Z');
    const buf = sh.bytes(sh.resolve(f));
    if (!buf || buf[0] !== 0x1f) return err(`uncompress: ${f}: not in compressed format`);
    sh.touchRead(sh.resolve(f));
    try {
      sh.writeBytes(sh.resolve(f.replace(/\.Z$/, '')), gunzipSync(buf.subarray(2)));
      return okEmpty();
    } catch {
      return err(`uncompress: ${f}: corrupt data`);
    }
  }),
];

// ─── network ────────────────────────────────────────────────────────────────

function fetchUrl(ctx: CmdCtx, tool: string): ExecResult {
  const { args, sh } = ctx;
  const { flags, values, long, operands } = parseArgs(args, { withValue: ['o', 'X', 'H'], longWithValue: ['output'] });
  const url = operands[0];
  if (!url) return usage(tool, `${tool} [-Is] [-o arquivo] [-H header] [-X METHOD] URL`);
  const resolved = resolveHost(sh, url);
  if (!resolved) return err(`${tool}: (6) Could not resolve host: ${url.split('/')[2] ?? url}`);
  const { site } = resolved;
  const silent = flags.has('s');
  const headersOnly = flags.has('I');
  const hdrs = Object.entries({ 'Content-Type': 'text/html; charset=utf-8', Server: 'abyss/1.0', ...site.headers }).map(([k, v]) => `${k}: ${v}`);
  const body = headersOnly ? '' : site.html;
  const outFile = values.o ?? (typeof long.output === 'string' ? long.output : undefined);
  if (outFile) {
    sh.write(sh.resolve(outFile), body);
    return silent ? okEmpty() : out(`Saved to ${outFile}\n`);
  }
  if (headersOnly) return lines(hdrs);
  if (silent) return out(body);
  return lines([...hdrs, '', body]);
}

const NETWORK: CommandSpec[] = [
  cmd('curl', 'rede', 'curl [-Is] [-o arquivo] [-H header] [-X METHOD] URL', 'cliente HTTP simulado', (ctx) => fetchUrl(ctx, 'curl')),
  cmd('wget', 'rede', 'wget [-q] [-O arquivo] URL', 'baixa recurso simulado', ({ args, sh }) => {
    const { flags, values, operands } = parseArgs(args, { withValue: ['O'] });
    const url = operands[0];
    if (!url) return usage('wget', 'wget URL');
    const resolved = resolveHost(sh, url);
    if (!resolved) return err(`wget: unable to resolve host address '${url}'`);
    const outName = values.O ?? url.split('/').pop() ?? 'index.html';
    sh.write(sh.resolve(outName), resolved.site.html);
    return flags.has('q') ? okEmpty() : out(`${outName} saved [${resolved.site.html.length}]\n`);
  }),
  cmd('ping', 'rede', 'ping [-c N] host', 'teste ICMP simulado', ({ args, sh }) => {
    const { values, operands } = parseArgs(args, { withValue: ['c'] });
    const host = operands[0] ?? 'null-machine.local';
    const count = Number(values.c ?? '3');
    const resolved = resolveHost(sh, host);
    if (!resolved && host !== 'null-machine.local') return err(`ping: ${host}: Name or service not known`);
    const ip = '10.13.0.4';
    const rnd = sh.rand('ping:' + host);
    const rows = [`PING ${host} (${ip}) 56(84) bytes of data.`];
    for (let i = 0; i < count; i++) {
      const ms = (rnd() * 40 + 5).toFixed(1);
      rows.push(`64 bytes from ${ip}: icmp_seq=${i + 1} ttl=64 time=${ms} ms`);
    }
    rows.push(`--- ${host} ping statistics ---`, `${count} packets transmitted, ${count} received, 0% packet loss`);
    return lines(rows);
  }),
  cmd('dig', 'rede', 'dig [@server] host [type]', 'consulta DNS simulada', ({ args, sh }) => {
    const host = args.find((a) => !a.startsWith('-') && !a.startsWith('@')) ?? 'null-machine.local';
    const resolved = resolveHost(sh, host);
    const ip = resolved ? '10.13.0.4' : 'NXDOMAIN';
    return lines([
      `; <<>> dig sim <<>> ${host}`,
      ';; ANSWER SECTION:',
      resolved ? `${host}.\t\t300\tIN\tA\t10.13.0.4` : `; ${host}. NXDOMAIN`,
      resolved ? `${host}.\t\t300\tIN\tTXT\t"v=abyss1; chapter=${sh.chapter}"` : '',
    ].filter(Boolean));
  }),
  cmd('nslookup', 'rede', 'nslookup host', 'lookup DNS simulado', ({ args, sh }) => {
    const host = parseArgs(args).operands[0] ?? 'null-machine.local';
    const resolved = resolveHost(sh, host);
    if (!resolved) return err(`** server can't find ${host}: NXDOMAIN`);
    return lines([`Server:\t\t10.13.0.1`, `Address:\t10.13.0.1#53`, '', `Name:\t${host}`, `Address: 10.13.0.4`]);
  }),
  cmd('host', 'rede', 'host nome', 'consulta DNS simples', ({ args, sh }) => {
    const host = parseArgs(args).operands[0];
    if (!host) return usage('host', 'host nome');
    const resolved = resolveHost(sh, host);
    if (!resolved) return err(`Host ${host} not found: 3(NXDOMAIN)`);
    return out(`${host} has address 10.13.0.4\n${host} descriptive text "chapter=${sh.chapter}"\n`);
  }),
  cmd('traceroute', 'rede', 'traceroute host', 'traça rota simulada', ({ args, sh }) => {
    const host = parseArgs(args).operands[0] ?? 'gateway';
    const hops = ['10.13.0.1', '10.13.0.2', '10.13.0.4'];
    const rnd = sh.rand('trace:' + host);
    const rows = [`traceroute to ${host} (10.13.0.4), 30 hops max`];
    hops.forEach((h, i) => rows.push(` ${i + 1}  ${h}  ${(rnd() * 20 + 1).toFixed(3)} ms`));
    return lines(rows);
  }),
  cmd('tracepath', 'rede', 'tracepath host', 'traça rota (path MTU)', ({ args, sh }) => {
    const host = parseArgs(args).operands[0] ?? 'null-machine.local';
    return lines([` 1:  null-machine (10.13.0.4)                      0.1ms pmtu 1500`, ` 1:  ${host} (10.13.0.9)                           12.4ms reached`]);
  }),
  cmd('netstat', 'rede', 'netstat [-tuln]', 'sockets simulados', ({ sh }) => {
    const rows = ['Proto Recv-Q Send-Q Local Address           Foreign Address         State'];
    sh.procs().forEach((p, i) => {
      if (/sshd|node|orpheus|curl/.test(p.command)) {
        rows.push(`tcp        0      0 10.13.0.4:${40000 + p.pid % 2000}     10.13.0.9:443           ESTABLISHED`);
      }
    });
    rows.push('tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN');
    return lines(rows);
  }),
  cmd('ss', 'rede', 'ss [-tuln]', 'estatísticas de socket', ({ sh }) => {
    const rows = ['Netid State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess'];
    sh.procs().slice(0, 8).forEach((p) => {
      rows.push(`tcp   ESTAB  0      0      10.13.0.4:${40000 + p.pid % 2000} 10.13.0.9:443   users:(("${p.command.split(' ')[0]}",pid=${p.pid}))`);
    });
    return lines(rows);
  }),
  cmd('ip', 'rede', 'ip addr|route', 'informação de rede', ({ args }) => {
    const sub = args[1] ?? 'addr';
    if (sub === 'route') return lines(['default via 10.13.0.1 dev eth0', '10.13.0.0/24 dev eth0 proto kernel scope link src 10.13.0.4']);
    return lines([
      '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536',
      '    inet 127.0.0.1/8 scope host lo',
      '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500',
      '    inet 10.13.0.4/24 brd 10.13.0.255 scope global eth0',
    ]);
  }),
  cmd('ifconfig', 'rede', 'ifconfig [iface]', 'configuração de interface', () =>
    lines([
      'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
      '        inet 10.13.0.4  netmask 255.255.255.0  broadcast 10.13.0.255',
      '        ether 02:00:00:00:00:04  txqueuelen 1000  (Ethernet)',
      'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
      '        inet 127.0.0.1  netmask 255.255.0.0',
    ]),
  ),
  cmd('nc', 'rede', 'nc [host] [port]', 'netcat — eco simulado', ({ args }) => {
    const { operands } = parseArgs(args);
    if (!operands.length) return out('nc: use nc host port (simulated — no persistent socket)\n');
    return out(`Connection to ${operands[0]} ${operands[1] ?? '443'} [tcp] succeeded (simulated).\n`);
  }),
  cmd('netcat', 'rede', 'netcat [host] [port]', 'alias de nc', ({ args }) => {
    const { operands } = parseArgs(args);
    if (!operands.length) return out('netcat: use netcat host port (simulated)\n');
    return out(`Connection to ${operands[0]} ${operands[1] ?? '443'} [tcp] succeeded (simulated).\n`);
  }),
  cmd('whois', 'rede', 'whois domínio', 'registro simulado', ({ args, sh }) => {
    const dom = parseArgs(args).operands[0] ?? 'null-machine.local';
    return lines([
      `Domain Name: ${dom.toUpperCase()}`,
      'Registrar: Abyss Registry (simulated)',
      `Creation Date: 2030-01-01`,
      `Registrant Org: null observer program`,
      `Comment: chapter=${sh.chapter}`,
    ]);
  }),
];

// ─── system / processes ─────────────────────────────────────────────────────

const NULL_HW = {
  cpu: 'NullCore v3 (simulated x86_64)',
  cores: 4,
  model: 'AbyssUNIX Virtual CPU @ 2.40GHz',
  memTotal: 8 * 1024 * 1024 * 1024,
};

function fmtPs(sh: ShellApi, style: 'ef' | 'aux'): string[] {
  const procs = sh.procs();
  if (style === 'ef') {
    return [
      'UID        PID  PPID  C STIME TTY          TIME CMD',
      ...procs.map((p) =>
        `${p.user.padEnd(10)} ${String(p.pid).padStart(5)} ${String(p.ppid).padStart(5)} ${String(Math.round(p.cpu)).padStart(2)} ${p.start} ?        ${p.time} ${p.command}`,
      ),
    ];
  }
  return [
    'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
    ...procs.map((p) =>
      `${p.user.padEnd(9)} ${String(p.pid).padStart(4)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(p.rss * 1024).padStart(5)} ${String(p.rss).padStart(5)} ?        ${p.stat.padEnd(4)} ${p.start} ${p.time} ${p.command}`,
    ),
  ];
}

const SYSTEM: CommandSpec[] = [
  cmd('ps', 'processos', 'ps [-ef] [-aux]', 'lista processos', ({ args, sh }) => {
    const { flags } = parseArgs(args);
    if (flags.has('e') && flags.has('f')) return lines(fmtPs(sh, 'ef'));
    if (flags.has('a') || flags.has('u') || flags.has('x')) return lines(fmtPs(sh, 'aux'));
    const self = sh.procs().find((p) => /shell|null-sh/.test(p.command));
    return lines([`  PID TTY          TIME CMD`, `${self?.pid ?? 1} ?        00:00:00 ${self?.command.split(' ')[0] ?? 'sh'}`]);
  }),
  cmd('top', 'processos', 'top [-bn1]', 'snapshot de processos', ({ sh }) => {
    const rows = ['top - ' + sh.now().toISOString().slice(0, 19) + ' up simulated,  1 user,  load average: 0.08, 0.04, 0.02', 'Tasks: ' + sh.procs().length + ' total', ''];
    rows.push(...fmtPs(sh, 'aux').slice(1, 12));
    return lines(rows);
  }),
  cmd('htop', 'processos', 'htop', 'snapshot colorido (texto)', ({ sh }) => {
    return lines(['  PID USER     CPU% MEM% Command', ...sh.procs().slice(0, 15).map((p) => `${String(p.pid).padStart(5)} ${p.user.padEnd(8)} ${p.cpu.toFixed(0).padStart(3)} ${p.mem.toFixed(0).padStart(3)} ${p.command.slice(0, 40)}`)]);
  }),
  cmd('kill', 'processos', 'kill [-9] PID', 'envia sinal a processo', ({ args, sh }) => {
    const { flags, operands } = parseArgs(args);
    const pid = Number(operands[0]);
    if (!pid) return usage('kill', 'kill PID');
    const found = sh.procs().some((p) => p.pid === pid);
    if (!found) return err(`kill: (${pid}) - No such process`);
    sh.emit(`proc.kill:${pid}${flags.has('9') ? ':SIGKILL' : ':SIGTERM'}`);
    return okEmpty();
  }),
  cmd('killall', 'processos', 'killall nome', 'mata processos por nome', ({ args, sh }) => {
    const name = parseArgs(args).operands[0];
    if (!name) return usage('killall', 'killall nome');
    const hits = sh.procs().filter((p) => p.command.includes(name));
    if (!hits.length) return err(`${name}: no process found`);
    hits.forEach((p) => sh.emit(`proc.kill:${p.pid}`));
    return okEmpty();
  }),
  cmd('sleep', 'sistema', 'sleep segundos', 'aguarda (máx 50ms real)', ({ args }) => {
    const sec = Math.min(Number(parseArgs(args).operands[0] ?? '0'), 3600);
    if (sec > 0) {
      const start = Date.now();
      while (Date.now() - start < Math.min(sec * 1000, 50)) { /* cap */ }
    }
    return okEmpty();
  }),
  cmd('env', 'sistema', 'env', 'imprime ambiente', ({ sh }) => lines(Object.entries(sh.env).map(([k, v]) => `${k}=${v}`))),
  cmd('printenv', 'sistema', 'printenv [var]', 'imprime variável', ({ args, sh }) => {
    const key = parseArgs(args).operands[0];
    if (!key) return lines(Object.entries(sh.env).map(([k, v]) => `${k}=${v}`));
    const v = sh.env[key];
    return v != null ? out(v + '\n') : err(`printenv: '${key}': variável não definida`);
  }),
  cmd('set', 'shell', 'set [-o]', 'mostra opções/variáveis', ({ sh }) => lines([`chapter=${sh.chapter}`, `cwd=${sh.cwd}`, ...Object.entries(sh.env).map(([k, v]) => `${k}=${v}`)])),
  cmd('unset', 'shell', 'unset VAR', 'remove variável', ({ args, sh }) => {
    const key = parseArgs(args).operands[0];
    if (key) delete sh.env[key];
    return okEmpty();
  }),
  cmd('date', 'sistema', 'date [+formato]', 'data/hora simulada', ({ args, sh }) => {
    const fmt = parseArgs(args).operands[0];
    const d = sh.now();
    if (fmt?.startsWith('+')) {
      const f = fmt.slice(1);
      const s = f.replace(/%Y/g, String(d.getUTCFullYear())).replace(/%m/g, String(d.getUTCMonth() + 1).padStart(2, '0')).replace(/%d/g, String(d.getUTCDate()).padStart(2, '0')).replace(/%H/g, String(d.getUTCHours()).padStart(2, '0')).replace(/%M/g, String(d.getUTCMinutes()).padStart(2, '0')).replace(/%S/g, String(d.getUTCSeconds()).padStart(2, '0'));
      return out(s + '\n');
    }
    return out(d.toUTCString() + '\n');
  }),
  cmd('cal', 'sistema', 'cal [mês] [ano]', 'calendário', ({ args, sh }) => {
    const ops = parseArgs(args).operands.map(Number);
    const d = sh.now();
    const year = ops[1] || (ops[0] > 12 ? ops[0] : 0) || d.getUTCFullYear();
    const month = ops[1] ? ops[0] : ops[0] <= 12 && ops[0] > 0 ? ops[0] : d.getUTCMonth() + 1;
    const first = new Date(Date.UTC(year, month - 1, 1));
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const rows = [`   ${year} ${String(month).padStart(2)}`, ' Su Mo Tu We Th Fr Sa'];
    let line = '   ';
    for (let i = 0; i < first.getUTCDay(); i++) line += '   ';
    for (let day = 1; day <= days; day++) {
      line += String(day).padStart(3);
      if ((first.getUTCDay() + day) % 7 === 0) { rows.push(line); line = '   '; }
    }
    if (line.trim()) rows.push(line);
    return lines(rows);
  }),
  cmd('uptime', 'sistema', 'uptime', 'tempo ligado simulado', ({ sh }) => {
    const r = sh.rand('uptime');
    const mins = Math.floor(r() * 50000 + 1000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return out(` ${sh.now().toISOString().slice(11, 19)} up ${h}:${String(m).padStart(2, '0')},  1 user,  load average: 0.02, 0.01, 0.00\n`);
  }),
  cmd('free', 'sistema', 'free [-h]', 'memória simulada', ({ args }) => {
    const hum = parseArgs(args).flags.has('h');
    const total = NULL_HW.memTotal;
    const used = Math.floor(total * 0.42);
    const fmt = (n: number) => (hum ? human(n) : String(Math.floor(n / 1024)));
    return lines([`              total        used        free`, `Mem:     ${fmt(total).padStart(10)} ${fmt(used).padStart(10)} ${fmt(total - used).padStart(10)}`]);
  }),
  cmd('uname', 'sistema', 'uname [-a|-s|-r|-m]', 'informação do kernel', ({ args }) => {
    const { flags } = parseArgs(args);
    if (flags.has('a')) return out('AbyssUNIX null-machine 6.1.0-abyss #1 SMP x86_64 GNU/Linux\n');
    if (flags.has('s')) return out('AbyssUNIX\n');
    if (flags.has('r')) return out('6.1.0-abyss\n');
    if (flags.has('m')) return out('x86_64\n');
    return out('AbyssUNIX\n');
  }),
  cmd('hostname', 'sistema', 'hostname', 'nome do host', () => out('null-machine\n')),
  cmd('whoami', 'sistema', 'whoami', 'usuário efetivo', () => out('null\n')),
  cmd('id', 'sistema', 'id', 'uid/gid', () => out('uid=1000(null) gid=1000(null) groups=1000(null)\n')),
  cmd('groups', 'sistema', 'groups', 'grupos do usuário', () => out('null\n')),
  cmd('pwd', 'navegação', 'pwd', 'diretório atual', ({ sh }) => out(sh.cwd + '\n')),
  cmd('clear', 'shell', 'clear', 'limpa tela', () => out('\x1b[2J\x1b[H')),
  cmd('true', 'shell', 'true', 'código de saída 0', () => okEmpty()),
  cmd('false', 'shell', 'false', 'código de saída 1', () => ({ stdout: '', stderr: '', code: 1 })),
  cmd('yes', 'shell', 'yes [texto]', 'imprime linha repetidamente', ({ args, stdin }) => {
    const { values, operands } = parseArgs(args, { withValue: ['n'] });
    const text = operands[0] ?? 'y';
    const limit = values.n ? Number(values.n) : stdin ? 100 : 20;
    return lines(Array(Math.min(limit, 100)).fill(text));
  }),
  cmd('which', 'shell', 'which comando', 'localiza executável', ({ args, sh }) => {
    const name = parseArgs(args).operands[0];
    if (!name) return usage('which', 'which comando');
    if (sh.isCommand(name)) return out(`/usr/bin/${name}\n`);
    return err(`${name}: not found`);
  }),
  cmd('type', 'shell', 'type nome', 'tipo de comando', ({ args, sh }) => {
    const name = parseArgs(args).operands[0];
    if (!name) return usage('type', 'type nome');
    if (sh.aliases[name]) return out(`${name} is aliased to '${sh.aliases[name]}'\n`);
    if (sh.isCommand(name)) return out(`${name} is a shell builtin/command\n`);
    return err(`${name}: not found`);
  }),
  cmd('command', 'shell', 'command -v nome', 'localiza comando', ({ args, sh }) => {
    const { flags, operands } = parseArgs(args);
    const name = operands[0];
    if (flags.has('v') && name) {
      if (sh.isCommand(name)) return out(`${name}\n`);
      return err('', 1);
    }
    return usage('command', 'command -v nome');
  }),
  cmd('history', 'shell', 'history [n]', 'histórico de comandos', ({ args, sh }) => {
    const n = Number(parseArgs(args).operands[0] ?? '0');
    const hist = n > 0 ? sh.history.slice(-n) : sh.history;
    return lines(hist.map((h, i) => `${String(sh.history.length - hist.length + i + 1).padStart(5)}  ${h}`));
  }),
  cmd('alias', 'shell', 'alias [nome=valor]', 'lista ou define alias', ({ args, sh }) => {
    const { operands } = parseArgs(args);
    if (!operands.length) return lines(Object.entries(sh.aliases).map(([k, v]) => `alias ${k}='${v}'`));
    const eq = operands[0].indexOf('=');
    if (eq > 0) sh.aliases[operands[0].slice(0, eq)] = operands[0].slice(eq + 1);
    return okEmpty();
  }),
  cmd('echo', 'shell', 'echo [-n] [-e] [texto...]', 'imprime argumentos', ({ args }) => {
    const { flags, operands } = parseArgs(args);
    let text = operands.join(' ');
    if (flags.has('e')) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const body = flags.has('n') ? text : text + '\n';
    return out(body);
  }),
  cmd('printf', 'shell', 'printf formato [args...]', 'saída formatada', ({ args }) => {
    const fmt = args[0] ?? '';
    const rest = args.slice(1);
    let ai = 0;
    let body = '';
    // reutiliza o formato até consumir os argumentos (como printf(1))
    do {
      let used = 0;
      const chunk = fmt
        .replace(/\\([ntr\\%])/g, (_, c: string) =>
          c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === '\\' ? '\\' : '%',
        )
        .replace(/%(-?\d*)([sdfxX])/g, (_m, _w, conv: string) => {
          used += 1;
          const v = rest[ai++] ?? '';
          if (conv === 's') return String(v);
          if (conv === 'd') return String(Math.trunc(Number(v) || 0));
          if (conv === 'f') return String(Number(v) || 0);
          if (conv === 'x') return (Number(v) || 0).toString(16);
          if (conv === 'X') return (Number(v) || 0).toString(16).toUpperCase();
          return String(v);
        })
        .replace(/%%/g, '%');
      body += chunk;
      if (!used) break;
    } while (ai < rest.length);
    return out(body);
  }),
  cmd('test', 'shell', 'test expr | test -f arquivo', 'avalia expressão', ({ args, sh }) => runTest(args, sh)),
  cmd('[', 'shell', '[ expr ]', 'alias de test', ({ args, sh }) => runTest(args.filter((a) => a !== ']'), sh)),
  cmd('expr', 'shell', 'expr arg1 op arg2', 'expressão inteira', ({ args }) => {
    const ops = parseArgs(args).operands;
    if (ops.length < 3) return usage('expr', 'expr A op B');
    const a = Number(ops[0]);
    const op = ops[1];
    const b = Number(ops[2]);
    const r = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? Math.floor(a / b) : op === '%' ? a % b : 0;
    return out(String(r) + '\n');
  }),
  cmd('bc', 'shell', 'bc', 'calculadora (linha única via args)', ({ args, stdin }) => {
    const expr = args.length ? args.join(' ') : stdin.trim();
    if (!expr) return usage('bc', 'echo 1+1 | bc');
    try {
      if (!/^[\d\s+\-*/().]+$/.test(expr)) return err('bc: syntax error');
      // eslint-disable-next-line no-new-func
      return out(String(Function(`"use strict"; return (${expr})`)()) + '\n');
    } catch {
      return err('bc: syntax error');
    }
  }),
  cmd('factor', 'shell', 'factor N', 'fatores primos', ({ args }) => {
    let n = Number(parseArgs(args).operands[0]);
    if (!n || n < 2) return usage('factor', 'factor N');
    const factors: number[] = [];
    for (let d = 2; d * d <= n; d++) while (n % d === 0) { factors.push(d); n /= d; }
    if (n > 1) factors.push(n);
    return out(`${parseArgs(args).operands[0]}: ${factors.join(' ')}\n`);
  }),
  cmd('getconf', 'sistema', 'getconf nome', 'variáveis de configuração', ({ args }) => {
    const name = parseArgs(args).operands[0] ?? 'PAGE_SIZE';
    const map: Record<string, string> = { PAGE_SIZE: '4096', CHILD_MAX: '4096', OPEN_MAX: '1024', ARG_MAX: '2097152' };
    return map[name] ? out(map[name] + '\n') : err(`getconf: '${name}': unknown variable`);
  }),
  cmd('locale', 'sistema', 'locale [-a]', 'configuração regional', ({ args }) => {
    if (parseArgs(args).flags.has('a')) return lines(['C', 'C.UTF-8', 'en_US.UTF-8', 'pt_BR.UTF-8']);
    return lines(['LANG=C.UTF-8', 'LC_ALL=C.UTF-8']);
  }),
  cmd('dmesg', 'sistema', 'dmesg', 'buffer do kernel (narrativa)', ({ sh }) => {
    const rows = [
      `[${sh.now().toISOString()}] AbyssUNIX: booting chapter=${sh.chapter}`,
      `[${sh.now().toISOString()}] quarantine: overlay mounted ro`,
      `[${sh.now().toISOString()}] null-sh: session observer attached`,
      `[${sh.now().toISOString()}] orpheus: trace sink active`,
    ];
    sh.trace.slice(0, 5).forEach((t) => rows.push(`[${t.ts}] ${t.service}: ${t.event} (${t.latency}ms)`));
    return lines(rows);
  }),
  cmd('journalctl', 'sistema', 'journalctl [-n N]', 'logs systemd simulados', ({ args, sh }) => {
    const n = Number(parseArgs(args, { withValue: ['n'] }).values.n ?? '10');
    const rows = sh.trace.slice(0, n).map((t) => `${t.ts} ${t.level} ${t.service}[${t.traceId.slice(0, 8)}]: ${t.detail}`);
    return lines(rows.length ? rows : ['-- No entries --']);
  }),
  cmd('last', 'sistema', 'last', 'logins recentes', ({ sh }) => lines([`null   pts/0        10.13.0.4        ${sh.now().toISOString().slice(0, 16)}   still logged in`])),
  cmd('w', 'sistema', 'w', 'usuários logados', ({ sh }) => lines([`${sh.now().toISOString().slice(11, 19)} up simulated,  1 user,  load average: 0.00`, 'USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT', 'null     pts/0    10.13.0.4        -        0.00s  0.01s  0.00s null-sh'])),
  cmd('who', 'sistema', 'who', 'quem está logado', () => out('null     pts/0        2026-08-22 14:00 (10.13.0.4)\n')),
  cmd('time', 'shell', 'time comando', 'cronometra comando', ({ args, sh }) => {
    const line = args.join(' ').trim();
    if (!line) return usage('time', 'time comando');
    const t0 = Date.now();
    const r = sh.runLine(line);
    const ms = Date.now() - t0;
    return { stdout: r.stdout + `\nreal\t0m${(ms / 1000).toFixed(3)}s\n`, stderr: r.stderr, code: r.code };
  }),
  cmd('timeout', 'shell', 'timeout S comando...', 'limita tempo (simulado)', ({ args, sh }) => {
    const { operands } = parseArgs(args);
    const sec = Number(operands[0]);
    const line = operands.slice(1).join(' ');
    if (!line) return usage('timeout', 'timeout S comando');
    if (sec <= 0) return err('timeout: invalid duration');
    return sh.runLine(line);
  }),
  cmd('watch', 'shell', 'watch [-n S] comando', 'executa periodicamente (uma vez)', ({ args, sh }) => {
    const { values, operands } = parseArgs(args, { withValue: ['n'] });
    const line = operands.join(' ');
    if (!line) return usage('watch', 'watch comando');
    const r = sh.runLine(line);
    const note = `\n[watch: intervalo ${values.n ?? '2'}s — runtime executa snapshot único; sem refresh contínuo]\n`;
    return { stdout: r.stdout + note, stderr: r.stderr, code: r.code };
  }),
  cmd('script', 'shell', 'script [arquivo]', 'grava sessão (stub)', ({ args, sh }) => {
    const f = parseArgs(args).operands[0] ?? '/tmp/typescript';
    sh.write(sh.resolve(f), `Script started on ${sh.now().toISOString()}\n`);
    return out(`Script started, file is ${f}\n`);
  }),
  cmd('tty', 'shell', 'tty', 'terminal conectado', () => out('/dev/pts/0\n')),
  cmd('stty', 'shell', 'stty [-a]', 'configuração tty', ({ args }) => {
    if (parseArgs(args).flags.has('a')) return out('speed 38400 baud; rows 24; columns 80;\n');
    return okEmpty();
  }),
  cmd('reset', 'shell', 'reset', 'reinicia terminal', () => out('\x1b[c\x1b[2J\x1b[H')),
  cmd('tput', 'shell', 'tput cmd', 'capacidades terminfo', ({ args }) => {
    const c = parseArgs(args).operands[0];
    if (c === 'cols') return out('80\n');
    if (c === 'lines') return out('24\n');
    return okEmpty();
  }),
  cmd('arch', 'sistema', 'arch', 'arquitetura', () => out('x86_64\n')),
  cmd('nproc', 'sistema', 'nproc', 'núcleos CPU', () => out(String(NULL_HW.cores) + '\n')),
  cmd('lscpu', 'sistema', 'lscpu', 'informação CPU', () => lines(['Architecture:        x86_64', `Model name:          ${NULL_HW.model}`, `CPU(s):              ${NULL_HW.cores}`, 'Thread(s) per core:  1', 'Vendor ID:           AbyssSim'])),
  cmd('lsblk', 'sistema', 'lsblk', 'dispositivos de bloco', () => lines(['NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT', 'sda      8:0    0   32G  0 disk ', '├─sda1   8:1    0   31G  0 part /', '└─sda2   8:2    0    1G  0 part [SWAP]'])),
  cmd('lspci', 'sistema', 'lspci', 'dispositivos PCI', () => lines(['00:00.0 Host bridge: Abyss Virtual Host', '00:1f.0 Ethernet controller: Simulated NIC (eth0)'])),
  cmd('lsusb', 'sistema', 'lsusb', 'dispositivos USB', () => lines(['Bus 001 Device 001: ID 0000:0000 Abyss Root Hub', 'Bus 001 Device 002: ID 046d:c52b Logitech Unifying (simulated)'])),
  cmd('vmstat', 'sistema', 'vmstat [intervalo]', 'estatísticas VM', ({ sh }) => {
    const r = sh.rand('vmstat');
    return lines(['procs -----------memory---------- ---swap--', ' r  b   swpd   free   buff  cache', ` ${Math.floor(r() * 3)}  0      0 ${Math.floor(r() * 4000000)} 120000 890000`]);
  }),
  cmd('iostat', 'sistema', 'iostat', 'I/O de disco', ({ sh }) => {
    const r = sh.rand('iostat');
    return lines(['Device            tps    kB_read/s    kB_w/s', `sda              ${(r() * 10).toFixed(2)}         ${(r() * 100).toFixed(2)}      ${(r() * 50).toFixed(2)}`]);
  }),
  cmd('sar', 'sistema', 'sar', 'atividade do sistema', ({ sh }) => lines([`${sh.now().toISOString().slice(11, 19)}     CPU     %user     %system     %idle`, `${sh.now().toISOString().slice(11, 19)}     all      4.20        1.10       94.70`])),
];

function compileSource(ctx: CmdCtx, tool: string): ExecResult {
  const { args, sh } = ctx;
  const target = parseArgs(args).operands.find((a) => !a.startsWith('-'));
  if (!target) return usage(tool, `${tool} <arquivo>`);
  const p = sh.resolve(target);
  const src = sh.read(p);
  if (src == null) return err(`${tool}: ${target}: Arquivo ou diretório inexistente`);
  sh.touchRead(p);
  const outPath = sh.resolve(buildOutPath(target));
  sh.write(outPath, fakeElfHeader(p));
  sh.emit(`file.built:${p}`);
  return lines([`${tool} (abyss) — ${target}`, `  → ${outPath.split('/').pop()}`, '0 errors']);
}

function runPythonCmd(ctx: CmdCtx): ExecResult {
  const { args, sh, stdin } = ctx;
  const file = parseArgs(args).operands[0];
  const code = file ? sh.read(sh.resolve(file)) : stdin;
  if (code == null) return err('python: no input');
  if (file) sh.touchRead(sh.resolve(file));
  return runPython(code, sh);
}

const DEV: CommandSpec[] = [
  cmd('node', 'dev', 'node script.js', 'executa JavaScript (.js)', ({ args, sh }) => {
    const file = parseArgs(args).operands[0];
    if (!file) return usage('node', 'node script.js');
    if (!file.endsWith('.js')) return err('node: only .js scripts supported in quarantine');
    const p = sh.resolve(file);
    const code = sh.read(p);
    if (code == null) return err('node: cannot find module');
    try {
      const logs: string[] = [];
      // eslint-disable-next-line no-new-func
      new Function('console', code)({ log: (...a: unknown[]) => logs.push(a.map(String).join(' ')) });
      sh.touchRead(p);
      return out(logs.join('\n') + (logs.length ? '\n' : ''));
    } catch (e) {
      return err(`node: ${e instanceof Error ? e.message : 'runtime error'}`);
    }
  }),
  cmd('python', 'dev', 'python script.py', 'interpretador Python mínimo', runPythonCmd),
  cmd('python3', 'dev', 'python3 script.py', 'interpretador Python 3 mínimo', runPythonCmd),
  cmd('make', 'dev', 'make [alvo]', 'compila alvo', (ctx) => compileSource(ctx, 'make')),
  cmd('build', 'dev', 'build arquivo', 'compila artefato .out', (ctx) => compileSource(ctx, 'build')),
  cmd('gcc', 'dev', 'gcc -o out fonte.c', 'compilador simulado', (ctx) => compileSource(ctx, 'gcc')),
  cmd('clang', 'dev', 'clang fonte.c', 'compilador simulado', (ctx) => compileSource(ctx, 'clang')),
  cmd('strip', 'dev', 'strip arquivo.out', 'remove símbolos (noop)', ({ args, sh }) => {
    const f = parseArgs(args).operands[0];
    if (!f) return usage('strip', 'strip arquivo');
    const p = sh.resolve(f);
    if (!sh.exists(p)) return err(`strip: '${f}': No such file`);
    sh.touchRead(p);
    return okEmpty();
  }),
  cmd('nm', 'dev', 'nm arquivo.out', 'lista símbolos', ({ args, sh }) => {
    const f = parseArgs(args).operands[0];
    if (!f) return usage('nm', 'nm arquivo');
    const p = sh.resolve(f);
    const buf = sh.bytes(p);
    if (!buf) return err(`nm: ${f}: No such file`);
    sh.touchRead(p);
    return lines(analyzeOut(buf).symbols);
  }),
  cmd('objdump', 'dev', 'objdump -d arquivo.out', 'desmonta executável', ({ args, sh }) => {
    const f = parseArgs(args).operands.find((a) => !a.startsWith('-'));
    if (!f) return usage('objdump', 'objdump -d arquivo');
    const p = sh.resolve(f);
    const buf = sh.bytes(p);
    if (!buf) return err(`objdump: ${f}: No such file`);
    sh.touchRead(p);
    return lines(['', 'Disassembly of section .text:', '401000:  push   %rbp', '401001:  mov    %rsp,%rbp', '401004:  call   401020 <main>']);
  }),
  cmd('readelf', 'dev', 'readelf -h arquivo.out', 'cabeçalho ELF', ({ args, sh }) => {
    const f = parseArgs(args).operands.find((a) => !a.startsWith('-'));
    if (!f) return usage('readelf', 'readelf -h arquivo');
    const p = sh.resolve(f);
    const buf = sh.bytes(p);
    if (!buf) return err(`readelf: ${f}: No such file`);
    sh.touchRead(p);
    return lines(analyzeOut(buf).headers);
  }),
  cmd('git', 'dev', 'git status|log|show|cat-file|branch|diff|rev-parse', 'subset git VFS', runGit),
  cmd('npm', 'dev', 'npm ...', 'registry em quarentena', () => err('npm: registry unreachable — quarantine network policy (use local node/build)')),
  cmd('npx', 'dev', 'npx ...', 'registry em quarentena', () => err('npx: registry unreachable — quarantine network policy')),
  cmd('cargo', 'dev', 'cargo build', 'Rust toolchain subset', () => out('cargo: toolchain not installed in quarantine (use gcc/build)\n')),
  cmd('go', 'dev', 'go build', 'Go toolchain subset', () => out('go: toolchain not installed in quarantine (use gcc/build)\n')),
  cmd('rustc', 'dev', 'rustc fonte.rs', 'Rust compiler subset', () => out('rustc: not available — use gcc/build for .out artifacts\n')),
];

const MAN_INDEX: Map<string, CommandSpec> = new Map();

export function registerManPages(specs: CommandSpec[]) {
  for (const c of specs) MAN_INDEX.set(c.name, c);
}

function gameHelp(): ExecResult {
  const cats: Record<string, string[]> = {};
  for (const c of MAN_INDEX.values()) {
    cats[c.category] ??= [];
    if (!cats[c.category].includes(c.name)) cats[c.category].push(c.name);
  }
  const rows = ['ABYSS shell — comandos disponíveis:', ''];
  for (const [cat, names] of Object.entries(cats).sort()) {
    rows.push(`  ${cat}: ${names.sort().join(', ')}`);
  }
  rows.push(
    '',
    'Operadores: |  &&  ||  ;  >  >>  <  2>  $(...)  <(...)  *  ?  {}',
    'Use man <comando> para detalhes. Game: submit, investigate, choose, epilogue.',
  );
  return lines(rows);
}

const GAME: CommandSpec[] = [
  cmd('submit', 'jogo', 'submit <P-ID> <resposta>', 'envia resposta de puzzle', ({ args, sh }) => {
    const puzzleId = args[0];
    const answer = args.slice(1).join(' ').trim();
    if (!puzzleId || !answer) return usage('submit', 'submit <P-ID> <resposta>');
    sh.emit(`submit:${puzzleId}:${answer}`);
    return out(`Submitted ${puzzleId} — validating...\n`);
  }),
  cmd('investigate', 'jogo', 'investigate [capítulo]', 'workspace de investigação', ({ args, sh }) => {
    const chapter = args[0] ?? sh.chapter;
    const base = '/home/null/investigation';
    const inv = sh.node(base);
    const dirs = inv?.type === 'dir' ? Object.keys(inv.children ?? {}).sort() : [];
    return lines([
      `Investigation workspace (${chapter})`,
      `Path: ${base}`,
      ...dirs.map((d) => `  ${d}/`),
      '',
      'Browse: ls /home/null/investigation/<chapter>',
      'Submit: submit P-XXX <answer>',
      'Evidence: use Evidence app for collected artifacts.',
    ]);
  }),
  cmd('choose', 'jogo', 'choose <final>', '(legado) use os arquivos em endings/', ({ args, sh }) => {
    const ending = (args[0] ?? '').toLowerCase();
    if (!['disconnect', 'observer', 'merge', 'null', 'capture'].includes(ending)) {
      return usage(
        'choose',
        'Os finais não se digitam. Abra um arquivo em endings/ (DISCONNECT, OBSERVER, MERGE, NULL, CAPTURE).',
      );
    }
    sh.emit(`ending.choose:${ending}`);
    return out(`Desfecho legado: ${ending}\n(Prefira abrir endings/${ending.toUpperCase()})\n`);
  }),
  cmd('disconnect', 'jogo', 'disconnect', 'corta conexões conhecidas — desfecho', ({ sh }) => {
    sh.emit('ending.choose:disconnect');
    return out('Severing known routes…\n');
  }),
  cmd('inherit', 'jogo', 'inherit', 'assume o posto de Observer — desfecho', ({ sh }) => {
    sh.emit('ending.choose:observer');
    return out('Inheriting NULL watch…\n');
  }),
  cmd('converge', 'jogo', 'converge', 'autoriza fusão com Mariana — desfecho', ({ sh }) => {
    sh.emit('ending.choose:merge');
    return out('Authorizing continuity with Mariana…\n');
  }),
  cmd('erase-self', 'jogo', 'erase-self', 'apaga o próprio rastro — desfecho', ({ sh }) => {
    sh.emit('ending.choose:null');
    return out('Wiping observer footprint…\n');
  }),
  cmd('accept-link', 'jogo', 'accept-link', 'aceita o canal invertido — desfecho', ({ sh }) => {
    sh.emit('ending.choose:capture');
    return out('Opening inverted channel…\n');
  }),
  cmd('epilogue', 'jogo', 'epilogue', 'solicita epílogo', ({ sh }) => {
    sh.emit('epilogue.request');
    return lines(['observer disconnected', 'new observer detected', 'hello.']);
  }),
  cmd('flag', 'jogo', 'flag', 'flags do servidor', () => out('(flags are server-side — use Vault app)\n')),
  cmd('help', 'jogo', 'help', 'lista categorias e comandos', gameHelp),
  cmd('man', 'jogo', 'man comando', 'manual do comando', ({ args }) => {
    const name = parseArgs(args).operands[0];
    if (!name) return gameHelp();
    const spec = MAN_INDEX.get(name);
    if (!spec) return err(`No manual entry for ${name}`);
    const body = [`NAME`, `  ${spec.name} — ${spec.summary}`, '', `SYNOPSIS`, `  ${spec.synopsis}`, '', ...(spec.man?.length ? ['DESCRIPTION', ...spec.man.map((l) => `  ${l}`)] : [`  ${spec.summary}`])];
    return lines(body);
  }),
  cmd('tip', 'jogo', 'tip', 'dica de gameplay', () => lines(['Tip: open the Evidence app to review artifacts you read with cat/xxd/strings.', 'Submit answers with: submit P-XXX <answer>'])),
  cmd('hints', 'jogo', 'hints', 'dicas de investigação', () => lines(['Hints:', '  • Read brief.txt under /home/null/investigation/<chapter>/P-XXX/', '  • Use strings/xxd on binaries; git log in repos', '  • Submit via: submit P-XXX <answer>', '  • Track evidence in the Evidence app'])),
];

export const MISC_COMMANDS: CommandSpec[] = [
  ...BINARY_DATA,
  ...CRYPTO,
  ...COMPRESSION,
  ...NETWORK,
  ...SYSTEM,
  ...DEV,
  ...GAME,
];

for (const c of MISC_COMMANDS) MAN_INDEX.set(c.name, c);
