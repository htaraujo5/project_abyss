import type { ChapterId, PuzzleDefinition, EvidenceDefinition, Hint } from '@abyss/shared';

export function pz(p: PuzzleDefinition): PuzzleDefinition {
  return p;
}

export function hints(c: string, d: string, o: string): Hint[] {
  return [
    { level: 'conceptual', text: c },
    { level: 'directional', text: d },
    { level: 'operational', text: o },
  ];
}

export function flagValidator(flag: string) {
  return [{ type: 'flag.set' as const, flag }];
}

export type { ChapterId, EvidenceDefinition };
