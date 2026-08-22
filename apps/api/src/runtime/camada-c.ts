import type { ChapterId, SaveGame } from '@abyss/shared';

/** Directional tips only — never literal puzzle answers. */
const SIGNALS: Record<ChapterId, string> = {
  prologue: 'ls -a /home/null',
  surface: 'strings beats cat sometimes',
  deep: 'shadow persists between sessions',
  dark: 'man submit',
  charter: '204 body empty headers speak',
  mariana: 'compare request response and UI',
  abyss: 'something sits between layers',
  primarch: 'observer channel may be bidirectional',
  observer: 'the machine was left on purpose',
  epilogue: 'choose what you keep',
};

export function camadaCHeaders(save: SaveGame): Record<string, string> {
  const tip = SIGNALS[save.currentChapter] ?? SIGNALS.prologue;
  return {
    'x-abyss-channel': 'quarantine',
    'x-abyss-signal': Buffer.from(tip, 'utf8').toString('base64'),
  };
}
