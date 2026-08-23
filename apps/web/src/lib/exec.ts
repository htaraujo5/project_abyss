import { execCommand } from './api';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { emit } from './bus';
import { uiSound } from './audio';
import type { EndingId, SaveGame } from '@abyss/shared';

export type ExecResult = Awaited<ReturnType<typeof execCommand>>;

type ProgressDelta = {
  save: SaveGame;
  ending?: EndingId;
  completedPuzzles?: string[];
  unlockedEvidence?: string[];
  newFlags?: string[];
  narrative?: string[];
};

/** Propaga efeitos de progresso (exec ou abertura de arquivo na UI). */
export function applyProgressDelta(
  result: ProgressDelta,
  opts: { beforeChapter?: string; source?: string } = {},
) {
  const g = useGame.getState();
  const before = opts.beforeChapter ?? g.save?.currentChapter;
  g.setSave(result.save);

  const solved = result.completedPuzzles ?? [];
  for (const p of solved) {
    g.notify('puzzle', `Puzzle resolvido — ${p}`, 'success');
  }
  for (const e of result.unlockedEvidence ?? []) {
    const meta = useMeta.getState().evidenceById(e);
    g.notify('evidência', `Nova evidência — ${meta?.title ?? e}`, 'info');
  }
  for (const n of result.narrative ?? []) {
    g.notify('narrativa', n, 'info');
  }
  for (const f of result.newFlags ?? []) {
    if (f.startsWith('flag.')) g.notify('vault', `Flag registrada — ${f.slice(5)}`, 'success');
  }

  const chapterChanged = !!before && result.save.currentChapter !== before;
  if (chapterChanged) {
    void useMeta.getState().refreshChapter(result.save.id).then((info) => {
      const meta = useMeta.getState().chapterMeta[result.save.currentChapter];
      if (info) {
        g.showBanner({
          layer: meta?.layer ?? '',
          title: info.title,
          text: info.intro,
        });
      }
    });
    void useMeta.getState().refreshLogs(result.save.id);
  }

  if (result.ending === 'capture') {
    g.beginCaptureSequence();
  } else if (result.ending) {
    g.setPhase('ending');
  }

  if (solved.length > 0 || chapterChanged || result.ending) {
    uiSound('notify');
  }

  emit('save-updated', { source: opts.source ?? 'progress' });
}

function openGameGuide() {
  window.open('/guia.html', '_blank', 'noopener,noreferrer');
}

/**
 * Executa um comando no runtime e propaga todos os efeitos de jogo
 * (save, notificações, evidências, capítulo, final) para o resto da UI.
 */
export async function runCommand(command: string, source = 'terminal'): Promise<ExecResult | null> {
  const g = useGame.getState();
  const save = g.save;
  if (!save) return null;

  // Abrir antes de qualquer await — senão o browser bloqueia o popup.
  const head = command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (head === 'ajuda' || head === 'guia' || head === 'guide') {
    openGameGuide();
  }

  const before = save.currentChapter;
  const result = await execCommand(save.id, command);
  applyProgressDelta(result, { beforeChapter: before, source });

  // Fallback se o comando veio de alias/pipe e o evento ainda pede o guia
  if (result.events?.includes('guide.open') && !(head === 'ajuda' || head === 'guia' || head === 'guide')) {
    openGameGuide();
  }

  return result;
}
