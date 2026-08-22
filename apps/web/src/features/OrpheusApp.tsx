import { useEffect, useState } from 'react';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconRefresh } from '../shell/Icons';

export function OrpheusApp({ winId }: { winId: string }) {
  const save = useGame((s) => s.save);
  const setWinSubtitle = useGame((s) => s.setWinSubtitle);
  const telemetry = useMeta((s) => s.telemetry);
  const refreshTelemetry = useMeta((s) => s.refreshTelemetry);
  const [tab, setTab] = useState<'panel' | 'correlation' | 'raw'>('panel');

  useEffect(() => {
    if (!telemetry && save) void refreshTelemetry(save.id);
  }, [telemetry, save, refreshTelemetry]);

  const o = telemetry?.orpheus;

  useEffect(() => {
    setWinSubtitle(winId, o ? `integridade ${o.integrity}%` : 'offline');
  }, [o, setWinSubtitle, winId]);

  if (!o) {
    return <div className="empty-state">Painel ORPHEUS indisponível nesta sessão.</div>;
  }

  const active = o.collectors.filter((c) => c.state === 'ACTIVE').length;
  const failed = o.collectors.filter((c) => c.state === 'FAILED').length;

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-label">orpheus</span>
        <span className="chip">v0.9.13</span>
        <span className="chip ok">uptime {o.uptime}</span>
        <span className="chip info">sync {o.lastSync}</span>
        <span className={`chip ${failed ? 'err' : 'ok'}`}>
          coletores {active}/{o.collectors.length}
        </span>
        <div className="sep" />
        <div className="seg">
          {(['panel', 'correlation', 'raw'] as const).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'panel' ? 'painel' : t === 'correlation' ? 'correlação' : 'bruto'}
            </button>
          ))}
        </div>
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => save && void refreshTelemetry(save.id)}
          title="Ressincronizar"
        >
          <IconRefresh size={13} />
        </button>
      </div>

      {tab === 'panel' && (
        <div className="orph-grid">
          <div className="orph-cell">
            <h4>coletores</h4>
            {o.collectors.map((c) => (
              <div className="orph-row" key={c.id}>
                <span>{c.id}</span>
                <b
                  style={{
                    color:
                      c.state === 'FAILED'
                        ? 'var(--err)'
                        : c.state === 'IDLE'
                          ? 'var(--muted)'
                          : 'var(--ok)',
                  }}
                >
                  {c.state}
                </b>
              </div>
            ))}
          </div>

          <div className="orph-cell">
            <h4>fila</h4>
            {o.collectors.map((c) => (
              <div className="orph-row" key={c.id}>
                <span>{c.id}</span>
                <b>{c.queued}</b>
              </div>
            ))}
          </div>

          <div className="orph-cell">
            <h4>throughput (msg/s)</h4>
            {o.collectors.map((c) => (
              <div key={c.id} style={{ marginBottom: 5 }}>
                <div className="orph-row">
                  <span>{c.id}</span>
                  <b>{c.rate.toFixed(1)}</b>
                </div>
                <div className="meter">
                  <i style={{ width: `${Math.min(100, c.rate)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="orph-cell">
            <h4>sinais</h4>
            {o.signals.map((s) => (
              <div className="orph-row" key={s.id}>
                <span>
                  {s.id} <span className="dim">{s.label}</span>
                </span>
                <b style={{ color: s.score > 70 ? 'var(--warn)' : undefined }}>
                  {s.score.toFixed(2)}
                </b>
              </div>
            ))}
          </div>

          <div className="orph-cell">
            <h4>deriva</h4>
            {o.signals.map((s) => (
              <div className="orph-row" key={s.id}>
                <span>{s.id}</span>
                <b style={{ color: s.drift < 0 ? 'var(--err)' : 'var(--ok)' }}>
                  {s.drift > 0 ? '+' : ''}
                  {s.drift.toFixed(2)}
                </b>
              </div>
            ))}
          </div>

          <div className="orph-cell">
            <h4>estado do coletor agregado</h4>
            <div className="spark">
              {o.series.map((v, i) => (
                <i key={i} style={{ height: `${Math.max(2, v)}%` }} />
              ))}
            </div>
            <div className="orph-row" style={{ marginTop: 8 }}>
              <span>integridade</span>
              <b>{o.integrity}%</b>
            </div>
            <div className="orph-row">
              <span>janelas nulas</span>
              <b>{o.series.filter((v) => v < 6).length}</b>
            </div>
            <div className="orph-row">
              <span>picos</span>
              <b>{o.series.filter((v) => v > 92).length}</b>
            </div>
          </div>
        </div>
      )}

      {tab === 'correlation' && (
        <div className="pane-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Sinal</th>
                <th>Rótulo</th>
                <th style={{ textAlign: 'right' }}>Score</th>
                <th style={{ textAlign: 'right' }}>Deriva</th>
                <th>Coletores associados</th>
              </tr>
            </thead>
            <tbody>
              {o.signals.map((s, i) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td className="dim">{s.label}</td>
                  <td className="num">{s.score.toFixed(2)}</td>
                  <td className="num" style={{ color: s.drift < 0 ? 'var(--err)' : 'var(--ok)' }}>
                    {s.drift.toFixed(2)}
                  </td>
                  <td className="dim">
                    {o.collectors
                      .filter((_, ci) => (ci + i) % 3 === 0)
                      .map((c) => c.id)
                      .join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="panel dim tiny">
            ORPHEUS não interpreta. Ele mede. A correlação acima é estatística, não semântica.
          </div>
        </div>
      )}

      {tab === 'raw' && (
        <pre className="code-pane">{JSON.stringify(o, null, 2)}</pre>
      )}
    </>
  );
}
