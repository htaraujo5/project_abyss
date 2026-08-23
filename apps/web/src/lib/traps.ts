/** Armadilhas: browser externo e timeout de capítulo. */

export const BROWSER_TRAP_MS = 30 * 1000;
export const CHAPTER_TRAP_MS = 4 * 60 * 60 * 1000;
export const TRAP_EVENT = 'abyss-trap-update';
/** Flash do sorriso sinistro — disparado na primeira isca do browser. */
export const TRAP_SMILE_EVENT = 'abyss-trap-smile';

export type TrapReason = 'browser' | 'chapter';

type TrapState = {
  /** timestamp em que o timer do browser foi armado */
  browserArmedAt?: number;
  chapterId?: string;
  chapterEnteredAt?: number;
};

function key(saveId: string) {
  return `abyss_traps_${saveId}`;
}

function load(saveId: string): TrapState {
  try {
    const raw = localStorage.getItem(key(saveId));
    if (!raw) return {};
    return JSON.parse(raw) as TrapState;
  } catch {
    return {};
  }
}

function persist(saveId: string, state: TrapState) {
  localStorage.setItem(key(saveId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(TRAP_EVENT, { detail: { saveId } }));
}

export function clearTraps(saveId: string) {
  localStorage.removeItem(key(saveId));
  window.dispatchEvent(new CustomEvent(TRAP_EVENT, { detail: { saveId } }));
}

/** Hosts “reais” que armam o timer de 5 minutos. */
export function isBrowserTrapHost(raw: string): boolean {
  const host = normalizeHost(raw);
  const traps = [
    'google.com',
    'google.com.br',
    'youtube.com',
    'youtu.be',
    'facebook.com',
    'fb.com',
    'instagram.com',
  ];
  return traps.some((t) => host === t || host.endsWith(`.${t}`));
}

export function normalizeHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^\/\//, '')
    .split('/')[0]!
    .split('?')[0]!
    .split('#')[0]!
    .replace(/^www\./, '')
    .replace(/:\d+$/, '');
}

/** Arma o timer uma vez; visitas seguintes não reiniciam.
 *  @returns true se acabou de armar (primeira isca). */
export function armBrowserTrap(saveId: string): boolean {
  const s = load(saveId);
  if (s.browserArmedAt) {
    window.dispatchEvent(new CustomEvent(TRAP_EVENT, { detail: { saveId } }));
    return false;
  }
  s.browserArmedAt = Date.now();
  persist(saveId, s);
  window.dispatchEvent(new CustomEvent(TRAP_SMILE_EVENT, { detail: { saveId } }));
  return true;
}

/** ms restantes do timer do browser; null se não armado ou já consumido/limpo. */
export function getBrowserTrapRemainingMs(saveId: string | null | undefined): number | null {
  if (!saveId) return null;
  const s = load(saveId);
  if (!s.browserArmedAt) return null;
  const left = BROWSER_TRAP_MS - (Date.now() - s.browserArmedAt);
  if (left <= 0) return 0;
  return left;
}

/** Remove timer de browser expirado sem disparar captura (ex.: após wipe). */
export function clearExpiredBrowserTrap(saveId: string) {
  const s = load(saveId);
  if (!s.browserArmedAt) return;
  if (Date.now() - s.browserArmedAt < BROWSER_TRAP_MS) return;
  delete s.browserArmedAt;
  persist(saveId, s);
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function syncChapterClock(
  saveId: string,
  chapterId: string,
  chapterEnteredAtIso?: string,
) {
  const s = load(saveId);
  const entered = chapterEnteredAtIso
    ? Date.parse(chapterEnteredAtIso)
    : s.chapterId === chapterId && s.chapterEnteredAt
      ? s.chapterEnteredAt
      : Date.now();
  if (s.chapterId !== chapterId) {
    s.chapterId = chapterId;
    s.chapterEnteredAt = Number.isFinite(entered) ? entered : Date.now();
    persist(saveId, s);
    return;
  }
  if (!s.chapterEnteredAt) {
    s.chapterId = chapterId;
    s.chapterEnteredAt = Number.isFinite(entered) ? entered : Date.now();
    persist(saveId, s);
  }
}

/** Retorna o motivo se algum timer estourou; senão null. */
export function checkTraps(
  saveId: string,
  chapterId: string,
  chapterEnteredAtIso?: string,
): TrapReason | null {
  syncChapterClock(saveId, chapterId, chapterEnteredAtIso);
  const s = load(saveId);
  const now = Date.now();
  if (s.browserArmedAt && now - s.browserArmedAt >= BROWSER_TRAP_MS) {
    return 'browser';
  }
  const chapterStart =
    s.chapterEnteredAt ?? (chapterEnteredAtIso ? Date.parse(chapterEnteredAtIso) : NaN);
  if (Number.isFinite(chapterStart) && now - chapterStart >= CHAPTER_TRAP_MS) {
    return 'chapter';
  }
  return null;
}
