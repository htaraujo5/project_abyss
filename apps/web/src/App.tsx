import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppId } from '@abyss/shared';
import { saveUiState } from './lib/api';
import { loadStoredSettings, useGame } from './state/game';
import { useMeta } from './state/meta';
import { WindowFrame } from './shell/WindowFrame';
import {
  ContextMenu,
  Dock,
  DesktopIcons,
  NotificationCenter,
  StatusBar,
  Toasts,
  TopBar,
} from './shell/Chrome';
import { CommandPalette } from './shell/CommandPalette';
import { IntakeConsole } from './features/Intake';
import { TerminalApp } from './features/TerminalApp';
import { FilesApp } from './features/FilesApp';
import { CodeApp } from './features/CodeApp';
import { BrowserApp } from './features/BrowserApp';
import { TraceApp } from './features/TraceApp';
import { GraphApp } from './features/GraphApp';
import { HexApp } from './features/HexApp';
import { ImageLabApp } from './features/ImageLabApp';
import { PacketApp } from './features/PacketApp';
import { MemoryApp } from './features/MemoryApp';
import { ForgeApp } from './features/ForgeApp';
import { OrpheusApp } from './features/OrpheusApp';
import { EvidenceApp } from './features/EvidenceApp';
import { VaultApp } from './features/VaultApp';
import { SettingsApp } from './features/SettingsApp';
import { ChapterBanner, ChapterQuestion, EndingOverlay } from './features/Narrative';
import { CaptureSequence } from './features/CaptureSequence';
import { setMuted, setUiVolume, startAmbient, uiSound } from './lib/audio';
import { installCamadaC } from './lib/camada-c';
import { checkTraps, syncChapterClock } from './lib/traps';
import { triggerTrapCapture } from './lib/capture';

const SHORTCUT_ORDER: AppId[] = [
  'files',
  'terminal',
  'code',
  'browser',
  'trace',
  'graph',
  'hex',
  'image-lab',
  'evidence',
];

function AppBody({ app, winId }: { app: AppId; winId: string }) {
  switch (app) {
    case 'terminal':
      return <TerminalApp winId={winId} />;
    case 'files':
      return <FilesApp winId={winId} />;
    case 'code':
      return <CodeApp winId={winId} />;
    case 'browser':
      return <BrowserApp winId={winId} />;
    case 'trace':
      return <TraceApp winId={winId} />;
    case 'graph':
      return <GraphApp winId={winId} />;
    case 'hex':
      return <HexApp winId={winId} />;
    case 'image-lab':
      return <ImageLabApp winId={winId} />;
    case 'packet':
      return <PacketApp winId={winId} />;
    case 'memory':
      return <MemoryApp winId={winId} />;
    case 'forge':
      return <ForgeApp winId={winId} />;
    case 'orpheus':
      return <OrpheusApp winId={winId} />;
    case 'evidence':
      return <EvidenceApp winId={winId} />;
    case 'vault':
      return <VaultApp />;
    case 'settings':
      return <SettingsApp />;
    default:
      return null;
  }
}

/* --------------------------------- desktop ------------------------------- */

function Desktop() {
  const save = useGame((s) => s.save)!;
  const windows = useGame((s) => s.windows);
  const phase = useGame((s) => s.phase);
  const captureSequence = useGame((s) => s.captureSequence);
  const uiLocked = useGame((s) => s.uiLocked);
  const settings = useGame((s) => s.settings);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsOnline, setWsOnline] = useState(false);
  const [sandbox, setSandbox] = useState('vfs');
  const workspaceRef = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({ w: 1280, h: 640 });

  useLayoutEffect(() => {
    const measure = () => {
      const el = workspaceRef.current;
      if (el) setBounds({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // armadilhas secretas: browser (5 min) e capítulo (4 h)
  useEffect(() => {
    if (!save || uiLocked || captureSequence || phase === 'ending') return;
    syncChapterClock(save.id, save.currentChapter, save.chapterEnteredAt);
    const tick = () => {
      const g = useGame.getState();
      const s = g.save;
      if (!s || g.uiLocked || g.captureSequence || g.phase === 'ending' || s.ending) return;
      const reason = checkTraps(s.id, s.currentChapter, s.chapterEnteredAt);
      if (reason) void triggerTrapCapture(reason);
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [save?.id, save?.currentChapter, save?.chapterEnteredAt, uiLocked, captureSequence, phase]);

  // efeitos de UI para qualquer controle, sem instrumentar cada componente
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-sfx], button, [role="button"], .tree-row, .dock-btn, .desktop-icon, .tab, .log-line, .palette-row',
      );
      if (!el || el.hasAttribute('disabled')) return;
      const explicit = el.dataset.sfx as Parameters<typeof uiSound>[0] | undefined;
      if (explicit) return uiSound(explicit);
      if (el.classList.contains('close')) return uiSound('close');
      if (el.matches('input, select, textarea')) return;
      uiSound('click');
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    void fetch('/api/health')
      .then((r) => r.json())
      .then((h: { sandbox?: string }) => h.sandbox && setSandbox(h.sandbox))
      .catch(() => undefined);
  }, []);

  // canal de runtime (indicador de status; o exec principal usa HTTP)
  useEffect(() => {
    const token = localStorage.getItem('abyss_token') ?? '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try {
      const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?token=${token}&saveId=${save.id}`);
      ws.onopen = () => setWsOnline(true);
      ws.onclose = () => setWsOnline(false);
      ws.onerror = () => setWsOnline(false);
      wsRef.current = ws;
      // fechar durante o handshake gera erro no console: espera abrir
      return () => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.addEventListener('open', () => ws.close());
        } else {
          ws.close();
        }
      };
    } catch {
      setWsOnline(false);
    }
  }, [save.id]);

  // persistência do layout de janelas por save
  useEffect(() => {
    const t = setTimeout(() => {
      void saveUiState(save.id, { windows });
    }, 900);
    return () => clearTimeout(t);
  }, [windows, save.id]);

  // atalhos globais (UI/UX doc §UX "atalhos de teclado consistentes")
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().uiLocked) {
        e.preventDefault();
        return;
      }
      const g = useGame.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        return g.setPaletteOpen(!g.paletteOpen);
      }
      if (e.key === 'Escape') {
        if (g.paletteOpen) g.setPaletteOpen(false);
        if (g.notifOpen) g.setNotifOpen(false);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        return g.tile({ w: bounds.w, h: bounds.h });
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        return g.cascade({ w: bounds.w, h: bounds.h });
      }
      if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const app = SHORTCUT_ORDER[Number(e.key) - 1];
        if (app) g.openApp(app);
        return;
      }
      const focused = g.windows.find((w) => w.id === g.focusId);
      if (!focused) return;
      if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        return g.closeWin(focused.id);
      }
      if (mod && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        return g.minimizeWin(focused.id);
      }
      if (e.key === 'F11') {
        e.preventDefault();
        return g.toggleMaximize(focused.id, { w: bounds.w, h: bounds.h });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bounds]);

  // sons de interface + leito ambiente conforme preferências
  useEffect(() => {
    setUiVolume(settings.volumeUi);
    setMuted(settings.muted);
    if (!settings.muted && phase === 'playing') startAmbient();
  }, [settings.volumeUi, settings.muted, phase]);

  return (
    <div className="desktop">
      <TopBar />
      <main
        className="workspace"
        ref={workspaceRef}
        onContextMenu={(e) => {
          if (uiLocked) {
            e.preventDefault();
            return;
          }
          if ((e.target as HTMLElement).closest('.window, .desktop-icon')) return;
          e.preventDefault();
          const g = useGame.getState();
          g.openCtxMenu(e.clientX, e.clientY, [
            { label: 'Abrir Terminal', onClick: () => g.openApp('terminal') },
            { label: 'Abrir Files', onClick: () => g.openApp('files') },
            { label: 'Abrir Evidence Board', onClick: () => g.openApp('evidence') },
            { label: '', separator: true },
            { label: 'Organizar em grade', onClick: () => g.tile(bounds) },
            { label: 'Cascatear', onClick: () => g.cascade(bounds) },
            { label: 'Fechar todas', onClick: () => g.closeAll() },
            { label: '', separator: true },
            { label: 'Busca global (Ctrl+K)', onClick: () => g.setPaletteOpen(true) },
            {
              label: g.settings.desktopIcons ? 'Ocultar ícones' : 'Mostrar ícones',
              onClick: () => g.patchSettings({ desktopIcons: !g.settings.desktopIcons }),
            },
            { label: 'Ajustes', onClick: () => g.openApp('settings') },
          ]);
        }}
      >
        <DesktopIcons />
        {windows.map((w) => (
          <WindowFrame key={w.id} win={w} bounds={bounds}>
            <AppBody app={w.app} winId={w.id} />
          </WindowFrame>
        ))}
        <ChapterQuestion />
        <NotificationCenter />
      </main>
      <StatusBar sandbox={sandbox} wsOnline={wsOnline} />
      <Dock />
      <Toasts />
      <ContextMenu />
      <CommandPalette bounds={bounds} />
      <ChapterBanner />
      {captureSequence && <CaptureSequence />}
      {phase === 'ending' && !captureSequence && <EndingOverlay />}
    </div>
  );
}

export function App() {
  const phase = useGame((s) => s.phase);
  const save = useGame((s) => s.save);
  const settings = useGame((s) => s.settings);
  const patchSettings = useGame((s) => s.patchSettings);

  useEffect(() => {
    patchSettings(loadStoredSettings());
    void useMeta.getState().loadStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || !save) return;
    installCamadaC(() => {
      const s = useGame.getState().save;
      if (!s) return { chapter: 'prologue', flags: {}, puzzlesCompleted: 0 };
      return {
        chapter: s.currentChapter,
        flags: s.flags,
        puzzlesCompleted: Object.values(s.puzzles).filter((p) => p.status === 'completed').length,
      };
    });
  }, [phase, save?.id, save?.currentChapter]);

  // tokens de tema, escala, contraste e evolução visual por capítulo
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(settings.uiScale));
    root.dataset.contrast = settings.contrast;
    root.dataset.reduceMotion = String(settings.reduceMotion);
    root.dataset.chapter = save?.currentChapter ?? 'prologue';
  }, [settings.uiScale, settings.contrast, settings.reduceMotion, save?.currentChapter]);

  if (phase === 'boot' || !save) return <IntakeConsole />;
  return <Desktop />;
}
