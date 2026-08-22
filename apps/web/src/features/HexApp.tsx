import { useEffect, useMemo, useState } from 'react';
import { readFileText } from '../lib/api';
import { useGame } from '../state/game';
import { IconSearch } from '../shell/Icons';

const BYTES_PER_ROW = 16;

export function HexApp({ winId }: { winId: string }) {
  const { save, setWinSubtitle, pushToast, openApp } = useGame();
  const payload = useGame((s) => s.appPayload.hex) as
    | { path?: string; nonce?: number }
    | undefined;
  const [path, setPath] = useState(payload?.path ?? '/home/null/.null');
  const [input, setInput] = useState(path);
  const [content, setContent] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState<'structure' | 'strings'>('structure');

  useEffect(() => {
    if (payload?.path) {
      setPath(payload.path);
      setInput(payload.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.nonce, payload?.path]);

  useEffect(() => {
    if (!save) return;
    void readFileText(save.id, path).then((c) => {
      setContent(c);
      setWinSubtitle(winId, c == null ? `${path} — inacessível` : `${path} · ${c.length} bytes`);
      if (c == null) pushToast(`Sem bytes legíveis em ${path}`, 'warning');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save?.id, path]);

  const bytes = useMemo(() => {
    if (content == null) return new Uint8Array();
    return new TextEncoder().encode(content);
  }, [content]);

  const queryBytes = useMemo(() => {
    if (!query) return null;
    if (/^(0x)?[0-9a-f\s]+$/i.test(query) && query.replace(/[^0-9a-f]/gi, '').length % 2 === 0) {
      const hex = query.replace(/[^0-9a-f]/gi, '');
      const arr: number[] = [];
      for (let i = 0; i < hex.length; i += 2) arr.push(parseInt(hex.slice(i, i + 2), 16));
      return arr;
    }
    return [...new TextEncoder().encode(query)];
  }, [query]);

  const matches = useMemo(() => {
    if (!queryBytes?.length) return [];
    const out: number[] = [];
    for (let i = 0; i <= bytes.length - queryBytes.length; i++) {
      let ok = true;
      for (let j = 0; j < queryBytes.length; j++) {
        if (bytes[i + j] !== queryBytes[j]) {
          ok = false;
          break;
        }
      }
      if (ok) out.push(i);
      if (out.length > 400) break;
    }
    return out;
  }, [bytes, queryBytes]);

  const structure = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    if (!bytes.length) return out;
    const head = [...bytes.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    out.push({ label: 'magic (8B)', value: head });
    const text = content ?? '';
    const looksText = /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(text.slice(0, 512));
    out.push({ label: 'classificação', value: looksText ? 'texto/UTF-8' : 'binário' });
    out.push({ label: 'tamanho', value: `${bytes.length} bytes` });
    out.push({ label: 'linhas', value: String(text.split('\n').length) });
    const entropy = (() => {
      const freq = new Array(256).fill(0);
      for (const b of bytes) freq[b] += 1;
      let h = 0;
      for (const f of freq) {
        if (!f) continue;
        const p = f / bytes.length;
        h -= p * Math.log2(p);
      }
      return h;
    })();
    out.push({ label: 'entropia', value: `${entropy.toFixed(2)} bits/byte` });
    const nonPrintable = [...bytes].filter((b) => b < 9 || (b > 13 && b < 32) || b > 126).length;
    out.push({ label: 'não imprimíveis', value: `${nonPrintable}` });
    const trailing = /\n{3,}$/.test(text) ? 'sim' : 'não';
    out.push({ label: 'padding final', value: trailing });
    return out;
  }, [bytes, content]);

  const strings = useMemo(
    () => [...new Set((content ?? '').match(/[\x20-\x7e]{4,}/g) ?? [])].slice(0, 300),
    [content],
  );

  const rows = useMemo(() => {
    const out: { off: number; slice: number[] }[] = [];
    for (let i = 0; i < bytes.length; i += BYTES_PER_ROW) {
      out.push({ off: i, slice: [...bytes.slice(i, i + BYTES_PER_ROW)] });
    }
    return out.slice(0, 4000);
  }, [bytes]);

  const isMatch = (off: number) =>
    matches.some((m) => off >= m && off < m + (queryBytes?.length ?? 0));

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-label">arquivo</span>
        <input
          className="input mono"
          style={{ flex: 1, maxWidth: 380 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setPath(input)}
        />
        <button className="btn sm" onClick={() => setPath(input)}>
          abrir
        </button>
        <div className="sep" />
        <span className="dim">
          <IconSearch size={12} />
        </span>
        <input
          className="input mono"
          style={{ width: 190 }}
          placeholder="texto ou bytes (ex: 89 50 4e)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="chip">{matches.length} ocorrências</span>
        <button
          className="btn sm ghost"
          style={{ marginLeft: 'auto' }}
          onClick={() => openApp('code', { path })}
        >
          abrir no Code
        </button>
      </div>

      <div className="split">
        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-head">
            offset · 16 bytes por linha {sel != null && `· seleção 0x${sel.toString(16)}`}
          </div>
          {content == null ? (
            <div className="empty-state">
              Nenhum conteúdo acessível em <span className="mono">{path}</span>.
              <br />
              <span className="dim">O caminho pode existir apenas para o shell.</span>
            </div>
          ) : (
            <div className="hex-grid">
              {rows.map((r) => (
                <div className="hex-row" key={r.off}>
                  <span className="off">{r.off.toString(16).padStart(8, '0')}</span>
                  <span className="bytes">
                    {r.slice.map((b, i) => {
                      const off = r.off + i;
                      const hit = isMatch(off);
                      return (
                        <span
                          key={i}
                          onClick={() => setSel(off)}
                          style={{
                            cursor: 'pointer',
                            background: hit
                              ? 'color-mix(in srgb, var(--accent) 30%, transparent)'
                              : sel === off
                                ? 'color-mix(in srgb, var(--warn) 30%, transparent)'
                                : undefined,
                          }}
                        >
                          {b.toString(16).padStart(2, '0')}
                          {i === 7 ? '  ' : ' '}
                        </span>
                      );
                    })}
                    {' '.repeat(Math.max(0, (BYTES_PER_ROW - r.slice.length) * 3))}
                  </span>
                  <span className="ascii">
                    {r.slice
                      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
                      .join('')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pane bordered-l" style={{ width: 272, flex: '0 0 272px' }}>
          <div className="tabs">
            <button
              className={`tab${view === 'structure' ? ' active' : ''}`}
              onClick={() => setView('structure')}
            >
              Estrutura
            </button>
            <button
              className={`tab${view === 'strings' ? ' active' : ''}`}
              onClick={() => setView('strings')}
            >
              Strings ({strings.length})
            </button>
          </div>
          {view === 'structure' ? (
            <div className="pane-scroll">
              <dl className="kv">
                {structure.map((s) => (
                  <span key={s.label} style={{ display: 'contents' }}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </span>
                ))}
              </dl>
              {sel != null && (
                <>
                  <div className="pane-head">Byte selecionado</div>
                  <dl className="kv">
                    <dt>offset</dt>
                    <dd>
                      0x{sel.toString(16)} ({sel})
                    </dd>
                    <dt>hex</dt>
                    <dd>{bytes[sel]?.toString(16).padStart(2, '0')}</dd>
                    <dt>dec</dt>
                    <dd>{bytes[sel]}</dd>
                    <dt>bin</dt>
                    <dd>{bytes[sel]?.toString(2).padStart(8, '0')}</dd>
                    <dt>ascii</dt>
                    <dd>
                      {bytes[sel] >= 32 && bytes[sel] < 127 ? String.fromCharCode(bytes[sel]) : '·'}
                    </dd>
                  </dl>
                </>
              )}
            </div>
          ) : (
            <div className="pane-scroll">
              {strings.map((s, i) => (
                <div key={i} className="log-line" onClick={() => setQuery(s)}>
                  <span className="ts">{String(i).padStart(3, '0')}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
