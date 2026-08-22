import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppId } from '@abyss/shared';
import { APP_HINTS, APP_TITLES, useGame } from '../state/game';
import { useMeta } from '../state/meta';
import { searchAll } from '../lib/api';
import { emit } from '../lib/bus';
import { AppIcon, IconFile, IconEvidence, IconTerminal, IconHex, IconChevron } from './Icons';

type Row = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
};

const APP_ORDER: AppId[] = [
  'terminal',
  'files',
  'code',
  'browser',
  'trace',
  'graph',
  'hex',
  'image-lab',
  'evidence',
  'orpheus',
  'vault',
  'packet',
  'memory',
  'forge',
  'settings',
];

export function CommandPalette({ bounds }: { bounds: { w: number; h: number } }) {
  const {
    paletteOpen,
    setPaletteOpen,
    openApp,
    save,
    windows,
    tile,
    cascade,
    closeAll,
    pushToast,
  } = useGame();
  const puzzles = useMeta((s) => s.puzzles);
  const chapter = useMeta((s) => s.chapter);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof searchAll>> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ('');
      setSel(0);
      setRemote(null);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen || !save || q.trim().length < 2 || q.startsWith('>')) {
      setRemote(null);
      return;
    }
    const t = setTimeout(() => {
      searchAll(save.id, q.trim())
        .then(setRemote)
        .catch(() => setRemote(null));
    }, 180);
    return () => clearTimeout(t);
  }, [q, paletteOpen, save]);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    const out: Row[] = [];

    if (term.startsWith('>')) {
      const cmd = q.trim().slice(1).trim();
      if (cmd) {
        out.push({
          id: 'exec',
          group: 'Terminal',
          label: `Executar: ${cmd}`,
          hint: 'enter',
          icon: <IconTerminal size={14} />,
          run: () => {
            openApp('terminal');
            emit('exec', { command: cmd });
          },
        });
      }
      return out;
    }

    for (const app of APP_ORDER) {
      if (term && !`${APP_TITLES[app]} ${APP_HINTS[app]}`.toLowerCase().includes(term)) continue;
      const unlocked = !save || save.unlockedApps.includes(app) || app === 'settings';
      out.push({
        id: `app-${app}`,
        group: 'Aplicações',
        label: APP_TITLES[app],
        hint: unlocked ? APP_HINTS[app] : 'bloqueado',
        icon: <AppIcon app={app} size={14} />,
        run: () => openApp(app),
      });
    }

    const actions: { label: string; hint: string; run: () => void }[] = [
      { label: 'Organizar janelas em grade', hint: 'tile', run: () => tile(bounds) },
      { label: 'Cascatear janelas', hint: 'cascade', run: () => cascade(bounds) },
      { label: 'Fechar todas as janelas', hint: `${windows.length} abertas`, run: closeAll },
      {
        label: 'Copiar resumo da investigação',
        hint: 'clipboard',
        run: () => {
          const txt = save
            ? `${save.name} · ${save.currentChapter} · ${
                Object.values(save.puzzles).filter((p) => p.status === 'completed').length
              } puzzles · ${Object.keys(save.evidence).length} evidências`
            : '';
          void navigator.clipboard.writeText(txt);
          pushToast('Resumo copiado', 'success');
        },
      },
    ];
    for (const a of actions) {
      if (term && !a.label.toLowerCase().includes(term)) continue;
      out.push({
        id: `act-${a.label}`,
        group: 'Ações',
        label: a.label,
        hint: a.hint,
        icon: <IconChevron size={13} />,
        run: a.run,
      });
    }

    if (chapter) {
      for (const site of chapter.websites) {
        if (term && !`${site.host} ${site.title}`.toLowerCase().includes(term)) continue;
        out.push({
          id: `site-${site.host}`,
          group: 'Sistemas',
          label: site.title,
          hint: site.host,
          icon: <AppIcon app="browser" size={14} />,
          run: () => openApp('browser', { host: site.host }),
        });
      }
    }

    if (term.length >= 2) {
      for (const p of puzzles) {
        if (!save?.puzzles[p.id]) continue;
        if (!`${p.id} ${p.title}`.toLowerCase().includes(term)) continue;
        out.push({
          id: `pz-${p.id}`,
          group: 'Puzzles',
          label: `${p.id} — ${p.title}`,
          hint: save.puzzles[p.id]?.status,
          icon: <IconEvidence size={14} />,
          run: () => openApp('evidence', { tab: 'puzzles', puzzleId: p.id }),
        });
        if (out.length > 80) break;
      }
    }

    for (const f of remote?.files ?? []) {
      out.push({
        id: `file-${f.path}${f.line ?? ''}`,
        group: 'Arquivos',
        label: f.path,
        hint: f.line ? `:${f.line} ${f.excerpt ?? ''}`.slice(0, 60) : undefined,
        icon: f.path.match(/\.(bin|dat|img|png|jpg)$/) ? <IconHex size={14} /> : <IconFile size={14} />,
        run: () =>
          f.path.match(/\.(png|jpg|jpeg|bmp)$/)
            ? openApp('image-lab', { path: f.path })
            : openApp('code', { path: f.path }),
      });
    }

    for (const e of remote?.evidence ?? []) {
      out.push({
        id: `ev-${e.id}`,
        group: 'Evidências',
        label: e.title,
        hint: e.kind,
        icon: <IconEvidence size={14} />,
        run: () => {
          openApp('evidence', { tab: 'board', evidenceId: e.id });
          emit('focus-evidence', { id: e.id });
        },
      });
    }

    return out;
  }, [q, save, remote, puzzles, chapter, bounds, windows.length, openApp, tile, cascade, closeAll, pushToast]);

  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  if (!paletteOpen) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return setPaletteOpen(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => (s + 1) % Math.max(1, rows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (s - 1 + rows.length) % Math.max(1, rows.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[sel]?.run();
      setPaletteOpen(false);
    }
  }

  let lastGroup = '';

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setPaletteOpen(false)}>
      <div className="palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Buscar arquivos, evidências, puzzles…   ( > comando para o terminal )"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {rows.length === 0 && (
            <div className="empty-state" style={{ padding: 28 }}>
              Nada encontrado. Use <span className="mono">&gt; comando</span> para executar no
              terminal.
            </div>
          )}
          {rows.map((r, i) => {
            const head = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {head && <div className="palette-group">{head}</div>}
                <button
                  className={`palette-row${i === sel ? ' active' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => {
                    r.run();
                    setPaletteOpen(false);
                  }}
                >
                  <span style={{ color: 'var(--muted)', display: 'grid' }}>{r.icon}</span>
                  <span className="mono" style={{ fontSize: 11.5 }}>
                    {r.label}
                  </span>
                  {r.hint && <span className="hint">{r.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="statusbar" style={{ height: 22, borderTop: '1px solid var(--line)' }}>
          <span className="sb-item">↑↓ navegar</span>
          <span className="sb-item">enter abrir</span>
          <span className="sb-item">esc fechar</span>
          <span className="sb-spacer" />
          <span className="sb-item">{rows.length} resultados</span>
        </div>
      </div>
    </div>
  );
}
