import { useEffect, useState } from 'react';
import { uiSound } from '../lib/audio';
import { TRAP_SMILE_EVENT } from '../lib/traps';

/** Popup breve: sorriso sinistro quando o jogador toca um site-isca. */
export function TrapSmileFlash() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let hideTimer = 0;
    let leaveTimer = 0;

    const onSmile = () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(leaveTimer);
      setLeaving(false);
      setVisible(true);
      uiSound('scare');
      hideTimer = window.setTimeout(() => {
        setLeaving(true);
        leaveTimer = window.setTimeout(() => {
          setVisible(false);
          setLeaving(false);
        }, 320);
      }, 2000);
    };

    window.addEventListener(TRAP_SMILE_EVENT, onSmile);
    return () => {
      window.removeEventListener(TRAP_SMILE_EVENT, onSmile);
      window.clearTimeout(hideTimer);
      window.clearTimeout(leaveTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`trap-smile-flash${leaving ? ' leave' : ''}`}
      role="presentation"
      aria-hidden
    >
      <svg className="trap-smile-face" viewBox="0 0 120 80" fill="none" aria-hidden>
        {/* olhos */}
        <ellipse cx="38" cy="28" rx="7" ry="10" fill="currentColor" />
        <ellipse cx="82" cy="28" rx="7" ry="10" fill="currentColor" />
        {/* sorriso largo / sinistro */}
        <path
          d="M22 48 C40 72, 80 72, 98 48"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        {/* cantos do sorriso puxados */}
        <path
          d="M22 48 L16 42 M98 48 L104 42"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
