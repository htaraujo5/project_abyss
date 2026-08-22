import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconRefresh, IconSearch } from '../shell/Icons';

export function MemoryApp({ winId }: { winId: string }) {
  const save = useGame((s) => s.save);
  const setWinSubtitle = useGame((s) => s.setWinSubtitle);
  const telemetry = useMeta((s) => s.telemetry);
  const refreshTelemetry = useMeta((s) => s.refreshTelemetry);
  const [sel, setSel] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!telemetry && save) void refreshTelemetry(save.id);
  }, [telemetry, save, refreshTelemetry]);

  const regions = telemetry?.memory ?? [];
  const region = regions[sel];

  useEffect(() => {
    setWinSubtitle(winId, region ? `${region.label} @ ${region.addr}` : '');
  }, [region, setWinSubtitle, winId]);

  const strings = useMemo(() => {
    if (!region) return [];
    const found = new Set<string>();
    for (const line of region.dump.split('\n')) {
      const ascii = line.slice(-16);
      for (const m of ascii.match(/[\x20-\x7e]{4,}/g) ?? []) found.add(m);
    }
    return [...found];
  }, [region]);

  const dumpLines = region
    ? region.dump.split('\n').filter((l) => !q || l.toLowerCase().includes(q.toLowerCase()))
    : [];

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-label">processo</span>
        <span className="chip accent">null-machine · pid 1</span>
        <div className="sep" />
        <span className="dim">
          <IconSearch size={12} />
        </span>
        <input
          className="input mono"
          style={{ width: 200 }}
          placeholder="buscar no dump"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          title="Reanexar processo"
          onClick={() => save && void refreshTelemetry(save.id)}
        >
          <IconRefresh size={13} />
        </button>
      </div>

      <div className="split">
        <div className="pane bordered-r" style={{ width: 236, flex: '0 0 236px' }}>
          <div className="pane-head">Regiões mapeadas</div>
          <div className="pane-scroll tree">
            {regions.map((r, i) => (
              <div
                key={r.addr}
                className={`tree-row${i === sel ? ' selected' : ''}`}
                onClick={() => setSel(i)}
              >
                <span className="mono" style={{ color: 'var(--muted)' }}>
                  {r.addr}
                </span>
                <span className="mono">{r.label}</span>
                <span className="dim tiny" style={{ marginLeft: 'auto' }}>
                  {r.perms}
                </span>
              </div>
            ))}
          </div>
          <div className="pane-head" style={{ borderTop: '1px solid var(--line)' }}>
            Strings visíveis
          </div>
          <div className="pane-scroll">
            {strings.map((s) => (
              <div key={s} className="log-line" onClick={() => setQ(s)}>
                <span>{s}</span>
              </div>
            ))}
            {strings.length === 0 && (
              <div className="empty-state" style={{ padding: 16 }}>
                Nenhuma cadeia legível.
              </div>
            )}
          </div>
        </div>

        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-head">
            {region ? `${region.addr} · ${(region.size / 1024).toFixed(0)} KiB · ${region.perms}` : 'sem região'}
          </div>
          <div className="hex-grid">
            {dumpLines.map((l, i) => {
              const off = l.slice(0, 12);
              const hex = l.slice(14, 14 + 47);
              const ascii = l.slice(-16);
              return (
                <div className="hex-row" key={i}>
                  <span className="off">{off}</span>
                  <span className="bytes">{hex}</span>
                  <span className="ascii">{ascii}</span>
                </div>
              );
            })}
            {dumpLines.length === 0 && (
              <div className="empty-state">Nada corresponde a "{q}" nesta região.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
