import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addLink, getHint, patchEvidence, removeLink, saveUiState } from '../lib/api';
import { useGame } from '../state/game';
import { useMeta, type EvidenceMeta } from '../state/meta';
import { runCommand } from '../lib/exec';
import { on } from '../lib/bus';
import { IconLink, IconSearch } from '../shell/Icons';

const KIND_LABEL: Record<string, string> = {
  evidence: 'evidência',
  person: 'pessoa',
  system: 'sistema',
  organization: 'organização',
  event: 'evento',
  hypothesis: 'hipótese',
  contradiction: 'contradição',
  question: 'pergunta',
};

type Pos = Record<string, { x: number; y: number }>;

export function EvidenceApp({ winId }: { winId: string }) {
  const { save, setSave, setWinSubtitle, pushToast, notify, openApp } = useGame();
  const payload = useGame((s) => s.appPayload.evidence) as
    | {
        tab?: 'board' | 'puzzles' | 'hypotheses';
        evidenceId?: string;
        puzzleId?: string;
        nonce?: number;
      }
    | undefined;
  const evidenceMeta = useMeta((s) => s.evidence);
  const puzzlesMeta = useMeta((s) => s.puzzles);

  const [tab, setTab] = useState<'board' | 'puzzles' | 'hypotheses'>(payload?.tab ?? 'board');
  const [sel, setSel] = useState<string | null>(payload?.evidenceId ?? null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [pos, setPos] = useState<Pos>({});
  const [notes, setNotes] = useState('');
  const [answer, setAnswer] = useState('');
  const [selPuzzle, setSelPuzzle] = useState<string | null>(payload?.puzzleId ?? null);
  const [hint, setHint] = useState<{ tier?: string; text?: string } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const collected = useMemo(
    () =>
      Object.keys(save?.evidence ?? {})
        .map((id) => evidenceMeta.find((e) => e.id === id) ?? ({ id, kind: 'evidence', title: id, summary: '', chapter: '' } as EvidenceMeta))
        .filter((e) => (kinds.length ? kinds.includes(e.kind) : true))
        .filter((e) =>
          filter ? `${e.id} ${e.title} ${e.summary}`.toLowerCase().includes(filter.toLowerCase()) : true,
        ),
    [save, evidenceMeta, kinds, filter],
  );

  const allKinds = useMemo(
    () => [...new Set(Object.keys(save?.evidence ?? {}).map((id) => evidenceMeta.find((e) => e.id === id)?.kind ?? 'evidence'))],
    [save, evidenceMeta],
  );

  // foco vindo de outro app: notificação, paleta, grafo
  useEffect(() => {
    if (!payload) return;
    if (payload.tab) setTab(payload.tab);
    if (payload.evidenceId) {
      setSel(payload.evidenceId);
      setTab(payload.tab ?? 'board');
    }
    if (payload.puzzleId) {
      setSelPuzzle(payload.puzzleId);
      setTab('puzzles');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.nonce, payload?.tab, payload?.evidenceId, payload?.puzzleId]);

  // posições persistidas por save
  useEffect(() => {
    const stored = (save?.windowLayout?.evidencePositions as Pos) ?? {};
    setPos((p) => ({ ...stored, ...p }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save?.id]);

  useEffect(() => {
    setPos((prev) => {
      const next = { ...prev };
      let i = Object.keys(prev).length;
      for (const e of Object.keys(save?.evidence ?? {})) {
        if (!next[e]) {
          next[e] = {
            x: 40 + (i % 5) * 214,
            y: 30 + Math.floor(i / 5) * 148,
          };
          i += 1;
        }
      }
      return next;
    });
  }, [save?.evidence]);

  const persistPositions = useCallback(
    (next: Pos) => {
      if (!save) return;
      void saveUiState(save.id, { evidencePositions: next });
    },
    [save],
  );

  useEffect(() => {
    setWinSubtitle(winId, `${collected.length} itens · ${save?.links.length ?? 0} vínculos`);
  }, [collected.length, save?.links.length, setWinSubtitle, winId]);

  useEffect(() => on('focus-evidence', ({ id }) => setSel(id)), []);

  useEffect(() => {
    if (!sel || !save) return;
    setNotes(save.evidence[sel]?.notes ?? '');
  }, [sel, save]);

  function drag(id: string, e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = boardRef.current!.getBoundingClientRect();
    const start = pos[id] ?? { x: 0, y: 0 };
    const ox = e.clientX - rect.left - start.x;
    const oy = e.clientY - rect.top - start.y;
    const onMove = (ev: PointerEvent) =>
      setPos((p) => ({
        ...p,
        [id]: {
          x: Math.max(0, ev.clientX - rect.left - ox + boardRef.current!.scrollLeft),
          y: Math.max(0, ev.clientY - rect.top - oy + boardRef.current!.scrollTop),
        },
      }));
    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setPos((p) => {
        persistPositions(p);
        return p;
      });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  async function link(to: string) {
    if (!save || !linkFrom || linkFrom === to) return setLinkFrom(null);
    const label = window.prompt('Rótulo da relação (opcional)') ?? undefined;
    const res = (await addLink(save.id, linkFrom, to, label)) as { save?: typeof save };
    if (res.save) setSave(res.save);
    notify('board', 'Vínculo registrado', 'success');
    setLinkFrom(null);
  }

  async function saveNotes() {
    if (!save || !sel) return;
    const r = await patchEvidence(save.id, sel, { notes });
    setSave(r.save);
    pushToast('Anotação salva', 'success');
  }

  async function setState(state: string) {
    if (!save || !sel) return;
    const r = await patchEvidence(save.id, sel, { state });
    setSave(r.save);
  }

  async function requestHint(puzzleId: string) {
    if (!save) return;
    const h = (await getHint(save.id, puzzleId)) as {
      level?: string;
      tier?: string;
      text?: string;
      error?: string;
    };
    if (h.error) {
      pushToast(h.error, 'warning');
      setHint(null);
      return;
    }
    const level = h.level ?? h.tier ?? 'dica';
    setHint({ tier: level, text: h.text });
    if (h.text) notify('dica', `${level}: ${h.text}`, 'info');
  }

  async function submit(puzzleId: string) {
    if (!answer.trim()) return;
    const r = await runCommand(`submit ${puzzleId} ${answer.trim()}`, 'evidence');
    if (r && (r.completedPuzzles ?? []).includes(puzzleId)) setAnswer('');
    else if (r) pushToast(r.stdout.trim() || 'Resposta registrada', 'info');
  }

  const selMeta = sel ? evidenceMeta.find((e) => e.id === sel) : null;
  const links = save?.links ?? [];
  const puzzleList = puzzlesMeta.filter((p) => save?.puzzles[p.id]);
  const puzzle = selPuzzle ? puzzlesMeta.find((p) => p.id === selPuzzle) : null;

  return (
    <>
      <div className="tabs">
        {(['board', 'puzzles', 'hypotheses'] as const).map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'board' ? 'Quadro' : t === 'puzzles' ? `Investigações (${puzzleList.length})` : 'Hipóteses'}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <>
          <div className="toolbar wrap">
            <span className="dim">
              <IconSearch size={12} />
            </span>
            <input
              className="input"
              style={{ width: 180 }}
              placeholder="filtrar evidências"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="sep" />
            {allKinds.map((k) => (
              <button
                key={k}
                className={`chip${kinds.length && !kinds.includes(k) ? ' off' : ''}`}
                onClick={() => setKinds((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))}
              >
                {KIND_LABEL[k] ?? k}
              </button>
            ))}
            <div className="sep" />
            <button
              className={`btn sm${linkFrom ? ' primary' : ''}`}
              onClick={() => setLinkFrom(linkFrom ? null : sel)}
              disabled={!sel && !linkFrom}
            >
              <IconLink size={11} />
              {linkFrom ? 'escolha o destino…' : 'vincular a partir da seleção'}
            </button>
            <span className="dim tiny" style={{ marginLeft: 'auto' }}>
              arraste os cartões · hipóteses podem coexistir
            </span>
          </div>

          <div className="split">
            <div className="board" ref={boardRef}>
              <svg className="board-links">
                {links.map((l) => {
                  const a = pos[l.from];
                  const b = pos[l.to];
                  if (!a || !b) return null;
                  const contradiction =
                    evidenceMeta.find((e) => e.id === l.from)?.kind === 'contradiction' ||
                    evidenceMeta.find((e) => e.id === l.to)?.kind === 'contradiction';
                  return (
                    <g key={l.id}>
                      <line
                        className={contradiction ? 'contradiction' : ''}
                        x1={a.x + 97}
                        y1={a.y + 40}
                        x2={b.x + 97}
                        y2={b.y + 40}
                      />
                      {l.label && (
                        <text x={(a.x + b.x) / 2 + 97} y={(a.y + b.y) / 2 + 34} textAnchor="middle">
                          {l.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {collected.map((e) => {
                const p = pos[e.id] ?? { x: 20, y: 20 };
                const state = save?.evidence[e.id]?.state ?? 'observed';
                return (
                  <div
                    key={e.id}
                    className={`board-card${sel === e.id ? ' selected' : ''}${
                      linkFrom === e.id ? ' linking' : ''
                    }`}
                    style={{ left: p.x, top: p.y }}
                    onPointerDown={(ev) => drag(e.id, ev)}
                    onClick={() => (linkFrom ? void link(e.id) : setSel(e.id))}
                  >
                    <header>
                      <span>{KIND_LABEL[e.kind] ?? e.kind}</span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          color:
                            state === 'confirmed'
                              ? 'var(--ok)'
                              : state === 'contradicted'
                                ? 'var(--err)'
                                : state === 'related'
                                  ? 'var(--accent-soft)'
                                  : 'var(--dim)',
                        }}
                      >
                        {state}
                      </span>
                    </header>
                    <div className="title">{e.title}</div>
                    {e.summary && <div className="sum">{e.summary.slice(0, 96)}</div>}
                  </div>
                );
              })}
              {collected.length === 0 && (
                <div className="empty-state">
                  Nenhuma evidência coletada ainda. Abra os briefings em
                  <span className="mono"> /home/null/investigation</span>.
                </div>
              )}
            </div>

            <div className="pane bordered-l" style={{ width: 300, flex: '0 0 300px' }}>
              <div className="pane-head">Inspetor</div>
              {!selMeta ? (
                <div className="empty-state">Selecione um cartão do quadro.</div>
              ) : (
                <div className="pane-scroll">
                  <dl className="kv">
                    <dt>id</dt>
                    <dd>{selMeta.id}</dd>
                    <dt>tipo</dt>
                    <dd>{KIND_LABEL[selMeta.kind] ?? selMeta.kind}</dd>
                    <dt>camada</dt>
                    <dd>{selMeta.chapter}</dd>
                    <dt>estado</dt>
                    <dd>{save?.evidence[selMeta.id]?.state}</dd>
                  </dl>
                  <div className="panel" style={{ paddingTop: 0 }}>
                    {selMeta.summary}
                    {selMeta.body && (
                      <pre className="code-pane" style={{ marginTop: 8, maxHeight: 200 }}>
                        {selMeta.body}
                      </pre>
                    )}
                  </div>
                  <div className="pane-head">Estado analítico</div>
                  <div className="toolbar wrap">
                    {(['observed', 'related', 'confirmed', 'contradicted', 'discarded'] as const).map(
                      (s) => (
                        <button key={s} className="btn sm" onClick={() => void setState(s)}>
                          {s}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="pane-head">Anotações</div>
                  <div style={{ padding: 'var(--s2)' }}>
                    <textarea
                      className="input mono"
                      style={{ width: '100%', height: 90, padding: 8 }}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="correlações, hipóteses, caminhos…"
                    />
                    <button className="btn sm primary" style={{ marginTop: 6 }} onClick={() => void saveNotes()}>
                      salvar anotação
                    </button>
                  </div>
                  <div className="pane-head">Vínculos</div>
                  {links
                    .filter((l) => l.from === selMeta.id || l.to === selMeta.id)
                    .map((l) => (
                      <div key={l.id} className="log-line">
                        <span>
                          {l.from === selMeta.id ? '→' : '←'}{' '}
                          {evidenceMeta.find(
                            (e) => e.id === (l.from === selMeta.id ? l.to : l.from),
                          )?.title ?? (l.from === selMeta.id ? l.to : l.from)}
                          {l.label ? ` · ${l.label}` : ''}
                        </span>
                        <button
                          className="btn sm ghost"
                          style={{ marginLeft: 'auto' }}
                          onClick={async () => {
                            if (!save) return;
                            const r = await removeLink(save.id, l.id);
                            if (r.save) setSave(r.save);
                          }}
                        >
                          remover
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'puzzles' && (
        <div className="split">
          <div className="pane" style={{ flex: 1 }}>
            <div className="pane-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 72 }}>ID</th>
                    <th>Investigação</th>
                    <th style={{ width: 92 }}>Camada</th>
                    <th style={{ width: 92 }}>Estado</th>
                    <th style={{ width: 60, textAlign: 'right' }}>Dicas</th>
                  </tr>
                </thead>
                <tbody>
                  {puzzleList.map((p) => {
                    const st = save?.puzzles[p.id];
                    return (
                      <tr
                        key={p.id}
                        className={selPuzzle === p.id ? 'selected' : ''}
                        onClick={() => {
                          setSelPuzzle(p.id);
                          setHint(null);
                        }}
                      >
                        <td>{p.id}</td>
                        <td>{p.title}</td>
                        <td className="dim">{p.chapter}</td>
                        <td
                          style={{
                            color:
                              st?.status === 'completed'
                                ? 'var(--ok)'
                                : st?.status === 'available'
                                  ? 'var(--accent-soft)'
                                  : 'var(--dim)',
                          }}
                        >
                          {st?.status ?? 'locked'}
                        </td>
                        <td className="num">{st?.hintsUsed ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pane bordered-l" style={{ width: 330, flex: '0 0 330px' }}>
            <div className="pane-head">Briefing</div>
            {!puzzle ? (
              <div className="empty-state">
                Selecione uma investigação. Os arquivos de apoio ficam em
                <span className="mono"> /home/null/investigation</span>.
              </div>
            ) : (
              <div className="pane-scroll">
                <div className="panel">
                  <div className="upper tiny dim">{puzzle.id}</div>
                  <div style={{ color: 'var(--text)', margin: '4px 0 8px' }}>{puzzle.title}</div>
                  <div style={{ lineHeight: 1.7 }}>
                    {puzzle.narrativeGoal ?? puzzle.brief ?? puzzle.description ?? '—'}
                  </div>
                </div>
                <dl className="kv">
                  <dt>capítulo</dt>
                  <dd>{puzzle.chapter}</dd>
                  <dt>estado</dt>
                  <dd>{save?.puzzles[puzzle.id]?.status}</dd>
                  <dt>entrega</dt>
                  <dd>
                    {puzzle.acceptsSubmit
                      ? 'submit no Terminal ou aqui'
                      : 'estado (abrir artefatos / correlacionar)'}
                  </dd>
                </dl>
                <div className="toolbar wrap">
                  <button
                    className="btn sm"
                    onClick={() =>
                      openApp('files', {
                        path: puzzle.cluePath ?? `/home/null/investigation/${puzzle.chapter}/${puzzle.id}`,
                      })
                    }
                  >
                    abrir pasta
                  </button>
                  <button className="btn sm" onClick={() => void requestHint(puzzle.id)}>
                    pedir dica
                  </button>
                </div>
                {hint?.text && (
                  <div className="panel">
                    <div className="chip warn">{hint.tier ?? 'dica'}</div>
                    <div style={{ marginTop: 6, lineHeight: 1.7 }}>{hint.text}</div>
                  </div>
                )}
                <div className="pane-head">Resposta</div>
                <div style={{ padding: 'var(--s2)', display: 'flex', gap: 6 }}>
                  <input
                    className="input mono"
                    style={{ flex: 1 }}
                    placeholder={
                      puzzle.acceptsSubmit
                        ? `submit ${puzzle.id} <resposta>`
                        : 'este caso não usa submit'
                    }
                    value={answer}
                    disabled={!puzzle.acceptsSubmit}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void submit(puzzle.id)}
                  />
                  <button
                    className="btn sm primary"
                    disabled={!puzzle.acceptsSubmit}
                    onClick={() => void submit(puzzle.id)}
                  >
                    enviar
                  </button>
                </div>
                <div className="panel dim tiny">
                  {puzzle.acceptsSubmit
                    ? 'No Terminal: submit P-XXX resposta — a validação é de estado, não de sequência.'
                    : 'Complete abrindo artefatos e correlacionando evidências. A validação é de estado.'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'hypotheses' && (
        <div className="split">
          <div className="pane" style={{ flex: 1 }}>
            <div className="pane-head">Hipóteses e contradições coexistentes</div>
            <div className="pane-scroll">
              {collected
                .filter((e) => ['hypothesis', 'contradiction', 'question'].includes(e.kind))
                .map((e) => {
                  const state = save?.evidence[e.id]?.state;
                  return (
                    <div key={e.id} className="panel" style={{ borderBottom: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className={`chip ${e.kind === 'contradiction' ? 'err' : 'accent'}`}>
                          {KIND_LABEL[e.kind]}
                        </span>
                        <span style={{ color: 'var(--text)' }}>{e.title}</span>
                        <span className="chip" style={{ marginLeft: 'auto' }}>
                          {state}
                        </span>
                      </div>
                      <div className="dim" style={{ marginTop: 6, lineHeight: 1.7 }}>
                        {e.summary}
                      </div>
                      {save?.evidence[e.id]?.notes && (
                        <pre className="code-pane" style={{ marginTop: 8 }}>
                          {save.evidence[e.id].notes}
                        </pre>
                      )}
                    </div>
                  );
                })}
              {collected.filter((e) => ['hypothesis', 'contradiction', 'question'].includes(e.kind))
                .length === 0 && (
                <div className="empty-state">
                  Nenhuma hipótese registrada. Elas surgem ao correlacionar evidências.
                </div>
              )}
            </div>
          </div>
          <div className="pane bordered-l" style={{ width: 260, flex: '0 0 260px' }}>
            <div className="pane-head">Regra das duas fontes</div>
            <div className="panel dim" style={{ lineHeight: 1.8 }}>
              Uma revelação crítica só se sustenta com duas evidências independentes mais uma
              correlação explícita feita por você. O quadro aceita hipóteses concorrentes ao mesmo
              tempo — descartar é uma decisão sua, não do sistema.
              <div className="hairline" style={{ margin: '12px 0' }} />
              <div className="orph-row">
                <span>evidências</span>
                <b>{Object.keys(save?.evidence ?? {}).length}</b>
              </div>
              <div className="orph-row">
                <span>vínculos manuais</span>
                <b>{links.length}</b>
              </div>
              <div className="orph-row">
                <span>confirmadas</span>
                <b>
                  {Object.values(save?.evidence ?? {}).filter((e) => e.state === 'confirmed').length}
                </b>
              </div>
              <div className="orph-row">
                <span>contraditas</span>
                <b>
                  {
                    Object.values(save?.evidence ?? {}).filter((e) => e.state === 'contradicted')
                      .length
                  }
                </b>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
