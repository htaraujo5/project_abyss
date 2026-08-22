import type { EndingId } from '@abyss/shared';
import { applyProgressDelta } from './exec';
import { clearTraps } from './traps';

const API = '';

function authHeaders(): HeadersInit {
  const t = localStorage.getItem('abyss_token') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/** Dispara captura forçada (browser / timeout) e inicia a sequência. */
export async function triggerTrapCapture(reason: 'browser' | 'chapter' | 'manual') {
  const { useGame } = await import('../state/game');
  const g = useGame.getState();
  const save = g.save;
  if (!save || g.captureSequence || g.uiLocked) return;
  if (save.ending) {
    if (save.ending === 'capture') g.beginCaptureSequence();
    return;
  }

  const res = await fetch(`${API}/api/saves/${save.id}/trap-capture`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) return;
  const data = (await res.json()) as {
    save: typeof save;
    ending?: EndingId;
    completedPuzzles?: string[];
    unlockedEvidence?: string[];
    newFlags?: string[];
    narrative?: string[];
  };
  applyProgressDelta(data, { source: `trap:${reason}` });
}

/** Zera o progresso do save atual após a captura. */
export async function resetProgressAfterCapture() {
  const { useGame } = await import('../state/game');
  const g = useGame.getState();
  const save = g.save;
  if (!save) return null;
  const res = await fetch(`${API}/api/saves/${save.id}/reset`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { save: typeof save };
  clearTraps(save.id);
  g.setSave(data.save);
  const { useMeta } = await import('../state/meta');
  await useMeta.getState().refreshChapter(data.save.id);
  await useMeta.getState().refreshLogs(data.save.id);
  return data.save;
}
