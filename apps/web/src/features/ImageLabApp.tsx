import { useEffect, useMemo, useRef, useState } from 'react';
import { listFs, readFileText } from '../lib/api';
import { useGame } from '../state/game';

type Channels = { r: boolean; g: boolean; b: boolean; a: boolean };

const SIZE = 192;

/** Deriva um raster determinístico a partir dos bytes do artefato. */
function raster(bytes: Uint8Array) {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  if (!bytes.length) return px;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const b0 = bytes[(y * SIZE + x) % bytes.length];
      const b1 = bytes[(y * 31 + x * 17 + 7) % bytes.length];
      const b2 = bytes[(y * 7 + x * 3 + 29) % bytes.length];
      px[i] = b0;
      px[i + 1] = (b1 * 3 + b0) & 0xff;
      px[i + 2] = (b2 * 5 + b1) & 0xff;
      px[i + 3] = 255 - (((b0 ^ b2) >> 3) & 0x1f);
    }
  }
  return px;
}

export function ImageLabApp({ winId }: { winId: string }) {
  const { save, setWinSubtitle, openApp } = useGame();
  const payload = useGame((s) => s.appPayload['image-lab']) as
    | { path?: string; nonce?: number }
    | undefined;
  const [path, setPath] = useState(payload?.path ?? '/home/null/investigation');
  const [input, setInput] = useState(path);
  const [content, setContent] = useState<string | null>(null);
  const [ch, setCh] = useState<Channels>({ r: true, g: true, b: true, a: false });
  const [contrast, setContrast] = useState(100);
  const [gamma, setGamma] = useState(100);
  const [edge, setEdge] = useState(0);
  const [tab, setTab] = useState<'metadata' | 'strings' | 'layers'>('metadata');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (payload?.path) {
      setPath(payload.path);
      setInput(payload.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.nonce, payload?.path]);

  const [candidates, setCandidates] = useState<{ path: string; name: string }[]>([]);

  useEffect(() => {
    if (!save) return;
    void readFileText(save.id, path).then((c) => {
      setContent(c);
      setWinSubtitle(winId, `${path}${c ? ` · ${c.length} B` : ' — sem dados'}`);
      if (c == null) void loadCandidates(path);
      else setCandidates([]);
    });

    async function loadCandidates(dir: string) {
      if (!save) return;
      const found: { path: string; name: string }[] = [];
      const queue = [dir];
      let guard = 0;
      while (queue.length && found.length < 40 && guard < 24) {
        guard += 1;
        const current = queue.shift()!;
        const res = await listFs(save.id, current, 'gui');
        if (!('type' in res) || res.type !== 'dir') continue;
        for (const e of res.entries) {
          const p = `${current === '/' ? '' : current}/${e.name}`;
          if (e.type === 'dir') queue.push(p);
          else found.push({ path: p, name: e.name });
        }
      }
      setCandidates(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save?.id, path]);

  const bytes = useMemo(() => new TextEncoder().encode(content ?? ''), [content]);
  const px = useMemo(() => raster(bytes), [bytes]);

  const histogram = useMemo(() => {
    const bins = new Array(48).fill(0);
    for (let i = 0; i < bytes.length; i++) bins[Math.floor((bytes[i] / 256) * 48)] += 1;
    const max = Math.max(1, ...bins);
    return bins.map((b) => b / max);
  }, [bytes]);

  const metadata = useMemo(() => {
    const out: { k: string; v: string }[] = [];
    for (const line of (content ?? '').split('\n')) {
      const m = /^\s*([A-Za-z][A-Za-z0-9 _\-]{1,40}):\s*(.+)$/.exec(line);
      if (m) out.push({ k: m[1].trim(), v: m[2].trim() });
      if (out.length > 80) break;
    }
    return out;
  }, [content]);

  const strings = useMemo(
    () => [...new Set((content ?? '').match(/[\x20-\x7e]{5,}/g) ?? [])].slice(0, 200),
    [content],
  );

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(SIZE, SIZE);
    const c = contrast / 100;
    const g = gamma / 100;
    for (let i = 0; i < px.length; i += 4) {
      const apply = (v: number) => {
        let x = v / 255;
        x = Math.pow(x, 1 / Math.max(0.05, g));
        x = (x - 0.5) * c + 0.5;
        return Math.max(0, Math.min(255, x * 255));
      };
      const showAlphaOnly = ch.a && !ch.r && !ch.g && !ch.b;
      if (showAlphaOnly) {
        const a = px[i + 3];
        img.data[i] = img.data[i + 1] = img.data[i + 2] = apply(a);
      } else {
        img.data[i] = ch.r ? apply(px[i]) : 0;
        img.data[i + 1] = ch.g ? apply(px[i + 1]) : 0;
        img.data[i + 2] = ch.b ? apply(px[i + 2]) : 0;
      }
      img.data[i + 3] = 255;
    }
    if (edge > 0) {
      const src = new Uint8ClampedArray(img.data);
      const k = edge / 100;
      for (let y = 1; y < SIZE - 1; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
          const i = (y * SIZE + x) * 4;
          for (let c2 = 0; c2 < 3; c2++) {
            const gx =
              src[i + c2 - 4] - src[i + c2 + 4] + src[i + c2 - SIZE * 4] - src[i + c2 + SIZE * 4];
            img.data[i + c2] = src[i + c2] * (1 - k) + Math.abs(gx) * k * 2;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [px, ch, contrast, gamma, edge]);

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-label">artefato</span>
        <input
          className="input mono"
          style={{ flex: 1, maxWidth: 360 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setPath(input)}
        />
        <button className="btn sm" onClick={() => setPath(input)}>
          carregar
        </button>
        <button className="btn sm ghost" onClick={() => openApp('hex', { path })}>
          abrir no Hex
        </button>
      </div>

      <div className="split">
        <div className="pane bordered-r" style={{ width: 168, flex: '0 0 168px' }}>
          <div className="pane-head">Canais</div>
          <div style={{ padding: 'var(--s3)', display: 'grid', gap: 8 }}>
            {(
              [
                ['r', 'RGB · R'],
                ['g', 'RGB · G'],
                ['b', 'RGB · B'],
                ['a', 'Alpha'],
              ] as const
            ).map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={ch[key]}
                  onChange={(e) => setCh({ ...ch, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="pane-head">Transformações</div>
          <div style={{ padding: 'var(--s3)', display: 'grid', gap: 10 }}>
            {(
              [
                ['contraste', contrast, setContrast, 0, 300],
                ['gamma', gamma, setGamma, 10, 300],
                ['bordas', edge, setEdge, 0, 100],
              ] as const
            ).map(([label, val, setter, min, max]) => (
              <div key={label}>
                <div className="tiny dim upper" style={{ marginBottom: 4 }}>
                  {label} {val}
                </div>
                <input
                  className="slider"
                  style={{ width: '100%' }}
                  type="range"
                  min={min}
                  max={max}
                  value={val}
                  onChange={(e) => setter(Number(e.target.value))}
                />
              </div>
            ))}
            <button
              className="btn sm"
              onClick={() => {
                setContrast(100);
                setGamma(100);
                setEdge(0);
                setCh({ r: true, g: true, b: true, a: false });
              }}
            >
              resetar
            </button>
          </div>
        </div>

        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-head">
            visualização de bytes · {SIZE}×{SIZE}
          </div>
          <div className="imglab-stage">
            {bytes.length ? (
              <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width: 384, height: 384 }} />
            ) : candidates.length ? (
              <div style={{ alignSelf: 'stretch', padding: 'var(--s3)' }}>
                <div className="upper tiny dim" style={{ marginBottom: 8 }}>
                  artefatos em {path}
                </div>
                {candidates.map((c) => (
                  <button
                    key={c.path}
                    className="palette-row"
                    onClick={() => {
                      setPath(c.path);
                      setInput(c.path);
                    }}
                  >
                    <span className="mono" style={{ fontSize: 11 }}>
                      {c.name}
                    </span>
                    <span className="hint">{c.path}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhum dado carregado.</div>
            )}
          </div>
        </div>

        <div className="pane bordered-l" style={{ width: 288, flex: '0 0 288px' }}>
          <div className="pane-head">Histograma</div>
          <div style={{ padding: 'var(--s2)' }}>
            <div className="histogram">
              {histogram.map((h, i) => (
                <i key={i} style={{ height: `${Math.max(2, h * 100)}%` }} />
              ))}
            </div>
          </div>
          <div className="tabs">
            {(['metadata', 'strings', 'layers'] as const).map((t) => (
              <button
                key={t}
                className={`tab${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'metadata' ? 'Metadata' : t === 'strings' ? 'Strings' : 'Layers'}
              </button>
            ))}
          </div>
          <div className="pane-scroll">
            {tab === 'metadata' &&
              (metadata.length ? (
                <dl className="kv">
                  {metadata.map((m, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      <dt>{m.k}</dt>
                      <dd>{m.v}</dd>
                    </span>
                  ))}
                </dl>
              ) : (
                <div className="empty-state" style={{ padding: 18 }}>
                  Nenhum campo de metadata no formato chave: valor.
                </div>
              ))}
            {tab === 'strings' &&
              strings.map((s, i) => (
                <div key={i} className="log-line">
                  <span>{s}</span>
                </div>
              ))}
            {tab === 'layers' && (
              <div style={{ padding: 'var(--s3)' }}>
                <div className="orph-row">
                  <span>base</span>
                  <b>{bytes.length} B</b>
                </div>
                <div className="orph-row">
                  <span>canal alpha</span>
                  <b>{ch.a ? 'visível' : 'oculto'}</b>
                </div>
                <div className="orph-row">
                  <span>entropia aparente</span>
                  <b>
                    {(
                      histogram.reduce((a, b) => a + (b > 0.02 ? 1 : 0), 0) /
                      Math.max(1, histogram.length)
                    ).toFixed(2)}
                  </b>
                </div>
                <p className="dim tiny" style={{ lineHeight: 1.7 }}>
                  As operações desta ferramenta são legítimas: canais, contraste, gamma, bordas,
                  metadata e strings. Nenhuma delas revela nada por si só.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
