import { useMemo, useState } from 'react';
import { CHAPTER_META, CHAPTER_ORDER, type ChapterId } from '@abyss/shared';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconLock } from '../shell/Icons';

function pct(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

function EndingLabel({ id }: { id?: string }) {
  if (!id) {
    return (
      <span className="dim" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <IconLock size={11} /> ainda aberto
      </span>
    );
  }
  const labels: Record<string, string> = {
    disconnect: 'Desconexão',
    observer: 'Observer',
    merge: 'Convergência',
    null: 'User Not Found',
    capture: 'Captura',
  };
  return <b style={{ color: id === 'capture' ? 'var(--danger)' : 'var(--accent-soft)' }}>{labels[id] ?? id}</b>;
}

export function VaultApp() {
  const { save, pushToast, openApp } = useGame();
  const puzzles = useMeta((s) => s.puzzles);
  const evidence = useMeta((s) => s.evidence);
  const [tab, setTab] = useState<'flags' | 'artefatos' | 'progresso'>('flags');

  const flags = useMemo(
    () =>
      Object.keys(save?.flags ?? {})
        .filter((f) => f.startsWith('flag.'))
        .map((f) => f.slice(5)),
    [save],
  );

  const rows = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    for (const id of CHAPTER_ORDER) map[id] = { total: 0, done: 0 };
    for (const p of puzzles) {
      const ch = p.chapter || 'prologue';
      map[ch] ??= { total: 0, done: 0 };
      map[ch].total += 1;
      if (save?.puzzles[p.id]?.status === 'completed') map[ch].done += 1;
    }
    // se o meta ainda não carregou, estima a partir do save
    if (puzzles.length === 0 && save?.puzzles) {
      const completed = Object.values(save.puzzles).filter((p) => p.status === 'completed').length;
      const total = Object.keys(save.puzzles).length;
      map.prologue = { total, done: completed };
    }
    return CHAPTER_ORDER.map((id) => ({
      id: id as ChapterId,
      ...map[id],
      meta: CHAPTER_META[id as ChapterId],
    })).filter((r) => r.total > 0 || r.id === save?.currentChapter);
  }, [puzzles, save]);

  const totals = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.total, 0);
    const done = rows.reduce((a, r) => a + r.done, 0);
    const hints = Object.values(save?.puzzles ?? {}).reduce((a, p) => a + (p.hintsUsed ?? 0), 0);
    const evTotal = evidence.length || Object.keys(save?.evidence ?? {}).length;
    const evHave = Object.keys(save?.evidence ?? {}).length;
    return { total, done, hints, evTotal, evHave, pct: pct(done, total) };
  }, [rows, save, evidence]);

  return (
    <>
      <div className="tabs">
        {(['flags', 'artefatos', 'progresso'] as const).map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'flags' ? 'Flags' : t === 'artefatos' ? 'Artefatos' : 'Progresso'}
          </button>
        ))}
      </div>

      {tab === 'flags' && (
        <div className="vault-grid">
          {flags.map((f) => (
            <div key={f} className="vault-card">
              <div className="tiny dim upper">flag registrada</div>
              <div
                className="code"
                onClick={() => {
                  void navigator.clipboard.writeText(f);
                  pushToast('Flag copiada', 'success');
                }}
                title="clique para copiar"
              >
                {f}
              </div>
            </div>
          ))}
          {flags.length === 0 && (
            <div className="empty-state">
              Nenhuma flag registrada. Flags aparecem quando um puzzle crítico é resolvido.
            </div>
          )}
        </div>
      )}

      {tab === 'artefatos' && (
        <div className="vault-grid">
          {Object.keys(save?.evidence ?? {}).map((id) => {
            const meta = evidence.find((e) => e.id === id);
            const state = save?.evidence[id]?.state;
            return (
              <div
                key={id}
                className="vault-card"
                style={{ cursor: 'pointer' }}
                onClick={() => openApp('evidence', { tab: 'board', evidenceId: id })}
              >
                <div className="tiny dim upper">
                  {meta?.kind ?? 'artefato'} · {state}
                </div>
                <div style={{ margin: '4px 0', color: 'var(--text)' }}>{meta?.title ?? id}</div>
                <div className="dim tiny">{meta?.summary}</div>
              </div>
            );
          })}
          {Object.keys(save?.evidence ?? {}).length === 0 && (
            <div className="empty-state">Nenhum artefato preservado ainda.</div>
          )}
        </div>
      )}

      {tab === 'progresso' && (
        <div className="pane-scroll vault-progress">
          <div className="vault-summary">
            <div className="vault-ring" style={{ ['--p' as string]: `${totals.pct}%` }}>
              <div className="vault-ring-inner">
                <div className="vault-ring-pct">{totals.pct}%</div>
                <div className="tiny dim upper">campanha</div>
              </div>
            </div>
            <div className="vault-summary-stats">
              <div className="orph-row">
                <span>investigações resolvidas</span>
                <b>
                  {totals.done}
                  <span className="dim"> / {totals.total || '—'}</span>
                </b>
              </div>
              <div className="orph-row">
                <span>artefatos no vault</span>
                <b>
                  {totals.evHave}
                  {totals.evTotal ? <span className="dim"> / {totals.evTotal}</span> : null}
                </b>
              </div>
              <div className="orph-row">
                <span>dicas consultadas</span>
                <b>{totals.hints}</b>
              </div>
              <div className="orph-row">
                <span>camada atual</span>
                <b>{save ? CHAPTER_META[save.currentChapter]?.title ?? save.currentChapter : '—'}</b>
              </div>
              <div className="orph-row">
                <span>desfecho</span>
                <EndingLabel id={save?.ending} />
              </div>
            </div>
          </div>

          <div className="pane-head">Por camada</div>
          <div className="vault-layers">
            {rows.map((r) => {
              const p = pct(r.done, r.total);
              const current = save?.currentChapter === r.id;
              return (
                <div key={r.id} className={`vault-layer${current ? ' current' : ''}${p === 100 ? ' done' : ''}`}>
                  <div className="vault-layer-head">
                    <div>
                      <div className="tiny dim upper">{r.meta?.layer ?? r.id}</div>
                      <div className="vault-layer-title">{r.meta?.title ?? r.id}</div>
                    </div>
                    <div className="vault-layer-count mono">
                      {r.done}/{r.total}
                      <span className="dim"> · {p}%</span>
                    </div>
                  </div>
                  <div className="meter thick">
                    <i style={{ width: `${p}%` }} />
                  </div>
                  {r.meta?.question && <div className="vault-layer-q dim tiny">{r.meta.question}</div>}
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="empty-state">Carregue o catálogo de investigações para ver o mapa por camada.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
