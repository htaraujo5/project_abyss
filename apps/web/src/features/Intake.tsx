import { useEffect, useRef, useState } from 'react';
import { RegisterRequestSchema } from '@abyss/shared';
import {
  clearLocalSession,
  createGuest,
  createSave,
  getSave,
  listSaves,
  loadLocalSession,
  loginAccount,
  registerAccount,
} from '../lib/api';
import { useGame, type WinState } from '../state/game';
import { useMeta } from '../state/meta';
import { unlockAudio } from '../lib/audio';
import { IconAbyss } from '../shell/Icons';

type Tone = 'out' | 'err' | 'ok' | 'cmd' | 'dim' | 'head';
type Line = { text: string; tone?: Tone };

type FieldKey = 'fullName' | 'email' | 'username' | 'password';
type Step = { key: FieldKey | 'confirm'; label: string; secret?: boolean; note?: string };

const REGISTER_STEPS: Step[] = [
  { key: 'fullName', label: 'nome completo', note: 'como deve constar no laudo' },
  { key: 'email', label: 'e-mail' },
  { key: 'username', label: 'nome de usuário', note: '3-20: letras, números, . _ -' },
  { key: 'password', label: 'senha', secret: true, note: 'mínimo 8 caracteres' },
  { key: 'confirm', label: 'confirmar senha', secret: true },
];

const LOGIN_STEPS: Step[] = [
  { key: 'username', label: 'usuário' },
  { key: 'password', label: 'senha', secret: true },
];

const BOOT_LINES: Line[] = [
  { text: 'ABYSS BOOTLOADER 1.0 — quarantine host', tone: 'dim' },
  { text: 'mount /dev/vfs0 → / (ephemeral, copy-on-write)', tone: 'dim' },
  { text: 'egress policy ......... DENY (sandbox isolado)', tone: 'dim' },
  { text: 'content catalog ....... 10 camadas · 91 investigações', tone: 'dim' },
  { text: 'forensic toolchain .... trace graph hex imagelab packet memory forge', tone: 'dim' },
  { text: 'evidence engine ....... state validation (não sequência de comandos)', tone: 'dim' },
  { text: 'case #ABYSS-3301 ...... pronto', tone: 'ok' },
  { text: '', tone: 'out' },
  { text: 'CASE #ABYSS-3301 — MÁQUINA APREENDIDA', tone: 'head' },
  {
    text: 'A estação pertencia a um operador conhecido apenas como NULL. Ela chegou',
    tone: 'out',
  },
  { text: 'em quarentena, sem rede externa e sem laudo anterior.', tone: 'out' },
  { text: '', tone: 'out' },
  { text: 'Sua tarefa: determinar quem operava esta máquina e no que trabalhava.', tone: 'out' },
  {
    text: 'Nada será entregue. Você observa, formula hipóteses, testa no shell,',
    tone: 'dim',
  },
  { text: 'correlaciona no quadro e só então compreende.', tone: 'dim' },
  { text: '', tone: 'out' },
  { text: 'Identificação necessária para abrir o laudo. `ajuda` lista os comandos.', tone: 'out' },
];

const HELP: Line[] = [
  { text: 'comandos de intake', tone: 'head' },
  { text: '  anonimo            sessão sem cadastro (progresso só neste navegador)', tone: 'out' },
  { text: '  cadastrar          criar credencial de analista', tone: 'out' },
  { text: '  entrar             retomar com credencial existente', tone: 'out' },
  { text: '  dossie             reler o briefing do caso', tone: 'out' },
  { text: '  historia           origem e premissa do PROJECT ABYSS', tone: 'out' },
  { text: '  desenvolvedores    créditos / quem fez', tone: 'out' },
  { text: '  proposta           intenção de design e o que o jogo pede de você', tone: 'out' },
  { text: '  guia               aviso + passo a passo completo (spoilers)', tone: 'out' },
  { text: '  investigacoes      listar laudos abertos nesta credencial', tone: 'out' },
  { text: '  continuar [n]      retomar um laudo', tone: 'out' },
  { text: '  nova [nome]        abrir um laudo novo', tone: 'out' },
  { text: '  quemsou / sair     identidade atual / encerrar credencial', tone: 'out' },
  { text: '  limpar             limpar o console', tone: 'out' },
  { text: '', tone: 'out' },
  { text: 'aliases: guest, register, login, story, credits, proposal, guide, help.', tone: 'dim' },
];

const HISTORIA: Line[] = [
  { text: 'HISTÓRIA — PROJECT ABYSS', tone: 'head' },
  { text: '', tone: 'out' },
  {
    text: 'Uma estação foi apreendida. O operador assinava apenas NULL. Não há laudo',
    tone: 'out',
  },
  {
    text: 'anterior, não há rede externa: só um sandbox em quarentena e o que restou',
    tone: 'out',
  },
  { text: 'no disco — arquivos, commits órfãos, serviços mentindo, sinais AA-01.', tone: 'out' },
  { text: '', tone: 'out' },
  {
    text: 'NULL investigava um fenômeno que chamou de The Signal: mensagens que',
    tone: 'out',
  },
  {
    text: 'pareciam ruído até correlacionadas. Isso o levou a Acheron, a Charter,',
    tone: 'out',
  },
  {
    text: 'a Mariana — e à suspeita de que a própria observação alimentava o sistema.',
    tone: 'out',
  },
  { text: '', tone: 'out' },
  {
    text: 'Você não recebe a solução. Você herda a máquina. Cada camada aprofunda',
    tone: 'dim',
  },
  {
    text: 'a pergunta: quem operava isto — e o que o operador estava se tornando?',
    tone: 'dim',
  },
  { text: '', tone: 'out' },
  {
    text: 'Dez camadas. Noventa e uma investigações. Cinco desfechos possíveis —',
    tone: 'out',
  },
  { text: 'incluindo um em que a rede fecha o laço sobre você.', tone: 'out' },
];

const DESENVOLVEDORES: Line[] = [
  { text: 'DESENVOLVEDORES', tone: 'head' },
  { text: '', tone: 'out' },
  { text: 'projeto .......... PROJECT ABYSS', tone: 'out' },
  { text: 'autor ............ Helisson Ferreira', tone: 'out' },
  { text: 'forma ............ thriller investigativo técnico no browser', tone: 'out' },
  { text: 'stack ............ React · Fastify · VFS Unix · conteúdo data-driven', tone: 'out' },
  { text: '', tone: 'out' },
  {
    text: 'Toda telemetria, host, binário e serviço existem apenas no sandbox',
    tone: 'dim',
  },
  {
    text: 'ficcional. Nada do seu sistema real é lido além do que a aplicação cria',
    tone: 'dim',
  },
  { text: '(e a câmera, só se você autorizar no final CAPTURA).', tone: 'dim' },
  { text: '', tone: 'out' },
  {
    text: 'Ferramentas e assistência de implementação: Cursor / agentes de código.',
    tone: 'dim',
  },
];

const PROPOSTA: Line[] = [
  { text: 'PROPOSTA DE DESIGN', tone: 'head' },
  { text: '', tone: 'out' },
  {
    text: 'ABYSS não é um terminal cosmético. É um desktop apreendido: shell POSIX',
    tone: 'out',
  },
  {
    text: 'isolado, apps forenses, evidências com estado, e validação por o que você',
    tone: 'out',
  },
  { text: 'descobriu — não por uma sequência mágica de comandos decorativos.', tone: 'out' },
  { text: '', tone: 'out' },
  { text: 'princípios', tone: 'head' },
  { text: '  · a GUI pode mentir; o shell e os artefatos não', tone: 'out' },
  { text: '  · hipótese → teste → correlação no quadro → compreensão', tone: 'out' },
  { text: '  · camadas aprofundam a pergunta, não “fases de tutorial”', tone: 'out' },
  { text: '  · finais são atos (abrir um caminho / armadilha), não um menu', tone: 'out' },
  { text: '  · o mundo reage: tempo, browser externo, captura', tone: 'out' },
  { text: '', tone: 'out' },
  {
    text: 'O jogo pede paciência investigativa. Se quiser o mapa completo — com',
    tone: 'dim',
  },
  { text: 'spoilers — use `guia`. Caso contrário, comece com `anonimo` ou `cadastrar`.', tone: 'dim' },
];

const GUIA_AVISO: Line[] = [
  { text: 'GUIA — AVISO', tone: 'head' },
  { text: '', tone: 'out' },
  {
    text: 'O guia é um PASSO A PASSO completo da campanha: respostas, caminhos,',
    tone: 'out',
  },
  {
    text: 'gates de camada e TODOS os finais (incluindo Captura e armadilhas).',
    tone: 'out',
  },
  { text: '', tone: 'out' },
  { text: 'Isto estraga a descoberta. Use só se estiver travado ou estudando o design.', tone: 'dim' },
  { text: '', tone: 'out' },
  {
    text: 'Para abrir em nova aba do navegador, confirme com:  guia abrir',
    tone: 'ok',
  },
];

const DOSSIER: Line[] = [
  { text: 'DOSSIÊ — ABYSS-3301', tone: 'head' },
  { text: 'sujeito ....... NULL (identidade não confirmada)', tone: 'out' },
  { text: 'apreensão ..... estação em quarentena, egress bloqueado', tone: 'out' },
  { text: 'escopo ........ perícia local: identidade e atividade do operador', tone: 'out' },
  { text: 'ferramental ... terminal Unix isolado + toolchain forense na GUI', tone: 'out' },
  { text: '', tone: 'out' },
  { text: 'advertência do analista anterior: "A GUI mente. Confie no shell."', tone: 'dim' },
  { text: 'Todo host, binário, serviço e protocolo aqui existe só no sandbox ficcional.', tone: 'dim' },
];

/** Valida um campo isolado com as mesmas regras do servidor. */
function validateField(key: FieldKey, value: string): string | null {
  const result = RegisterRequestSchema.shape[key].safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

export function IntakeConsole() {
  const { setSession, setSave, setPhase, openApp } = useGame();
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [wizard, setWizard] = useState<{
    kind: 'register' | 'login';
    idx: number;
    data: Record<string, string>;
  } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const savesRef = useRef<Awaited<ReturnType<typeof listSaves>>['saves']>([]);

  const print = (...next: Line[]) => setLines((v) => [...v, ...next]);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      if (i >= BOOT_LINES.length) {
        clearInterval(t);
        return;
      }
      const line = BOOT_LINES[i++];
      setLines((v) => [...v, line]);
    }, 90);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy, wizard]);

  const step = wizard ? (wizard.kind === 'register' ? REGISTER_STEPS : LOGIN_STEPS)[wizard.idx] : null;

  async function mount(saveId?: string) {
    setBusy(true);
    try {
      const saves = savesRef.current.length ? savesRef.current : (await listSaves()).saves;
      let save = saveId ? saves.find((s) => s.id === saveId) : saves[0];
      save = save ? (await getSave(save.id)).save : (await createSave('Investigação 1')).save;

      print({ text: `montando ${save.name} · capítulo ${save.currentChapter}…`, tone: 'dim' });
      setSave(save);
      await useMeta.getState().loadStatic();
      await useMeta.getState().refreshChapter(save.id);
      await useMeta.getState().refreshLogs(save.id);
      setPhase('playing');

      const layout = save.windowLayout?.windows as WinState[] | undefined;
      if (layout?.length) useGame.getState().restoreWindows(layout);
      else {
        openApp('files');
        openApp('terminal');
      }
    } catch (e) {
      print({ text: `! ${e instanceof Error ? e.message : String(e)}`, tone: 'err' });
      setBusy(false);
    }
  }

  async function afterAuth(displayName: string) {
    print({ text: `credencial aceita — ${displayName}`, tone: 'ok' });
    const { saves } = await listSaves();
    savesRef.current = saves;
    if (saves.length > 1) {
      print(
        { text: `${saves.length} laudos nesta credencial:`, tone: 'out' },
        ...saves.map((s, i) => ({
          text: `  [${i + 1}] ${s.name} · ${s.currentChapter}`,
          tone: 'out' as Tone,
        })),
        { text: 'use `continuar <n>` ou `nova <nome>`.', tone: 'dim' },
      );
      setBusy(false);
      return;
    }
    await mount(saves[0]?.id);
  }

  async function runCommand(raw: string) {
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const arg = rest.join(' ');
    const c = cmd.toLowerCase();

    if (c === 'ajuda' || c === 'help' || c === '?') return print(...HELP);
    if (c === 'dossie' || c === 'dossier' || c === 'brief') return print(...DOSSIER);
    if (c === 'historia' || c === 'história' || c === 'story' || c === 'lore') {
      return print(...HISTORIA);
    }
    if (c === 'desenvolvedores' || c === 'desenvolvedor' || c === 'devs' || c === 'credits' || c === 'creditos' || c === 'créditos') {
      return print(...DESENVOLVEDORES);
    }
    if (c === 'proposta' || c === 'proposal' || c === 'manifesto' || c === 'about') {
      return print(...PROPOSTA);
    }
    if (c === 'guia' || c === 'guide' || c === 'walkthrough' || c === 'spoiler') {
      if (/^(abrir|open|sim|yes|confirmar|confirm)$/i.test(arg)) {
        print(
          { text: 'abrindo guia completo em nova aba…', tone: 'dim' },
          { text: 'spoilers totais — você foi avisado.', tone: 'ok' },
        );
        window.open('/guia.html', '_blank', 'noopener,noreferrer');
        return;
      }
      return print(...GUIA_AVISO);
    }
    if (c === 'limpar' || c === 'clear') return setLines([]);

    if (c === 'quemsou' || c === 'whoami') {
      const s = loadLocalSession();
      return print(
        s
          ? { text: `${s.displayName} · ${s.playerId}`, tone: 'out' }
          : { text: 'nenhuma credencial ativa', tone: 'dim' },
      );
    }

    if (c === 'sair' || c === 'logout') {
      clearLocalSession();
      savesRef.current = [];
      return print({ text: 'credencial encerrada neste navegador', tone: 'out' });
    }

    if (c === 'anonimo' || c === 'guest' || c === 'anônimo') {
      setBusy(true);
      unlockAudio();
      try {
        const session = loadLocalSession() ?? (await createGuest());
        setSession(session);
        print({ text: 'sessão anônima — progresso preso a este navegador', tone: 'dim' });
        await afterAuth(session.displayName);
      } catch (e) {
        print({ text: `! ${e instanceof Error ? e.message : String(e)}`, tone: 'err' });
        setBusy(false);
      }
      return;
    }

    if (c === 'cadastrar' || c === 'cadastro' || c === 'register') {
      print(
        { text: 'cadastro de analista — `cancelar` aborta', tone: 'head' },
        { text: REGISTER_STEPS[0].note ?? '', tone: 'dim' },
      );
      setWizard({ kind: 'register', idx: 0, data: {} });
      return;
    }

    if (c === 'entrar' || c === 'login') {
      setWizard({ kind: 'login', idx: 0, data: {} });
      return;
    }

    if (c === 'investigacoes' || c === 'investigações' || c === 'saves') {
      if (!loadLocalSession()) {
        return print({ text: '! identifique-se primeiro', tone: 'err' });
      }
      const { saves } = await listSaves();
      savesRef.current = saves;
      return print(
        ...(saves.length
          ? saves.map((s, i) => ({
              text: `  [${i + 1}] ${s.name} · ${s.currentChapter} · atualizado ${new Date(
                s.updatedAt,
              ).toLocaleString('pt-BR')}`,
              tone: 'out' as Tone,
            }))
          : [{ text: 'nenhum laudo aberto — use `nova`', tone: 'dim' as Tone }]),
      );
    }

    if (c === 'continuar' || c === 'continue') {
      if (!loadLocalSession()) return print({ text: '! identifique-se primeiro', tone: 'err' });
      const saves = savesRef.current.length ? savesRef.current : (await listSaves()).saves;
      savesRef.current = saves;
      const idx = arg ? Number(arg) - 1 : 0;
      const target = saves[idx];
      if (!target) return print({ text: '! laudo inexistente', tone: 'err' });
      return void mount(target.id);
    }

    if (c === 'nova' || c === 'new') {
      if (!loadLocalSession()) return print({ text: '! identifique-se primeiro', tone: 'err' });
      setBusy(true);
      try {
        const { save } = await createSave(arg || `Investigação ${savesRef.current.length + 1}`);
        savesRef.current = [save, ...savesRef.current];
        await mount(save.id);
      } catch (e) {
        print({ text: `! ${e instanceof Error ? e.message : String(e)}`, tone: 'err' });
        setBusy(false);
      }
      return;
    }

    if (!c) return;
    print({ text: `intake: ${c}: comando desconhecido — tente \`ajuda\``, tone: 'err' });
  }

  async function advanceWizard(value: string) {
    if (!wizard || !step) return;
    if (/^(cancelar|cancel|abort)$/i.test(value)) {
      setWizard(null);
      return print({ text: 'cadastro cancelado', tone: 'dim' });
    }

    if (step.key === 'confirm') {
      if (value !== wizard.data.password) {
        return print({ text: '! as senhas não coincidem', tone: 'err' });
      }
    } else {
      const problem =
        wizard.kind === 'register'
          ? validateField(step.key, value)
          : value.trim()
            ? null
            : `informe ${step.label}`;
      if (problem) return print({ text: `! ${step.label}: ${problem}`, tone: 'err' });
    }

    const data = { ...wizard.data, [step.key]: value };
    const steps = wizard.kind === 'register' ? REGISTER_STEPS : LOGIN_STEPS;
    const next = wizard.idx + 1;

    if (next < steps.length) {
      setWizard({ ...wizard, idx: next, data });
      const note = steps[next].note;
      if (note) print({ text: note, tone: 'dim' });
      return;
    }

    setWizard(null);
    setBusy(true);
    unlockAudio();
    try {
      const session =
        wizard.kind === 'register'
          ? await registerAccount({
              fullName: data.fullName,
              email: data.email,
              username: data.username,
              password: data.password,
            })
          : await loginAccount(data.username, data.password);
      setSession(session);
      await afterAuth(session.displayName);
    } catch (e) {
      print({ text: `! ${e instanceof Error ? e.message : String(e)}`, tone: 'err' });
      print({
        text:
          wizard.kind === 'register'
            ? 'use `cadastrar` para tentar de novo'
            : 'use `entrar` para tentar de novo, ou `cadastrar`',
        tone: 'dim',
      });
      setBusy(false);
    }
  }

  function submit() {
    if (busy) return;
    const value = input;
    setInput('');
    if (step) {
      print({ text: `${step.label}: ${step.secret ? '•'.repeat(value.length) : value}`, tone: 'cmd' });
      void advanceWizard(value);
      return;
    }
    if (!value.trim()) return;
    print({ text: `$ ${value}`, tone: 'cmd' });
    setHistory((h) => [value, ...h].slice(0, 40));
    setHIdx(-1);
    void runCommand(value);
  }

  return (
    <div className="boot" onClick={() => inputRef.current?.focus()}>
      <div className="boot-card intake">
        <div className="intake-head">
          <span style={{ color: 'var(--accent-soft)' }}>
            <IconAbyss size={34} />
          </span>
          <div>
            <h1 className="boot-title">ABYSS</h1>
            <div className="boot-sub">quarantine environment · case #3301</div>
          </div>
        </div>

        <div className="intake-log mono" ref={logRef}>
          {lines.map((l, i) => (
            <div key={i} className={`intake-line ${l.tone ?? 'out'}`}>
              {l.text || '\u00a0'}
            </div>
          ))}

          <div className="intake-prompt">
            <span className={step ? 'field' : 'sigil'}>
              {busy ? '' : step ? `${step.label}:` : 'analista@abyss:intake$'}
            </span>
            {busy ? (
              <span className="dim">montando ambiente…</span>
            ) : (
              <input
                ref={inputRef}
                className="intake-input mono"
                type={step?.secret ? 'password' : 'text'}
                value={input}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') return submit();
                  if (step) return;
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const n = Math.min(hIdx + 1, history.length - 1);
                    if (n >= 0) {
                      setHIdx(n);
                      setInput(history[n]);
                    }
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const n = hIdx - 1;
                    setHIdx(n);
                    setInput(n >= 0 ? history[n] : '');
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
