import type { ChapterId, ChapterPackage, VfsNode } from '@abyss/shared';
import { ALL_PUZZLES, ALL_EVIDENCE, getPuzzlesByChapter } from './catalog/index.js';
import { prologue as prologueBase } from './chapters/prologue.js';
import { surface as surfaceBase } from './chapters/surface.js';
import {
  deep as deepBase,
  dark as darkBase,
  charter as charterBase,
  mariana as marianaBase,
  abyssChapter as abyssBase,
  primarch as primarchBase,
  observer as observerBase,
  epilogue as epilogueBase,
} from './chapters/rest.js';
import { mergeVfs } from './vfs.js';
import { chapterClueVfs } from './catalog/clues.js';

function enrich(base: ChapterPackage): ChapterPackage {
  const puzzles = getPuzzlesByChapter(base.id);
  const evidence = ALL_EVIDENCE.filter((e) => e.chapter === base.id);
  const clues = chapterClueVfs[base.id];
  return {
    ...base,
    puzzles: puzzles.length ? puzzles : base.puzzles,
    evidence: evidence.length ? evidence : base.evidence,
    vfsSeed: clues ? mergeVfs(base.vfsSeed, clues) : base.vfsSeed,
  };
}

export const chapters: Record<ChapterId, ChapterPackage> = {
  prologue: enrich(prologueBase),
  surface: enrich(surfaceBase),
  deep: enrich(deepBase),
  dark: enrich(darkBase),
  charter: enrich(charterBase),
  mariana: enrich(marianaBase),
  abyss: enrich(abyssBase),
  primarch: enrich(primarchBase),
  observer: enrich(observerBase),
  epilogue: enrich(epilogueBase),
};

export function getChapter(id: ChapterId): ChapterPackage {
  return chapters[id];
}

export function allPuzzles() {
  return ALL_PUZZLES;
}

export function allEvidence() {
  return ALL_EVIDENCE;
}

export function getPuzzle(id: string) {
  return ALL_PUZZLES.find((p) => p.id === id);
}

export function getEvidenceDef(id: string) {
  return ALL_EVIDENCE.find((e) => e.id === id);
}

export { ALL_PUZZLES, ALL_EVIDENCE };
export { prologueBase as prologue, surfaceBase as surface };
