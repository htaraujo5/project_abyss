import { useRef, useState, type ReactNode } from 'react';
import { useGame, type WinState } from '../state/game';
import { AppIcon, IconClose, IconMaximize, IconMinimize, IconRestore } from './Icons';

type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_W = 380;
const MIN_H = 220;

export function WindowFrame({
  win,
  bounds,
  children,
}: {
  win: WinState;
  bounds: { w: number; h: number };
  children: ReactNode;
}) {
  const { focusId, focusWin, moveWin, setRect, minimizeWin, closeWin, toggleMaximize, snapWin, openCtxMenu } =
    useGame();
  const [snapHint, setSnapHint] = useState<'left' | 'right' | 'top' | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const focused = focusId === win.id;

  function onTitlePointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    focusWin(win.id);
    if (win.maximized) return;
    dragRef.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const x = Math.min(Math.max(-win.w + 120, ev.clientX - d.dx), bounds.w - 80);
      const y = Math.min(Math.max(0, ev.clientY - d.dy), bounds.h - 40);
      moveWin(win.id, x, y);
      if (ev.clientY <= 4) setSnapHint('top');
      else if (ev.clientX <= 4) setSnapHint('left');
      else if (ev.clientX >= bounds.w - 4) setSnapHint('right');
      else setSnapHint(null);
    };
    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      dragRef.current = null;
      setSnapHint((s) => {
        if (s) snapWin(win.id, s, bounds);
        return null;
      });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  function onResizePointerDown(dir: Dir, e: React.PointerEvent) {
    e.stopPropagation();
    focusWin(win.id);
    const start = { ...win, px: e.clientX, py: e.clientY };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      let { x, y, w, h } = start;
      if (dir.includes('e')) w = Math.max(MIN_W, start.w + dx);
      if (dir.includes('s')) h = Math.max(MIN_H, start.h + dy);
      if (dir.includes('w')) {
        w = Math.max(MIN_W, start.w - dx);
        x = start.x + (start.w - w);
      }
      if (dir.includes('n')) {
        h = Math.max(MIN_H, start.h - dy);
        y = Math.max(0, start.y + (start.h - h));
      }
      setRect(win.id, { x, y, w, h });
    };
    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  const dirs: Dir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  return (
    <>
      {snapHint && (
        <div
          className="snap-preview"
          style={
            snapHint === 'top'
              ? { left: 0, top: 0, width: bounds.w, height: bounds.h }
              : {
                  left: snapHint === 'left' ? 0 : bounds.w / 2,
                  top: 0,
                  width: bounds.w / 2,
                  height: bounds.h,
                }
          }
        />
      )}
      <div
        className={`window${focused ? ' focused' : ''}${win.maximized ? ' maximized' : ''}`}
        style={{
          left: win.x,
          top: win.y,
          width: win.w,
          height: win.h,
          zIndex: win.z,
          display: win.minimized ? 'none' : 'flex',
        }}
        onPointerDownCapture={() => focusWin(win.id)}
      >
        <div
          className="titlebar"
          onPointerDown={onTitlePointerDown}
          onDoubleClick={() => toggleMaximize(win.id, bounds)}
          onContextMenu={(e) => {
            e.preventDefault();
            openCtxMenu(e.clientX, e.clientY, [
              { label: win.maximized ? 'Restaurar' : 'Maximizar', onClick: () => toggleMaximize(win.id, bounds) },
              { label: 'Minimizar', onClick: () => minimizeWin(win.id) },
              { label: '', separator: true },
              { label: 'Encaixar à esquerda', onClick: () => snapWin(win.id, 'left', bounds) },
              { label: 'Encaixar à direita', onClick: () => snapWin(win.id, 'right', bounds) },
              { label: '', separator: true },
              { label: 'Fechar', onClick: () => closeWin(win.id) },
            ]);
          }}
        >
          <span className="tb-icon">
            <AppIcon app={win.app} size={14} />
          </span>
          <span className="tb-title">{win.title}</span>
          {win.subtitle && <span className="tb-sub">— {win.subtitle}</span>}
          <div className="win-btns">
            <button
              className="win-btn"
              title="Minimizar (Ctrl+M)"
              onClick={() => minimizeWin(win.id)}
            >
              <IconMinimize size={13} />
            </button>
            <button
              className="win-btn"
              title="Maximizar (F11)"
              onClick={() => toggleMaximize(win.id, bounds)}
            >
              {win.maximized ? <IconRestore size={13} /> : <IconMaximize size={12} />}
            </button>
            <button className="win-btn close" title="Fechar (Ctrl+W)" onClick={() => closeWin(win.id)}>
              <IconClose size={13} />
            </button>
          </div>
        </div>
        <div className="window-body">{children}</div>
        {!win.maximized &&
          dirs.map((d) => (
            <div
              key={d}
              className={`resize-handle rh-${d}`}
              onPointerDown={(e) => onResizePointerDown(d, e)}
            />
          ))}
      </div>
    </>
  );
}
