import { useEffect, useState } from 'react';
import { listFs, type DirEntry } from '../lib/api';
import { useGame } from '../state/game';
import { runCommand } from '../lib/exec';
import { IconFile, IconPlay, IconRefresh } from '../shell/Icons';

const SOURCE_DIRS = ['/home/null', '/home/null/investigation', '/opt', '/tmp'];
const BUILDABLE = /\.(c|cpp|cc|h|s|asm|js|mjs|ts|sh|java|cs|py)$/i;

export function ForgeApp({ winId }: { winId: string }) {
  const { save, setWinSubtitle, openApp } = useGame();
  const [dir, setDir] = useState(SOURCE_DIRS[0]);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<{ name: string; from: string; at: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!save) return;
    void listFs(save.id, dir, 'gui').then((r) => {
      if ('type' in r && r.type === 'dir') setEntries(r.entries.filter((e) => e.type === 'file'));
    });
  }, [dir, save]);

  useEffect(() => {
    setWinSubtitle(winId, target ?? 'nenhum alvo');
  }, [target, setWinSubtitle, winId]);

  async function exec(kind: 'build' | 'node') {
    if (!target) return;
    setBusy(true);
    setLog((v) => [...v, `$ ${kind} ${target}`]);
    const r = await runCommand(`${kind} ${target}`, 'forge');
    const out = [
      ...(r?.stdout ? r.stdout.split('\n') : []),
      ...(r?.stderr ? r.stderr.split('\n').map((l) => `! ${l}`) : []),
    ].filter(Boolean);
    setLog((v) => [...v, ...out].slice(-500));
    if (kind === 'build' && r?.exitCode === 0) {
      setArtifacts((v) => [
        {
          name: `${target.split('/').pop()?.replace(/\.[a-z]+$/i, '')}.out`,
          from: target,
          at: new Date().toLocaleTimeString('pt-BR'),
        },
        ...v,
      ]);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-label">fonte</span>
        <select className="input" style={{ width: 190 }} value={dir} onChange={(e) => setDir(e.target.value)}>
          {SOURCE_DIRS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <div className="sep" />
        <button className="btn sm primary" disabled={!target || busy} onClick={() => void exec('build')}>
          Build
        </button>
        <button className="btn sm" disabled={!target || busy} onClick={() => void exec('node')}>
          <IconPlay size={11} /> Executar
        </button>
        <button
          className="btn sm ghost"
          disabled={!target}
          onClick={() => target && openApp('code', { path: target })}
        >
          editar no Code
        </button>
        <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setLog([])} title="Limpar log">
          <IconRefresh size={13} />
        </button>
      </div>

      <div className="split">
        <div className="pane bordered-r" style={{ width: 236, flex: '0 0 236px' }}>
          <div className="pane-head">Alvos ({entries.length})</div>
          <div className="pane-scroll tree">
            {entries.map((e) => {
              const p = `${dir}/${e.name}`;
              return (
                <div
                  key={p}
                  className={`tree-row${target === p ? ' selected' : ''}`}
                  onClick={() => setTarget(p)}
                >
                  <span className="ico">
                    <IconFile size={12} />
                  </span>
                  <span className="mono">{e.name}</span>
                  {BUILDABLE.test(e.name) && (
                    <span className="chip accent" style={{ marginLeft: 'auto' }}>
                      build
                    </span>
                  )}
                </div>
              );
            })}
            {entries.length === 0 && (
              <div className="empty-state" style={{ padding: 16 }}>
                Sem arquivos nesta pasta.
              </div>
            )}
          </div>
        </div>

        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-head">Saída de build</div>
          <pre className="code-pane">
            {log.length
              ? log.join('\n')
              : 'abyss-forge — selecione um alvo e execute build.\nCompiladores operam no sandbox efêmero.'}
          </pre>
        </div>

        <div className="pane bordered-l" style={{ width: 232, flex: '0 0 232px' }}>
          <div className="pane-head">Artefatos</div>
          <div className="pane-scroll">
            {artifacts.map((a, i) => (
              <div key={i} className="vault-card" style={{ margin: 'var(--s2)' }}>
                <div className="mono">{a.name}</div>
                <div className="dim tiny">{a.from}</div>
                <div className="dim tiny">{a.at}</div>
              </div>
            ))}
            {artifacts.length === 0 && (
              <div className="empty-state" style={{ padding: 18 }}>
                Nenhum artefato gerado nesta sessão.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
