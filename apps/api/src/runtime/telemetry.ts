import { CHAPTER_ORDER, type ChapterId } from '@abyss/shared';

/**
 * Telemetria determinística por save+capítulo.
 *
 * Referência: VISUAL_GUIDE §7 (Trace), §13 (ORPHEUS), 24-ui-ux (Packet, Memory).
 * As inconsistências plantadas NÃO são destacadas — o jogador precisa percebê-las.
 */

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SERVICES: Record<ChapterId, string[]> = {
  prologue: ['quarantine', 'forensics', 'kernel', 'vfs'],
  surface: ['quarantine', 'forensics', 'orpheus', 'git-objects', 'mailer'],
  deep: ['orpheus', 'collector-01', 'collector-02', 'indexer', 'mailer'],
  dark: ['relay', 'signal', 'onion-gw', 'orpheus', 'indexer'],
  charter: ['charter-router', 'trainer', 'svc-a', 'svc-b', 'auth', 'ledger'],
  mariana: ['graph', 'fragment', 'svc-a', 'svc-b', 'trainer', 'unknown-caller'],
  abyss: ['ledger', 'density', 'graph', 'fragment', 'shadow'],
  primarch: ['sw-proxy', 'dataset', 'ai-core', 'trainer', 'ledger'],
  observer: ['observer', 'meta', 'ai-core', 'sw-proxy', 'session'],
  epilogue: ['session', 'observer', 'meta'],
};

const EVENTS = [
  'REQUEST',
  'RESPONSE',
  'JOB_STARTED',
  'JOB_DONE',
  'CACHE_MISS',
  'CACHE_HIT',
  'AUTH_OK',
  'AUTH_DENY',
  'RETRY',
  'HEARTBEAT',
  'FLUSH',
  'INDEX_WRITE',
  'EGRESS_DENY',
  'SPAN_CLOSE',
];

export type TraceEvent = {
  id: string;
  ts: string;
  epoch: number;
  service: string;
  event: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  latency: number;
  traceId: string;
  detail: string;
};

export function buildTrace(
  saveId: string,
  chapter: ChapterId,
  narrative: { source: string; lines: string[] }[],
  count = 220,
): TraceEvent[] {
  const services = SERVICES[chapter] ?? SERVICES.surface;
  const r = rng(seedFrom(`${saveId}:${chapter}:trace`));
  const layer = CHAPTER_ORDER.indexOf(chapter);
  const base = Date.UTC(2024, 2, 3, 2, 14, 0) + layer * 86_400_000;
  const out: TraceEvent[] = [];
  let t = base;

  for (let i = 0; i < count; i++) {
    t += Math.floor(r() * 1400) + 60;
    const service = services[Math.floor(r() * services.length)];
    const event = EVENTS[Math.floor(r() * EVENTS.length)];
    let latency = Math.round((r() * 40 + 2) * 10) / 10;
    let level: TraceEvent['level'] = r() > 0.88 ? 'warn' : r() > 0.8 ? 'debug' : 'info';
    let detail = `span=${(r() * 1e6).toFixed(0)} host=${service}.internal`;

    // anomalias plantadas: densidade cresce com a profundidade da camada
    const anomalyChance = 0.015 + layer * 0.008;
    if (r() < anomalyChance) {
      const kind = Math.floor(r() * 4);
      if (kind === 0) {
        latency = -Math.round(r() * 180) / 10;
        detail = `span=${(r() * 1e6).toFixed(0)} response before request`;
      } else if (kind === 1) {
        level = 'error';
        latency = Math.round(r() * 9000) / 10;
        detail = `span=${(r() * 1e6).toFixed(0)} upstream=unknown-caller`;
      } else if (kind === 2) {
        detail = `span=${(r() * 1e6).toFixed(0)} host=acheron.internal via=${service}`;
        level = 'warn';
      } else {
        detail = `span=${(r() * 1e6).toFixed(0)} observer=1 origin=self`;
      }
    }

    out.push({
      id: `t${i}`,
      ts: new Date(t).toISOString().slice(11, 23),
      epoch: t,
      service,
      event,
      level,
      latency,
      traceId: `${(seedFrom(`${saveId}${i}${chapter}`) % 0xffffff).toString(16).padStart(6, '0')}`,
      detail,
    });
  }

  // linhas narrativas do capítulo entram como eventos reais do stream
  let ni = 0;
  for (const set of narrative) {
    for (const line of set.lines) {
      const at = base + Math.floor(r() * (t - base));
      out.push({
        id: `n${ni++}`,
        ts: new Date(at).toISOString().slice(11, 23),
        epoch: at,
        service: set.source,
        event: 'LOG',
        level: /warn|skew|unreachable/i.test(line)
          ? 'warn'
          : /error|deny|fail/i.test(line)
            ? 'error'
            : 'info',
        latency: 0,
        traceId: 'narrative',
        detail: line,
      });
    }
  }

  return out.sort((a, b) => a.epoch - b.epoch);
}

export type PacketFrame = {
  no: number;
  ts: number;
  src: string;
  dst: string;
  proto: string;
  len: number;
  info: string;
  payload: string;
};

export function buildPackets(saveId: string, chapter: ChapterId, count = 90): PacketFrame[] {
  const r = rng(seedFrom(`${saveId}:${chapter}:pcap`));
  const hosts = [
    '10.0.0.14',
    '10.0.0.1',
    '172.16.4.9',
    '172.16.4.31',
    '203.0.113.7',
    '198.51.100.22',
  ];
  const protos = ['TCP', 'TLS', 'DNS', 'HTTP', 'WS', 'ICMP'];
  const notes = [
    'GET /status HTTP/1.1',
    'Client Hello (SNI=acheron.internal)',
    'Standard query A orpheus.internal',
    'Application Data',
    'WebSocket frame (masked)',
    'Echo request',
    'GET /collectors HTTP/1.1',
    'Application Data [retransmission]',
  ];
  const out: PacketFrame[] = [];
  let ts = 0;
  for (let i = 1; i <= count; i++) {
    ts += Math.round(r() * 4200) / 100;
    const src = hosts[Math.floor(r() * hosts.length)];
    let dst = hosts[Math.floor(r() * hosts.length)];
    if (dst === src) dst = hosts[(hosts.indexOf(src) + 1) % hosts.length];
    const proto = protos[Math.floor(r() * protos.length)];
    const info = notes[Math.floor(r() * notes.length)];
    const len = 54 + Math.floor(r() * 1200);
    const words: string[] = [];
    const text = `${proto} ${info} seq=${i} host=${dst}`;
    for (let b = 0; b < 96; b++) {
      words.push(
        b < text.length
          ? text.charCodeAt(b).toString(16).padStart(2, '0')
          : Math.floor(r() * 256)
              .toString(16)
              .padStart(2, '0'),
      );
    }
    out.push({ no: i, ts: Math.round(ts * 100) / 100, src, dst, proto, len, info, payload: words.join('') });
  }
  return out;
}

export type MemoryRegion = {
  addr: string;
  size: number;
  perms: string;
  label: string;
  dump: string;
};

export function buildMemory(saveId: string, chapter: ChapterId): MemoryRegion[] {
  const r = rng(seedFrom(`${saveId}:${chapter}:mem`));
  const labels = [
    ['[stack]', 'rw-'],
    ['[heap]', 'rw-'],
    ['libabyss.so', 'r-x'],
    ['orpheus.bin', 'r-x'],
    ['[anon]', 'rw-'],
    ['[vfs-cache]', 'r--'],
    ['[fragment]', 'rw-'],
  ];
  const strings = [
    'null@abyss',
    'acheron.internal',
    'orpheus/collector',
    'CHARTER',
    'mariana',
    'observer',
    'session-token',
    'quarantine',
  ];
  return labels.map(([label, perms], i) => {
    const addr = `0x${(0x7ffd0000 + i * 0x4000 + Math.floor(r() * 0x1000)).toString(16)}`;
    const size = (1 + Math.floor(r() * 24)) * 4096;
    const rows: string[] = [];
    for (let row = 0; row < 24; row++) {
      const bytes: number[] = [];
      const inject = r() < 0.28 ? strings[Math.floor(r() * strings.length)] : null;
      for (let b = 0; b < 16; b++) {
        bytes.push(inject && b < inject.length ? inject.charCodeAt(b) : Math.floor(r() * 256));
      }
      const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
      const asc = bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
      rows.push(
        `${(parseInt(addr, 16) + row * 16).toString(16).padStart(12, '0')}  ${hex}  ${asc}`,
      );
    }
    return { addr, size, perms, label, dump: rows.join('\n') };
  });
}

export type OrpheusState = {
  collectors: { id: string; state: 'ACTIVE' | 'IDLE' | 'FAILED'; queued: number; rate: number }[];
  signals: { id: string; score: number; label: string; drift: number }[];
  series: number[];
  uptime: string;
  lastSync: string;
  integrity: number;
};

export function buildOrpheus(saveId: string, chapter: ChapterId): OrpheusState {
  const r = rng(seedFrom(`${saveId}:${chapter}:orpheus`));
  const layer = CHAPTER_ORDER.indexOf(chapter);
  const collectors = Array.from({ length: 6 + Math.min(6, layer) }, (_, i) => {
    const roll = r();
    return {
      id: `C-${String(i + 1).padStart(2, '0')}`,
      state: (roll > 0.82 ? 'FAILED' : roll > 0.62 ? 'IDLE' : 'ACTIVE') as
        | 'ACTIVE'
        | 'IDLE'
        | 'FAILED',
      queued: Math.floor(r() * 4200),
      rate: Math.round(r() * 900) / 10,
    };
  });
  const labels = [
    'periodic burst',
    'shared vocabulary',
    'cross-service echo',
    'null-window',
    'missing ids',
    'latency mirror',
    'unowned caller',
    'self reference',
  ];
  const signals = Array.from({ length: 5 + Math.min(6, layer) }, (_, i) => ({
    id: `AA-${String(i + 1).padStart(2, '0')}`,
    score: Math.round(r() * 10000) / 100,
    label: labels[i % labels.length],
    drift: Math.round((r() - 0.4) * 2000) / 100,
  }));
  const series = Array.from({ length: 40 }, () => Math.round(r() * 100));
  return {
    collectors,
    signals,
    series,
    uptime: `${140 + layer * 37}d ${Math.floor(r() * 24)}h`,
    lastSync: `${Math.floor(r() * 59)}m atrás`,
    integrity: Math.round((88 + r() * 11.9) * 10) / 10,
  };
}
