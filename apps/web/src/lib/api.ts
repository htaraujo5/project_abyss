import type { AppId, ChapterId, EndingId, SaveGame } from '@abyss/shared';

const API = '';

export type Session = {
  playerId: string;
  displayName: string;
  token: string;
};

function authHeaders(token?: string): HeadersInit {
  const t = token ?? localStorage.getItem('abyss_token') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

export async function createGuest(displayName?: string): Promise<Session> {
  const res = await fetch(`${API}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  const data = (await res.json()) as Session;
  localStorage.setItem('abyss_token', data.token);
  localStorage.setItem('abyss_session', JSON.stringify(data));
  return data;
}

async function auth(path: 'login' | 'register', body: unknown): Promise<Session> {
  const res = await fetch(`${API}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Session & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'falha na autenticação');
  localStorage.setItem('abyss_token', data.token);
  localStorage.setItem('abyss_session', JSON.stringify(data));
  return data;
}

export function loginAccount(username: string, password: string) {
  return auth('login', { username, password });
}

export function registerAccount(payload: {
  fullName: string;
  email: string;
  username: string;
  password: string;
}) {
  return auth('register', payload);
}

export function clearLocalSession() {
  localStorage.removeItem('abyss_token');
  localStorage.removeItem('abyss_session');
}

export function loadLocalSession(): Session | null {
  const raw = localStorage.getItem('abyss_session');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function createSave(name?: string) {
  const res = await fetch(`${API}/api/saves`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: name ?? 'Investigação 1' }),
  });
  if (!res.ok) throw new Error('Falha ao criar save');
  return (await res.json()) as { save: SaveGame };
}

export async function getSave(id: string) {
  const res = await fetch(`${API}/api/saves/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Save não encontrado');
  return (await res.json()) as { save: SaveGame };
}

export async function listSaves() {
  const res = await fetch(`${API}/api/saves`, { headers: authHeaders() });
  if (!res.ok) return { saves: [] as SaveGame[] };
  return (await res.json()) as { saves: SaveGame[] };
}

export async function execCommand(saveId: string, command: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/exec`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ command }),
  });
  if (!res.ok) throw new Error('exec failed');
  return res.json() as Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    cwd: string;
    events?: string[];
    completedPuzzles: string[];
    unlockedEvidence: string[];
    newFlags: string[];
    narrative: string[];
    ending?: EndingId;
    save: SaveGame;
  }>;
}

export type DirEntry = {
  name: string;
  type: 'file' | 'dir';
  hidden?: boolean;
  size: number;
  items?: number;
};

export type FsResult =
  | { type: 'dir'; path: string; entries: DirEntry[] }
  | {
      type: 'file';
      path: string;
      content: string | null;
      size: number;
      hidden: boolean;
      ending?: EndingId;
      completedPuzzles?: string[];
      unlockedEvidence?: string[];
      newFlags?: string[];
      narrative?: string[];
      save?: SaveGame;
    }
  | { error: string };

export async function listFs(
  saveId: string,
  path: string,
  mode: 'gui' | 'shell' = 'gui',
): Promise<FsResult> {
  const res = await fetch(
    `${API}/api/saves/${saveId}/fs?path=${encodeURIComponent(path)}&mode=${mode}`,
    { headers: authHeaders() },
  );
  const data = (await res.json()) as FsResult;
  if ('type' in data && data.type === 'file' && data.save) {
    const { applyProgressDelta } = await import('./exec');
    applyProgressDelta(
      {
        save: data.save,
        ending: data.ending,
        completedPuzzles: data.completedPuzzles,
        unlockedEvidence: data.unlockedEvidence,
        newFlags: data.newFlags,
        narrative: data.narrative,
      },
      { source: 'fs' },
    );
  }
  return data;
}

export async function readFileText(saveId: string, path: string): Promise<string | null> {
  const r = await listFs(saveId, path, 'shell');
  if ('type' in r && r.type === 'file') return r.content;
  return null;
}

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

export type MemoryRegion = {
  addr: string;
  size: number;
  perms: string;
  label: string;
  dump: string;
};

export type OrpheusState = {
  collectors: { id: string; state: 'ACTIVE' | 'IDLE' | 'FAILED'; queued: number; rate: number }[];
  signals: { id: string; score: number; label: string; drift: number }[];
  series: number[];
  uptime: string;
  lastSync: string;
  integrity: number;
};

export async function getTelemetry(saveId: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/telemetry`, { headers: authHeaders() });
  if (!res.ok) throw new Error('telemetry unavailable');
  return res.json() as Promise<{
    chapter: ChapterId;
    trace: TraceEvent[];
    packets: PacketFrame[];
    memory: MemoryRegion[];
    orpheus: OrpheusState;
  }>;
}

export async function searchAll(saveId: string, q: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return { files: [], evidence: [], puzzles: [] };
  return res.json() as Promise<{
    files: { path: string; line?: number; excerpt?: string }[];
    evidence: { id: string; title: string; kind: string }[];
    puzzles: { id: string; title: string; status: string }[];
  }>;
}

export async function saveUiState(saveId: string, ui: Record<string, unknown>) {
  await fetch(`${API}/api/saves/${saveId}/ui`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ ui }),
  });
}

export async function getPuzzlesMeta() {
  const res = await fetch(`${API}/api/meta/puzzles`);
  return res.json() as Promise<{
    puzzles: {
      id: string;
      chapter: string;
      title: string;
      brief: string;
      category?: string;
      difficulty?: number;
      hints?: { tier: string; text: string }[];
      rewards?: { evidence?: string[]; apps?: string[]; flags?: string[] };
    }[];
  }>;
}

export async function getChaptersMeta() {
  const res = await fetch(`${API}/api/meta/chapters`);
  return res.json() as Promise<{
    order: ChapterId[];
    meta: Record<string, { title: string; layer: string; question: string }>;
  }>;
}

export async function getChapterInfo(saveId: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/chapter`, {
    headers: authHeaders(),
  });
  return res.json() as Promise<{
    id: ChapterId;
    title: string;
    intro: string;
    musicTrack?: string;
    websites: { host: string; title: string; html: string; headers?: Record<string, string> }[];
    logs: { id: string; source: string; lines: string[] }[];
    puzzles: { id: string; title: string; status: string }[];
  }>;
}

export async function getHint(saveId: string, puzzleId: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/hint`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ puzzleId }),
  });
  return res.json();
}

export async function addLink(saveId: string, from: string, to: string, label?: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/links`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ from, to, label }),
  });
  return res.json();
}

export async function removeLink(saveId: string, linkId: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/links/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.json() as Promise<{ save: SaveGame }>;
}

export async function patchEvidence(
  saveId: string,
  evidenceId: string,
  body: { notes?: string; state?: string },
) {
  const res = await fetch(`${API}/api/saves/${saveId}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('falha ao atualizar evidência');
  return res.json() as Promise<{ save: SaveGame }>;
}

export async function browse(saveId: string, host: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/browse/${encodeURIComponent(host)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('site not found');
  return res.json() as Promise<{
    host: string;
    title: string;
    html: string;
    headers?: Record<string, string>;
  }>;
}

export async function getLogs(saveId: string) {
  const res = await fetch(`${API}/api/saves/${saveId}/logs`, { headers: authHeaders() });
  return res.json() as Promise<{ logs: { id: string; source: string; lines: string[] }[] }>;
}

export async function chooseEnding(saveId: string, ending: EndingId) {
  const res = await fetch(`${API}/api/saves/${saveId}/ending`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ending }),
  });
  return res.json();
}

export async function getEvidenceMeta() {
  const res = await fetch(`${API}/api/meta/evidence`);
  return res.json() as Promise<{
    evidence: {
      id: string;
      kind: string;
      title: string;
      summary: string;
      chapter: string;
      body?: string;
    }[];
  }>;
}

export type { AppId, SaveGame };
