import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getChapter } from '@abyss/content';
import { VfsShell } from './shell.js';
import { applyEventsToSave } from './engine.js';
import {
  CONTENT_VERSION,
  DEFAULT_UNLOCKED_APPS,
  type SaveGame,
} from '@abyss/shared';
import { cloneVfs } from './vfs.js';

function blankSave(vfs = getChapter('prologue').vfsSeed): SaveGame {
  return {
    id: 'test',
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
    vfsSnapshot: cloneVfs(vfs),
    narrativeLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('P-001 Hidden File', () => {
  it('completes when .null is read via shell', () => {
    const save = blankSave();
    const shell = new VfsShell(save.vfsSnapshot!);
    const result = shell.exec('cat /home/null/.null');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /MARIANA/);
    const delta = applyEventsToSave(save, result.events, shell.snapshot());
    assert.ok(save.flags['found.null']);
    assert.ok(
      delta.completedPuzzles.includes('P-001') ||
        save.puzzles['P-001']?.status === 'completed',
    );
  });
});

describe('chapter packages', () => {
  it('loads all chapters', () => {
    for (const id of [
      'prologue',
      'surface',
      'deep',
      'dark',
      'charter',
      'mariana',
      'abyss',
      'primarch',
      'observer',
      'epilogue',
    ] as const) {
      const ch = getChapter(id);
      assert.ok(ch.puzzles.length >= 1);
    }
  });
});
