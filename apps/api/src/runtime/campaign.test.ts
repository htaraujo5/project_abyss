import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getChapter } from '@abyss/content';
import { VfsShell } from './shell.js';
import { applyEventsToSave, mergeChapterIntoVfs } from './engine.js';
import {
  CONTENT_VERSION,
  DEFAULT_UNLOCKED_APPS,
  type SaveGame,
} from '@abyss/shared';
import { cloneVfs } from './vfs.js';

function blankSave(): SaveGame {
  return {
    id: 'campaign',
    playerId: 'p',
    slot: 1,
    name: 't',
    contentVersion: CONTENT_VERSION,
    currentChapter: 'prologue',
    flags: { 'chapter.prologue': true },
    puzzles: {},
    evidence: {},
    links: [],
    unlockedApps: [...DEFAULT_UNLOCKED_APPS],
    cwd: '/home/null',
    vfsSnapshot: cloneVfs(getChapter('prologue').vfsSeed),
    narrativeLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function run(save: SaveGame, shell: VfsShell, cmd: string) {
  const prev = save.currentChapter;
  const result = shell.exec(cmd);
  applyEventsToSave(save, result.events, shell.snapshot());
  if (save.currentChapter !== prev) {
    shell.restore(mergeChapterIntoVfs(shell.snapshot(), save.currentChapter), shell.cwd);
  }
  save.vfsSnapshot = shell.snapshot();
  return result;
}

describe('campaign spine', () => {
  it('advances prologue to epilogue through spine files', () => {
    const save = blankSave();
    const shell = new VfsShell(save.vfsSnapshot!);

    const sequence = [
      'cat /home/null/.null',
      'cat /home/null/projects/orpheus/.git/objects/0000000000000000000000000000000000000331',
      'cat /home/null/Documents/null_profile.txt',
      'cat /home/null/projects/orpheus/docs/CHANGELOG.md',
      'cat /home/null/projects/orpheus/data/correlation.json',
      'cat /home/null/Documents/acheron_note.txt',
      'cat /home/null/projects/orpheus/web/panel.json',
      'cat /home/null/projects/orpheus/web/reply_3301.txt',
      'cat /home/null/projects/charter/decoded_be.txt',
      'cat /home/null/projects/charter/services/clocks.log',
      'cat /home/null/projects/mariana/observe.behavior.txt',
      'cat /home/null/projects/mariana/runtime_fragments.log',
      'cat /home/null/projects/abyss/absence_graph.txt',
      'cat /home/null/projects/primarch/response_wire.json',
      'cat /home/null/projects/primarch/dataset_card.md',
      'cat /home/null/projects/observer/player_history.log',
      'cat /home/null/projects/observer/endings/OBSERVER',
      'epilogue',
    ];

    for (const cmd of sequence) run(save, shell, cmd);

    assert.equal(save.puzzles['P-001']?.status, 'completed');
    assert.equal(save.puzzles['P-006']?.status, 'completed');
    assert.equal(save.puzzles['P-090']?.status, 'completed');
    assert.equal(save.puzzles['P-091']?.status, 'completed');
    assert.equal(save.ending, 'observer');
    assert.equal(save.currentChapter, 'epilogue');
    assert.ok(save.flags['epilogue.seen']);
  });
});
