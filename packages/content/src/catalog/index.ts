import type { ChapterId, PuzzleDefinition } from '@abyss/shared';
import { ALL_PUZZLES } from './puzzles.js';

export { ALL_PUZZLES } from './puzzles.js';
export { ALL_EVIDENCE } from './evidence.js';
export { pz, hints, flagValidator } from './helpers.js';

export function getPuzzlesByChapter(chapter: ChapterId): PuzzleDefinition[] {
  return ALL_PUZZLES.filter((p) => p.chapter === chapter);
}

export function getPuzzleAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of ALL_PUZZLES) {
    if (p.answer) out[p.id] = p.answer;
  }
  return out;
}
