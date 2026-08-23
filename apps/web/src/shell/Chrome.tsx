import { useEffect, useRef, useState } from 'react';
import type { AppId } from '@abyss/shared';
import { APP_HINTS, APP_TITLES, useGame } from '../state/game';
import { useMeta } from '../state/meta';
import {
  formatCountdown,
  getBrowserTrapRemainingMs,
  TRAP_EVENT,
} from '../lib/traps';
import {
  AppIcon,
  IconAbyss,
  IconBell,
  IconLock,
  IconSearch,
  IconTerminal,
  IconFiles,
  IconOrpheus,
  IconEvidence,
  SEVERITY_ICONS,
} from './Icons';
import { ProfileMenu } from './ProfileMenu';

/* ------------------------------- top bar --------------------------------- */

export function TopBar() {
  const { save, setPaletteOpen, notifications, notifOpen, setNotifOpen } = useGame();
  const chapterMeta = useMeta((s) => s.chapterMeta);
  const [now, setNow] = useState(() => new Date());
  const [trapMs, setTrapMs] = useState<number | null>(() =>
    getBrowserTrapRemainingMs(save?.id),
  );

  useEffect(() => {
    const tick = () => {
      setNow(new Date());
      setTrapMs(getBrowserTrapRemainingMs(save?.id));
    };
    tick();
    const t = setInterval(tick, 250);
    const onTrap = () => setTrapMs(getBrowserTrapRemainingMs(save?.id));
    window.addEventListener(TRAP_EVENT, onTrap);
    return () => {
      clearInterval(t);
      window.removeEventListener(TRAP_EVENT, onTrap);
    };
  }, [save?.id]);

  const unread = notifications.filter((n) => !n.read).length;
  const meta = save ? chapterMeta[save.currentChapter] : undefined;
  const solved = save ? Object.values(save.puzzles).filter((p) => p.status === 'completed').length : 0;
  const showCountdown = trapMs != null;

  return (
    <header className="topbar">
      <span style={{ color: 'var(--accent-soft)', display: 'grid' }}>
        <IconAbyss size={15} />
      </span>
      <span className="topbar-brand">ABYSS</span>
      <div className="topbar-sep" />
      {meta && (
        <span className="chip accent" title={meta.question}>
          {meta.layer} · {meta.title}
        </span>
      )}
      <span className="chip">{solved} puzzles</span>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button className="topbar-search" onClick={() => setPaletteOpen(true)}>
          <IconSearch size={12} />
          <span>Buscar arquivos, evidências, comandos…</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <ProfileMenu />
      <div className="topbar-sep" />
      <button
        className="topbar-item"
        onClick={() => setNotifOpen(!notifOpen)}
        title="Notificações"
      >
        <IconBell size={14} />
        {unread > 0 && <span className="badge-count">{unread}</span>}
      </button>
      <span
        className={`topbar-clock${showCountdown ? ' countdown' : ''}`}
        title={showCountdown ? 'link externo — tempo restante' : undefined}
      >
        {showCountdown
          ? formatCountdown(trapMs)
          : now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </header>
  );
}

/* --------------------------- notification center -------------------------- */

export function NotificationCenter() {
  const { notifications, notifOpen, setNotifOpen } = useGame();
  if (!notifOpen) return null;
  return (
    <div className="notif-center">
      <div className="pane-head">
        Notificações
        <button
          className="btn sm ghost"
          style={{ marginLeft: 'auto' }}
          onClick={() => setNotifOpen(false)}
        >
          fechar
        </button>
      </div>
      <div className="pane-scroll">
        {notifications.length === 0 && (
          <div className="empty-state" style={{ padding: 24 }}>
            Nenhum evento de sistema registrado.
          </div>
        )}
        {notifications.map((n) => {
          const Ico = SEVERITY_ICONS[n.severity];
          return (
            <div key={n.id} className="notif">
              <span className={`sev ${n.severity}`}>
                <Ico size={13} />
              </span>
              <div className="body">
                <div className="kind">
                  {n.kind} ·{' '}
                  {new Date(n.ts).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div>{n.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- status bar ------------------------------ */

export function StatusBar({ sandbox, wsOnline }: { sandbox: string; wsOnline: boolean }) {
  const { save, windows } = useGame();
  const chapter = useMeta((s) => s.chapter);
  const evidenceCount = save ? Object.keys(save.evidence).length : 0;
  const flags = save ? Object.keys(save.flags).filter((f) => f.startsWith('flag.')).length : 0;
  const available = save
    ? Object.values(save.puzzles).filter((p) => p.status === 'available').length
    : 0;

  return (
    <footer className="statusbar">
      <span className="sb-item">
        <i className={`dot ${wsOnline ? 'ok' : 'warn'}`} />
        {wsOnline ? 'runtime conectado' : 'runtime http'}
      </span>
      <span className="sb-item">sandbox:{sandbox}</span>
      <span className="sb-item">cwd {save?.cwd ?? '/home/null'}</span>
      <span className="sb-spacer" />
      <span className="sb-item">{chapter?.title ?? '—'}</span>
      <span className="sb-item">abertos {available}</span>
      <span className="sb-item">evidências {evidenceCount}</span>
      <span className="sb-item">flags {flags}</span>
      <span className="sb-item">janelas {windows.filter((w) => !w.minimized).length}</span>
      <span className="sb-item">
        <i className="dot accent" />
        {save?.name ?? 'sem save'}
      </span>
    </footer>
  );
}

/* ---------------------------------- dock --------------------------------- */

const DOCK_LABELS: Partial<Record<AppId, string>> = {
  evidence: 'Evidence',
  'image-lab': 'Img Lab',
  orpheus: 'Orpheus',
  settings: 'Ajustes',
};

const DOCK_GROUPS: AppId[][] = [
  ['files', 'terminal', 'code', 'browser'],
  ['trace', 'graph', 'hex', 'image-lab', 'packet', 'memory', 'forge'],
  ['evidence', 'orpheus', 'vault'],
  ['settings'],
];

export function Dock() {
  const { save, windows, openApp, focusId, focusWin, minimizeWin, closeWin, openCtxMenu } =
    useGame();

  return (
    <nav className="dock">
      <div className="dock-inner">
        {DOCK_GROUPS.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', alignItems: 'flex-start' }}>
            {gi > 0 && <div className="dock-sep" />}
            {group.map((app, i) => {
              const unlocked = !save || save.unlockedApps.includes(app) || app === 'settings';
              const win = windows.find((w) => w.app === app);
              const idx = DOCK_GROUPS.slice(0, gi).reduce((a, g) => a + g.length, 0) + i + 1;
              return (
                <button
                  key={app}
                  className={`dock-btn${win ? ' open' : ''}${unlocked ? '' : ' locked'}`}
                  title={
                    unlocked
                      ? `${APP_TITLES[app]} — ${APP_HINTS[app]}${idx <= 9 ? ` (Ctrl+${idx})` : ''}`
                      : `${APP_TITLES[app]} — indisponível`
                  }
                  onClick={() => {
                    if (!unlocked) return openApp(app);
                    if (win && focusId === win.id && !win.minimized) minimizeWin(win.id);
                    else if (win) focusWin(win.id);
                    else openApp(app);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openCtxMenu(e.clientX, e.clientY, [
                      { label: `Abrir ${APP_TITLES[app]}`, onClick: () => openApp(app) },
                      {
                        label: 'Fechar janela',
                        disabled: !win,
                        onClick: () => win && closeWin(win.id),
                      },
                    ]);
                  }}
                >
                  <span className="glyph">
                    {unlocked ? <AppIcon app={app} size={17} /> : <IconLock size={15} />}
                  </span>
                  <span className="label">{DOCK_LABELS[app] ?? APP_TITLES[app]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

/* ------------------------------ desktop icons ----------------------------- */

const DESKTOP_ITEMS: { app: AppId; label: string; Icon: typeof IconFiles }[] = [
  { app: 'files', label: 'Files', Icon: IconFiles },
  { app: 'terminal', label: 'Terminal', Icon: IconTerminal },
  { app: 'evidence', label: 'Evidence', Icon: IconEvidence },
  { app: 'orpheus', label: 'ORPHEUS', Icon: IconOrpheus },
];

export function DesktopIcons() {
  const { save, openApp, settings, openCtxMenu } = useGame();
  const [sel, setSel] = useState<AppId | null>(null);
  const items = DESKTOP_ITEMS.filter((d) => !save || save.unlockedApps.includes(d.app));

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      const i = items.findIndex((d) => d.app === sel);
      if (i < 0) return;
      if (e.key === 'Enter') {
        openApp(sel);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        setSel(items[next].app);
      }
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, items, openApp]);

  if (!settings.desktopIcons) return null;
  return (
    <div className="desktop-icons" onClick={() => setSel(null)}>
      {items.map((d) => (
        <button
          key={d.app}
          className={`desktop-icon${sel === d.app ? ' selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setSel(d.app);
          }}
          onDoubleClick={() => openApp(d.app)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSel(d.app);
            openCtxMenu(e.clientX, e.clientY, [
              { label: `Abrir ${d.label}`, onClick: () => openApp(d.app) },
              { label: 'Abrir em nova janela', onClick: () => openApp(d.app) },
            ]);
          }}
          title={`${d.label} — duplo clique ou Enter para abrir`}
        >
          <span className="glyph">
            <d.Icon size={22} />
          </span>
          <span className="label">{d.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- context menu ---------------------------- */

export function ContextMenu() {
  const { ctxMenu, closeCtxMenu } = useGame();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeCtxMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCtxMenu();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu, closeCtxMenu]);

  if (!ctxMenu) return null;
  const x = Math.min(ctxMenu.x, window.innerWidth - 200);
  const y = Math.min(ctxMenu.y, window.innerHeight - ctxMenu.items.length * 28 - 16);

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} ref={ref}>
      {ctxMenu.items.map((it, i) =>
        it.separator ? (
          <div className="ctx-sep" key={i} />
        ) : (
          <button
            key={i}
            className="ctx-item"
            disabled={it.disabled}
            onClick={() => {
              it.onClick?.();
              closeCtxMenu();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

/* ---------------------------------- toasts ------------------------------- */

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toast-stack">
      {toasts.map((t) => {
        const Ico = SEVERITY_ICONS[t.severity];
        return (
          <div key={t.id} className={`toast ${t.severity}`}>
            <span className={`sev ${t.severity}`} style={{ marginTop: 1 }}>
              <Ico size={13} />
            </span>
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
