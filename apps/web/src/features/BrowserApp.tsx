import { useCallback, useEffect, useRef, useState } from 'react';
import { browse } from '../lib/api';
import { baitPageFor } from '../lib/bait-sites';
import { armBrowserTrap, isBrowserTrapHost, normalizeHost } from '../lib/traps';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { IconArrowLeft, IconChevron, IconLock, IconRefresh } from '../shell/Icons';

type Page = { host: string; title: string; html: string; headers?: Record<string, string> };
type Tab = { id: string; host: string; page: Page | null; error?: string };

export function BrowserApp({ winId }: { winId: string }) {
  const { save, setWinSubtitle, pushToast } = useGame();
  const payload = useGame((s) => s.appPayload.browser) as { host?: string } | undefined;
  const chapter = useMeta((s) => s.chapter);
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'b1', host: '', page: null }]);
  const [active, setActive] = useState('b1');
  const [url, setUrl] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [devtools, setDevtools] = useState<'off' | 'network' | 'console' | 'storage'>('off');
  const [requests, setRequests] = useState<
    { host: string; status: number; type: string; size: number; ms: number }[]
  >([]);
  const seq = useRef(1);

  const tab = tabs.find((t) => t.id === active)!;

  const go = useCallback(
    async (host: string, tabId = active) => {
      if (!save || !host) return;
      const clean = normalizeHost(host) || host.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const started = performance.now();

      const bait = baitPageFor(clean);
      if (bait) {
        setTabs((v) =>
          v.map((t) => (t.id === tabId ? { ...t, host: clean, page: bait, error: undefined } : t)),
        );
        setHistory((h) => [...h, clean]);
        setRequests((r) =>
          [
            {
              host: clean,
              status: 200,
              type: 'document',
              size: bait.html.length,
              ms: Math.round(performance.now() - started),
            },
            ...r,
          ].slice(0, 60),
        );
        if (isBrowserTrapHost(clean)) armBrowserTrap(save.id);
        return;
      }

      try {
        const page = await browse(save.id, clean);
        setTabs((v) => v.map((t) => (t.id === tabId ? { ...t, host: clean, page, error: undefined } : t)));
        setHistory((h) => [...h, clean]);
        setRequests((r) =>
          [
            {
              host: clean,
              status: 200,
              type: 'document',
              size: page.html.length,
              ms: Math.round(performance.now() - started),
            },
            ...r,
          ].slice(0, 60),
        );
      } catch {
        setTabs((v) =>
          v.map((t) =>
            t.id === tabId
              ? { ...t, host: clean, page: null, error: 'ERR_NAME_NOT_RESOLVED' }
              : t,
          ),
        );
        setRequests((r) =>
          [
            { host: clean, status: 404, type: 'document', size: 0, ms: Math.round(performance.now() - started) },
            ...r,
          ].slice(0, 60),
        );
        pushToast(`Host não resolvido: ${clean}`, 'warning');
      }
    },
    [save, active, pushToast],
  );

  useEffect(() => {
    if (payload?.host) {
      setUrl(payload.host);
      void go(payload.host);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.host]);

  useEffect(() => {
    setWinSubtitle(winId, tab.host || 'nova aba');
  }, [tab.host, setWinSubtitle, winId]);

  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab${t.id === active ? ' active' : ''}`}
            onClick={() => {
              setActive(t.id);
              setUrl(t.host);
            }}
          >
            {t.page?.title ?? (t.host || 'nova aba')}
          </button>
        ))}
        <button
          className="tab"
          onClick={() => {
            seq.current += 1;
            const t = { id: `b${seq.current}`, host: '', page: null };
            setTabs((v) => [...v, t]);
            setActive(t.id);
            setUrl('');
          }}
        >
          +
        </button>
      </div>

      <div className="browser-chrome">
        <button
          className="icon-btn"
          title="Voltar"
          onClick={() => {
            const prev = history[history.length - 2];
            if (prev) {
              setHistory((h) => h.slice(0, -1));
              void go(prev);
            }
          }}
        >
          <IconArrowLeft size={14} />
        </button>
        <button className="icon-btn" title="Recarregar" onClick={() => tab.host && void go(tab.host)}>
          <IconRefresh size={13} />
        </button>
        <div className="url-bar">
          <span className="dim">
            <IconLock size={11} />
          </span>
          <span className="dim">http://</span>
          <input
            value={url}
            placeholder="host interno (ex: archive.acheron.internal)"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void go(url)}
          />
          <button className="btn sm ghost" onClick={() => void go(url)}>
            ir
          </button>
        </div>
        <div className="seg">
          {(['off', 'network', 'console', 'storage'] as const).map((d) => (
            <button key={d} className={devtools === d ? 'on' : ''} onClick={() => setDevtools(d)}>
              {d === 'off' ? 'devtools' : d}
            </button>
          ))}
        </div>
      </div>

      <div className="split">
        <div className="pane" style={{ flex: 1 }}>
          {tab.page ? (
            <div
              className="page"
              // conteúdo ficcional servido pelo próprio jogo
              dangerouslySetInnerHTML={{ __html: tab.page.html }}
            />
          ) : tab.error ? (
            <div className="empty-state">
              <div>
                <div className="mono" style={{ color: 'var(--err)' }}>
                  {tab.error}
                </div>
                <div style={{ marginTop: 8 }}>
                  {tab.host} não respondeu. Talvez o host apareça em logs, headers ou arquivos.
                </div>
              </div>
            </div>
          ) : (
            <div className="pane-scroll" style={{ padding: 'var(--s5)' }}>
              <div className="upper dim tiny" style={{ marginBottom: 12 }}>
                sistemas alcançáveis neste estágio
              </div>
              {(chapter?.websites ?? []).map((s) => (
                <button
                  key={s.host}
                  className="palette-row"
                  onClick={() => {
                    setUrl(s.host);
                    void go(s.host);
                  }}
                >
                  <IconChevron size={12} />
                  <span>{s.title}</span>
                  <span className="hint">{s.host}</span>
                </button>
              ))}
              {(chapter?.websites ?? []).length === 0 && (
                <div className="dim">Nenhum host conhecido ainda.</div>
              )}
            </div>
          )}
        </div>

        {devtools !== 'off' && (
          <div className="pane bordered-l" style={{ width: 316, flex: '0 0 316px' }}>
            <div className="pane-head">devtools · {devtools}</div>
            {devtools === 'network' && (
              <div className="pane-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Host</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Bytes</th>
                      <th style={{ textAlign: 'right' }}>ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r, i) => (
                      <tr key={i}>
                        <td>{r.host}</td>
                        <td style={{ color: r.status >= 400 ? 'var(--err)' : 'var(--ok)' }}>
                          {r.status}
                        </td>
                        <td className="num">{r.size}</td>
                        <td className="num">{r.ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tab.page?.headers && (
                  <>
                    <div className="pane-head">response headers</div>
                    <dl className="kv">
                      {Object.entries(tab.page.headers).map(([k, v]) => (
                        <span key={k} style={{ display: 'contents' }}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </span>
                      ))}
                    </dl>
                  </>
                )}
              </div>
            )}
            {devtools === 'console' && (
              <pre className="code-pane">
                {[
                  `[browser] navigated to ${tab.host || '—'}`,
                  tab.page ? `[browser] document ${tab.page.html.length} bytes` : '',
                  tab.page?.headers?.['x-abyss-note']
                    ? `[server] x-abyss-note: ${tab.page.headers['x-abyss-note']}`
                    : '',
                  '[hint] o devtools real do seu navegador (F12) também faz parte da investigação',
                ]
                  .filter(Boolean)
                  .join('\n')}
              </pre>
            )}
            {devtools === 'storage' && (
              <dl className="kv">
                <dt>origin</dt>
                <dd>{tab.host || '—'}</dd>
                <dt>cookies</dt>
                <dd>nenhum (sandbox)</dd>
                <dt>localStorage</dt>
                <dd>abyss_session, abyss_settings</dd>
                <dt>service worker</dt>
                <dd>{tab.host.includes('acheron') ? 'registrado' : 'nenhum'}</dd>
              </dl>
            )}
          </div>
        )}
      </div>
    </>
  );
}
