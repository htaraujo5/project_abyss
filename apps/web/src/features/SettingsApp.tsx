import { useGame, DEFAULT_SETTINGS } from '../state/game';
import { setMuted, setUiVolume, uiSound } from '../lib/audio';

export function SettingsApp() {
  const { settings, patchSettings, save, session, closeAll, pushToast } = useGame();

  return (
    <div className="pane-scroll">
      <div className="pane-head">Interface</div>
      <div className="panel" style={{ display: 'grid', gap: 14 }}>
        <div>
          <div className="tiny dim upper" style={{ marginBottom: 5 }}>
            escala da UI — {Math.round(settings.uiScale * 100)}%
          </div>
          <input
            className="slider"
            style={{ width: 240 }}
            type="range"
            min={80}
            max={140}
            step={5}
            value={settings.uiScale * 100}
            onChange={(e) => patchSettings({ uiScale: Number(e.target.value) / 100 })}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.contrast === 'high'}
            onChange={(e) => patchSettings({ contrast: e.target.checked ? 'high' : 'normal' })}
          />
          alto contraste
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.reduceMotion}
            onChange={(e) => patchSettings({ reduceMotion: e.target.checked })}
          />
          reduzir animações e efeitos narrativos
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.desktopIcons}
            onChange={(e) => patchSettings({ desktopIcons: e.target.checked })}
          />
          mostrar ícones na área de trabalho
        </label>
      </div>

      <div className="pane-head">Terminal</div>
      <div className="panel">
        <div className="tiny dim upper" style={{ marginBottom: 6 }}>
          contraste do terminal
        </div>
        <div className="seg">
          {(['graphite', 'contrast', 'paper'] as const).map((t) => (
            <button
              key={t}
              className={settings.terminalTheme === t ? 'on' : ''}
              onClick={() => patchSettings({ terminalTheme: t })}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="dim tiny" style={{ marginTop: 8 }}>
          Reabra as abas do terminal para aplicar o tema.
        </p>
      </div>

      <div className="pane-head">Áudio</div>
      <div className="panel" style={{ display: 'grid', gap: 14 }}>
        <p className="dim tiny" style={{ margin: 0 }}>
          Sem “música de rádio” — score de suspense só no intake; após o login o desktop fica
          silencioso (SFX de UI). Na captura: ruído branco; no wipe: silêncio total.
        </p>
        <div>
          <div className="tiny dim upper" style={{ marginBottom: 5 }}>
            sons / ambiente — {Math.round(settings.volumeUi * 100)}%
          </div>
          <input
            className="slider"
            style={{ width: 240 }}
            type="range"
            min={0}
            max={100}
            value={settings.volumeUi * 100}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              patchSettings({ volumeUi: v, musicMode: 'off', volumeMusic: 0 });
              setUiVolume(v);
              uiSound('click');
            }}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.muted}
            onChange={(e) => {
              patchSettings({ muted: e.target.checked });
              setMuted(e.target.checked);
            }}
          />
          silenciar tudo
        </label>
        <button
          className="btn sm"
          style={{ justifySelf: 'start' }}
          onClick={() => uiSound('notify')}
        >
          testar som de interface
        </button>
      </div>

      <div className="pane-head">Sessão</div>
      <div className="panel">
        <dl className="kv" style={{ padding: 0 }}>
          <dt>jogador</dt>
          <dd>{session?.displayName ?? '—'}</dd>
          <dt>save</dt>
          <dd>{save?.name ?? '—'}</dd>
          <dt>capítulo</dt>
          <dd>{save?.currentChapter ?? '—'}</dd>
          <dt>versão de conteúdo</dt>
          <dd>{save?.contentVersion ?? '—'}</dd>
        </dl>
        <div className="toolbar wrap" style={{ border: 0, background: 'none', paddingLeft: 0 }}>
          <button
            className="btn sm"
            onClick={() => {
              patchSettings(DEFAULT_SETTINGS);
              pushToast('Preferências restauradas', 'success');
            }}
          >
            restaurar preferências
          </button>
          <button className="btn sm" onClick={() => closeAll()}>
            fechar todas as janelas
          </button>
          <button
            className="btn sm danger"
            onClick={() => {
              localStorage.removeItem('abyss_session');
              localStorage.removeItem('abyss_token');
              location.reload();
            }}
          >
            encerrar sessão
          </button>
        </div>
      </div>

      <div className="panel dim tiny" style={{ lineHeight: 1.8 }}>
        Toda telemetria, host, binário e serviço deste jogo existe apenas no sandbox ficcional.
        Nenhum recurso do seu sistema é lido além do que a própria aplicação cria.
      </div>
    </div>
  );
}
