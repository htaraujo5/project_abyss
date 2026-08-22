import { useEffect, useRef, useState } from 'react';
import { startCaptureNoise, stopAllAudio } from '../lib/audio';
import { useGame } from '../state/game';

const CHAT: { from: 'them' | 'sys'; text: string; delay: number }[] = [
  { from: 'them', text: 'olá.', delay: 900 },
  { from: 'them', text: 'não desligue a câmera.', delay: 1600 },
  { from: 'them', text: 'você achou que estava investigando a rede.', delay: 2200 },
  { from: 'them', text: 'nós estávamos investigando você.', delay: 2000 },
  { from: 'sys', text: 'link: inverted channel established', delay: 1200 },
  { from: 'them', text: 'cada comando. cada arquivo. cada dica pedida.', delay: 2100 },
  { from: 'them', text: 'o sandbox era isca. o desktop, espelho.', delay: 2000 },
  { from: 'them', text: 'a câmera confirma: você está aí.', delay: 1800 },
  { from: 'them', text: 'observer capturado.', delay: 1600 },
  { from: 'them', text: 'agora vamos limpar o que sobrou da sessão.', delay: 2000 },
];

const WIPE_LINES = [
  'rm -rf /home/null/investigation/*',
  'shred -n 3 -u /var/log/observer.log',
  'killall -9 null-sh evidence vault forge',
  'umount /mnt/vault',
  'wipefs --all /dev/session',
  'echo "observer link seized" >> /dev/kmsg',
  'sync && poweroff -f',
];

type Phase = 'chat' | 'wipe' | 'done';

/** Sequência de captura: chat + webcam real, UI travada, depois wipe. */
export function CaptureSequence() {
  const endCaptureSequence = useGame((s) => s.endCaptureSequence);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>(reduce ? 'wipe' : 'chat');
  const [msgIdx, setMsgIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [camOk, setCamOk] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const [wipeIdx, setWipeIdx] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ruído branco assim que a sequência / câmera começa
  useEffect(() => {
    if (phase === 'chat') startCaptureNoise();
    if (phase === 'wipe') stopAllAudio(0.08);
    return () => {
      if (phase === 'chat') stopAllAudio(0.1);
    };
  }, [phase]);

  // webcam real
  useEffect(() => {
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
  }, []);

  // impede fechar a aba/recarregar de forma casual
  useEffect(() => {
    const block = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', block);
    return () => window.removeEventListener('beforeunload', block);
  }, []);

  // digita mensagens do chat
  useEffect(() => {
    if (phase !== 'chat') return;
    if (msgIdx >= CHAT.length) {
      const t = window.setTimeout(() => setPhase('wipe'), 1400);
      return () => clearTimeout(t);
    }
    const msg = CHAT[msgIdx]!;
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
    }, msgIdx === 0 ? 700 : 350);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
    };
  }, [phase, msgIdx]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [typed, msgIdx]);

  // wipe — silêncio total
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
      {phase === 'chat' && (
        <div className="capture-chat-win">
          <div className="capture-chat-titlebar">
            <span className="capture-chat-dot live" />
            <span className="mono tiny">SIGNAL_CTRL — link ativo</span>
            <span className="capture-chat-lock mono tiny">FECHADO</span>
          </div>
          <div className="capture-chat-body">
            <div className="capture-cam">
              <video ref={videoRef} className="capture-cam-video" playsInline muted autoPlay />
              {!camOk && (
                <div className={`capture-cam-fallback${camErr ? ' err' : ''}`}>
                  {camErr
                    ? 'CÂMERA NEGADA — usando replay de sessão'
                    : 'solicitando câmera…'}
                </div>
              )}
              <div className="capture-cam-label mono tiny">
                {camOk ? 'CAM · LIVE' : camErr ? 'CAM · OFFLINE' : 'CAM · …'}
              </div>
            </div>
            <div className="capture-chat-pane">
              <div className="capture-chat-msgs">
                {CHAT.slice(0, msgIdx).map((m, i) => (
                  <div key={i} className={`capture-bubble ${m.from}`}>
                    <span className="mono tiny dim">
                      {m.from === 'them' ? 'SIGNAL_CTRL' : 'system'}
                    </span>
                    <div>{m.text}</div>
                  </div>
                ))}
                {msgIdx < CHAT.length && (
                  <div className={`capture-bubble ${CHAT[msgIdx]!.from}`}>
                    <span className="mono tiny dim">
                      {CHAT[msgIdx]!.from === 'them' ? 'SIGNAL_CTRL' : 'system'}
                    </span>
                    <div>
                      {typed}
                      <span className="capture-cursor">█</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="capture-chat-input mono tiny dim">
                entrada desabilitada — canal sob controle remoto
              </div>
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
