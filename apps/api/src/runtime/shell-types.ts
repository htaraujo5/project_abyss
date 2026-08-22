import type { VfsNode } from '@abyss/shared';
import type { DirEntry } from './vfs.js';

export type ExecResult = { stdout: string; stderr: string; code: number };

export type SiteEntry = {
  host: string;
  title: string;
  html: string;
  headers?: Record<string, string>;
};

export type PacketFrame = {
  ts: string;
  src: string;
  dst: string;
  proto: string;
  length: number;
  info: string;
  payloadHex?: string;
};

export type TraceRow = {
  ts: string;
  service: string;
  event: string;
  level: string;
  latency: number;
  traceId: string;
  detail: string;
};

export type ProcEntry = {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  rss: number;
  stat: string;
  start: string;
  time: string;
  command: string;
};

/** Superfície do shell exposta às implementações de comando. */
export interface ShellApi {
  root: VfsNode;
  cwd: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  history: string[];
  chapter: string;
  hosts: Map<string, SiteEntry>;
  packets: PacketFrame[];
  trace: TraceRow[];
  lastExit: number;
  /** Sequência determinística de processos do host virtual. */
  procs(): ProcEntry[];
  now(): Date;
  rand(seed: string): () => number;

  resolve(path: string): string;
  node(path: string): VfsNode | null;
  read(path: string): string | null;
  bytes(path: string): Buffer | null;
  write(path: string, content: string): void;
  writeBytes(path: string, data: Buffer): void;
  append(path: string, content: string): void;
  remove(path: string): boolean;
  exists(path: string): boolean;
  list(path: string, all: boolean): DirEntry[];
  mkdirp(path: string): void;
  /** Expande um padrão glob; devolve [] se nada casar. */
  glob(pattern: string): string[];
  /** Executa uma linha completa no mesmo shell (usado por xargs, find -exec, watch). */
  runLine(line: string, stdin?: string): ExecResult;
  /** Registra evento de jogo (consumido pelo engine). */
  emit(event: string): void;
  /** Marca leitura de artefato: dispara evidências no engine. */
  touchRead(path: string): void;
  isCommand(name: string): boolean;
  commandNames(): string[];
}

export type CmdCtx = {
  name: string;
  args: string[];
  stdin: string;
  sh: ShellApi;
};

export type CommandSpec = {
  name: string;
  category:
    | 'navegação'
    | 'arquivos'
    | 'texto'
    | 'dados'
    | 'binário'
    | 'compressão'
    | 'cripto'
    | 'rede'
    | 'sistema'
    | 'processos'
    | 'dev'
    | 'jogo'
    | 'shell';
  synopsis: string;
  summary: string;
  /** Corpo da man page (sem cabeçalho); linhas já formatadas. */
  man?: string[];
  run: (ctx: CmdCtx) => ExecResult;
};

export function out(stdout: string): ExecResult {
  return { stdout, stderr: '', code: 0 };
}
export function err(stderr: string, code = 1): ExecResult {
  return { stdout: '', stderr: stderr.endsWith('\n') ? stderr : stderr + '\n', code };
}
export function okEmpty(): ExecResult {
  return { stdout: '', stderr: '', code: 0 };
}
/** Garante quebra de linha final quando há conteúdo. */
export function lines(list: string[]): ExecResult {
  return out(list.length ? list.join('\n') + '\n' : '');
}

export function usage(name: string, text: string): ExecResult {
  return err(`${name}: uso: ${text}`, 2);
}

/** Separa flags curtas agrupadas (-la → l,a), flags longas e operandos. */
export function parseArgs(
  args: string[],
  opts: { withValue?: string[]; longWithValue?: string[]; stopAtDoubleDash?: boolean } = {},
): {
  flags: Set<string>;
  values: Record<string, string>;
  long: Record<string, string | true>;
  operands: string[];
} {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const long: Record<string, string | true> = {};
  const operands: string[] = [];
  const withValue = new Set(opts.withValue ?? []);
  const longWithValue = new Set(opts.longWithValue ?? []);
  let noMoreFlags = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (noMoreFlags) {
      operands.push(a);
      continue;
    }
    if (a === '--') {
      noMoreFlags = true;
      continue;
    }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) long[key] = a.slice(eq + 1);
      else if (longWithValue.has(key)) {
        long[key] = args[i + 1] ?? '';
        i += 1;
      } else long[key] = true;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      // `-12` → flags 1 e 2 (comm); `head -10` ainda lê o argv cru
      if (/^-\d+$/.test(a)) {
        for (const ch of a.slice(1)) flags.add(ch);
        continue;
      }
      const chars = a.slice(1);
      for (let c = 0; c < chars.length; c++) {
        const ch = chars[c];
        if (withValue.has(ch)) {
          const inline = chars.slice(c + 1);
          if (inline) {
            values[ch] = inline;
          } else {
            values[ch] = args[i + 1] ?? '';
            i += 1;
          }
          flags.add(ch);
          break;
        }
        flags.add(ch);
      }
      continue;
    }
    operands.push(a);
  }
  return { flags, values, long, operands };
}

/** Divide texto em linhas preservando a informação de newline final. */
export function toLines(text: string): string[] {
  if (text === '') return [];
  const hadTrailing = text.endsWith('\n');
  const arr = text.split('\n');
  if (hadTrailing) arr.pop();
  return arr;
}
