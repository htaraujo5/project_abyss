import { useEffect, useMemo, useState } from 'react';
import type { PacketFrame } from '../lib/api';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconRefresh, IconSearch } from '../shell/Icons';

function hexRows(payload: string) {
  const bytes = payload.match(/.{2}/g) ?? [];
  const rows: { off: string; hex: string; ascii: string }[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    rows.push({
      off: (i).toString(16).padStart(8, '0'),
      hex: slice.join(' ').padEnd(47, ' '),
      ascii: slice
        .map((b) => {
          const v = parseInt(b, 16);
          return v >= 32 && v < 127 ? String.fromCharCode(v) : '.';
        })
        .join(''),
    });
  }
  return rows;
}

export function PacketApp({ winId }: { winId: string }) {
  const save = useGame((s) => s.save);
  const setWinSubtitle = useGame((s) => s.setWinSubtitle);
  const telemetry = useMeta((s) => s.telemetry);
  const refreshTelemetry = useMeta((s) => s.refreshTelemetry);
  const [sel, setSel] = useState<PacketFrame | null>(null);
  const [proto, setProto] = useState<string>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!telemetry && save) void refreshTelemetry(save.id);
  }, [telemetry, save, refreshTelemetry]);

  const packets = telemetry?.packets ?? [];
  const protos = useMemo(() => ['all', ...new Set(packets.map((p) => p.proto))], [packets]);
  const rows = packets.filter(
    (p) =>
      (proto === 'all' || p.proto === proto) &&
      (!q || `${p.src} ${p.dst} ${p.info}`.toLowerCase().includes(q.toLowerCase())),
  );

  useEffect(() => {
    setWinSubtitle(winId, `${rows.length} frames`);
  }, [rows.length, setWinSubtitle, winId]);

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-label">captura</span>
        <div className="seg">
          {protos.map((p) => (
            <button key={p} className={proto === p ? 'on' : ''} onClick={() => setProto(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="sep" />
        <span className="dim">
          <IconSearch size={12} />
        </span>
        <input
          className="input mono"
          style={{ width: 220 }}
          placeholder="host, porta, conteúdo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => save && void refreshTelemetry(save.id)}
          title="Recapturar"
        >
          <IconRefresh size={13} />
        </button>
      </div>

      <div className="split col">
        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 46 }}>#</th>
                  <th style={{ width: 78 }}>Tempo</th>
                  <th style={{ width: 118 }}>Origem</th>
                  <th style={{ width: 118 }}>Destino</th>
                  <th style={{ width: 60 }}>Proto</th>
                  <th style={{ width: 60, textAlign: 'right' }}>Bytes</th>
                  <th>Info</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.no} className={sel?.no === p.no ? 'selected' : ''} onClick={() => setSel(p)}>
                    <td className="dim">{p.no}</td>
                    <td className="dim">{p.ts.toFixed(2)}</td>
                    <td>{p.src}</td>
                    <td>{p.dst}</td>
                    <td
                      style={{
                        color: p.proto === 'TLS' || p.proto === 'WS' ? 'var(--accent-soft)' : 'inherit',
                      }}
                    >
                      {p.proto}
                    </td>
                    <td className="num">{p.len}</td>
                    <td className="dim">{p.info}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pane bordered-t" style={{ height: 216, flex: '0 0 216px' }}>
          <div className="pane-head">
            {sel ? `frame ${sel.no} — ${sel.len} bytes` : 'payload'}
          </div>
          {!sel ? (
            <div className="empty-state">Selecione um frame para inspecionar os bytes.</div>
          ) : (
            <div className="split">
              <div className="hex-grid" style={{ flex: 1 }}>
                {hexRows(sel.payload).map((r) => (
                  <div className="hex-row" key={r.off}>
                    <span className="off">{r.off}</span>
                    <span className="bytes">{r.hex}</span>
                    <span className="ascii">{r.ascii}</span>
                  </div>
                ))}
              </div>
              <div className="pane bordered-l" style={{ width: 260, flex: '0 0 260px' }}>
                <dl className="kv">
                  <dt>frame</dt>
                  <dd>{sel.no}</dd>
                  <dt>tempo</dt>
                  <dd>{sel.ts.toFixed(2)}s</dd>
                  <dt>origem</dt>
                  <dd>{sel.src}</dd>
                  <dt>destino</dt>
                  <dd>{sel.dst}</dd>
                  <dt>protocolo</dt>
                  <dd>{sel.proto}</dd>
                  <dt>tamanho</dt>
                  <dd>{sel.len} bytes</dd>
                  <dt>info</dt>
                  <dd>{sel.info}</dd>
                </dl>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
