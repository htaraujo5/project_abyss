import { useCallback, useEffect, useState } from 'react';
import { listFs, type DirEntry } from '../lib/api';
import { useGame } from '../state/game';
import { on, emit } from '../lib/bus';
import {
  IconArrowUp,
  IconChevron,
  IconFile,
  IconFolder,
  IconRefresh,
  IconSearch,
} from '../shell/Icons';

const ROOTS = ['/home/null', '/var/log', '/etc', '/opt', '/tmp', '/'];

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} K`;
  return `${(n / 1024 / 1024).toFixed(1)} M`;
}

function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function kindOf(name: string) {
  const e = extOf(name);
  if (['png', 'jpg', 'jpeg', 'bmp', 'gif'].includes(e)) return 'imagem';
  if (['bin', 'dat', 'dump', 'img', 'iso', 'so', 'o'].includes(e)) return 'binário';
  if (['log', 'txt', 'md', 'csv', 'json', 'yaml', 'yml', 'conf', 'cfg', 'ini'].includes(e))
    return 'texto';
  if (['js', 'ts', 'c', 'cpp', 'h', 'py', 'sh', 'asm', 'java', 'cs'].includes(e)) return 'código';
  if (['pcap', 'cap'].includes(e)) return 'captura';
  return e || 'arquivo';
}

export function FilesApp({ winId }: { winId: string }) {
  const { save, openApp, setWinSubtitle, openCtxMenu, pushToast } = useGame();
  const payload = useGame((s) => s.appPayload.files) as
    | { path?: string; nonce?: number }
    | undefined;
  const [cwd, setCwd] = useState(payload?.path ?? save?.cwd ?? '/home/null');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [selected, setSelected] = useState<DirEntry | null>(null);
  const [preview, setPreview] = useState<{ path: string; content: string | null } | null>(null);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, DirEntry[] | undefined>>({});

  const load = useCallback(
    async (path: string) => {
      if (!save) return;
      const res = await listFs(save.id, path, 'gui');
      if ('type' in res && res.type === 'dir') {
        setEntries(res.entries);
        setCwd(res.path);
        setWinSubtitle(winId, res.path);
      } else if ('type' in res && res.type === 'file') {
        setPreview({ path: res.path, content: res.content });
      } else {
        pushToast(`Caminho inacessível: ${path}`, 'error');
      }
    },
    [save, setWinSubtitle, winId, pushToast],
  );

  useEffect(() => {
    void load(cwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save?.id]);

  // navegação vinda de outro app (paleta, Evidence, terminal) com a janela aberta
  useEffect(() => {
    if (payload?.path) void load(payload.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.nonce, payload?.path]);

  useEffect(() => on('save-updated', () => void load(cwd)), [load, cwd]);

  async function openEntry(e: DirEntry) {
    const path = `${cwd === '/' ? '' : cwd}/${e.name}`;
    if (e.type === 'dir') {
      setSelected(null);
      setPreview(null);
      await load(path);
      return;
    }
    const res = await listFs(save!.id, path, 'gui');
    if ('type' in res && res.type === 'file') setPreview({ path, content: res.content });
    const k = kindOf(e.name);
    if (k === 'imagem') openApp('image-lab', { path });
    else if (k === 'binário' || k === 'captura') openApp('hex', { path });
    else openApp('code', { path });
  }

  async function toggleExpand(path: string) {
    if (expanded[path]) {
      setExpanded((v) => ({ ...v, [path]: undefined }));
      return;
    }
    const res = await listFs(save!.id, path, 'gui');
    if ('type' in res && res.type === 'dir') {
      setExpanded((v) => ({ ...v, [path]: res.entries }));
    }
  }

  const shown = entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));
  const parts = cwd.split('/').filter(Boolean);

  function rowMenu(e: DirEntry, ev: React.MouseEvent) {
    ev.preventDefault();
    const path = `${cwd === '/' ? '' : cwd}/${e.name}`;
    openCtxMenu(ev.clientX, ev.clientY, [
      { label: e.type === 'dir' ? 'Abrir pasta' : 'Abrir', onClick: () => void openEntry(e) },
      { label: '', separator: true },
      { label: 'Abrir no Code', disabled: e.type === 'dir', onClick: () => openApp('code', { path }) },
      { label: 'Abrir no Hex', disabled: e.type === 'dir', onClick: () => openApp('hex', { path }) },
      {
        label: 'Abrir no Image Lab',
        disabled: kindOf(e.name) !== 'imagem',
        onClick: () => openApp('image-lab', { path }),
      },
      { label: '', separator: true },
      {
        label: 'cd no terminal',
        onClick: () => {
          openApp('terminal');
          emit('exec', { command: `cd ${e.type === 'dir' ? path : cwd}` });
        },
      },
      {
        label: 'Copiar caminho',
        onClick: () => {
          void navigator.clipboard.writeText(path);
          pushToast('Caminho copiado', 'success');
        },
      },
    ]);
  }

  return (
    <>
      <div className="toolbar">
        <button
          className="icon-btn"
          title="Subir um nível"
          onClick={() => void load(cwd.split('/').slice(0, -1).join('/') || '/')}
        >
          <IconArrowUp size={14} />
        </button>
        <button className="icon-btn" title="Recarregar" onClick={() => void load(cwd)}>
          <IconRefresh size={14} />
        </button>
        <div className="sep" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
          <button className="btn sm ghost" onClick={() => void load('/')}>
            /
          </button>
          {parts.map((p, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span className="dim">
                <IconChevron size={10} />
              </span>
              <button
                className="btn sm ghost"
                onClick={() => void load('/' + parts.slice(0, i + 1).join('/'))}
              >
                {p}
              </button>
            </span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dim">
            <IconSearch size={12} />
          </span>
          <input
            className="input"
            style={{ width: 150 }}
            placeholder="filtrar nesta pasta"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="split">
        <div className="pane bordered-r" style={{ width: 210, flex: '0 0 210px' }}>
          <div className="pane-head">Locais</div>
          <div className="pane-scroll tree">
            {ROOTS.map((r) => (
              <div key={r}>
                <div
                  className={`tree-row dir${cwd === r ? ' selected' : ''}`}
                  onClick={() => void load(r)}
                >
                  <span
                    className="caret"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleExpand(r);
                    }}
                  >
                    <IconChevron
                      size={9}
                      style={{ transform: expanded[r] ? 'rotate(90deg)' : 'none' }}
                    />
                  </span>
                  <span className="ico">
                    <IconFolder size={13} />
                  </span>
                  <span className="mono">{r}</span>
                </div>
                {expanded[r]?.map((c) => {
                  const p = `${r === '/' ? '' : r}/${c.name}`;
                  return (
                    <div
                      key={p}
                      className={`tree-row${c.type === 'dir' ? ' dir' : ''}${
                        cwd === p ? ' selected' : ''
                      }`}
                      style={{ paddingLeft: 26 }}
                      onClick={() => (c.type === 'dir' ? void load(p) : openApp('code', { path: p }))}
                    >
                      <span className="ico">
                        {c.type === 'dir' ? <IconFolder size={12} /> : <IconFile size={12} />}
                      </span>
                      <span className="mono">{c.name}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-head">
            {shown.length} itens{filter && ` · filtro "${filter}"`}
          </div>
          <div className="pane-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '52%' }}>Nome</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr
                    key={e.name}
                    className={selected?.name === e.name ? 'selected' : ''}
                    onClick={() => {
                      setSelected(e);
                      if (e.type === 'file') {
                        void listFs(save!.id, `${cwd === '/' ? '' : cwd}/${e.name}`, 'gui').then(
                          (r) =>
                            'type' in r &&
                            r.type === 'file' &&
                            setPreview({ path: r.path, content: r.content }),
                        );
                      }
                    }}
                    onDoubleClick={() => void openEntry(e)}
                    onContextMenu={(ev) => rowMenu(e, ev)}
                  >
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          color: e.type === 'dir' ? 'var(--accent-soft)' : 'inherit',
                        }}
                      >
                        {e.type === 'dir' ? <IconFolder size={13} /> : <IconFile size={13} />}
                        {e.name}
                      </span>
                    </td>
                    <td className="dim">{e.type === 'dir' ? `pasta · ${e.items ?? 0}` : kindOf(e.name)}</td>
                    <td className="num">{e.type === 'dir' ? '—' : fmtSize(e.size)}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={3} className="dim" style={{ padding: 16 }}>
                      Nada visível aqui pela interface gráfica.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pane bordered-l" style={{ width: 300, flex: '0 0 300px' }}>
          <div className="pane-head">Inspetor</div>
          {!selected && !preview && (
            <div className="empty-state">
              Selecione um item.
              <br />
              <span className="dim">
                A interface gráfica pode não listar tudo que existe no volume.
              </span>
            </div>
          )}
          {(selected || preview) && (
            <div className="pane-scroll">
              <dl className="kv">
                <dt>nome</dt>
                <dd>{selected?.name ?? preview?.path.split('/').pop()}</dd>
                <dt>caminho</dt>
                <dd>{preview?.path ?? `${cwd}/${selected?.name}`}</dd>
                <dt>tipo</dt>
                <dd>{selected ? (selected.type === 'dir' ? 'diretório' : kindOf(selected.name)) : 'arquivo'}</dd>
                {selected?.type === 'file' && (
                  <>
                    <dt>bytes</dt>
                    <dd>{selected.size}</dd>
                  </>
                )}
              </dl>
              {preview?.content != null && (
                <>
                  <div className="pane-head" style={{ borderTop: '1px solid var(--line)' }}>
                    Prévia
                  </div>
                  <pre className="code-pane" style={{ maxHeight: 260 }}>
                    {preview.content.slice(0, 4000) || '(vazio)'}
                  </pre>
                </>
              )}
              <div className="toolbar wrap" style={{ borderTop: '1px solid var(--line)' }}>
                <button
                  className="btn sm"
                  disabled={!preview}
                  onClick={() => preview && openApp('code', { path: preview.path })}
                >
                  Code
                </button>
                <button
                  className="btn sm"
                  disabled={!preview}
                  onClick={() => preview && openApp('hex', { path: preview.path })}
                >
                  Hex
                </button>
                <button
                  className="btn sm"
                  disabled={!preview || kindOf(preview.path) !== 'imagem'}
                  onClick={() => preview && openApp('image-lab', { path: preview.path })}
                >
                  Image Lab
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
