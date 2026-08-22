import { create } from 'zustand';
import type { ChapterId } from '@abyss/shared';
import {
  getChapterInfo,
  getChaptersMeta,
  getEvidenceMeta,
  getLogs,
  getPuzzlesMeta,
  getTelemetry,
} from '../lib/api';

export type Telemetry = Awaited<ReturnType<typeof getTelemetry>>;

export type EvidenceMeta = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  chapter: string;
  body?: string;
};

export type PuzzleMeta = {
  id: string;
  chapter: string;
  title: string;
  narrativeGoal?: string;
  brief?: string;
  description?: string;
  cluePath?: string;
  hintLevels?: string[];
  acceptsSubmit?: boolean;
  category?: string;
  difficulty?: number;
};

export type ChapterInfo = {
  id: ChapterId;
  title: string;
  intro: string;
  musicTrack?: string;
  websites: { host: string; title: string; html: string; headers?: Record<string, string> }[];
  logs: { id: string; source: string; lines: string[] }[];
  puzzles: { id: string; title: string; status: string }[];
};

type MetaState = {
  loaded: boolean;
  evidence: EvidenceMeta[];
  puzzles: PuzzleMeta[];
  chapterMeta: Record<string, { title: string; layer: string; question: string }>;
  chapterOrder: ChapterId[];
  chapter: ChapterInfo | null;
  logs: { id: string; source: string; lines: string[] }[];
  telemetry: Telemetry | null;
  loadStatic: () => Promise<void>;
  refreshChapter: (saveId: string) => Promise<ChapterInfo | null>;
  refreshLogs: (saveId: string) => Promise<void>;
  refreshTelemetry: (saveId: string) => Promise<void>;
  evidenceById: (id: string) => EvidenceMeta | undefined;
  puzzleById: (id: string) => PuzzleMeta | undefined;
};

export const useMeta = create<MetaState>((set, get) => ({
  loaded: false,
  evidence: [],
  puzzles: [],
  chapterMeta: {},
  chapterOrder: [],
  chapter: null,
  logs: [],
  telemetry: null,

  refreshTelemetry: async (saveId) => {
    try {
      set({ telemetry: await getTelemetry(saveId) });
    } catch {
      set({ telemetry: null });
    }
  },

  loadStatic: async () => {
    if (get().loaded) return;
    const [ev, pz, ch] = await Promise.all([
      getEvidenceMeta(),
      getPuzzlesMeta(),
      getChaptersMeta(),
    ]);
    set({
      loaded: true,
      evidence: ev.evidence as EvidenceMeta[],
      puzzles: pz.puzzles as PuzzleMeta[],
      chapterMeta: ch.meta,
      chapterOrder: ch.order,
    });
  },

  refreshChapter: async (saveId) => {
    const info = (await getChapterInfo(saveId)) as ChapterInfo;
    set({ chapter: info });
    void get().refreshTelemetry(saveId);
    return info;
  },

  refreshLogs: async (saveId) => {
    const { logs } = await getLogs(saveId);
    set({ logs });
  },

  evidenceById: (id) => get().evidence.find((e) => e.id === id),
  puzzleById: (id) => get().puzzles.find((p) => p.id === id),
}));
