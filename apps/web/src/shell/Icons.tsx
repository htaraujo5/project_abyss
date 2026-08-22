import type { AppId } from '@abyss/shared';
import type { CSSProperties, ReactNode } from 'react';

type P = { size?: number; style?: CSSProperties };

function Svg({ size = 16, children, style }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconTerminal = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="16" rx="1.5" />
    <path d="M6 9l3 3-3 3M12.5 15h5" />
  </Svg>
);

export const IconFiles = (p: P) => (
  <Svg {...p}>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
    <path d="M3 10h16" />
  </Svg>
);

export const IconCode = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 8.5L4 12l4.5 3.5M15.5 8.5L20 12l-4.5 3.5M13.5 5l-3 14" />
  </Svg>
);

export const IconBrowser = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="16" rx="1.5" />
    <path d="M2.5 8.5h19M5.5 6.3h.01M7.8 6.3h.01" />
  </Svg>
);

export const IconTrace = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18M3 12h12M3 18h15" />
    <path d="M18.5 10.5v3M21 12h-5" />
  </Svg>
);

export const IconGraph = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="5.5" r="2" />
    <circle cx="5" cy="17" r="2" />
    <circle cx="19" cy="17" r="2" />
    <path d="M10.6 7.2 6.4 15.3M13.4 7.2l4.2 8.1M7 17h10" />
  </Svg>
);

export const IconHex = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7.5 4.3v8.4L12 20l-7.5-4.3V7.3z" />
    <path d="M9 10h2v4M13 10h2v4h-2z" />
  </Svg>
);

export const IconImageLab = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="M3.5 17l4.6-4.6 3.4 3.4 3-3 6 6" />
  </Svg>
);

export const IconEvidence = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3.5" width="18" height="17" rx="1.5" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="16" cy="12" r="1.4" />
    <circle cx="9" cy="16.5" r="1.4" />
    <path d="M9.2 8.6l5.5 2.8M14.9 13.2l-4.6 2.6" />
  </Svg>
);

export const IconVault = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <circle cx="12" cy="12" r="3.6" />
    <path d="M12 8.4V6.6M12 17.4v-1.8M8.4 12H6.6M17.4 12h-1.8" />
  </Svg>
);

export const IconOrpheus = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
  </Svg>
);

export const IconForge = (p: P) => (
  <Svg {...p}>
    <path d="M4 19h16M6.5 15.5l4-9 3.5 6 2-3 2.5 6z" />
  </Svg>
);

export const IconPacket = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l8 4.3v8.4l-8 4.3-8-4.3V7.8z" />
    <path d="M4.3 7.9L12 12l7.7-4.1M12 12v8.5" />
  </Svg>
);

export const IconMemory = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="7" width="15" height="10" rx="1" />
    <path d="M7.5 7V4.5M12 7V4.5M16.5 7V4.5M7.5 19.5V17M12 19.5V17M16.5 19.5V17" />
  </Svg>
);

export const IconSettings = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M4 9h4.6M15.4 9H20M4 15h8.6M19.4 15H20" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M15.8 15.8L20.5 20.5" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z" />
    <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
  </Svg>
);

export const IconMinimize = (p: P) => (
  <Svg {...p}>
    <path d="M6 17h12" />
  </Svg>
);

export const IconMaximize = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </Svg>
);

export const IconRestore = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="8.5" width="11" height="11" rx="1" />
    <path d="M8.5 5.5h10v10" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M7 7l10 10M17 7L7 17" />
  </Svg>
);

export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);

export const IconFolder = (p: P) => (
  <Svg {...p}>
    <path d="M3 7a1.5 1.5 0 0 1 1.5-1.5h4L10.5 8h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </Svg>
);

export const IconFile = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 3.5h7L18.5 8.5v12h-12z" />
    <path d="M13 3.5v5h5.5" />
  </Svg>
);

export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5.5" y="10.5" width="13" height="9" rx="1.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
);

export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-1 1" />
    <path d="M14 10a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l1-1" />
  </Svg>
);

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5l10 6.5-10 6.5z" />
  </Svg>
);

export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M19 12a7 7 0 1 1-2.4-5.3M19 4.5V9h-4.5" />
  </Svg>
);

export const IconArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
);

export const IconArrowUp = (p: P) => (
  <Svg {...p}>
    <path d="M6 14.5l6-6 6 6" />
  </Svg>
);

export const IconFilter = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16l-6 7v6l-4-2v-4z" />
  </Svg>
);

export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l8.5 4.5L12 12.5 3.5 8zM3.5 12.5L12 17l8.5-4.5" />
  </Svg>
);

export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 8h.01" />
  </Svg>
);

export const IconWarning = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l8.5 15H3.5z" />
    <path d="M12 9.5v4M12 16h.01" />
  </Svg>
);

export const IconError = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Svg>
);

export const IconSuccess = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 12.5l2.8 2.8L16.5 9.5" />
  </Svg>
);

export const IconAbyss = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.5l9 5.2v10.6l-9 5.2-9-5.2V7.7z" />
    <path d="M12 7l4.5 2.6v5.3L12 17.5 7.5 14.9V9.6z" />
    <circle cx="12" cy="12.2" r="1.4" />
  </Svg>
);

export const APP_ICONS: Record<AppId, (p: P) => ReactNode> = {
  terminal: IconTerminal,
  files: IconFiles,
  code: IconCode,
  browser: IconBrowser,
  trace: IconTrace,
  graph: IconGraph,
  hex: IconHex,
  'image-lab': IconImageLab,
  evidence: IconEvidence,
  vault: IconVault,
  orpheus: IconOrpheus,
  forge: IconForge,
  packet: IconPacket,
  memory: IconMemory,
  settings: IconSettings,
};

export function AppIcon({ app, size = 16 }: { app: AppId; size?: number }) {
  const C = APP_ICONS[app] ?? IconFile;
  return <>{C({ size })}</>;
}

export const SEVERITY_ICONS = {
  info: IconInfo,
  warning: IconWarning,
  error: IconError,
  success: IconSuccess,
};
