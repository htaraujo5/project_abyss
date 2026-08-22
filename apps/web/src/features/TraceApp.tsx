import { useEffect, useMemo, useState } from 'react';
import type { TraceEvent } from '../lib/api';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconFilter, IconRefresh, IconSearch } from '../shell/Icons';

const LEVELS: TraceEvent['level'][] = ['info', 'warn', 'error', 'debug'];

export function TraceApp({ winId }: { winId: string }) {
  const save = useGame((s) => s.save);
  const setWinSubtitle = useGame((s) => s.setWinSubtitle);
  const telemetry = useMeta((s) => s.telemetry);
  const refreshTelemetry = useMeta((s) => s.refreshTelemetry);

  const [services, setServices] = useState<string[]>([]);
  const [levels, setLevels] = useState<TraceEvent['level'][]>([...LEVELS]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<TraceEvent | null>(null);
  const [correlate, setCorrelate] = useState<string | null>(null);
  const [minLatency, setMinLatency] = useState(0);
  const payload = useGame((s) => s.appPayload.trace) as
    | { service?: string; traceId?: string; query?: string; nonce?: number }
    | undefined;

  useEffect(() => {
    if (!telemetry && save) void refreshTelemetry(save.id);
  }, [telemetry, save, refreshTelemetry]);

  const all = telemetry?.trace ?? [];
  const allServices = useMemo(() => [...new Set(all.map((e) => e.service))].sort(), [all]);

  useEffect(() => {
    setServices(allServices);
  }, [allServices.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // chegada de outro app (ex. "ver no Trace" do Graph) aplica o filtro pedido
  useEffect(() => {
    if (!payload) return;
    if (payload.service) setServices(allServices.includes(payload.service) ? [payload.service] : allServices);
    if (payload.traceId) setCorrelate(payload.traceId);
    if (payload.query) setQ(payload.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.nonce, payload?.service, payload?.traceId, allServices.join(',')]);

  const rows = useMemo(
    () =>
      all.filter((e) => {
        if (!services.includes(e.service)) return false;
        if (!levels.includes(e.level)) return false;
        if (correlate && e.traceId !== correlate) return false;
        if (Math.abs(e.latency) < minLatency) return false;
        if (q && !`${e.service} ${e.event} ${e.detail} ${e.traceId}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        return true;
      }),
    [all, services, levels, q, correlate, minLatency],
  );

  useEffect(() => {
    setWinSubtitle(winId, `${rows.length}/${all.length} eventos`);
  }, [rows.length, all.length, setWinSubtitle, winId]);

  return (
    <>
      <div className="toolbar wrap">
        <span className="toolbar-label">
          <IconFilter size={11} /> serviços
        </span>
        {allServices.map((s) => (
          <button
            key={s}
            className={`chip${services.includes(s) ? '' : ' off'}`}
            onClick={() =>
              setServices((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))
            }
          >
            {s}
          </button>
        ))}
        <div className="sep" />
        {LEVELS.map((l) => (
          <button
            key={l}
            className={`chip ${l === 'error' ? 'err' : l === 'warn' ? 'warn' : l === 'debug' ? 'unknown' : 'info'}${
              levels.includes(l) ? '' : ' off'
            }`}
            onClick={() => setLevels((v) => (v.includes(l) ? v.filter((x) => x !== l) : [...v, l]))}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <span className="dim">
          <IconSearch size={12} />
        </span>
        <input
          className="input mono"
          style={{ width: 240 }}
          placeholder="filtrar por serviço, evento, span, host…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="sep" />
        <span className="toolbar-label">latência ≥ {minLatency}ms</span>
        <input
          className="slider"
          type="range"
          min={0}
          max={200}
          value={minLatency}
          onChange={(e) => setMinLatency(Number(e.target.value))}
          style={{ width: 110 }}
        />
        {correlate && (
          <>
            <div className="sep" />
            <span className="chip accent">trace {correlate}</span>
            <button className="btn sm ghost" onClick={() => setCorrelate(null)}>
              limpar correlação
            </button>
          </>
        )}
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          title="Recarregar stream"
          onClick={() => save && void refreshTelemetry(save.id)}
        >
          <IconRefresh size={13} />
        </button>
      </div>

      <div className="split">
        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Tempo</th>
                  <th style={{ width: 130 }}>Serviço</th>
                  <th style={{ width: 110 }}>Evento</th>
                  <th style={{ width: 74, textAlign: 'right' }}>Latência</th>
                  <th style={{ width: 74 }}>Trace</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className={selected?.id === e.id ? 'selected' : ''}
                    onClick={() => setSelected(e)}
                    onDoubleClick={() => setCorrelate(e.traceId)}
                  >
                    <td className="dim">{e.ts}</td>
                    <td>{e.service}</td>
                    <td
                      style={{
                        color:
                          e.level === 'error'
                            ? 'var(--err)'
                            : e.level === 'warn'
                              ? 'var(--warn)'
                              : e.level === 'debug'
                                ? 'var(--dim)'
                                : 'inherit',
                      }}
                    >
                      {e.event}
                    </td>
                    <td className="num">{e.latency.toFixed(1)}</td>
                    <td className="dim">{e.traceId}</td>
                    <td className="dim">{e.detail}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="dim" style={{ padding: 16 }}>
                      Nenhum evento com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pane bordered-l" style={{ width: 288, flex: '0 0 288px' }}>
          <div className="pane-head">Inspetor de evento</div>
          {!selected ? (
            <div className="empty-state">
              Selecione um evento.
              <br />
              <span className="dim">Duplo clique correlaciona todo o trace.</span>
            </div>
          ) : (
            <div className="pane-scroll">
              <dl className="kv">
                <dt>timestamp</dt>
                <dd>{selected.ts}</dd>
                <dt>serviço</dt>
                <dd>{selected.service}</dd>
                <dt>evento</dt>
                <dd>{selected.event}</dd>
                <dt>nível</dt>
                <dd>{selected.level}</dd>
                <dt>latência</dt>
                <dd>{selected.latency} ms</dd>
                <dt>trace</dt>
                <dd>{selected.traceId}</dd>
                <dt>detalhe</dt>
                <dd>{selected.detail}</dd>
              </dl>
              <div className="toolbar wrap">
                <button className="btn sm" onClick={() => setCorrelate(selected.traceId)}>
                  correlacionar trace
                </button>
                <button className="btn sm" onClick={() => setQ(selected.service)}>
                  filtrar serviço
                </button>
              </div>
              <div className="pane-head">Vizinhança temporal</div>
              <div>
                {all
                  .filter((e) => Math.abs(e.epoch - selected.epoch) < 4000)
                  .slice(0, 40)
                  .map((e) => (
                    <div
                      key={e.id}
                      className={`log-line ${
                        e.level === 'error' ? 'err' : e.level === 'warn' ? 'warn' : ''
                      }`}
                      onClick={() => setSelected(e)}
                    >
                      <span className="ts">{e.ts.slice(0, 8)}</span>
                      <span>
                        {e.service} {e.event}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="statusbar" style={{ height: 20 }}>
        <span className="sb-item">{rows.length} de {all.length} eventos</span>
        <span className="sb-item">
          warn {rows.filter((r) => r.level === 'warn').length} · error{' '}
          {rows.filter((r) => r.level === 'error').length}
        </span>
        <span className="sb-spacer" />
        <span className="sb-item">
          latência média{' '}
          {rows.length
            ? (rows.reduce((a, b) => a + b.latency, 0) / rows.length).toFixed(1)
            : '0.0'}
          ms
        </span>
      </div>
    </>
  );
}
