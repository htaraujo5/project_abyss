import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allPuzzles, allEvidence, getChapter } from '@abyss/content';

describe('full catalog', () => {
  it('has 91 puzzles P-001..P-091', () => {
    const puzzles = allPuzzles();
    assert.equal(puzzles.length, 91);
    for (let i = 1; i <= 91; i++) {
      const id = `P-${String(i).padStart(3, '0')}`;
      assert.ok(puzzles.some((p) => p.id === id), `missing ${id}`);
    }
  });

  it('has evidence entries', () => {
    assert.ok(allEvidence().length >= 90);
  });

  it('chapters expose investigation clues', () => {
    const pro = getChapter('prologue');
    assert.ok(pro.puzzles.length >= 5);
    // vfs should include investigation overlay after enrich
    const inv = pro.vfsSeed.children?.home?.children?.null?.children?.investigation;
    assert.ok(inv, 'investigation folder missing');
  });

  it('distribution roughly 55 main', () => {
    const main = allPuzzles().filter((p) => p.main && !p.optional && !p.secret && p.id !== 'P-091');
    // allow some variance from catalog authoring
    assert.ok(main.length >= 45, `main count ${main.length}`);
  });
});
