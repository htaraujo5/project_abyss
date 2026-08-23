import { create } from 'zustand';
import type { AppId, EndingId, SaveGame } from '@abyss/shared';
import type { Session } from '../lib/api';
import { uiSound } from '../lib/audio';

export type WinState = {
  id: string;
  app: AppId;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  restore?: { x: number; y: number; w: number; h: number };
};

export type Severity = 'info' | 'warning' | 'error' | 'success';

export type Notification = {
  id: string;
  ts: number;
  severity: Severity;
  kind: string;
  text: string;
  read: boolean;
};

export type Toast = { id: string; text: string; severity: Severity };

export type Settings = {
  uiScale: number;
  contrast: 'normal' | 'high';
  reduceMotion: boolean;
  desktopIcons: boolean;
  terminalTheme: 'graphite' | 'contrast' | 'paper';
  /** `events`: trilha só em momentos marcantes; `ambient`: música contínua */
  musicMode: 'events' | 'ambient' | 'off';
  volumeMusic: number;
  volumeUi: number;
  muted: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  uiScale: 1,
  contrast: 'normal',
  reduceMotion: false,
  desktopIcons: true,
  terminalTheme: 'graphite',
  musicMode: 'off',
  volumeMusic: 0,
  volumeUi: 0.6,
  muted: false,
};

export type CtxMenuItem = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
};

type GameState = {
  phase: 'boot' | 'playing' | 'ending';
  session: Session | null;
  save: SaveGame | null;
  windows: WinState[];
  focusId: string | null;
  zCounter: number;
  toasts: Toast[];
  notifications: Notification[];
  notifOpen: boolean;
  paletteOpen: boolean;
  ctxMenu: { x: number; y: number; items: CtxMenuItem[] } | null;
  settings: Settings;
  appPayload: Partial<Record<AppId, unknown>>;
  payloadNonce: number;
  banner: { title: string; layer: string; text: string } | null;
  uiLocked: boolean;
  captureSequence: boolean;
  /** Epílogo a mostrar após captura (save já pode ter sido zerado). */
  pendingEpilogue: EndingId | null;

  setSession: (s: Session | null) => void;
  setSave: (s: SaveGame | null) => void;
  setPhase: (p: GameState['phase']) => void;
  beginCaptureSequence: () => void;
  endCaptureSequence: () => void;
  clearPendingEpilogue: () => void;

  openApp: (app: AppId, payload?: unknown) => void;
  closeWin: (id: string) => void;
  focusWin: (id: string) => void;
  moveWin: (id: string, x: number, y: number) => void;
  setRect: (id: string, r: Partial<Pick<WinState, 'x' | 'y' | 'w' | 'h'>>) => void;
  minimizeWin: (id: string) => void;
  toggleMaximize: (id: string, bounds: { w: number; h: number }) => void;
  snapWin: (id: string, side: 'left' | 'right' | 'top', bounds: { w: number; h: number }) => void;
  setWinSubtitle: (id: string, subtitle: string) => void;
  cascade: (bounds: { w: number; h: number }) => void;
  tile: (bounds: { w: number; h: number }) => void;
  closeAll: () => void;
  restoreWindows: (wins: WinState[]) => void;

  pushToast: (text: string, severity?: Severity) => void;
  notify: (kind: string, text: string, severity?: Severity) => void;
  markNotifsRead: () => void;
  setNotifOpen: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  openCtxMenu: (x: number, y: number, items: CtxMenuItem[]) => void;
  closeCtxMenu: () => void;

  patchSettings: (s: Partial<Settings>) => void;
  showBanner: (b: GameState['banner']) => void;
};

export const APP_TITLES: Record<AppId, string> = {
  terminal: 'Terminal',
  files: 'Files',
  code: 'Code',
  browser: 'Browser',
  trace: 'Trace',
  graph: 'Graph',
  hex: 'Hex',
  'image-lab': 'Image Lab',
  evidence: 'Evidence Board',
  vault: 'Vault',
  orpheus: 'ORPHEUS',
  forge: 'Forge',
  packet: 'Packet',
  memory: 'Memory',
  settings: 'Settings',
};

export const APP_HINTS: Record<AppId, string> = {
  terminal: 'shell Unix do sandbox',
  files: 'explorador de arquivos',
  code: 'editor com build e output',
  browser: 'navegador de sistemas internos',
  trace: 'logs, eventos e latências',
  graph: 'topologia e relações',
  hex: 'inspeção binária',
  'image-lab': 'forense de imagem',
  evidence: 'quadro investigativo',
  vault: 'artefatos e flags',
  orpheus: 'coletores e sinais',
  forge: 'build e execução',
  packet: 'captura de frames',
  memory: 'dumps de memória',
  settings: 'preferências do sistema',
};

const DEFAULT_SIZE: Record<AppId, { w: number; h: number }> = {
  terminal: { w: 880, h: 460 },
  files: { w: 900, h: 520 },
  code: { w: 1060, h: 620 },
  browser: { w: 980, h: 620 },
  trace: { w: 1020, h: 500 },
  graph: { w: 940, h: 580 },
  hex: { w: 940, h: 520 },
  'image-lab': { w: 1040, h: 580 },
  evidence: { w: 1140, h: 640 },
  vault: { w: 700, h: 460 },
  orpheus: { w: 960, h: 560 },
  forge: { w: 860, h: 500 },
  packet: { w: 960, h: 520 },
  memory: { w: 900, h: 500 },
  settings: { w: 620, h: 520 },
};

let seq = 0;
const nid = () => `${Date.now().toString(36)}-${(seq += 1)}`;

export const useGame = create<GameState>((set, get) => ({
  phase: 'boot',
  session: null,
  save: null,
  windows: [],
  focusId: null,
  zCounter: 10,
  toasts: [],
  notifications: [],
  notifOpen: false,
  paletteOpen: false,
  ctxMenu: null,
  settings: DEFAULT_SETTINGS,
  appPayload: {},
  payloadNonce: 0,
  banner: null,
  uiLocked: false,
  captureSequence: false,
  pendingEpilogue: null,

  setSession: (session) => set({ session }),
  setSave: (save) => set({ save }),
  setPhase: (phase) => set({ phase }),

  beginCaptureSequence: () =>
    set({
      captureSequence: true,
      uiLocked: true,
      windows: [],
      focusId: null,
      paletteOpen: false,
      notifOpen: false,
      ctxMenu: null,
      banner: null,
      pendingEpilogue: 'capture',
    }),

  endCaptureSequence: () => {
    const saveId = get().save?.id;
    if (saveId) {
      void import('../lib/traps').then(({ clearTraps }) => clearTraps(saveId));
    }
    // reset assíncrono do progresso; a UI do epílogo usa pendingEpilogue
    void import('../lib/capture').then(({ resetProgressAfterCapture }) =>
      resetProgressAfterCapture(),
    );
    set({
      captureSequence: false,
      uiLocked: false,
      phase: 'ending',
    });
  },

  clearPendingEpilogue: () => set({ pendingEpilogue: null }),

  openApp: (app, payload) => {
    if (get().uiLocked) return;
    const save = get().save;
    if (save && !save.unlockedApps.includes(app) && app !== 'settings') {
      get().pushToast(`${APP_TITLES[app]} indisponível neste estágio`, 'warning');
      return;
    }
    if (payload !== undefined) {
      // `nonce` garante nova identidade: apps já abertos reagem ao payload
      const nonce = get().payloadNonce + 1;
      set({
        payloadNonce: nonce,
        appPayload: {
          ...get().appPayload,
          [app]: { ...(payload as Record<string, unknown>), nonce },
        },
      });
    }
    const existing = get().windows.find((w) => w.app === app);
    if (existing) {
      set({
        windows: get().windows.map((w) =>
          w.id === existing.id ? { ...w, minimized: false } : w,
        ),
      });
      get().focusWin(existing.id);
      return;
    }
    const z = get().zCounter + 1;
    const size = DEFAULT_SIZE[app] ?? { w: 720, h: 480 };
    const host = document.querySelector('.workspace') as HTMLElement | null;
    const bw = host?.clientWidth ?? window.innerWidth;
    const bh = host?.clientHeight ?? window.innerHeight - 140;
    const w = Math.min(size.w, bw - 32);
    const h = Math.min(size.h, bh - 32);
    const step = (get().windows.length % 6) * 26;
    const win: WinState = {
      id: `${app}-${nid()}`,
      app,
      title: APP_TITLES[app],
      x: Math.max(12, Math.round((bw - w) / 2 - 90) + step),
      y: Math.max(12, Math.round((bh - h) / 2 - 40) + step),
      w,
      h,
      z,
      minimized: false,
      maximized: false,
    };
    set({ windows: [...get().windows, win], focusId: win.id, zCounter: z });
    uiSound('open');
  },

  closeWin: (id) => {
    if (get().uiLocked) return;
    set({
      windows: get().windows.filter((w) => w.id !== id),
      focusId: get().focusId === id ? null : get().focusId,
    });
  },

  focusWin: (id) => {
    if (get().focusId === id) {
      const w = get().windows.find((x) => x.id === id);
      if (w && !w.minimized) return;
    }
    const z = get().zCounter + 1;
    set({
      zCounter: z,
      focusId: id,
      windows: get().windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)),
    });
  },

  moveWin: (id, x, y) =>
    set({ windows: get().windows.map((w) => (w.id === id ? { ...w, x, y } : w)) }),

  setRect: (id, r) =>
    set({ windows: get().windows.map((w) => (w.id === id ? { ...w, ...r } : w)) }),

  minimizeWin: (id) => {
    if (get().uiLocked) return;
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      focusId: get().focusId === id ? null : get().focusId,
    });
  },

  toggleMaximize: (id, bounds) =>
    set({
      windows: get().windows.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized) {
          const r = w.restore ?? { x: 40, y: 40, w: 800, h: 520 };
          return { ...w, ...r, maximized: false, restore: undefined };
        }
        return {
          ...w,
          restore: { x: w.x, y: w.y, w: w.w, h: w.h },
          x: 0,
          y: 0,
          w: bounds.w,
          h: bounds.h,
          maximized: true,
        };
      }),
    }),

  snapWin: (id, side, bounds) =>
    set({
      windows: get().windows.map((w) => {
        if (w.id !== id) return w;
        const base = { maximized: false, restore: w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h } };
        if (side === 'top') {
          return { ...w, ...base, x: 0, y: 0, w: bounds.w, h: bounds.h, maximized: true };
        }
        const half = Math.round(bounds.w / 2);
        return {
          ...w,
          ...base,
          x: side === 'left' ? 0 : half,
          y: 0,
          w: half,
          h: bounds.h,
        };
      }),
    }),

  setWinSubtitle: (id, subtitle) =>
    set({ windows: get().windows.map((w) => (w.id === id ? { ...w, subtitle } : w)) }),

  cascade: (bounds) =>
    set({
      windows: get().windows.map((w, i) => ({
        ...w,
        minimized: false,
        maximized: false,
        x: 24 + i * 32,
        y: 20 + i * 30,
        w: Math.min(w.restore?.w ?? w.w, bounds.w - 48 - i * 32),
        h: Math.min(w.restore?.h ?? w.h, bounds.h - 40 - i * 30),
      })),
    }),

  tile: (bounds) => {
    const wins = get().windows.filter((w) => !w.minimized);
    const cols = Math.ceil(Math.sqrt(wins.length || 1));
    const rows = Math.ceil((wins.length || 1) / cols);
    const cw = Math.floor(bounds.w / cols);
    const chh = Math.floor(bounds.h / rows);
    set({
      windows: get().windows.map((w) => {
        const i = wins.findIndex((x) => x.id === w.id);
        if (i < 0) return w;
        return {
          ...w,
          maximized: false,
          x: (i % cols) * cw,
          y: Math.floor(i / cols) * chh,
          w: cw,
          h: chh,
        };
      }),
    });
  },

  closeAll: () => {
    if (get().uiLocked) return;
    set({ windows: [], focusId: null });
  },
  restoreWindows: (wins) =>
    set({
      windows: wins,
      zCounter: Math.max(10, ...wins.map((w) => w.z)),
      focusId: wins.length ? wins[wins.length - 1].id : null,
    }),

  pushToast: (text, severity = 'info') => {
    const id = nid();
    set({ toasts: [...get().toasts, { id, text, severity }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4600);
  },

  notify: (kind, text, severity = 'info') => {
    const n: Notification = { id: nid(), ts: Date.now(), severity, kind, text, read: false };
    set({ notifications: [n, ...get().notifications].slice(0, 120) });
    get().pushToast(text, severity);
    // som de progresso só em marcadores de objetivo (ver lib/exec.ts)
  },

  markNotifsRead: () =>
    set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
  setNotifOpen: (v) => {
    if (get().uiLocked && v) return;
    set({ notifOpen: v });
    if (v) get().markNotifsRead();
  },
  setPaletteOpen: (paletteOpen) => {
    if (get().uiLocked && paletteOpen) return;
    set({ paletteOpen });
  },
  openCtxMenu: (x, y, items) => {
    if (get().uiLocked) return;
    set({ ctxMenu: { x, y, items } });
  },
  closeCtxMenu: () => set({ ctxMenu: null }),

  patchSettings: (s) => {
    const settings = { ...get().settings, ...s };
    set({ settings });
    localStorage.setItem('abyss_settings', JSON.stringify(settings));
  },

  showBanner: (banner) => {
    set({ banner });
    if (banner) setTimeout(() => set({ banner: null }), 5200);
  },
}));

export function loadStoredSettings(): Settings {
  try {
    const raw = localStorage.getItem('abyss_settings');
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    // trilha removida do jogo — força off mesmo se o save local ainda tiver música
    return { ...parsed, musicMode: 'off', volumeMusic: 0 };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function usePayload<T>(app: AppId): T | undefined {
  return useGame((s) => s.appPayload[app]) as T | undefined;
}
