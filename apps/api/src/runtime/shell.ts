import type { VfsNode } from '@abyss/shared';
import {
  cloneVfs,
  ensureDir,
  getNode,
  globPaths,
  listDir,
  pathExists,
  putNode,
  readBytes,
  readFile,
  removeNode,
  resolvePath,
  writeBinary,
  writeFile,
} from './vfs.js';
import {
  expandBraces,
  globToRegExp,
  hasGlob,
  parse,
  type Redir,
  type SimpleCommand,
  type Word,
} from './parse.js';
import {
  type CommandSpec,
  type ExecResult,
  type PacketFrame,
  type ProcEntry,
  type ShellApi,
  type SiteEntry,
  type TraceRow,
  err,
  out,
} from './shell-types.js';
import { FS_COMMANDS } from './commands-fs.js';
import { TEXT_COMMANDS } from './commands-text.js';
import { MISC_COMMANDS, registerManPages } from './commands-misc.js';

export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  events: string[];
};

const COMMANDS = new Map<string, CommandSpec>();
for (const c of [...FS_COMMANDS, ...TEXT_COMMANDS, ...MISC_COMMANDS]) {
  COMMANDS.set(c.name, c);
}
// `[` é alias de test
const testCmd = COMMANDS.get('test');
if (testCmd) COMMANDS.set('[', { ...testCmd, name: '[' });
registerManPages([...COMMANDS.values()]);

function seedRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    return h / 4294967296;
  };
}

export class VfsShell {
  cwd: string;
  root: VfsNode;
  env: Record<string, string>;
  aliases: Record<string, string> = {};
  history: string[] = [];
  chapter = 'prologue';
  hosts = new Map<string, SiteEntry>();
  packets: PacketFrame[] = [];
  trace: TraceRow[] = [];
  lastExit = 0;
  private events: string[] = [];
  private depth = 0;
  private procCounter = 0;

  constructor(root: VfsNode, cwd = '/home/null') {
    this.root = cloneVfs(root);
    this.cwd = cwd;
    this.env = {
      HOME: '/home/null',
      USER: 'null',
      LOGNAME: 'null',
      SHELL: '/bin/abyss-sh',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PWD: cwd,
      HOSTNAME: 'null-machine',
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
      TMPDIR: '/tmp',
      ABYSS_CHAPTER: 'prologue',
    };
  }

  snapshot(): VfsNode {
    return cloneVfs(this.root);
  }

  restore(node: VfsNode, cwd?: string) {
    this.root = cloneVfs(node);
    if (cwd) {
      this.cwd = cwd;
      this.env.PWD = cwd;
    }
  }

  setContext(opts: {
    chapter?: string;
    hosts?: SiteEntry[];
    packets?: PacketFrame[];
    trace?: TraceRow[];
  }) {
    if (opts.chapter) {
      this.chapter = opts.chapter;
      this.env.ABYSS_CHAPTER = opts.chapter;
    }
    if (opts.hosts) {
      this.hosts.clear();
      for (const h of opts.hosts) this.hosts.set(h.host, h);
    }
    if (opts.packets) this.packets = opts.packets;
    if (opts.trace) this.trace = opts.trace;
  }

  exec(line: string): ShellResult {
    this.events = [];
    const trimmed = line.trim();
    if (!trimmed) {
      return { stdout: '', stderr: '', exitCode: 0, cwd: this.cwd, events: [] };
    }
    if (this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
      if (this.history.length > 500) this.history.shift();
    }
    this.events.push(`command.executed:${trimmed}`);

    try {
      if (this.depth > 32) {
        return fail('shell: profundidade máxima de substituição atingida\n', this.cwd, this.events);
      }
      const script = parse(trimmed);
      if ('error' in script) {
        return fail(`shell: ${script.error}\n`, this.cwd, this.events);
      }
      let last: ExecResult = { stdout: '', stderr: '', code: 0 };
      for (const list of script.lists) {
        for (const item of list.items) {
          if (item.op === '&&' && last.code !== 0) continue;
          if (item.op === '||' && last.code === 0) continue;
          last = this.runPipeline(item.pipeline.commands);
          this.lastExit = last.code;
          this.env['?'] = String(last.code);
        }
      }
      return {
        stdout: last.stdout,
        stderr: last.stderr,
        exitCode: last.code,
        cwd: this.cwd,
        events: [...this.events],
      };
    } catch (e) {
      return fail(String(e) + '\n', this.cwd, this.events);
    }
  }

  private runPipeline(commands: SimpleCommand[]): ExecResult {
    if (!commands.length) return { stdout: '', stderr: '', code: 0 };
    let stdin = '';
    let last: ExecResult = { stdout: '', stderr: '', code: 0 };
    for (let i = 0; i < commands.length; i++) {
      const isLast = i === commands.length - 1;
      last = this.runSimple(commands[i], stdin, !isLast);
      stdin = last.stdout;
      if (last.code !== 0 && !isLast) {
        // pipe continua mesmo com falha parcial (comportamento bash padrão)
      }
    }
    return last;
  }

  private runSimple(cmd: SimpleCommand, stdin: string, piping: boolean): ExecResult {
    // redirecionamentos de leitura / heredoc
    let input = stdin;
    for (const r of cmd.redirs) {
      if (r.kind === 'read') {
        const path = this.expandWord(r.word, { split: false })[0] ?? '';
        const p = this.resolve(path);
        const c = readFile(this.root, p);
        if (c == null) return err(`${path}: Arquivo ou diretório inexistente`);
        this.touchRead(p);
        input = c;
      } else if (r.kind === 'heredoc') {
        input = r.expand ? this.expandString(r.text) : r.text;
      }
    }

    const argv = this.expandWords(cmd.words);
    if (!argv.length) {
      // só redirecionamentos (ex.: `> file`)
      return this.applyRedirs({ stdout: '', stderr: '', code: 0 }, cmd.redirs, piping);
    }

    let [name, ...args] = argv;
    // alias
    if (this.aliases[name] && !name.includes('/')) {
      const aliasLine = this.aliases[name];
      const expanded = parse(aliasLine + (args.length ? ' ' + args.map(shellQuote).join(' ') : ''));
      if (!('error' in expanded) && expanded.lists[0]?.items[0]) {
        const first = expanded.lists[0].items[0].pipeline.commands[0];
        return this.runSimple(
          { words: first.words, redirs: [...first.redirs, ...cmd.redirs] },
          input,
          piping,
        );
      }
    }

    // builtins que mutam estado
    const builtin = this.runBuiltin(name, args, input);
    if (builtin) return this.applyRedirs(builtin, cmd.redirs, piping);

    // caminho absoluto/relativo
    if (name.includes('/') || name.startsWith('./') || name.startsWith('../')) {
      const p = this.resolve(name);
      const node = getNode(this.root, p);
      if (!node || node.type !== 'file') {
        return this.applyRedirs(err(`${name}: Arquivo ou diretório inexistente`, 127), cmd.redirs, piping);
      }
      const mode = node.mode ?? '';
      if (!mode.includes('x') && !/\.(sh|js|py|out)$/.test(p)) {
        return this.applyRedirs(err(`permission denied: ${name}`, 126), cmd.redirs, piping);
      }
      if (p.endsWith('.js')) return this.applyRedirs(this.runCommand('node', [p, ...args], input), cmd.redirs, piping);
      if (p.endsWith('.py')) return this.applyRedirs(this.runCommand('python3', [p, ...args], input), cmd.redirs, piping);
      if (p.endsWith('.sh') || (readFile(this.root, p) ?? '').startsWith('#!')) {
        return this.applyRedirs(this.sourceScript(p, args, input), cmd.redirs, piping);
      }
      return this.applyRedirs(err(`permission denied: ${name}`, 126), cmd.redirs, piping);
    }

    if (!COMMANDS.has(name)) {
      return this.applyRedirs(err(`command not found: ${name}`, 127), cmd.redirs, piping);
    }
    return this.applyRedirs(this.runCommand(name, args, input), cmd.redirs, piping);
  }

  private runBuiltin(name: string, args: string[], stdin: string): ExecResult | null {
    switch (name) {
      case 'cd': {
        const target = this.resolve(args[0] ?? this.env.HOME ?? '/home/null');
        const node = getNode(this.root, target);
        if (!node || node.type !== 'dir') {
          return err(`cd: ${args[0] ?? target}: Arquivo ou diretório inexistente`);
        }
        this.cwd = target;
        this.env.PWD = target;
        this.env.OLDPWD = this.env.PWD;
        return { stdout: '', stderr: '', code: 0 };
      }
      case 'export': {
        if (!args.length) {
          return out(
            Object.entries(this.env)
              .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
              .join('\n') + '\n',
          );
        }
        for (const a of args) {
          const eq = a.indexOf('=');
          if (eq < 0) continue;
          this.env[a.slice(0, eq)] = a.slice(eq + 1);
        }
        return { stdout: '', stderr: '', code: 0 };
      }
      case 'readonly':
      case 'local':
      case 'declare': {
        for (const a of args.filter((x) => !x.startsWith('-'))) {
          const eq = a.indexOf('=');
          if (eq > 0) this.env[a.slice(0, eq)] = a.slice(eq + 1);
        }
        return { stdout: '', stderr: '', code: 0 };
      }
      case 'source':
      case '.': {
        const file = args[0];
        if (!file) return err(`${name}: nome de arquivo esperado`);
        return this.sourceScript(this.resolve(file), args.slice(1), stdin);
      }
      case 'eval': {
        const line = args.join(' ');
        const nested = this.exec(line);
        this.events.push(...nested.events.filter((e) => !e.startsWith('command.executed:')));
        return { stdout: nested.stdout, stderr: nested.stderr, code: nested.exitCode };
      }
      case 'exit':
      case 'return': {
        const code = args[0] != null ? Number(args[0]) || 0 : this.lastExit;
        return { stdout: '', stderr: '', code };
      }
      case 'exec': {
        if (!args.length) return { stdout: '', stderr: '', code: 0 };
        return this.runCommand(args[0], args.slice(1), stdin);
      }
      case 'shift': {
        // sem positional params reais — no-op
        return { stdout: '', stderr: '', code: 0 };
      }
      case 'wait':
        return { stdout: '', stderr: '', code: 0 };
      case 'hash':
        return { stdout: '', stderr: '', code: 0 };
      case 'ulimit':
        return out('unlimited\n');
      case 'umask':
        return out('0022\n');
      case 'times':
        return out('0m0.001s 0m0.001s\n0m0.002s 0m0.000s\n');
      case 'builtin': {
        if (!args.length) return { stdout: '', stderr: '', code: 0 };
        return this.runBuiltin(args[0], args.slice(1), stdin) ?? this.runCommand(args[0], args.slice(1), stdin);
      }
      case 'command': {
        const skip = args[0] === '-v' || args[0] === '-V';
        const rest = skip ? args.slice(1) : args;
        if (skip) {
          const n = rest[0];
          if (!n) return err('command: nome esperado');
          if (this.aliases[n]) return out(`alias ${n}='${this.aliases[n]}'\n`);
          if (COMMANDS.has(n) || ['cd', 'export', 'source', '.'].includes(n)) return out(`/bin/${n}\n`);
          return err(`command: ${n}: não encontrado`, 1);
        }
        if (!rest.length) return { stdout: '', stderr: '', code: 0 };
        return this.runCommand(rest[0], rest.slice(1), stdin);
      }
      default:
        return null;
    }
  }

  private sourceScript(path: string, _args: string[], _stdin: string): ExecResult {
    const c = readFile(this.root, path);
    if (c == null) return err(`${path}: Arquivo ou diretório inexistente`);
    this.touchRead(path);
    let body = c;
    if (body.startsWith('#!')) {
      const nl = body.indexOf('\n');
      body = nl >= 0 ? body.slice(nl + 1) : '';
    }
    const nested = this.exec(body);
    this.events.push(...nested.events.filter((e) => !e.startsWith('command.executed:')));
    return { stdout: nested.stdout, stderr: nested.stderr, code: nested.exitCode };
  }

  private runCommand(name: string, args: string[], stdin: string): ExecResult {
    // strip `]` for test/[
    if (name === '[' && args[args.length - 1] === ']') args = args.slice(0, -1);
    const spec = COMMANDS.get(name);
    if (!spec) return err(`command not found: ${name}`, 127);
    try {
      return spec.run({ name, args, stdin, sh: this.api() });
    } catch (e) {
      return err(`${name}: ${(e as Error).message}`, 2);
    }
  }

  private applyRedirs(result: ExecResult, redirs: Redir[], piping: boolean): ExecResult {
    let stdout = result.stdout;
    let stderr = result.stderr;
    let code = result.code;
    let stdoutToStderr = false;
    let stderrToStdout = false;

    for (const r of redirs) {
      if (r.kind === 'dup') {
        if (r.fd === 2 && r.target === 1) stderrToStdout = true;
        if (r.fd === 1 && r.target === 2) stdoutToStderr = true;
      }
    }

    if (stdoutToStderr) {
      stderr += stdout;
      stdout = '';
    }
    if (stderrToStdout) {
      stdout += stderr;
      stderr = '';
    }

    for (const r of redirs) {
      if (r.kind !== 'write') continue;
      const path = this.expandWord(r.word, { split: false })[0] ?? '';
      const p = this.resolve(path);
      const data = r.fd === 2 ? stderr : stdout;
      if (r.append) {
        const prev = readFile(this.root, p) ?? '';
        writeFile(this.root, p, prev + data);
      } else {
        writeFile(this.root, p, data);
      }
      this.events.push(`file.modified:${p}`);
      if (r.fd === 2) stderr = '';
      else if (!piping) stdout = '';
    }

    // se houve redirect de stdout e não estamos em pipe, esvazia stdout
    const wroteStdout = redirs.some((r) => r.kind === 'write' && r.fd === 1);
    if (wroteStdout && !piping) stdout = '';

    return { stdout, stderr, code };
  }

  private expandWords(words: Word[]): string[] {
    const out: string[] = [];
    for (const w of words) {
      out.push(...this.expandWord(w, { split: true }));
    }
    return out;
  }

  private expandWord(word: Word, opts: { split: boolean }): string[] {
    // process substitution e partes
    let joined = '';
    let anyQuoted = false;
    for (const part of word) {
      if (part.quote === 'single') {
        joined += part.text;
        anyQuoted = true;
        continue;
      }
      if (part.quote === 'double') {
        joined += this.expandString(part.text, { keepSpaces: true });
        anyQuoted = true;
        continue;
      }
      joined += this.expandString(part.text, { keepSpaces: false });
    }

    // process substitution <(...) ou >(...)
    const ps = /^(<[()]|>[()])([\s\S]*)\)$/.exec(joined);
    // handled inside expandString via markers

    if (anyQuoted || !opts.split) {
      // brace expand still happens for unquoted? bash does braces before quotes mostly
      // if fully quoted, skip glob
      if (anyQuoted) return [joined];
    }

    // brace expansion
    const braced = expandBraces(joined);
    const results: string[] = [];
    for (const candidate of braced) {
      if (!anyQuoted && hasGlob(candidate)) {
        const matches = this.glob(candidate);
        if (matches.length) results.push(...matches);
        else results.push(candidate); // bash: unmatched glob stays literal
      } else {
        results.push(candidate);
      }
    }
    if (opts.split && !anyQuoted) {
      return results.flatMap((r) => (r === '' ? [] : r.split(/[ \t]+/).filter(Boolean)));
    }
    return results;
  }

  private expandString(input: string, _opts?: { keepSpaces?: boolean }): string {
    let out = '';
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '~' && (i === 0 || /[\s:=]/.test(input[i - 1] ?? ''))) {
        out += this.env.HOME ?? '/home/null';
        continue;
      }
      if (ch === '$') {
        if (input[i + 1] === '{') {
          const end = input.indexOf('}', i + 2);
          if (end < 0) {
            out += ch;
            continue;
          }
          const expr = input.slice(i + 2, end);
          out += this.expandParam(expr);
          i = end;
          continue;
        }
        if (input[i + 1] === '(') {
          // command substitution or arithmetic
          const end = findBalanced(input, i + 1, '(', ')');
          if (end < 0) {
            out += ch;
            continue;
          }
          const inner = input.slice(i + 2, end);
          if (inner.startsWith('(') && inner.endsWith(')')) {
            out += String(evalArithmetic(inner.slice(1, -1), this.env));
          } else {
            out += this.commandSub(inner);
          }
          i = end;
          continue;
        }
        if (input[i + 1] === '?') {
          out += String(this.lastExit);
          i += 1;
          continue;
        }
        if (input[i + 1] === '$') {
          out += String(1000 + (this.procCounter % 9000));
          i += 1;
          continue;
        }
        if (input[i + 1] === '#') {
          out += '0';
          i += 1;
          continue;
        }
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i + 1));
        if (m) {
          out += this.env[m[0]] ?? '';
          i += m[0].length;
          continue;
        }
        out += ch;
        continue;
      }
      // process substitution
      if ((ch === '<' || ch === '>') && input[i + 1] === '(') {
        const end = findBalanced(input, i + 1, '(', ')');
        if (end < 0) {
          out += ch;
          continue;
        }
        const inner = input.slice(i + 2, end);
        const res = this.commandSubRaw(inner);
        const tmp = `/tmp/psub.${(this.procCounter += 1)}.${Date.now().toString(36)}`;
        writeFile(this.root, tmp, res.endsWith('\n') || res === '' ? res : res + '\n');
        out += tmp;
        i = end;
        continue;
      }
      out += ch;
    }
    return out;
  }

  private expandParam(expr: string): string {
    // ${VAR}, ${VAR:-default}, ${VAR:=default}, ${VAR:+alt}, ${#VAR}, ${VAR#pat}, ${VAR%pat}
    if (expr.startsWith('#')) {
      return String((this.env[expr.slice(1)] ?? '').length);
    }
    const m =
      /^([A-Za-z_][A-Za-z0-9_]*)(:-|:=|:\+|:?\?|##|#|%%|%)(.*)$/.exec(expr) ??
      /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(expr);
    if (!m) return this.env[expr] ?? '';
    const name = m[1];
    const op = m[2];
    const rest = m[3] ?? '';
    const val = this.env[name];
    if (!op) return val ?? '';
    if (op === ':-') return val !== undefined && val !== '' ? val : this.expandString(rest);
    if (op === ':=') {
      if (val === undefined || val === '') {
        const v = this.expandString(rest);
        this.env[name] = v;
        return v;
      }
      return val;
    }
    if (op === ':+') return val !== undefined && val !== '' ? this.expandString(rest) : '';
    if (op === ':?' || op === '?') {
      if (val === undefined || val === '') throw new Error(`${name}: ${rest || 'parameter null or not set'}`);
      return val;
    }
    if (op === '#' || op === '##') {
      const re = globToRegExp(rest);
      const s = val ?? '';
      if (op === '#') {
        const mm = new RegExp('^' + re.source.replace(/^\^/, '').replace(/\$$/, '')).exec(s);
        return mm ? s.slice(mm[0].length) : s;
      }
      // greedy
      for (let i = s.length; i >= 0; i--) {
        if (re.test(s.slice(0, i))) return s.slice(i);
      }
      return s;
    }
    if (op === '%' || op === '%%') {
      const re = globToRegExp(rest);
      const s = val ?? '';
      if (op === '%') {
        for (let i = 0; i <= s.length; i++) {
          const tail = s.slice(s.length - i);
          if (re.test(tail)) return s.slice(0, s.length - i);
        }
        return s;
      }
      for (let i = s.length; i >= 0; i--) {
        if (re.test(s.slice(s.length - i))) return s.slice(0, s.length - i);
      }
      return s;
    }
    return val ?? '';
  }

  private commandSub(line: string): string {
    return this.commandSubRaw(line).replace(/\n+$/, '').replace(/\n/g, ' ');
  }

  private commandSubRaw(line: string): string {
    this.depth += 1;
    try {
      const res = this.exec(line);
      this.events.push(...res.events.filter((e) => !e.startsWith('command.executed:')));
      return res.stdout;
    } finally {
      this.depth -= 1;
    }
  }

  resolve(path: string): string {
    if (path.startsWith('~/')) return resolvePath(this.env.HOME ?? '/home/null', path.slice(2));
    if (path === '~') return this.env.HOME ?? '/home/null';
    return resolvePath(this.cwd, path);
  }

  glob(pattern: string): string[] {
    return globPaths(this.root, this.cwd, pattern, globToRegExp);
  }

  touchRead(path: string) {
    this.events.push(`file.opened:${path}`);
    this.events.push(`artifact.opened:${path}`);
  }

  private api(): ShellApi {
    const self = this;
    return {
      get root() {
        return self.root;
      },
      get cwd() {
        return self.cwd;
      },
      get env() {
        return self.env;
      },
      get aliases() {
        return self.aliases;
      },
      get history() {
        return self.history;
      },
      get chapter() {
        return self.chapter;
      },
      get hosts() {
        return self.hosts;
      },
      get packets() {
        return self.packets;
      },
      get trace() {
        return self.trace;
      },
      get lastExit() {
        return self.lastExit;
      },
      procs: () => self.buildProcs(),
      now: () => new Date(),
      rand: (seed) => seedRand(`${self.chapter}:${seed}`),
      resolve: (p) => self.resolve(p),
      node: (p) => getNode(self.root, p),
      read: (p) => readFile(self.root, p),
      bytes: (p) => readBytes(self.root, p),
      write: (p, c) => writeFile(self.root, p, c),
      writeBytes: (p, b) => writeBinary(self.root, p, b),
      append: (p, c) => {
        const prev = readFile(self.root, p) ?? '';
        writeFile(self.root, p, prev + c);
      },
      remove: (p) => removeNode(self.root, p),
      exists: (p) => pathExists(self.root, p),
      list: (p, all) => listDir(self.root, p, { all }),
      mkdirp: (p) => {
        ensureDir(self.root, p);
      },
      glob: (pat) => self.glob(pat),
      runLine: (line, stdin) => {
        if (stdin != null && stdin !== '') {
          // injeta via pipe: echo | cmd — para simplicidade, seta stdin só se o comando ler
          const tmp = `/tmp/stdin.${++self.procCounter}`;
          writeFile(self.root, tmp, stdin);
          const nested = self.exec(`cat ${shellQuote(tmp)} | ${line}`);
          removeNode(self.root, tmp);
          self.events.push(...nested.events.filter((e) => !e.startsWith('command.executed:')));
          return { stdout: nested.stdout, stderr: nested.stderr, code: nested.exitCode };
        }
        const nested = self.exec(line);
        self.events.push(...nested.events.filter((e) => !e.startsWith('command.executed:')));
        return { stdout: nested.stdout, stderr: nested.stderr, code: nested.exitCode };
      },
      emit: (event) => {
        self.events.push(event);
      },
      touchRead: (p) => self.touchRead(p),
      isCommand: (n) => COMMANDS.has(n) || ['cd', 'export', 'source', '.', 'eval'].includes(n),
      commandNames: () => [...COMMANDS.keys()].sort(),
    };
  }

  private buildProcs(): ProcEntry[] {
    const r = seedRand(`procs:${this.chapter}`);
    const base: Omit<ProcEntry, 'pid' | 'cpu' | 'mem' | 'rss' | 'time'>[] = [
      { ppid: 0, user: 'root', stat: 'Ss', start: '00:00', command: '/sbin/init' },
      { ppid: 1, user: 'root', stat: 'S', start: '00:00', command: '/lib/systemd/systemd-journald' },
      { ppid: 1, user: 'root', stat: 'S', start: '00:01', command: 'sshd: /usr/sbin/sshd -D' },
      { ppid: 1, user: 'null', stat: 'Ss', start: '00:02', command: '-abyss-sh' },
      { ppid: 1, user: 'null', stat: 'Sl', start: '00:03', command: 'orpheus-daemon --quarantine' },
      { ppid: 1, user: 'null', stat: 'S', start: '00:04', command: 'kernel-helper [abyss]' },
      { ppid: 1, user: 'null', stat: 'R', start: '00:05', command: 'node /opt/forensics/agent.js' },
    ];
    return base.map((b, i) => ({
      ...b,
      pid: 1 + i * 37,
      cpu: Math.round(r() * 12 * 10) / 10,
      mem: Math.round(r() * 8 * 10) / 10,
      rss: Math.floor(8000 + r() * 120000),
      time: `0:${String(Math.floor(r() * 50)).padStart(2, '0')}`,
    }));
  }
}

function fail(stderr: string, cwd: string, events: string[]): ShellResult {
  return { stdout: '', stderr, exitCode: 1, cwd, events };
}

function shellQuote(s: string): string {
  if (!/[\s'"\\$`|&;<>(){}]/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function findBalanced(src: string, start: number, open: string, close: string): number {
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

function evalArithmetic(expr: string, env: Record<string, string>): number {
  let s = expr.trim();
  s = s.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    const v = env[name];
    return v != null && /^-?\d+(\.\d+)?$/.test(v) ? v : '0';
  });
  if (!/^[\d\s+\-*/%().,]+$/.test(s)) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${s});`)();
    return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
  } catch {
    return 0;
  }
}

// silence unused import when putNode not referenced in some builds
void putNode;
