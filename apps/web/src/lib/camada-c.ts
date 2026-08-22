import { CHAPTER_ORDER, type ChapterId } from '@abyss/shared';

export type CamadaCProgress = {
  chapter: string;
  flags: Record<string, boolean>;
  puzzlesCompleted: number;
};

const SHADOW_TIPS: Partial<Record<ChapterId, string>> = {
  deep: 'grep -r shadow /var/log',
  dark: 'submit accepts more than one shape',
  charter: 'empty responses still carry metadata',
  mariana: 'intermediate layers alter payloads',
  abyss: 'trace the path not the label',
  primarch: 'who watches the watcher',
  observer: 'runtime extends past the desktop',
  epilogue: 'endings are inputs too',
};

let booted = false;
let lastChapter: string | null = null;
let origFetch: typeof window.fetch | null = null;

function chapterIndex(chapter: string): number {
  const idx = CHAPTER_ORDER.indexOf(chapter as ChapterId);
  return idx < 0 ? 0 : idx;
}

function applyProgressHints(getProgress: () => CamadaCProgress) {
  const { chapter } = getProgress();
  if (chapter === lastChapter) return;
  lastChapter = chapter;

  const idx = chapterIndex(chapter);

  if (chapter === 'prologue') {
    console.debug('[ABYSS/runtime] quarantine note: dot entries omitted from GUI listings');
  }

  if (idx >= chapterIndex('deep')) {
    const tip = SHADOW_TIPS[chapter as ChapterId] ?? SHADOW_TIPS.deep!;
    const encoded = btoa(tip);
    if (localStorage.getItem('abyss.shadow') !== encoded) {
      localStorage.setItem('abyss.shadow', encoded);
    }
  }

  if (idx >= chapterIndex('dark')) {
    console.debug('[ABYSS/ws] frame {"op":"relay","ref":"submit","note":"manual pages exist"}');
  }
}

function attachFetchTap() {
  if (origFetch) return;
  origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await origFetch!(...args);
    try {
      const input = args[0];
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (url.includes('/api/saves/')) {
        const signal = res.headers.get('x-abyss-signal');
        if (signal) console.debug('[ABYSS/signal]', signal);
      }
    } catch {
      /* observer channel must not interfere with gameplay */
    }
    return res;
  };
}

export function installCamadaC(getProgress: () => CamadaCProgress) {
  if (!booted) {
    booted = true;
    console.log('[ABYSS/runtime] observer channel attached');
    console.log('[ABYSS/runtime] tip: Network tab may carry quarantine headers');
    attachFetchTap();
  }

  applyProgressHints(getProgress);
}
