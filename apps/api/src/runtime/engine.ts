import {
  CHAPTER_APP_UNLOCKS,
  CHAPTER_ORDER,
  type EndingId,
  type PuzzleDefinition,
  type Reward,
  type SaveGame,
  type Validator,
  type VfsNode,
} from '@abyss/shared';import { allPuzzles, getChapter, getEvidenceDef } from '@abyss/content';
import { fileContains, pathExists, readFile } from './vfs.js';

export type EngineDelta = {
  completedPuzzles: string[];
  unlockedEvidence: string[];
  newFlags: string[];
  narrative: string[];
  ending?: EndingId;
};

export function applyEventsToSave(
  save: SaveGame,
  events: string[],
  vfs: VfsNode,
): EngineDelta {
  const delta: EngineDelta = {
    completedPuzzles: [],
    unlockedEvidence: [],
    newFlags: [],
    narrative: [],
  };

  for (const ev of events) {
    if (ev.startsWith('file.opened:') || ev.startsWith('artifact.opened:')) {
      const path = ev.split(':').slice(1).join(':');
      onFileOpened(save, path, delta);
    }
    if (ev.startsWith('submit:')) {
      const parts = ev.split(':');
      const puzzleId = parts[1] ?? '';
      const answer = parts.slice(2).join(':');
      handleSubmit(save, puzzleId, answer, delta);
    }
    if (ev.startsWith('ending.choose:')) {
      const ending = ev.split(':')[1] as EndingId;
      commitEnding(save, ending, delta, false);
    }
    if (ev.startsWith('ending.force:')) {
      const ending = ev.split(':')[1] as EndingId;
      commitEnding(save, ending, delta, true);
    }
    if (ev === 'epilogue.request') {
      save.flags['epilogue.seen'] = true;
      delta.newFlags.push('epilogue.seen');
      delta.narrative.push('observer disconnected → new observer detected → hello.');
    }
  }

  // Auto-observe evidence when related files opened
  evaluateAll(save, vfs, delta);
  return delta;
}

const ENDING_PATH_RE =
  /(?:^|\/)endings\/(DISCONNECT|OBSERVER|MERGE|NULL|CAPTURE)(?:\.md)?$/i;

const ENDING_FROM_PATH: Record<string, EndingId> = {
  disconnect: 'disconnect',
  observer: 'observer',
  merge: 'merge',
  null: 'null',
  capture: 'capture',
};

function commitEnding(
  save: SaveGame,
  ending: EndingId,
  delta: EngineDelta,
  force: boolean,
) {
  if (save.ending) return;
  if (
    !force &&
    !save.flags['read.player.history'] &&
    save.currentChapter !== 'observer' &&
    save.currentChapter !== 'epilogue'
  ) {
    delta.narrative.push('Desfecho ainda bloqueado — leia o histórico do observador primeiro.');
    return;
  }
  save.flags['ending.chosen'] = true;
  save.flags[`ending.${ending}`] = true;
  save.ending = ending;
  delta.newFlags.push('ending.chosen', `ending.${ending}`);
  delta.ending = ending;
  delta.narrative.push(`Desfecho desencadeado: ${ending}`);
}

function tryEndingFromPath(save: SaveGame, path: string, delta: EngineDelta) {
  if (save.ending) return;
  const m = ENDING_PATH_RE.exec(path.replace(/\\/g, '/'));
  if (!m) return;
  const key = m[1].toLowerCase();
  const ending = ENDING_FROM_PATH[key];
  if (!ending) return;
  commitEnding(save, ending, delta, false);
}

function onFileOpened(save: SaveGame, path: string, delta: EngineDelta) {
  tryEndingFromPath(save, path, delta);

  // Investigation briefs unlock matching evidence cards
  const brief = /\/investigation\/[^/]+\/(P-\d+)\/brief\.txt$/.exec(path);
  if (brief) {
    unlockEvidence(save, `EV-${brief[1]}`, delta);
  }

  const map: Record<string, { flag?: string; evidence?: string[] }> = {
    '/home/null/.null': {
      flag: 'found.null',
      evidence: ['EV-NULL-DOTFILE', 'EV-WARNING-MARIANA', 'EV-GUI-DIVERGENCE'],
    },
    '/home/null/projects/orpheus/.git/objects/0000000000000000000000000000000000000331': {
      flag: 'found.orpheus',
      evidence: ['EV-ORPHEUS-PROJECT', 'EV-ORPHAN-331'],
    },
    '/home/null/Documents/null_profile.txt': {
      flag: 'read.null.profile',
      evidence: ['EV-NULL-ENGINEER'],
    },
    '/home/null/projects/orpheus/docs/CHANGELOG.md': {
      flag: 'read.changelog.gap',
      evidence: ['EV-CHANGELOG-GAP'],
    },
    '/home/null/projects/orpheus/data/correlation.json': {
      flag: 'found.signal',
      evidence: ['EV-THE-SIGNAL'],
    },
    '/home/null/Documents/acheron_note.txt': {
      flag: 'read.acheron.taxonomy',
      evidence: ['EV-ACHERON-TAXONOMY'],
    },
    '/home/null/projects/orpheus/web/panel.json': {
      flag: 'found.observer.prop',
      evidence: ['EV-OBSERVER-PROP'],
    },
    '/home/null/projects/orpheus/web/reply_3301.txt': {
      flag: 'read.3301.reply',
      evidence: ['EV-ENTITY-3301'],
    },
    '/home/null/projects/charter/decoded_be.txt': {
      flag: 'understood.decoder.drift',
      evidence: ['EV-DECODER-DRIFT', 'EV-CHARTER-DEF'],
    },
    '/home/null/projects/charter/services/clocks.log': {
      flag: 'found.clock.skew',
      evidence: ['EV-CLOCK-SKEW'],
    },
    '/home/null/projects/mariana/observe.behavior.txt': {
      flag: 'found.observe',
      evidence: ['EV-OBSERVE-FN'],
    },
    '/home/null/projects/mariana/runtime_fragments.log': {
      flag: 'found.runtime.fragments',
      evidence: ['EV-RUNTIME-FRAGMENTS'],
    },
    '/home/null/projects/abyss/absence_graph.txt': {
      flag: 'found.absence.graph',
      evidence: ['EV-ABSENCE-GRAPH'],
    },
    '/home/null/projects/primarch/response_wire.json': {
      flag: 'found.sw.intercept',
      evidence: ['EV-SW-INTERCEPT'],
    },
    '/home/null/projects/primarch/dataset_card.md': {
      flag: 'found.dataset.intent',
      evidence: ['EV-DATASET-INTENT'],
    },
    '/home/null/projects/observer/player_history.log': {
      flag: 'read.player.history',
      evidence: ['EV-PLAYER-HISTORY'],
    },
    '/home/null/projects/observer/final_architecture.md': {
      evidence: ['EV-FINAL-CHOICE'],
    },
  };

  const hit = map[path];
  if (!hit) return;
  if (hit.flag && !save.flags[hit.flag]) {
    save.flags[hit.flag] = true;
    delta.newFlags.push(hit.flag);
  }
  for (const id of hit.evidence ?? []) {
    unlockEvidence(save, id, delta);
  }
}

function unlockEvidence(save: SaveGame, id: string, delta: EngineDelta) {
  if (!save.evidence[id]) {
    save.evidence[id] = { id, state: 'observed' };
    delta.unlockedEvidence.push(id);
  } else if (save.evidence[id].state === 'unseen') {
    save.evidence[id].state = 'observed';
    delta.unlockedEvidence.push(id);
  }
}

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function handleSubmit(
  save: SaveGame,
  puzzleId: string,
  answer: string,
  delta: EngineDelta,
) {
  const puzzle = allPuzzles().find((p) => p.id === puzzleId);
  if (!puzzle) {
    delta.narrative.push(`Puzzle desconhecido: ${puzzleId}`);
    return;
  }
  if (!prereqsMet(save, puzzle) && puzzle.prerequisites.length) {
    delta.narrative.push(`${puzzleId} ainda bloqueado — complete os pré-requisitos.`);
    return;
  }
  const candidates = [
    puzzle.answer,
    ...(puzzle.answerAliases ?? []),
  ].filter(Boolean) as string[];
  if (!candidates.length) {
    delta.narrative.push(`${puzzleId} não aceita submit — continue investigando artefatos.`);
    return;
  }
  const ok = candidates.some(
    (a) => normalizeAnswer(a) === normalizeAnswer(answer),
  );
  if (!ok) {
    delta.narrative.push(`Resposta incorreta para ${puzzleId}.`);
    return;
  }
  for (const v of puzzle.validators) {
    if (v.type === 'flag.set' && !save.flags[v.flag]) {
      save.flags[v.flag] = true;
      delta.newFlags.push(v.flag);
    }
  }
  if (!save.flags[`solved.${puzzleId}`]) {
    save.flags[`solved.${puzzleId}`] = true;
    delta.newFlags.push(`solved.${puzzleId}`);
  }
  for (const eid of puzzle.evidenceUnlocks) {
    unlockEvidence(save, eid, delta);
  }
  delta.narrative.push(`✓ ${puzzleId} — ${puzzle.title}`);
}

function checkValidator(save: SaveGame, vfs: VfsNode, v: Validator): boolean {
  switch (v.type) {
    case 'file.exists':
      return pathExists(vfs, v.path);
    case 'file.contains':
      return fileContains(vfs, v.path, v.text);
    case 'flag.set':
      return !!save.flags[v.flag];
    case 'evidence.observed':
      return ['observed', 'related', 'confirmed'].includes(
        save.evidence[v.evidenceId]?.state ?? 'unseen',
      );
    case 'evidence.linked':
      return save.links.some(
        (l) =>
          (l.from === v.from && l.to === v.to) ||
          (l.from === v.to && l.to === v.from),
      );
    case 'json.path': {
      const raw = readFile(vfs, v.path);
      if (raw == null) return false;
      try {
        const data = JSON.parse(raw);
        const parts = v.jsonPath.replace(/^\$\.?/, '').split('.');
        let cur: unknown = data;
        for (const p of parts) {
          if (cur == null || typeof cur !== 'object') return false;
          cur = (cur as Record<string, unknown>)[p];
        }
        if (v.exists) return cur !== undefined;
        if (v.equals !== undefined) return cur === v.equals;
        return cur !== undefined;
      } catch {
        return false;
      }
    }
    case 'command.output':
      return false;
    case 'custom':
      return !!save.flags[`custom.${v.id}`];
    default:
      return false;
  }
}

function prereqsMet(save: SaveGame, puzzle: PuzzleDefinition): boolean {
  return puzzle.prerequisites.every(
    (id) => save.puzzles[id]?.status === 'completed',
  );
}

function applyRewards(save: SaveGame, rewards: Reward[], delta: EngineDelta) {
  for (const r of rewards) {
    switch (r.type) {
      case 'unlock_flag':
        if (!save.flags[r.flag]) {
          save.flags[r.flag] = true;
          delta.newFlags.push(r.flag);
        }
        break;
      case 'unlock_chapter':
        save.flags[`chapter.${r.chapter}`] = true;
        if (chapterOrderIndex(r.chapter) > chapterOrderIndex(save.currentChapter)) {
          save.currentChapter = r.chapter;
          delta.narrative.push(`Capítulo desbloqueado: ${r.chapter}`);
        }
        unlockAppsForProgress(save, r.chapter, delta);
        break;
      case 'unlock_app':
        if (!save.unlockedApps.includes(r.app)) {
          save.unlockedApps.push(r.app);
        }
        break;
      case 'unlock_evidence':
        unlockEvidence(save, r.evidenceId, delta);
        break;
      case 'narrative':
        delta.narrative.push(r.event);
        save.narrativeLog.push(r.event);
        break;
      case 'ending':
        save.ending = r.ending;
        delta.ending = r.ending;
        break;
    }
  }
}

function chapterOrderIndex(id: string): number {
  return CHAPTER_ORDER.indexOf(id as (typeof CHAPTER_ORDER)[number]);
}

function unlockAppsForProgress(
  save: SaveGame,
  upToChapter: string,
  delta: EngineDelta,
) {
  const idx = chapterOrderIndex(upToChapter);
  for (let i = 0; i <= idx; i++) {
    const cid = CHAPTER_ORDER[i];
    for (const app of CHAPTER_APP_UNLOCKS[cid] ?? []) {
      if (!save.unlockedApps.includes(app)) {
        save.unlockedApps.push(app);
        delta.narrative.push(`Ferramenta liberada: ${app}`);
      }
    }
  }
}

export function evaluateAll(
  save: SaveGame,
  vfs: VfsNode,
  delta: EngineDelta = {
    completedPuzzles: [],
    unlockedEvidence: [],
    newFlags: [],
    narrative: [],
  },
): EngineDelta {
  for (const puzzle of allPuzzles()) {
    const state = save.puzzles[puzzle.id] ?? {
      id: puzzle.id,
      status: 'locked' as const,
      hintsUsed: 0,
    };
    if (state.status === 'completed') {
      save.puzzles[puzzle.id] = state;
      continue;
    }
    if (!prereqsMet(save, puzzle) && puzzle.prerequisites.length) {
      state.status = 'locked';
      save.puzzles[puzzle.id] = state;
      continue;
    }
    state.status = 'available';
    const passed = puzzle.validators.every((v) => checkValidator(save, vfs, v));
    // Special-case P-001: opening .null sets flag; validators need both exists + flag
    if (passed) {
      state.status = 'completed';
      state.completedAt = new Date().toISOString();
      delta.completedPuzzles.push(puzzle.id);
      applyRewards(save, puzzle.rewards, delta);
      for (const eid of puzzle.evidenceUnlocks) {
        unlockEvidence(save, eid, delta);
      }
    }
    save.puzzles[puzzle.id] = state;
  }

  // Sync player history file content into narrative awareness
  if (save.flags['read.player.history']) {
    // already handled
  }

  return delta;
}

export function mergeChapterIntoVfs(
  current: VfsNode,
  chapterId: SaveGame['currentChapter'],
): VfsNode {
  const pkg = getChapter(chapterId);
  // Deep merge chapter seed over current — prefer overlay files
  return deepMergeVfs(current, pkg.vfsSeed);
}

function deepMergeVfs(a: VfsNode, b: VfsNode): VfsNode {
  if (b.type === 'file') return clone(b);
  if (a.type !== 'dir') return clone(b);
  const children: Record<string, VfsNode> = { ...(a.children ?? {}) };
  for (const [k, v] of Object.entries(b.children ?? {})) {
    if (children[k] && children[k].type === 'dir' && v.type === 'dir') {
      children[k] = deepMergeVfs(children[k], v);
    } else if (!children[k]) {
      children[k] = clone(v);
    } else if (v.type === 'file') {
      children[k] = clone(v);
    } else {
      children[k] = deepMergeVfs(children[k], v);
    }
  }
  return { type: 'dir', children };
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export function hintFor(
  save: SaveGame,
  puzzleId: string,
): { level: string; text: string } | { error: string } {
  const puzzle = allPuzzles().find((p) => p.id === puzzleId);
  if (!puzzle) return { error: 'Puzzle não encontrado' };
  const state = save.puzzles[puzzleId];
  if (!state || state.status === 'locked') return { error: 'Puzzle bloqueado' };
  const idx = Math.min(state.hintsUsed, puzzle.hintChain.length - 1);
  if (idx < 0 || !puzzle.hintChain[idx]) return { error: 'Sem dicas' };
  const hint = puzzle.hintChain[idx];
  for (const req of hint.requiresEvidence ?? []) {
    if (!save.evidence[req] || save.evidence[req].state === 'unseen') {
      return { error: 'Evidência insuficiente para esta dica' };
    }
  }
  state.hintsUsed += 1;
  save.puzzles[puzzleId] = state;
  return { level: hint.level, text: hint.text };
}

export function evidenceCatalog() {
  return allPuzzles().length
    ? // re-export via content
      getEvidenceDef
    : getEvidenceDef;
}
