import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import {
  CONTENT_VERSION,
  DEFAULT_UNLOCKED_APPS,
  type SaveGame,
  type GuestSession,
} from '@abyss/shared';
import { getChapter } from '@abyss/content';
import { cloneVfs, writeFile as vfsWrite, readFile as vfsRead } from './runtime/vfs.js';
import { VfsShell } from './runtime/shell.js';
import { applyEventsToSave, mergeChapterIntoVfs, evaluateAll } from './runtime/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const SAVES_DIR = path.join(DATA_DIR, 'saves');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const shells = new Map<string, VfsShell>();
const sessions = new Map<string, GuestSession>();

async function ensureDirs() {
  await mkdir(SAVES_DIR, { recursive: true });
  try {
    const raw = await readFile(SESSIONS_FILE, 'utf8');
    const list = JSON.parse(raw) as GuestSession[];
    for (const s of list) sessions.set(s.token, s);
  } catch {
    await writeFile(SESSIONS_FILE, '[]');
  }
}

async function persistSessions() {
  await writeFile(SESSIONS_FILE, JSON.stringify([...sessions.values()], null, 2));
}

function savePath(id: string) {
  return path.join(SAVES_DIR, `${id}.json`);
}

export async function initStore() {
  await ensureDirs();
}

export async function createGuest(displayName?: string): Promise<GuestSession> {
  const session: GuestSession = {
    playerId: nanoid(12),
    displayName: displayName?.trim() || `Investigator-${nanoid(4)}`,
    token: nanoid(24),
  };
  sessions.set(session.token, session);
  await persistSessions();
  return session;
}

export async function putSession(session: GuestSession): Promise<GuestSession> {
  sessions.set(session.token, session);
  await persistSessions();
  return session;
}

export function getSession(token: string | undefined): GuestSession | null {
  if (!token) return null;
  return sessions.get(token) ?? null;
}

export async function createSave(
  playerId: string,
  name = 'Slot 1',
  slot = 1,
): Promise<SaveGame> {
  const now = new Date().toISOString();
  const prologue = getChapter('prologue');
  const save: SaveGame = {
    id: nanoid(16),
    playerId,
    slot,
    name,
    contentVersion: CONTENT_VERSION,
    currentChapter: 'prologue',
    flags: { 'chapter.prologue': true },
    puzzles: {},
    evidence: {},
    links: [],
    unlockedApps: [...DEFAULT_UNLOCKED_APPS],
    cwd: '/home/null',
    vfsSnapshot: cloneVfs(prologue.vfsSeed),
    narrativeLog: ['quarantine: session opened'],
    chapterEnteredAt: now,
    createdAt: now,
    updatedAt: now,
  };
  evaluateAll(save, save.vfsSnapshot!);
  await writeSave(save);
  const shell = new VfsShell(save.vfsSnapshot!, save.cwd);
  shells.set(save.id, shell);
  return save;
}

export async function writeSave(save: SaveGame) {
  save.updatedAt = new Date().toISOString();
  await writeFile(savePath(save.id), JSON.stringify(save, null, 2));
}

export async function loadSave(id: string): Promise<SaveGame | null> {
  try {
    const raw = await readFile(savePath(id), 'utf8');
    const save = JSON.parse(raw) as SaveGame;
    if (!shells.has(id) && save.vfsSnapshot) {
      shells.set(id, new VfsShell(save.vfsSnapshot, save.cwd));
    }
    return save;
  } catch {
    return null;
  }
}

export async function listSaves(playerId: string): Promise<SaveGame[]> {
  const files = await readdir(SAVES_DIR);
  const out: SaveGame[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const save = await loadSave(f.replace(/\.json$/, ''));
    if (save && save.playerId === playerId) out.push(save);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getShell(saveId: string): VfsShell | null {
  return shells.get(saveId) ?? null;
}

export async function execCommand(saveId: string, command: string) {
  const save = await loadSave(saveId);
  if (!save) throw new Error('Save não encontrado');
  let shell = shells.get(saveId);
  if (!shell) {
    shell = new VfsShell(save.vfsSnapshot!, save.cwd);
    shells.set(saveId, shell);
  }

  // contexto de capítulo para curl/dmesg/investigate
  try {
    const ch = getChapter(save.currentChapter);
    shell.setContext({
      chapter: save.currentChapter,
      hosts: ch.websites.map((w) => ({
        host: w.host,
        title: w.title,
        html: w.html,
        headers: w.headers,
      })),
    });
  } catch {
    shell.setContext({ chapter: save.currentChapter });
  }

  const result = shell.exec(command);

  if (
    result.exitCode === 0 &&
    (command.includes('orpheus/src/main.js') || /node\s+.*main\.js/.test(command))
  ) {
    result.events.push('file.opened:/home/null/projects/orpheus/src/main.js');
    save.flags['ran.orpheus.main'] = true;
  }

  const prevChapter = save.currentChapter;
  const delta = applyEventsToSave(save, result.events, shell.snapshot());
  await finalizeSaveAfterDelta(save, shell, prevChapter, delta);

  return {
    ...result,
    completedPuzzles: delta.completedPuzzles,
    unlockedEvidence: delta.unlockedEvidence,
    newFlags: delta.newFlags,
    narrative: delta.narrative,
    ending: delta.ending,
    save,
  };
}

/** Aplica file.opened ao abrir um arquivo pela UI (Files/Code) — dispara finais por caminho. */
export async function observePath(saveId: string, filePath: string) {
  const save = await loadSave(saveId);
  if (!save) throw new Error('Save não encontrado');
  let shell = shells.get(saveId);
  if (!shell) {
    shell = new VfsShell(save.vfsSnapshot!, save.cwd);
    shells.set(saveId, shell);
  }
  const prevChapter = save.currentChapter;
  const delta = applyEventsToSave(
    save,
    [`file.opened:${filePath}`, `artifact.opened:${filePath}`],
    shell.snapshot(),
  );
  await finalizeSaveAfterDelta(save, shell, prevChapter, delta);
  return {
    completedPuzzles: delta.completedPuzzles,
    unlockedEvidence: delta.unlockedEvidence,
    newFlags: delta.newFlags,
    narrative: delta.narrative,
    ending: delta.ending,
    save,
  };
}

async function finalizeSaveAfterDelta(
  save: SaveGame,
  shell: VfsShell,
  prevChapter: string,
  delta: ReturnType<typeof applyEventsToSave>,
) {
  if (save.currentChapter !== prevChapter) {
    save.chapterEnteredAt = new Date().toISOString();
    const merged = mergeChapterIntoVfs(shell.snapshot(), save.currentChapter);
    shell.restore(merged, shell.cwd);
    if (save.currentChapter === 'observer' || save.flags['chapter.observer']) {
      const hist = '/home/null/projects/observer/player_history.log';
      const existing = vfsRead(shell.snapshot(), hist) ?? '';
      const flags = Object.entries(save.flags)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ');
      vfsWrite(
        shell.root,
        hist,
        existing + `\n[${new Date().toISOString()}] flags: ${flags}\n`,
      );
    }
  }

  save.cwd = shell.cwd;
  save.vfsSnapshot = shell.snapshot();

  const delta2 = evaluateAll(save, save.vfsSnapshot);
  mergeDelta(delta, delta2);

  await writeSave(save);
}

/** Força o final capture (armadilhas de browser / timeout de capítulo). */
export async function forceTrapCapture(saveId: string, reason: string) {
  const save = await loadSave(saveId);
  if (!save) throw new Error('Save não encontrado');
  if (save.ending) {
    return {
      completedPuzzles: [] as string[],
      unlockedEvidence: [] as string[],
      newFlags: [] as string[],
      narrative: [] as string[],
      ending: undefined,
      save,
    };
  }
  let shell = shells.get(saveId);
  if (!shell) {
    shell = new VfsShell(save.vfsSnapshot!, save.cwd);
    shells.set(saveId, shell);
  }
  const prevChapter = save.currentChapter;
  const delta = applyEventsToSave(save, [`ending.force:capture`], shell.snapshot());
  delta.narrative.push(`trap:${reason}`);
  await finalizeSaveAfterDelta(save, shell, prevChapter, delta);
  return {
    completedPuzzles: delta.completedPuzzles,
    unlockedEvidence: delta.unlockedEvidence,
    newFlags: delta.newFlags,
    narrative: delta.narrative,
    ending: delta.ending,
    save,
  };
}

/** Zera o progresso mantendo o mesmo save id/nome (pós-captura). */
export async function resetSaveProgress(saveId: string) {
  const save = await loadSave(saveId);
  if (!save) throw new Error('Save não encontrado');
  const now = new Date().toISOString();
  const prologue = getChapter('prologue');
  save.currentChapter = 'prologue';
  save.flags = { 'chapter.prologue': true };
  save.puzzles = {};
  save.evidence = {};
  save.links = [];
  save.unlockedApps = [...DEFAULT_UNLOCKED_APPS];
  save.cwd = '/home/null';
  save.vfsSnapshot = cloneVfs(prologue.vfsSeed);
  save.ending = undefined;
  save.narrativeLog = ['quarantine: session reopened after capture'];
  save.chapterEnteredAt = now;
  evaluateAll(save, save.vfsSnapshot!);
  await writeSave(save);
  const shell = new VfsShell(save.vfsSnapshot!, save.cwd);
  shells.set(save.id, shell);
  return save;
}

function mergeDelta(
  a: ReturnType<typeof applyEventsToSave>,
  b: ReturnType<typeof applyEventsToSave>,
) {
  a.completedPuzzles.push(
    ...b.completedPuzzles.filter((x) => !a.completedPuzzles.includes(x)),
  );
  a.unlockedEvidence.push(
    ...b.unlockedEvidence.filter((x) => !a.unlockedEvidence.includes(x)),
  );
  a.newFlags.push(...b.newFlags.filter((x) => !a.newFlags.includes(x)));
  a.narrative.push(...b.narrative);
  if (b.ending) a.ending = b.ending;
}

export async function updateSavePartial(
  id: string,
  patch: Partial<SaveGame>,
): Promise<SaveGame> {
  const save = await loadSave(id);
  if (!save) throw new Error('Save não encontrado');
  Object.assign(save, patch, { id: save.id, playerId: save.playerId });
  await writeSave(save);
  return save;
}
