import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { listFs, readFileText, type DirEntry } from '../lib/api';
import { useGame } from '../state/game';
import { runCommand } from '../lib/exec';
import { emit } from '../lib/bus';
import { IconChevron, IconClose, IconFile, IconFolder, IconPlay } from '../shell/Icons';

type OpenFile = { path: string; content: string; dirty: boolean };

const LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  json: 'json',
  md: 'markdown',
  sh: 'shell',
  bash: 'shell',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  java: 'java',
  py: 'python',
  asm: 's',
  yml: 'yaml',
  yaml: 'yaml',
  conf: 'ini',
  cfg: 'ini',
  ini: 'ini',
  log: 'log',
  csv: 'plaintext',
  txt: 'plaintext',
};

function langOf(path: string) {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  return LANG[ext] ?? 'plaintext';
}

export function CodeApp({ winId }: { winId: string }) {
  const { save, setWinSubtitle, pushToast } = useGame();
  const payload = useGame((s) => s.appPayload.code) as
    | { path?: string; nonce?: number }
    | undefined;
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [treeRoot, setTreeRoot] = useState('/home/null');
  const [tree, setTree] = useState<Record<string, DirEntry[] | undefined>>({});
  const [panel, setPanel] = useState<'output' | 'problems' | 'terminal'>('output');
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const lastPayload = useRef<string | null>(null);
  const [termLines, setTermLines] = useState<string[]>([]);
  const [termInput, setTermInput] = useState('');
  const [termCwd, setTermCwd] = useState(save?.cwd ?? '/home/null');
  const termHist = useRef<string[]>([]);
  const histIdx = useRef(0);
  const termScrollRef = useRef<HTMLPreElement>(null);

  const runInline = useCallback(
    async (cmd: string) => {
      termHist.current = [...termHist.current, cmd].slice(-100);
      histIdx.current = 0;
      setTermLines((v) => [...v, `${termCwd} $ ${cmd}`].slice(-500));
      if (cmd === 'clear') {
        setTermLines([]);
        return;
      }
      const r = await runCommand(cmd, 'code');
      const out: string[] = [];
      if (r?.stdout) out.push(...r.stdout.replace(/\n$/, '').split('\n'));
      if (r?.stderr) out.push(...r.stderr.replace(/\n$/, '').split('\n').map((l) => `! ${l}`));
      if (r?.cwd) setTermCwd(r.cwd);
      setTermLines((v) => [...v, ...out].slice(-500));
    },
    [termCwd],
  );

  useEffect(() => {
    const el = termScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [termLines]);

  const openPath = useCallback(
    async (path: string) => {
      if (!save) return;
      const existing = files.find((f) => f.path === path);
      if (existing) {
        setActive(path);
        return;
      }
      const content = await readFileText(save.id, path);
      if (content == null) {
        pushToast(`Não foi possível abrir ${path}`, 'error');
        return;
      }
      setFiles((v) => [...v, { path, content, dirty: false }]);
      setActive(path);
    },
    [files, save, pushToast],
  );

  const loadDir = useCallback(
    async (path: string) => {
      if (!save) return;
      const res = await listFs(save.id, path, 'gui');
      if ('type' in res && res.type === 'dir') setTree((v) => ({ ...v, [path]: res.entries }));
    },
    [save],
  );

  useEffect(() => {
    void loadDir(treeRoot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeRoot, save?.id]);

  useEffect(() => {
    const p = payload?.path;
    if (!p) return;
    const key = `${payload?.nonce ?? 0}:${p}`;
    if (key === lastPayload.current) return;
    lastPayload.current = key;
    void openPath(p);
    const dir = p.split('/').slice(0, -1).join('/') || '/';
    setTreeRoot(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.nonce, payload?.path]);

  useEffect(() => {
    setWinSubtitle(winId, active ?? '');
  }, [active, setWinSubtitle, winId]);

  const current = files.find((f) => f.path === active) ?? null;

  const problems = useMemo(() => {
    if (!current) return [];
    const out: { line: number; text: string; severity: 'warning' | 'error' }[] = [];
    current.content.split('\n').forEach((l, i) => {
      if (/TODO|FIXME|XXX/.test(l))
        out.push({ line: i + 1, text: l.trim().slice(0, 120), severity: 'warning' });
      if (/\b(NULL|nullptr|undefined)\s*(\+|-)/.test(l))
        out.push({ line: i + 1, text: `aritmética suspeita: ${l.trim().slice(0, 100)}`, severity: 'warning' });
      if (/0x[0-9a-f]{8,}/i.test(l))
        out.push({ line: i + 1, text: `constante longa: ${l.trim().slice(0, 100)}`, severity: 'warning' });
    });
    return out;
  }, [current]);

  async function persist() {
    if (!current || !save) return;
    const b64 = btoa(unescape(encodeURIComponent(current.content)));
    const r = await runCommand(`write ${current.path} ${b64}`, 'code');
    if (r?.exitCode === 0) {
      setFiles((v) => v.map((f) => (f.path === current.path ? { ...f, dirty: false } : f)));
      pushToast(`Gravado ${current.path}`, 'success');
    } else {
      pushToast(r?.stderr || 'Falha ao gravar', 'error');
    }
  }

  async function run(kind: 'node' | 'build') {
    if (!current) return;
    setRunning(true);
    setPanel('output');
    if (current.dirty) await persist();
    const r = await runCommand(`${kind} ${current.path}`, 'code');
    setOutput((v) =>
      [
        ...v,
        `$ ${kind} ${current.path}`,
        ...(r?.stdout ? r.stdout.split('\n') : []),
        ...(r?.stderr ? r.stderr.split('\n').map((l) => `! ${l}`) : []),
      ].slice(-400),
    );
    setRunning(false);
  }

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-label">Explorer</span>
        <select
          className="input"
          style={{ width: 150 }}
          value={treeRoot}
          onChange={(e) => setTreeRoot(e.target.value)}
        >
          {['/home/null', '/home/null/investigation', '/opt', '/etc', '/var/log', '/'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="sep" />
        <button className="btn sm" disabled={!current || !current.dirty} onClick={() => void persist()}>
          Gravar (Ctrl+S)
        </button>
        <button
          className="btn sm primary"
          disabled={!current || running}
          onClick={() => void run('node')}
        >
          <IconPlay size={11} /> Executar
        </button>
        <button className="btn sm" disabled={!current || running} onClick={() => void run('build')}>
          Build
        </button>
        <div className="sep" />
        <button
          className="btn sm ghost"
          disabled={!current}
          onClick={() => {
            emit('exec', { command: `cat ${current!.path}` });
            useGame.getState().openApp('terminal');
          }}
        >
          abrir no terminal
        </button>
        <span className="dim toolbar-status">
          {current
            ? `${langOf(current.path)} · ${current.content.split('\n').length} linhas`
            : 'nenhum arquivo'}
        </span>
      </div>

      <div className="split">
        <div className="pane bordered-r" style={{ width: 216, flex: '0 0 216px' }}>
          <div className="pane-head">{treeRoot}</div>
          <div className="pane-scroll tree">
            <TreeLevel
              path={treeRoot}
              entries={tree[treeRoot] ?? []}
              tree={tree}
              depth={0}
              onOpenDir={loadDir}
              onOpenFile={openPath}
              activePath={active}
            />
          </div>
        </div>

        <div className="pane" style={{ flex: 1 }}>
          <div className="tabs">
            {files.map((f) => (
              <button
                key={f.path}
                className={`tab${f.path === active ? ' active' : ''}`}
                onClick={() => setActive(f.path)}
                title={f.path}
              >
                <IconFile size={11} />
                {f.path.split('/').pop()}
                {f.dirty && <span className="modified" />}
                <span
                  className="x"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((v) => v.filter((x) => x.path !== f.path));
                    if (active === f.path) {
                      const rest = files.filter((x) => x.path !== f.path);
                      setActive(rest.length ? rest[rest.length - 1].path : null);
                    }
                  }}
                >
                  <IconClose size={10} />
                </span>
              </button>
            ))}
            {files.length === 0 && <span className="tab active">sem arquivos</span>}
          </div>

          {current ? (
            <div style={{ flex: 1, minHeight: 0 }}>
              <Editor
                height="100%"
                theme="vs-dark"
                language={langOf(current.path)}
                path={current.path}
                value={current.content}
                onChange={(v) =>
                  setFiles((files) =>
                    files.map((f) =>
                      f.path === current.path ? { ...f, content: v ?? '', dirty: true } : f,
                    ),
                  )
                }
                onMount={(editor, monaco) => {
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void persist());
                }}
                options={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 12.5,
                  minimap: { enabled: true, renderCharacters: false },
                  smoothScrolling: true,
                  scrollBeyondLastLine: false,
                  renderWhitespace: 'selection',
                  lineNumbersMinChars: 4,
                  padding: { top: 8 },
                  tabSize: 2,
                }}
              />
            </div>
          ) : (
            <div className="empty-state">
              Abra um arquivo pelo explorer, pelo Files ou pela busca global.
            </div>
          )}

          <div className="pane bordered-t" style={{ height: 168, flex: '0 0 168px' }}>
            <div className="tabs">
              {(['output', 'problems', 'terminal'] as const).map((p) => (
                <button
                  key={p}
                  className={`tab${panel === p ? ' active' : ''}`}
                  onClick={() => setPanel(p)}
                >
                  {p === 'output' ? 'Output' : p === 'problems' ? `Problemas (${problems.length})` : 'Terminal'}
                </button>
              ))}
            </div>
            {panel === 'output' && (
              <pre className="code-pane">
                {output.length ? output.join('\n') : '(nenhuma execução nesta sessão)'}
              </pre>
            )}
            {panel === 'problems' && (
              <div className="pane-scroll">
                {problems.length === 0 && (
                  <div className="empty-state" style={{ padding: 20 }}>
                    Nenhum apontamento estático.
                  </div>
                )}
                {problems.map((p, i) => (
                  <div key={i} className={`log-line ${p.severity === 'error' ? 'err' : 'warn'}`}>
                    <span className="ts">L{p.line}</span>
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
            )}
            {panel === 'terminal' && (
              <div className="code-term">
                <pre className="code-pane" ref={termScrollRef}>
                  {termLines.length
                    ? termLines.join('\n')
                    : 'shell integrado — mesmo runtime do Terminal. tente `ls`, `grep`, `submit`.'}
                </pre>
                <form
                  className="code-term-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cmd = termInput.trim();
                    if (!cmd) return;
                    setTermInput('');
                    void runInline(cmd);
                  }}
                >
                  <span className="prompt">{termCwd} $</span>
                  <input
                    className="bare-input"
                    value={termInput}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="comando"
                    onChange={(e) => setTermInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const i = Math.min(histIdx.current + 1, termHist.current.length);
                        histIdx.current = i;
                        setTermInput(termHist.current[termHist.current.length - i] ?? '');
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const i = Math.max(histIdx.current - 1, 0);
                        histIdx.current = i;
                        setTermInput(i === 0 ? '' : termHist.current[termHist.current.length - i] ?? '');
                      }
                    }}
                  />
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function TreeLevel({
  path,
  entries,
  tree,
  depth,
  onOpenDir,
  onOpenFile,
  activePath,
}: {
  path: string;
  entries: DirEntry[];
  tree: Record<string, DirEntry[] | undefined>;
  depth: number;
  onOpenDir: (p: string) => Promise<void>;
  onOpenFile: (p: string) => Promise<void>;
  activePath: string | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      {entries.map((e) => {
        const p = `${path === '/' ? '' : path}/${e.name}`;
        const isOpen = open[p];
        return (
          <div key={p}>
            <div
              className={`tree-row${e.type === 'dir' ? ' dir' : ''}${
                activePath === p ? ' selected' : ''
              }`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => {
                if (e.type === 'dir') {
                  setOpen((v) => ({ ...v, [p]: !v[p] }));
                  if (!tree[p]) void onOpenDir(p);
                } else void onOpenFile(p);
              }}
            >
              {e.type === 'dir' ? (
                <span className="caret">
                  <IconChevron size={9} style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                </span>
              ) : (
                <span className="caret" />
              )}
              <span className="ico">
                {e.type === 'dir' ? <IconFolder size={12} /> : <IconFile size={12} />}
              </span>
              <span className="mono">{e.name}</span>
            </div>
            {e.type === 'dir' && isOpen && (
              <TreeLevel
                path={p}
                entries={tree[p] ?? []}
                tree={tree}
                depth={depth + 1}
                onOpenDir={onOpenDir}
                onOpenFile={onOpenFile}
                activePath={activePath}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
