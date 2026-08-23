import {
  CHAPTER_META,
  CHAPTER_ORDER,
  type ChapterId,
  type EndingId,
  type SaveGame,
} from '@abyss/shared';
import type { EvidenceMeta, PuzzleMeta } from '../state/meta';

export type ProgressStats = {
  puzzleDone: number;
  puzzleTotal: number;
  puzzlePct: number;
  evidenceHave: number;
  evidenceTotal: number;
  evidencePct: number;
  flags: number;
  apps: number;
  hintsUsed: number;
  chaptersCleared: number;
  chapterTotal: number;
  currentChapter: ChapterId | null;
  currentTitle: string;
  ending?: EndingId;
  platinum: boolean;
  platinumMissing: string[];
};

export type Achievement = {
  id: string;
  title: string;
  detail: string;
  /** Descrição quando ainda bloqueada */
  lockedHint: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
};

export type AchievementState = Achievement & { unlocked: boolean; unlockedAt?: string };

const ENDING_LABEL: Record<EndingId, string> = {
  disconnect: 'Desconexão',
  observer: 'Observer',
  merge: 'Convergência',
  null: 'User Not Found',
  capture: 'Captura',
};

function pct(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export function computeProgress(
  save: SaveGame | null | undefined,
  puzzles: PuzzleMeta[],
  evidence: EvidenceMeta[],
): ProgressStats {
  const byChapter: Record<string, { total: number; done: number }> = {};
  for (const id of CHAPTER_ORDER) byChapter[id] = { total: 0, done: 0 };

  for (const p of puzzles) {
    const ch = p.chapter || 'prologue';
    byChapter[ch] ??= { total: 0, done: 0 };
    byChapter[ch].total += 1;
    if (save?.puzzles[p.id]?.status === 'completed') byChapter[ch].done += 1;
  }

  if (puzzles.length === 0 && save?.puzzles) {
    const vals = Object.values(save.puzzles);
    byChapter.prologue = {
      total: vals.length,
      done: vals.filter((p) => p.status === 'completed').length,
    };
  }

  const puzzleTotal = Object.values(byChapter).reduce((a, r) => a + r.total, 0);
  const puzzleDone = Object.values(byChapter).reduce((a, r) => a + r.done, 0);
  const chaptersWithContent = CHAPTER_ORDER.filter((id) => (byChapter[id]?.total ?? 0) > 0);
  const chaptersCleared = chaptersWithContent.filter((id) => {
    const r = byChapter[id];
    return r && r.total > 0 && r.done >= r.total;
  }).length;

  const evidenceTotal = evidence.length || Object.keys(save?.evidence ?? {}).length;
  const evidenceHave = Object.keys(save?.evidence ?? {}).length;
  const flags = Object.keys(save?.flags ?? {}).filter((f) => f.startsWith('flag.')).length;
  const apps = save?.unlockedApps?.length ?? 0;
  const hintsUsed = Object.values(save?.puzzles ?? {}).reduce((a, p) => a + (p.hintsUsed ?? 0), 0);

  const platinumMissing: string[] = [];
  if (puzzleTotal === 0 || puzzleDone < puzzleTotal) {
    platinumMissing.push(`investigações (${puzzleDone}/${puzzleTotal || '—'})`);
  }
  if (evidenceTotal > 0 && evidenceHave < evidenceTotal) {
    platinumMissing.push(`artefatos (${evidenceHave}/${evidenceTotal})`);
  }
  if (!save?.ending || save.ending === 'capture') {
    platinumMissing.push(save?.ending === 'capture' ? 'desfecho sem captura' : 'desfecho deliberado');
  }
  if (chaptersCleared < Math.max(1, chaptersWithContent.length - 1)) {
    platinumMissing.push(`camadas limpas (${chaptersCleared}/${chaptersWithContent.length})`);
  }

  const platinum = platinumMissing.length === 0 && puzzleTotal > 0;

  const ch = save?.currentChapter ?? null;
  return {
    puzzleDone,
    puzzleTotal,
    puzzlePct: pct(puzzleDone, puzzleTotal),
    evidenceHave,
    evidenceTotal,
    evidencePct: pct(evidenceHave, evidenceTotal),
    flags,
    apps,
    hintsUsed,
    chaptersCleared,
    chapterTotal: chaptersWithContent.length,
    currentChapter: ch,
    currentTitle: ch ? CHAPTER_META[ch]?.title ?? ch : '—',
    ending: save?.ending,
    platinum,
    platinumMissing,
  };
}

export function endingLabel(id?: EndingId) {
  if (!id) return 'ainda aberto';
  return ENDING_LABEL[id] ?? id;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_case',
    title: 'Primeiro laudo',
    detail: 'Resolveu a primeira investigação.',
    lockedHint: 'Complete qualquer puzzle.',
    tier: 'bronze',
  },
  {
    id: 'ten_deep',
    title: 'Dez de profundidade',
    detail: 'Dez investigações encerradas.',
    lockedHint: 'Complete 10 puzzles.',
    tier: 'bronze',
  },
  {
    id: 'half_signal',
    title: 'Meio Signal',
    detail: 'Metade da campanha resolvida.',
    lockedHint: 'Alcance 50% dos puzzles.',
    tier: 'silver',
  },
  {
    id: 'full_campaign',
    title: 'Campanha completa',
    detail: 'Todas as investigações do catálogo.',
    lockedHint: 'Complete 100% dos puzzles.',
    tier: 'gold',
  },
  {
    id: 'archivist',
    title: 'Arquivista',
    detail: 'Dez artefatos no vault.',
    lockedHint: 'Colete 10 evidências.',
    tier: 'bronze',
  },
  {
    id: 'full_vault',
    title: 'Vault saturado',
    detail: 'Todos os artefatos catalogados.',
    lockedHint: 'Colete 100% das evidências.',
    tier: 'gold',
  },
  {
    id: 'layer_clear',
    title: 'Camada limpa',
    detail: 'Zerou todas as investigações de uma camada.',
    lockedHint: 'Complete 100% de um capítulo.',
    tier: 'silver',
  },
  {
    id: 'toolkit',
    title: 'Ferramental aberto',
    detail: 'Oito ou mais apps liberados.',
    lockedHint: 'Desbloqueie 8 apps.',
    tier: 'silver',
  },
  {
    id: 'clean_ops',
    title: 'Operação limpa',
    detail: 'Cinco puzzles sem consultar dicas.',
    lockedHint: 'Complete 5 puzzles com 0 dicas usadas.',
    tier: 'silver',
  },
  {
    id: 'ending_disconnect',
    title: 'Desconexão',
    detail: 'Desfecho: cortou as rotas conhecidas.',
    lockedHint: 'Alcance o final Desconexão.',
    tier: 'gold',
  },
  {
    id: 'ending_observer',
    title: 'Sucessão',
    detail: 'Desfecho: herdou o posto de Observer.',
    lockedHint: 'Alcance o final Observer.',
    tier: 'gold',
  },
  {
    id: 'ending_merge',
    title: 'Convergência',
    detail: 'Desfecho: autorizou fusão com Mariana.',
    lockedHint: 'Alcance o final Convergência.',
    tier: 'gold',
  },
  {
    id: 'ending_null',
    title: 'User Not Found',
    detail: 'Desfecho: apagou o próprio rastro.',
    lockedHint: 'Alcance o final User Not Found.',
    tier: 'gold',
  },
  {
    id: 'ending_capture',
    title: 'Pacote capturado',
    detail: 'Desfecho: a rede fechou o laço sobre você.',
    lockedHint: 'Seja capturado pelo Signal.',
    tier: 'bronze',
  },
  {
    id: 'platinum',
    title: 'Platina ABYSS',
    detail: 'Campanha, vault e desfecho deliberado — platina.',
    lockedHint: '100% puzzles, 100% artefatos, camadas limpas e final sem captura.',
    tier: 'platinum',
  },
];

export function evaluateAchievements(stats: ProgressStats, save: SaveGame | null | undefined): AchievementState[] {
  const completed = Object.values(save?.puzzles ?? {}).filter((p) => p.status === 'completed');
  const cleanOps = completed.filter((p) => (p.hintsUsed ?? 0) === 0).length;
  const ending = save?.ending;

  const unlocked = (id: string) => {
    switch (id) {
      case 'first_case':
        return stats.puzzleDone >= 1;
      case 'ten_deep':
        return stats.puzzleDone >= 10;
      case 'half_signal':
        return stats.puzzlePct >= 50;
      case 'full_campaign':
        return stats.puzzleTotal > 0 && stats.puzzleDone >= stats.puzzleTotal;
      case 'archivist':
        return stats.evidenceHave >= 10;
      case 'full_vault':
        return stats.evidenceTotal > 0 && stats.evidenceHave >= stats.evidenceTotal;
      case 'layer_clear':
        return stats.chaptersCleared >= 1;
      case 'toolkit':
        return stats.apps >= 8;
      case 'clean_ops':
        return cleanOps >= 5;
      case 'ending_disconnect':
        return ending === 'disconnect';
      case 'ending_observer':
        return ending === 'observer';
      case 'ending_merge':
        return ending === 'merge';
      case 'ending_null':
        return ending === 'null';
      case 'ending_capture':
        return ending === 'capture';
      case 'platinum':
        return stats.platinum;
      default:
        return false;
    }
  };

  return ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: unlocked(a.id),
    unlockedAt: unlocked(a.id) ? save?.updatedAt : undefined,
  }));
}

/* ----------------------------- avatar ----------------------------------- */

const AVATAR_PALETTES = [
  ['#0e3d42', '#6ec8c4'],
  ['#1a2433', '#7aa2d4'],
  ['#2a1f14', '#d0a45a'],
  ['#1c1428', '#a78bdb'],
  ['#142018', '#6fbf8a'],
  ['#2a1218', '#e07070'],
  ['#121820', '#8b9aab'],
  ['#1e1a10', '#c4b48a'],
] as const;

export type AvatarStyle = {
  seed: number;
  initials: string;
  bg: string;
  fg: string;
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const one = parts[0] ?? '?';
  return one.slice(0, 2).toUpperCase();
}

export function avatarFromIdentity(displayName: string, playerId: string, seedOffset = 0): AvatarStyle {
  const h = hashStr(`${playerId}:${displayName}`) + seedOffset * 97;
  const pal = AVATAR_PALETTES[h % AVATAR_PALETTES.length];
  return {
    seed: h,
    initials: initialsFromName(displayName),
    bg: pal[0],
    fg: pal[1],
  };
}

const AVATAR_KEY = (playerId: string) => `abyss_avatar_seed:${playerId}`;

export function loadAvatarSeed(playerId: string): number {
  const raw = localStorage.getItem(AVATAR_KEY(playerId));
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function saveAvatarSeed(playerId: string, seed: number) {
  localStorage.setItem(AVATAR_KEY(playerId), String(seed));
}

export function cycleAvatarSeed(playerId: string): number {
  const next = (loadAvatarSeed(playerId) + 1) % AVATAR_PALETTES.length;
  saveAvatarSeed(playerId, next);
  return next;
}
