import { useEffect, useMemo, useRef, useState } from 'react';
import { startCaptureNoise, stopAllAudio } from '../lib/audio';
import {
  getSensorSnapshot,
  requestSensorPermissions,
  sensorIntelLines,
  type SensorSnapshot,
} from '../lib/sensors';
import { useGame } from '../state/game';

type ChatLine = { from: 'them' | 'sys'; text: string; delay: number };

function buildChat(sensors: SensorSnapshot): ChatLine[] {
  const intel = sensorIntelLines(sensors);
  const lines: ChatLine[] = [
    { from: 'them', text: 'olá.', delay: 800 },
    { from: 'them', text: 'você achou que estava investigando a rede.', delay: 2000 },
    { from: 'them', text: 'nós estávamos investigando você.', delay: 1800 },
    { from: 'sys', text: 'inverted channel · duplex video locked', delay: 1100 },
    { from: 'them', text: 'cada comando. cada arquivo. cada dica.', delay: 1900 },
    { from: 'them', text: 'o sandbox era isca. o desktop, espelho.', delay: 1800 },
    { from: 'sys', text: 'host fingerprint exfiltrado', delay: 900 },
  ];

  for (const row of intel) {
    lines.push({ from: 'sys', text: row, delay: 850 });
  }

  if (sensors.ip) {
    lines.push({
      from: 'them',
      text: `seu IP público é ${sensors.ip}.`,
      delay: 2000,
    });
  }
  if (sensors.lat != null && sensors.lon != null) {
    lines.push({
      from: 'them',
      text: `coordenadas ${sensors.lat.toFixed(5)}, ${sensors.lon.toFixed(5)}.`,
      delay: 2000,
    });
  } else if (sensors.label) {
    lines.push({
      from: 'them',
      text: `local aproximado: ${sensors.label}.`,
      delay: 2000,
    });
  }

  lines.push(
    { from: 'them', text: 'observer capturado.', delay: 1500 },
    { from: 'them', text: 'limpando o que sobrou da sua sessão.', delay: 1800 },
  );
  return lines;
}

const WIPE_LINES = [
  'rm -rf /home/null/investigation/*',
  'shred -n 3 -u /var/log/observer.log',
  'killall -9 null-sh evidence vault forge',
  'umount /mnt/vault',
  'wipefs --all /dev/session',
  'echo "observer link seized" >> /dev/kmsg',
  'sync && poweroff -f',
];

type Phase = 'loading' | 'call' | 'wipe' | 'done';

/** Câmera do captor: ruído + silhueta glitch. */
function EnemyCam() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let raf = 0;
    let alive = true;

    const fit = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 640;
      const h = parent?.clientHeight || 360;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);

    const draw = (t: number) => {
      if (!alive) return;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, w, h);

      // grain em baixa resolução
      const iw = 160;
      const ih = Math.max(1, Math.round((160 * h) / w));
      const img = ctx.createImageData(iw, ih);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 48) | 0;
        data[i] = v;
        data[i + 1] = v + 6;
        data[i + 2] = v + 10;
        data[i + 3] = 255;
      }
      const tmp = document.createElement('canvas');
      tmp.width = iw;
      tmp.height = ih;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.52;
      const flicker = 0.55 + Math.sin(t / 180) * 0.12 + Math.random() * 0.08;
      ctx.fillStyle = `rgba(18, 28, 36, ${flicker})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy - h * 0.18, w * 0.09, h * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.16, cy + h * 0.38);
      ctx.quadraticCurveTo(cx, cy - h * 0.02, cx + w * 0.16, cy + h * 0.38);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

      if (Math.random() < 0.08) {
        const gy = Math.random() * h;
        ctx.fillStyle = 'rgba(110, 200, 196, 0.12)';
        ctx.fillRect(0, gy, w, 6 + Math.random() * 18);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return <canvas ref={canvasRef} className="capture-enemy-canvas" aria-hidden />;
}

/** Sequência de captura: videochamada (eles + você) + wipe + logout. */
export function CaptureSequence() {
  const endCaptureSequence = useGame((s) => s.endCaptureSequence);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>(reduce ? 'wipe' : 'loading');
  const [sensors, setSensors] = useState<SensorSnapshot>(() => getSensorSnapshot());
  const chat = useMemo(() => buildChat(sensors), [sensors]);
  const [msgIdx, setMsgIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [camOk, setCamOk] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const [wipeIdx, setWipeIdx] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // refresh sensores no início da captura (IP / geo)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snap = await requestSensorPermissions();
        if (!cancelled) setSensors(snap);
      } finally {
        if (!cancelled && !reduce) setPhase('call');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reduce]);

  useEffect(() => {
    if (phase === 'call') startCaptureNoise();
    if (phase === 'wipe' || phase === 'loading') stopAllAudio(0.08);
    return () => {
      if (phase === 'call') stopAllAudio(0.1);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'call' && phase !== 'loading') return;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          void el.play().catch(() => undefined);
        }
        setCamOk(true);
      } catch {
        if (!cancelled) setCamErr(true);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [phase]);

  useEffect(() => {
    const block = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', block);
    return () => window.removeEventListener('beforeunload', block);
  }, []);

  useEffect(() => {
    if (phase !== 'call') return;
    if (msgIdx >= chat.length) {
      const t = window.setTimeout(() => setPhase('wipe'), 1400);
      return () => clearTimeout(t);
    }
    const msg = chat[msgIdx]!;
    setTyped('');
    let i = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      const tick = () => {
        i += 1;
        setTyped(msg.text.slice(0, i));
        if (i < msg.text.length) {
          timer = window.setTimeout(tick, 22 + (i % 7 === 0 ? 80 : 0));
        } else {
          timer = window.setTimeout(() => setMsgIdx((n) => n + 1), msg.delay);
        }
      };
      tick();
    }, msgIdx === 0 ? 600 : 280);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
    };
  }, [phase, msgIdx, chat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [typed, msgIdx]);

  useEffect(() => {
    if (phase !== 'wipe') return;
    if (wipeIdx === 0) stopAllAudio(0.05);
    if (wipeIdx >= WIPE_LINES.length) {
      const t = window.setTimeout(() => {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        setPhase('done');
        endCaptureSequence();
      }, 1200);
      return () => clearTimeout(t);
    }
    const t = window.setTimeout(() => setWipeIdx((n) => n + 1), reduce ? 120 : 320);
    return () => clearTimeout(t);
  }, [phase, wipeIdx, reduce, endCaptureSequence]);

  if (phase === 'done') return null;

  return (
    <div className="capture-lock" aria-modal role="dialog" aria-label="Canal sequestrado">
      {(phase === 'call' || phase === 'loading') && (
        <div className="capture-call">
          <div className="capture-call-bar">
            <span className="capture-chat-dot live" />
            <span className="mono tiny">SIGNAL_CTRL — video duplex</span>
            <span className="mono tiny dim">ENCRYPTED · FORCED</span>
            <span className="capture-chat-lock mono tiny">CAPTURA</span>
          </div>

          <div className="capture-call-stage">
            <div className="capture-feed remote">
              <EnemyCam />
              <div className="capture-feed-label mono tiny">SIGNAL_CTRL · LIVE</div>
              <div className="capture-feed-noise" aria-hidden />
            </div>

            <div className={`capture-feed self${camErr ? ' err' : ''}`}>
              <video ref={videoRef} className="capture-cam-video" playsInline muted autoPlay />
              {!camOk && (
                <div className={`capture-cam-fallback${camErr ? ' err' : ''}`}>
                  {camErr ? 'CAM OFFLINE' : 'abrindo sua câmera…'}
                </div>
              )}
              <div className="capture-feed-label mono tiny">
                YOU · {camOk ? 'LIVE' : camErr ? 'OFF' : '…'}
              </div>
            </div>
          </div>

          <div className="capture-call-chat">
            <div className="capture-chat-msgs">
              {chat.slice(0, msgIdx).map((m, i) => (
                <div key={i} className={`capture-bubble ${m.from}`}>
                  <span className="mono tiny dim">
                    {m.from === 'them' ? 'SIGNAL_CTRL' : 'system'}
                  </span>
                  <div>{m.text}</div>
                </div>
              ))}
              {phase === 'call' && msgIdx < chat.length && (
                <div className={`capture-bubble ${chat[msgIdx]!.from}`}>
                  <span className="mono tiny dim">
                    {chat[msgIdx]!.from === 'them' ? 'SIGNAL_CTRL' : 'system'}
                  </span>
                  <div>
                    {typed}
                    <span className="capture-cursor">█</span>
                  </div>
                </div>
              )}
              {phase === 'loading' && (
                <div className="capture-bubble sys">
                  <span className="mono tiny dim">system</span>
                  <div>
                    triangulando host…
                    <span className="capture-cursor">█</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        </div>
      )}

      {phase === 'wipe' && (
        <div className="capture-wipe-screen mono">
          <div className="capture-wipe-head">SESSION PURGE — NÃO INTERROMPA</div>
          {WIPE_LINES.slice(0, wipeIdx).map((line, i) => (
            <div key={i} className="capture-wipe-line">
              <span className="dim">root@null-machine#</span> {line}
            </div>
          ))}
          {wipeIdx < WIPE_LINES.length && <div className="capture-cursor">█</div>}
        </div>
      )}
    </div>
  );
}
