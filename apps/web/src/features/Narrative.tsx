import { useEffect, useState } from 'react';
import { CHAPTER_META, type EndingId } from '@abyss/shared';
import { ENDING_TEXT } from '../lib/endings';
import { clearTraps } from '../lib/traps';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconAbyss } from '../shell/Icons';

/** Epílogo narrativo — o desfecho já veio das ações do jogador. */
export function EndingOverlay() {
  const save = useGame((s) => s.save);
  const setPhase = useGame((s) => s.setPhase);
  const openApp = useGame((s) => s.openApp);
  const windows = useGame((s) => s.windows);
  const pendingEpilogue = useGame((s) => s.pendingEpilogue);
  const clearPendingEpilogue = useGame((s) => s.clearPendingEpilogue);
  const logoutAfterCapture = useGame((s) => s.logoutAfterCapture);
  const ending = (pendingEpilogue ?? save?.ending ?? null) as EndingId | null;
  const def = ending ? ENDING_TEXT[ending] : null;
  const isCapture = ending === 'capture';

  return (
    <div className="boot ending-overlay" style={{ position: 'absolute', inset: 0, zIndex: 900 }}>
      <div className="boot-card ending-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: isCapture ? 'var(--danger)' : 'var(--accent-soft)' }}>
            <IconAbyss size={26} />
          </span>
          <div>
            <h1 className="boot-title" style={{ fontSize: 24 }}>
              EPÍLOGO
            </h1>
            <div className="boot-sub" style={{ margin: 0 }}>
              {def?.tagline ??
                'O desfecho nasce das suas ações — abra um caminho em endings/.'}
            </div>
          </div>
        </div>

        <div className="hairline" style={{ margin: '20px 0' }} />

        {!def ? (
          <p className="dim" style={{ lineHeight: 1.8 }}>
            Não há menu de finais. Depois de ler o histórico do observador, abra o arquivo do
            caminho que você aceita em{' '}
            <span className="mono">~/projects/observer/endings/</span> (ou o equivalente em
            investigation). Também existem atos no shell: disconnect, inherit, converge,
            erase-self, accept-link.
          </p>
        ) : (
          <>
            <div
              className="mono ending-result-title"
              style={{ color: isCapture ? 'var(--danger)' : 'var(--accent-soft)' }}
            >
              {def.title}
            </div>
            <p className="ending-tagline">{def.tagline}</p>
            <div className="ending-story">
              {def.story.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <div className="ending-aftermath mono tiny">{def.aftermath}</div>
            {isCapture && (
              <p className="dim tiny" style={{ marginTop: 14, lineHeight: 1.7 }}>
                Sessão sequestrada. Progresso purgado. A credencial será encerrada — será
                necessário entrar de novo para reabrir a quarentena.
              </p>
            )}
            {!!save?.narrativeLog?.length && (
              <>
                <div className="hairline" style={{ margin: '18px 0' }} />
                <div className="mono dim tiny" style={{ lineHeight: 2 }}>
                  {save.narrativeLog.slice(-6).map((l: string, i: number) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </>
            )}
            <button
              className="btn primary lg"
              style={{ marginTop: 18 }}
              onClick={() => {
                if (isCapture) {
                  logoutAfterCapture();
                  return;
                }
                if (save) clearTraps(save.id);
                clearPendingEpilogue();
                setPhase('playing');
                if (windows.length === 0) {
                  openApp('files');
                  openApp('terminal');
                }
              }}
            >
              {isCapture ? 'encerrar sessão e pedir login' : 'voltar ao desktop'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Cartela cinematográfica de mudança de camada. */
export function ChapterBanner() {
  const banner = useGame((s) => s.banner);
  const reduce = useGame((s) => s.settings.reduceMotion);
  if (!banner) return null;
  return (
    <div className="chapter-banner" style={reduce ? { animation: 'none' } : undefined}>
      <div>
        <div className="layer">{banner.layer}</div>
        <h2>{banner.title}</h2>
        <div className="hairline" style={{ margin: '0 auto 20px', width: 240 }} />
        <p>{banner.text}</p>
      </div>
    </div>
  );
}

/** Faixa persistente com a pergunta central da camada atual. */
export function ChapterQuestion() {
  const save = useGame((s) => s.save);
  const chapter = useMeta((s) => s.chapter);
  const [open, setOpen] = useState(true);
  const meta = save ? CHAPTER_META[save.currentChapter] : null;

  useEffect(() => setOpen(true), [save?.currentChapter]);
  if (!meta || !open) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        maxWidth: 380,
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r3)',
        background: 'color-mix(in srgb, var(--bg-1) 88%, transparent)',
        backdropFilter: 'blur(8px)',
        zIndex: 3,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="chip accent">{meta.layer}</span>
        <span className="tiny upper dim">{meta.title}</span>
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => setOpen(false)}
          title="Ocultar"
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 12.5, marginTop: 6 }}>{meta.question}</div>
      {chapter?.intro && (
        <div className="dim tiny" style={{ marginTop: 6, lineHeight: 1.7 }}>
          {chapter.intro}
        </div>
      )}
    </div>
  );
}
