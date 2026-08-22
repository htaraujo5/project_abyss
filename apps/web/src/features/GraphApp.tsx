import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconRefresh } from '../shell/Icons';

type Node = { id: string; label: string; kind: string; x: number; y: number };
type Edge = { from: string; to: string; label?: string; weight: number };

function layout(nodes: Node[], edges: Edge[], w: number, h: number): Node[] {
  const pos = nodes.map((n, i) => ({
    ...n,
    x: w / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * Math.min(w, h) * 0.34,
    y: h / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * Math.min(w, h) * 0.34,
  }));
  const idx = new Map(pos.map((n, i) => [n.id, i]));
  for (let it = 0; it < 160; it++) {
    const fx = new Array(pos.length).fill(0);
    const fy = new Array(pos.length).fill(0);
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d2 = Math.max(400, dx * dx + dy * dy);
        const f = 90000 / d2;
        const d = Math.sqrt(d2);
        fx[i] += (dx / d) * f;
        fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f;
        fy[j] -= (dy / d) * f;
      }
    }
    for (const e of edges) {
      const a = idx.get(e.from);
      const b = idx.get(e.to);
      if (a == null || b == null) continue;
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - 150) * 0.012 * Math.min(3, e.weight);
      fx[a] += (dx / d) * f;
      fy[a] += (dy / d) * f;
      fx[b] -= (dx / d) * f;
      fy[b] -= (dy / d) * f;
    }
    for (let i = 0; i < pos.length; i++) {
      pos[i].x = Math.max(70, Math.min(w - 70, pos[i].x + fx[i] * 0.5));
      pos[i].y = Math.max(40, Math.min(h - 40, pos[i].y + fy[i] * 0.5));
    }
  }
  return pos;
}

export function GraphApp({ winId }: { winId: string }) {
  const { save, openApp, setWinSubtitle } = useGame();
  const telemetry = useMeta((s) => s.telemetry);
  const evidence = useMeta((s) => s.evidence);
  const refreshTelemetry = useMeta((s) => s.refreshTelemetry);
  const [view, setView] = useState<'technical' | 'investigative'>('technical');
  const [sel, setSel] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const hostRef = useRef<HTMLDivElement>(null);
  const win = useGame((s) => s.windows.find((w) => w.id === winId));

  useEffect(() => {
    if (!telemetry && save) void refreshTelemetry(save.id);
  }, [telemetry, save, refreshTelemetry]);

  const model = useMemo(() => {
    const ns: Node[] = [];
    const es: Edge[] = [];
    if (view === 'technical') {
      const services = [...new Set((telemetry?.trace ?? []).map((t) => t.service))];
      for (const s of services) {
        const errors = (telemetry?.trace ?? []).filter(
          (t) => t.service === s && t.level === 'error',
        ).length;
        ns.push({
          id: s,
          label: s,
          kind: s.includes('unknown') || s === 'shadow' || s === 'meta' ? 'anomaly' : errors ? 'org' : 'system',
          x: 0,
          y: 0,
        });
      }
      // adjacência temporal: eventos próximos no tempo sugerem chamadas entre serviços
      const pairs = new Map<string, number>();
      const stream = telemetry?.trace ?? [];
      for (let i = 1; i < stream.length; i++) {
        const a = stream[i - 1];
        const b = stream[i];
        if (a.service === b.service) continue;
        if (b.epoch - a.epoch > 900) continue;
        const key = [a.service, b.service].sort().join('|');
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
      for (const [key, w] of [...pairs]) {
        if (w < 3) pairs.delete(key);
      }
      // hosts citados nos detalhes: `svc.internal` colapsa no próprio serviço,
      // hosts sem serviço correspondente entram como organizações externas
      for (const t of telemetry?.trace ?? []) {
        for (const m of t.detail.matchAll(/(?:host|upstream|via|origin)=([a-z0-9.\-]+)/g)) {
          const raw = m[1];
          const base = raw.replace(/\.internal$/, '');
          const id = services.includes(base) ? base : raw;
          if (id === t.service) continue;
          if (!ns.find((n) => n.id === id)) {
            ns.push({
              id,
              label: id,
              kind: id.includes('unknown') || id === 'self' ? 'anomaly' : 'org',
              x: 0,
              y: 0,
            });
          }
          const key = [t.service, id].sort().join('|');
          pairs.set(key, (pairs.get(key) ?? 0) + 3);
        }
      }
      for (const [key, weight] of pairs) {
        const [a, b] = key.split('|');
        if (a === b) continue;
        es.push({ from: a, to: b, weight });
      }
    } else {
      for (const id of Object.keys(save?.evidence ?? {})) {
        const meta = evidence.find((e) => e.id === id);
        ns.push({
          id,
          label: meta?.title ?? id,
          kind: meta?.kind ?? 'evidence',
          x: 0,
          y: 0,
        });
      }
      for (const l of save?.links ?? []) {
        es.push({ from: l.from, to: l.to, label: l.label, weight: 1 });
      }
    }
    return { ns, es };
  }, [view, telemetry, save, evidence]);

  useEffect(() => {
    const w = hostRef.current?.clientWidth ?? 800;
    const h = hostRef.current?.clientHeight ?? 480;
    setNodes(layout(model.ns, model.es, w, h));
    setWinSubtitle(winId, `${model.ns.length} nós · ${model.es.length} arestas`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, win?.w, win?.h]);

  function drag(id: string, e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = hostRef.current!.getBoundingClientRect();
    const onMove = (ev: PointerEvent) =>
      setNodes((v) =>
        v.map((n) => (n.id === id ? { ...n, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : n)),
      );
    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  const selNode = nodes.find((n) => n.id === sel);
  const neighbors = model.es
    .filter((e) => e.from === sel || e.to === sel)
    .map((e) => (e.from === sel ? e.to : e.from));

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button
            className={view === 'technical' ? 'on' : ''}
            onClick={() => setView('technical')}
            title="Topologia técnica: serviços e hosts da telemetria"
          >
            técnica
          </button>
          <button
            className={view === 'investigative' ? 'on' : ''}
            onClick={() => setView('investigative')}
            title="Visão investigativa: evidências e vínculos do quadro"
          >
            investigativa
          </button>
        </div>
        <div className="sep" />
        <span className="chip ok">sistema</span>
        <span className="chip warn">com falhas</span>
        <span className="chip encrypted">anômalo</span>
        <span className="chip info">pessoa</span>
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          title="Recalcular layout"
          onClick={() => {
            const w = hostRef.current?.clientWidth ?? 800;
            const h = hostRef.current?.clientHeight ?? 480;
            setNodes(layout(model.ns, model.es, w, h));
          }}
        >
          <IconRefresh size={13} />
        </button>
      </div>

      <div className="split">
        <div className="graph-canvas" ref={hostRef} onClick={() => setSel(null)}>
          <svg className="board-links">
            {model.es.map((e, i) => {
              const a = nodes.find((n) => n.id === e.from);
              const b = nodes.find((n) => n.id === e.to);
              if (!a || !b) return null;
              const active = sel === e.from || sel === e.to;
              return (
                <g key={i}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    strokeWidth={active ? 1.6 : Math.min(2, 0.5 + e.weight / 8)}
                    stroke={
                      active
                        ? 'color-mix(in srgb, var(--accent) 85%, transparent)'
                        : 'color-mix(in srgb, var(--accent) 26%, transparent)'
                    }
                  />
                  {e.label && (
                    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle">
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {nodes.map((n) => (
            <div
              key={n.id}
              className={`graph-node ${n.kind}${sel === n.id ? ' selected' : ''}`}
              style={{ left: n.x, top: n.y }}
              onPointerDown={(e) => drag(n.id, e)}
              onClick={(e) => {
                e.stopPropagation();
                setSel(n.id);
              }}
              title={n.id}
            >
              {n.label.length > 28 ? `${n.label.slice(0, 26)}…` : n.label}
            </div>
          ))}
          {nodes.length === 0 && (
            <div className="empty-state">
              {view === 'investigative'
                ? 'Nenhuma evidência coletada ainda.'
                : 'Sem telemetria neste capítulo.'}
            </div>
          )}
        </div>

        <div className="pane bordered-l" style={{ width: 258, flex: '0 0 258px' }}>
          <div className="pane-head">Nó</div>
          {!selNode ? (
            <div className="empty-state">
              Clique num nó. Arraste para reorganizar a topologia.
            </div>
          ) : (
            <div className="pane-scroll">
              <dl className="kv">
                <dt>id</dt>
                <dd>{selNode.id}</dd>
                <dt>tipo</dt>
                <dd>{selNode.kind}</dd>
                <dt>grau</dt>
                <dd>{neighbors.length}</dd>
              </dl>
              <div className="pane-head">Conexões</div>
              {neighbors.map((nb) => (
                <div key={nb} className="log-line" onClick={() => setSel(nb)}>
                  <span>{nb}</span>
                </div>
              ))}
              {view === 'technical' && (
                <div className="toolbar wrap">
                  <button
                    className="btn sm"
                    onClick={() => openApp('trace', { service: selNode.id })}
                  >
                    ver no Trace
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
