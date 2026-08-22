import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useGame } from '../state/game';
import { runCommand } from '../lib/exec';
import { on } from '../lib/bus';
import { IconClose, IconRefresh, IconTerminal } from '../shell/Icons';

const THEMES = {
  graphite: {
    background: '#05080a',
    foreground: '#dfe8ec',
    cursor: '#7fd6e3',
    selectionBackground: '#1d3f4a',
    brightBlack: '#4f5d64',
  },
  contrast: {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffffff',
    selectionBackground: '#345',
    brightBlack: '#888888',
  },
  paper: {
    background: '#101418',
    foreground: '#e8e2d5',
    cursor: '#d0a45a',
    selectionBackground: '#3a3428',
    brightBlack: '#6b6355',
  },
} as const;

const QUICK = ['help', 'ls -la', 'investigate', 'flag'];

type Tab = { id: string; label: string };

export function TerminalApp({ winId }: { winId: string }) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 't1', label: 'shell 1' }]);
  const [active, setActive] = useState('t1');
  const [fontSize, setFontSize] = useState(12.5);
  const seq = useRef(1);

  function addTab() {
    seq.current += 1;
    const t = { id: `t${seq.current}`, label: `shell ${seq.current}` };
    setTabs((v) => [...v, t]);
    setActive(t.id);
  }

  function closeTab(id: string) {
    setTabs((v) => {
      const next = v.filter((t) => t.id !== id);
      if (!next.length) return v;
      if (id === active) setActive(next[next.length - 1].id);
      return next;
    });
  }

  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab${t.id === active ? ' active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            <IconTerminal size={12} />
            {t.label}
            {tabs.length > 1 && (
              <span
                className="x"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                <IconClose size={10} />
              </span>
            )}
          </button>
        ))}
        <button className="tab" onClick={addTab} title="Nova aba (Ctrl+Shift+T)">
          +
        </button>
        <div style={{ flex: 1 }} />
        <div className="toolbar" style={{ border: 0, background: 'none' }}>
          {QUICK.map((c) => (
            <button
              key={c}
              className="chip"
              style={{ cursor: 'pointer' }}
              onClick={() => window.dispatchEvent(new CustomEvent(`abyss-term-${active}`, { detail: c }))}
            >
              {c}
            </button>
          ))}
          <div className="sep" />
          <button className="icon-btn" title="Diminuir fonte" onClick={() => setFontSize((f) => Math.max(10, f - 1))}>
            A-
          </button>
          <button className="icon-btn" title="Aumentar fonte" onClick={() => setFontSize((f) => Math.min(20, f + 1))}>
            A+
          </button>
        </div>
      </div>
      {tabs.map((t) => (
        <TerminalPane
          key={t.id}
          tabId={t.id}
          winId={winId}
          visible={t.id === active}
          fontSize={fontSize}
        />
      ))}
    </>
  );
}

function TerminalPane({
  tabId,
  winId,
  visible,
  fontSize,
}: {
  tabId: string;
  winId: string;
  visible: boolean;
  fontSize: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const saveId = useGame((s) => s.save?.id);
  const theme = useGame((s) => s.settings.terminalTheme);
  const setWinSubtitle = useGame((s) => s.setWinSubtitle);
  const win = useGame((s) => s.windows.find((w) => w.id === winId));
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // xterm precisa de um container com layout: abas ocultas ficam display:none
  const [ready, setReady] = useState(visible);
  useEffect(() => {
    if (visible) setReady(true);
  }, [visible]);

  useEffect(() => {
    if (!ready || !hostRef.current || !saveId) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize,
      lineHeight: 1.25,
      theme: THEMES[theme],
      convertEol: true,
      scrollback: 4000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;
    const firstFit = requestAnimationFrame(() => {
      const host = hostRef.current;
      if (!host || host.clientWidth < 40) return;
      try {
        fit.fit();
      } catch {
        /* renderer ainda não pronto */
      }
    });

    let cwd = useGame.getState().save?.cwd || '/home/null';
    let buffer = '';
    let cursor = 0;
    const history: string[] = [];
    let hIdx = -1;
    let busy = false;

    const promptStr = () => `\x1b[38;5;80mnull@abyss\x1b[0m:\x1b[38;5;110m${cwd}\x1b[0m$ `;
    const writePrompt = () => term.write(`\r\n${promptStr()}`);
    const redrawLine = () => {
      term.write(`\r\x1b[K${promptStr()}${buffer}`);
      if (cursor < buffer.length) term.write(`\x1b[${buffer.length - cursor}D`);
    };

    term.writeln('\x1b[38;5;80mPROJECT ABYSS\x1b[0m — runtime Unix isolado (VFS efêmero)');
    term.writeln('\x1b[2mhelp lista os comandos. A GUI resume; o shell mostra.\x1b[0m');
    term.write(`\r\n${promptStr()}`);

    async function submit(cmd: string) {
      busy = true;
      try {
        const result = await runCommand(cmd);
        if (!result) {
          term.writeln('sem sessão ativa');
        } else {
          if (result.stdout) term.write(result.stdout.replace(/\n/g, '\r\n'));
          if (result.stderr)
            term.write(`\x1b[38;5;167m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
          cwd = result.cwd;
          setWinSubtitle(winId, cwd);
        }
      } catch (e) {
        term.write(`\x1b[38;5;167m${String(e)}\x1b[0m`);
      }
      busy = false;
      writePrompt();
    }

    const runExternal = (cmd: string) => {
      if (busy) return;
      buffer = '';
      cursor = 0;
      term.write(`\x1b[2m${cmd}\x1b[0m\r\n`);
      history.push(cmd);
      void submit(cmd);
    };

    const onExternal = (e: Event) => runExternal((e as CustomEvent<string>).detail);
    window.addEventListener(`abyss-term-${tabId}`, onExternal);
    const offBus = on('exec', ({ command }) => {
      if (visibleRef.current) runExternal(command);
    });

    const data = term.onData((d) => {
      if (busy) return;
      if (d === '\r') {
        const cmd = buffer;
        buffer = '';
        cursor = 0;
        term.write('\r\n');
        if (!cmd.trim()) return term.write(promptStr());
        history.push(cmd);
        hIdx = -1;
        void submit(cmd);
        return;
      }
      if (d === '\u007f') {
        if (cursor > 0) {
          buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
          cursor -= 1;
          redrawLine();
        }
        return;
      }
      if (d === '\u0003') {
        term.write('^C');
        buffer = '';
        cursor = 0;
        writePrompt();
        return;
      }
      if (d === '\u000c') {
        term.clear();
        redrawLine();
        return;
      }
      if (d === '\u001b[A' || d === '\u001b[B') {
        if (!history.length) return;
        if (d === '\u001b[A') hIdx = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1);
        else hIdx = hIdx < 0 ? -1 : Math.min(history.length, hIdx + 1);
        buffer = hIdx >= 0 && hIdx < history.length ? history[hIdx] : '';
        cursor = buffer.length;
        redrawLine();
        return;
      }
      if (d === '\u001b[C') {
        if (cursor < buffer.length) {
          cursor += 1;
          term.write('\u001b[C');
        }
        return;
      }
      if (d === '\u001b[D') {
        if (cursor > 0) {
          cursor -= 1;
          term.write('\u001b[D');
        }
        return;
      }
      if (d === '\u001b[H' || d === '\u0001') {
        cursor = 0;
        redrawLine();
        return;
      }
      if (d === '\u001b[F' || d === '\u0005') {
        cursor = buffer.length;
        redrawLine();
        return;
      }
      if (d >= ' ' && d !== '\u001b') {
        buffer = buffer.slice(0, cursor) + d + buffer.slice(cursor);
        cursor += d.length;
        redrawLine();
      }
    });

    return () => {
      cancelAnimationFrame(firstFit);
      data.dispose();
      offBus();
      window.removeEventListener(`abyss-term-${tabId}`, onExternal);
      termRef.current = null;
      // o viewport do xterm agenda um sync assíncrono: descartar antes dele lança
      setTimeout(() => term.dispose(), 150);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, saveId, tabId, theme]);

  // o fit addon lê dimensões do renderer: sem layout ele lança
  const safeFit = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.clientWidth < 40 || host.clientHeight < 40) return;
    try {
      fitRef.current?.fit();
    } catch {
      /* renderer ainda não pronto */
    }
  }, []);

  useEffect(() => {
    const t = termRef.current;
    if (t) t.options.fontSize = fontSize;
    safeFit();
  }, [fontSize, safeFit]);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      safeFit();
      termRef.current?.focus();
    }, 30);
    return () => clearTimeout(id);
  }, [visible, win?.w, win?.h, win?.maximized, safeFit]);

  return (
    <div
      className="term-host"
      ref={hostRef}
      style={{ display: visible ? 'block' : 'none' }}
      onClick={() => termRef.current?.focus()}
    />
  );
}

export function TerminalStatus() {
  return (
    <div className="statusbar" style={{ height: 20 }}>
      <span className="sb-item">
        <IconRefresh size={10} /> VFS efêmero
      </span>
    </div>
  );
}
