/** Áudio: SFX de UI + leito ambiente sintetizado + bed de intake. */

let unlocked = false;
let uiVolume = 0.6;
let muted = false;
let ctx: AudioContext | null = null;

let ambientGain: GainNode | null = null;
let ambientSources: AudioScheduledSourceNode[] = [];
let ambientMode: 'desk' | 'intake' | null = null;
let noiseGain: GainNode | null = null;
let noiseSource: AudioBufferSourceNode | null = null;
let intakeBed: HTMLAudioElement | null = null;
let intakeFadeTimer: number | null = null;

export function unlockAudio(prefer: 'desk' | 'intake' = 'desk') {
  unlocked = true;
  void ctx?.resume().catch(() => undefined);
  if (muted) return;
  if (prefer === 'intake') startIntakeAmbience();
  else startAmbient();
}

export function setUiVolume(v: number) {
  uiVolume = Math.max(0, Math.min(1, v));
  if (ambientGain && ctx) {
    ambientGain.gain.setTargetAtTime(ambientLevel(ambientMode ?? 'desk'), ctx.currentTime, 0.08);
  }
  if (noiseGain && ctx) {
    noiseGain.gain.setTargetAtTime(noiseLevel(), ctx.currentTime, 0.05);
  }
  if (intakeBed) intakeBed.volume = intakeBedLevel();
}

export function setMuted(v: boolean) {
  muted = v;
  if (v) stopAllAudio(0.25);
  // ao desmutar no desktop, só leito leve — nunca religa o score do intake
  else startAmbient();
}

/** stubs — mantidos para não quebrar imports residuais */
export function setMusicVolume(_v: number) {}
export function setMusicMode(_next: 'events' | 'ambient' | 'off') {}
export function rememberChapter(_chapter: string) {}
export function stopMusic(_fade = 1) {}
export function playCue(_kind: string, _chapter?: string) {}
export function playChapterMusic(_chapter: string) {}

type UiSound =
  | 'click'
  | 'open'
  | 'close'
  | 'back'
  | 'toggle'
  | 'key'
  | 'notify'
  | 'error'
  | 'success'
  | 'scare';

const UI_CFG: Record<
  Exclude<UiSound, 'scare'>,
  { f: number; to: number; d: number; g: number; type?: OscillatorType }
> = {
  click: { f: 1180, to: 940, d: 0.035, g: 0.035 },
  open: { f: 420, to: 700, d: 0.1, g: 0.05 },
  close: { f: 640, to: 320, d: 0.09, g: 0.045 },
  back: { f: 780, to: 520, d: 0.06, g: 0.04 },
  toggle: { f: 900, to: 1240, d: 0.05, g: 0.035 },
  key: { f: 1500, to: 1400, d: 0.022, g: 0.022, type: 'square' },
  notify: { f: 720, to: 1080, d: 0.16, g: 0.055 },
  error: { f: 240, to: 150, d: 0.2, g: 0.07 },
  success: { f: 660, to: 1320, d: 0.22, g: 0.06, type: 'triangle' },
};

function ensureCtx() {
  if (!unlocked && typeof window !== 'undefined') unlocked = true;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function ambientLevel(mode: 'desk' | 'intake') {
  if (muted) return 0;
  return (mode === 'intake' ? 0.055 : 0.028) * uiVolume;
}

function intakeBedLevel() {
  return muted ? 0 : 0.22 * uiVolume;
}

function noiseLevel() {
  return muted ? 0 : 0.12 * uiVolume;
}

function makeNoiseBuffer(ac: AudioContext, seconds: number, kind: 'white' | 'brown') {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = white;
    else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buf;
}

function clearAmbientSources(fade: number) {
  if (!ctx || !ambientGain) {
    ambientSources = [];
    ambientGain = null;
    ambientMode = null;
    return;
  }
  const g = ambientGain;
  const t0 = ctx.currentTime;
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(g.gain.value, t0);
  g.gain.linearRampToValueAtTime(0, t0 + fade);
  const sources = ambientSources;
  ambientSources = [];
  ambientGain = null;
  ambientMode = null;
  window.setTimeout(() => {
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        /* */
      }
    }
    try {
      g.disconnect();
    } catch {
      /* */
    }
  }, fade * 1000 + 40);
}

function stopIntakeBed(fade = 0.35) {
  if (intakeFadeTimer != null) {
    window.clearInterval(intakeFadeTimer);
    intakeFadeTimer = null;
  }
  const el = intakeBed;
  if (!el) return;
  intakeBed = null;

  const kill = () => {
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } catch {
      /* */
    }
  };

  if (fade <= 0 || el.volume <= 0.001) {
    kill();
    return;
  }

  const start = el.volume;
  const steps = Math.max(1, Math.floor(fade * 16));
  let i = 0;
  intakeFadeTimer = window.setInterval(() => {
    i += 1;
    el.volume = Math.max(0, start * (1 - i / steps));
    if (i >= steps) {
      if (intakeFadeTimer != null) window.clearInterval(intakeFadeTimer);
      intakeFadeTimer = null;
      kill();
    }
  }, Math.max(16, (fade * 1000) / steps));
}

/** Para o score do login imediatamente (OGG + drones). */
export function stopIntakeAmbience(fade = 0.45) {
  stopIntakeBed(fade);
  if (ambientMode === 'intake') clearAmbientSources(fade);
}

/** Bed OGG sinistro (score, não “música de rádio”) sob o drone. */
function startIntakeBed() {
  if (muted || intakeBed) return;
  try {
    const el = new Audio('/audio/09_Simulation_Unknown.ogg');
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    intakeBed = el;
    void el
      .play()
      .then(() => {
        if (intakeBed !== el || muted) {
          el.pause();
          return;
        }
        const target = intakeBedLevel();
        const steps = 24;
        let i = 0;
        intakeFadeTimer = window.setInterval(() => {
          i += 1;
          if (intakeBed !== el) {
            if (intakeFadeTimer != null) window.clearInterval(intakeFadeTimer);
            intakeFadeTimer = null;
            return;
          }
          el.volume = target * (i / steps);
          if (i >= steps && intakeFadeTimer != null) {
            window.clearInterval(intakeFadeTimer);
            intakeFadeTimer = null;
          }
        }, 90);
      })
      .catch(() => {
        if (intakeBed === el) intakeBed = null;
      });
  } catch {
    /* */
  }
}

/**
 * Quarentena / intake: drone dissonante + ruído + bed de suspense.
 * Não é trilha melódica — é score sobrenatural de fundo.
 */
export function startIntakeAmbience() {
  if (muted || uiVolume <= 0) return;
  try {
    stopCaptureNoise(0.2);
    if (ambientMode === 'intake' && ambientGain) {
      startIntakeBed();
      return;
    }
    clearAmbientSources(0.35);
    stopIntakeBed(0.2);

    const ac = ensureCtx();
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    ambientGain = master;
    ambientMode = 'intake';

    const noise = ac.createBufferSource();
    noise.buffer = makeNoiseBuffer(ac, 5, 'brown');
    noise.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 0.7;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 35;
    const ng = ac.createGain();
    ng.gain.value = 0.55;
    noise.connect(hp).connect(lp).connect(ng).connect(master);
    noise.start();
    ambientSources.push(noise);

    const pairs: [number, number][] = [
      [46, 0.42],
      [69.5, 0.28],
      [92.5, 0.16],
      [138.6, 0.08],
    ];
    for (const [hz, g] of pairs) {
      const osc = ac.createOscillator();
      const og = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      og.gain.value = g;
      osc.connect(og).connect(master);
      osc.start();
      ambientSources.push(osc);
    }

    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    ambientSources.push(lfo);

    const whisper = ac.createBufferSource();
    whisper.buffer = makeNoiseBuffer(ac, 3, 'white');
    whisper.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 8;
    const wg = ac.createGain();
    wg.gain.value = 0.04;
    whisper.connect(bp).connect(wg).connect(master);
    whisper.start();
    ambientSources.push(whisper);

    master.gain.linearRampToValueAtTime(ambientLevel('intake'), ac.currentTime + 3.5);
    startIntakeBed();
  } catch {
    /* áudio indisponível */
  }
}

/** Leito ambiente leve do desktop: ruído marrom filtrado + tom grave (sem OGG). */
export function startAmbient() {
  if (muted || uiVolume <= 0) return;
  try {
    // mata score do login (OGG + drones) antes do leito do desktop
    stopIntakeAmbience(0.35);
    stopCaptureNoise(0.2);
    const ac = ensureCtx();
    if (ambientGain && ambientMode === 'desk') return;

    clearAmbientSources(0.2);

    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    ambientGain = master;
    ambientMode = 'desk';

    const noise = ac.createBufferSource();
    noise.buffer = makeNoiseBuffer(ac, 4, 'brown');
    noise.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.Q.value = 0.5;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 40;
    noise.connect(hp).connect(lp).connect(master);
    noise.start();
    ambientSources.push(noise);

    const osc = ac.createOscillator();
    const og = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    og.gain.value = 0.35;
    osc.connect(og).connect(master);
    osc.start();
    ambientSources.push(osc);

    master.gain.linearRampToValueAtTime(ambientLevel('desk'), ac.currentTime + 2.2);
  } catch {
    /* áudio indisponível */
  }
}

export function stopAmbient(fade = 0.8) {
  stopIntakeBed(fade);
  clearAmbientSources(fade);
}

/** Ruído branco contínuo — captura / câmera aberta. */
export function startCaptureNoise() {
  if (muted || uiVolume <= 0) return;
  try {
    stopAmbient(0.3);
    const ac = ensureCtx();
    if (noiseGain) return;

    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    noiseGain = master;

    const noise = ac.createBufferSource();
    noise.buffer = makeNoiseBuffer(ac, 2, 'white');
    noise.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.55;
    noise.connect(bp).connect(master);
    noise.start();
    noiseSource = noise;

    master.gain.linearRampToValueAtTime(noiseLevel() * 1.6, ac.currentTime + 0.08);
    master.gain.linearRampToValueAtTime(noiseLevel(), ac.currentTime + 0.55);
  } catch {
    /* */
  }
}

export function stopCaptureNoise(fade = 0.15) {
  if (!ctx || !noiseGain) return;
  const g = noiseGain;
  const src = noiseSource;
  noiseGain = null;
  noiseSource = null;
  const t0 = ctx.currentTime;
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t0);
  g.gain.linearRampToValueAtTime(0.0001, t0 + fade);
  window.setTimeout(() => {
    try {
      src?.stop();
    } catch {
      /* */
    }
    try {
      g.disconnect();
    } catch {
      /* */
    }
  }, fade * 1000 + 30);
}

/** Corta ambiente + ruído + silencia momentaneamente o leito. */
export function stopAllAudio(fade = 0.12) {
  stopCaptureNoise(fade);
  stopAmbient(fade);
}

/** Sons curtos sintetizados: sem assets. */
export function uiSound(kind: UiSound) {
  if (muted || uiVolume <= 0) return;
  try {
    const ac = ensureCtx();
    if (kind === 'scare') {
      playScareBurst(ac);
      return;
    }
    const cfg = UI_CFG[kind];
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = cfg.type ?? 'sine';
    osc.frequency.setValueAtTime(cfg.f, t0);
    osc.frequency.exponentialRampToValueAtTime(cfg.to, t0 + cfg.d);
    gain.gain.setValueAtTime(cfg.g * uiVolume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + cfg.d);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + cfg.d + 0.02);
  } catch {
    /* áudio indisponível */
  }
}

function playScareBurst(ac: AudioContext) {
  const t0 = ac.currentTime;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.45 * uiVolume, t0 + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
  master.connect(ac.destination);

  const noiseBuf = makeNoiseBuffer(ac, 0.7, 'white');
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuf;
  const nf = ac.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 1100;
  nf.Q.value = 0.5;
  noise.connect(nf).connect(master);
  noise.start(t0);
  noise.stop(t0 + 0.7);
}
