/** Áudio: SFX de UI + leito ambiente sintetizado (sem música). */

let unlocked = false;
let uiVolume = 0.6;
let muted = false;
let ctx: AudioContext | null = null;

let ambientGain: GainNode | null = null;
let ambientSources: AudioScheduledSourceNode[] = [];
let noiseGain: GainNode | null = null;
let noiseSource: AudioBufferSourceNode | null = null;

export function unlockAudio() {
  unlocked = true;
  void ctx?.resume().catch(() => undefined);
  if (!muted) startAmbient();
}

export function setUiVolume(v: number) {
  uiVolume = Math.max(0, Math.min(1, v));
  if (ambientGain && ctx) {
    ambientGain.gain.setTargetAtTime(ambientLevel(), ctx.currentTime, 0.08);
  }
  if (noiseGain && ctx) {
    noiseGain.gain.setTargetAtTime(noiseLevel(), ctx.currentTime, 0.05);
  }
}

export function setMuted(v: boolean) {
  muted = v;
  if (v) stopAllAudio(0.25);
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

function ambientLevel() {
  return muted ? 0 : 0.028 * uiVolume;
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

/** Leito ambiente leve: ruído marrom filtrado + tom grave quase inaudível. */
export function startAmbient() {
  if (muted || uiVolume <= 0) return;
  try {
    const ac = ensureCtx();
    if (ambientGain) return;

    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    ambientGain = master;

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

    // pulso muito baixo — “sala / servidor distante”
    const osc = ac.createOscillator();
    const og = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    og.gain.value = 0.35;
    osc.connect(og).connect(master);
    osc.start();
    ambientSources.push(osc);

    master.gain.linearRampToValueAtTime(ambientLevel(), ac.currentTime + 2.2);
  } catch {
    /* áudio indisponível */
  }
}

export function stopAmbient(fade = 0.8) {
  if (!ctx || !ambientGain) return;
  const g = ambientGain;
  const t0 = ctx.currentTime;
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(g.gain.value, t0);
  g.gain.linearRampToValueAtTime(0, t0 + fade);
  const sources = ambientSources;
  ambientSources = [];
  ambientGain = null;
  window.setTimeout(() => {
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    try {
      g.disconnect();
    } catch {
      /* */
    }
  }, fade * 1000 + 40);
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

    // micro susto na abertura da câmera
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

/** Estouro agressivo residual (opcional). */
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
