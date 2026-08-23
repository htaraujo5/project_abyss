import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../state/game';
import { useMeta } from '../state/meta';
import {
  avatarFromIdentity,
  computeProgress,
  cycleAvatarSeed,
  endingLabel,
  evaluateAchievements,
  loadAvatarSeed,
  type AchievementState,
} from '../lib/profile';

function AvatarMark({
  initials,
  bg,
  fg,
  size = 28,
  platinum,
}: {
  initials: string;
  bg: string;
  fg: string;
  size?: number;
  platinum?: boolean;
}) {
  return (
    <span
      className={`profile-avatar${platinum ? ' platinum' : ''}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 25%, ${fg}55, transparent 55%), ${bg}`,
        color: fg,
        fontSize: Math.max(9, Math.round(size * 0.34)),
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function AchievementRow({ a }: { a: AchievementState }) {
  return (
    <div className={`profile-ach${a.unlocked ? ` on tier-${a.tier}` : ' off'}`}>
      <span className="profile-ach-mark" data-tier={a.tier}>
        {a.unlocked ? '◆' : '◇'}
      </span>
      <div className="profile-ach-body">
        <div className="profile-ach-title">{a.title}</div>
        <div className="dim tiny">{a.unlocked ? a.detail : a.lockedHint}</div>
      </div>
    </div>
  );
}

export function ProfileMenu() {
  const { save, session, openApp } = useGame();
  const puzzles = useMeta((s) => s.puzzles);
  const evidence = useMeta((s) => s.evidence);
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const playerId = session?.playerId ?? '';
  const displayName = session?.displayName ?? 'operador';

  useEffect(() => {
    if (playerId) setSeed(loadAvatarSeed(playerId));
  }, [playerId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const avatar = useMemo(
    () => avatarFromIdentity(displayName, playerId || 'guest', seed),
    [displayName, playerId, seed],
  );

  const stats = useMemo(
    () => computeProgress(save, puzzles, evidence),
    [save, puzzles, evidence],
  );

  const achievements = useMemo(
    () => evaluateAchievements(stats, save),
    [stats, save],
  );

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const recent = achievements.filter((a) => a.unlocked).slice(-4).reverse();
  const lockedPreview = achievements.filter((a) => !a.unlocked).slice(0, 3);

  function onCycleAvatar(e: React.MouseEvent) {
    e.stopPropagation();
    if (!playerId) return;
    setSeed(cycleAvatarSeed(playerId));
  }

  return (
    <div className="profile-root" ref={rootRef}>
      <button
        type="button"
        className={`topbar-item profile-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Perfil do operador"
        aria-expanded={open}
      >
        <AvatarMark
          initials={avatar.initials}
          bg={avatar.bg}
          fg={avatar.fg}
          size={22}
          platinum={stats.platinum}
        />
        <span className="profile-trigger-name">{displayName}</span>
        {stats.platinum && <span className="profile-plat-pip" title="Platina">P</span>}
      </button>

      {open && (
        <div className="profile-panel">
          <div className="profile-hero">
            <button
              type="button"
              className="profile-avatar-btn"
              onClick={onCycleAvatar}
              title="Trocar avatar"
            >
              <AvatarMark
                initials={avatar.initials}
                bg={avatar.bg}
                fg={avatar.fg}
                size={56}
                platinum={stats.platinum}
              />
            </button>
            <div className="profile-hero-text">
              <div className="profile-name">{displayName}</div>
              <div className="dim tiny mono">{session?.playerId?.slice(0, 12) ?? 'sem sessão'}</div>
              <div className="profile-role">
                {stats.platinum ? (
                  <span className="chip accent">platina</span>
                ) : (
                  <span className="chip">investigador</span>
                )}
                <span className="chip">{stats.currentTitle}</span>
              </div>
            </div>
          </div>

          <div className="profile-progress">
            <div className="profile-ring" style={{ ['--p' as string]: `${stats.puzzlePct}%` }}>
              <div className="profile-ring-inner">
                <div className="profile-ring-pct">{stats.puzzlePct}%</div>
                <div className="tiny dim upper">campanha</div>
              </div>
            </div>
            <div className="profile-stats">
              <div className="orph-row">
                <span>investigações</span>
                <b>
                  {stats.puzzleDone}
                  <span className="dim"> / {stats.puzzleTotal || '—'}</span>
                </b>
              </div>
              <div className="orph-row">
                <span>artefatos</span>
                <b>
                  {stats.evidenceHave}
                  {stats.evidenceTotal ? <span className="dim"> / {stats.evidenceTotal}</span> : null}
                </b>
              </div>
              <div className="orph-row">
                <span>conquistas</span>
                <b>
                  {unlockedCount}
                  <span className="dim"> / {achievements.length}</span>
                </b>
              </div>
              <div className="orph-row">
                <span>camadas limpas</span>
                <b>
                  {stats.chaptersCleared}
                  <span className="dim"> / {stats.chapterTotal || '—'}</span>
                </b>
              </div>
              <div className="orph-row">
                <span>desfecho</span>
                <b className={stats.ending === 'capture' ? 'danger' : undefined}>
                  {endingLabel(stats.ending)}
                </b>
              </div>
            </div>
          </div>

          {stats.platinum ? (
            <div className="profile-platinum-banner">
              Platina ABYSS — campanha, vault e desfecho deliberado.
            </div>
          ) : (
            <div className="profile-platinum-hint dim tiny">
              Platina: {stats.platinumMissing.slice(0, 3).join(' · ') || 'continue investigando'}
              {stats.platinumMissing.length > 3 ? '…' : ''}
            </div>
          )}

          <div className="pane-head profile-sec-head">Conquistas recentes</div>
          <div className="profile-ach-list">
            {recent.length === 0 && (
              <div className="empty-state" style={{ padding: '12px 8px' }}>
                Nenhuma conquista ainda. Resolva um puzzle para começar.
              </div>
            )}
            {recent.map((a) => (
              <AchievementRow key={a.id} a={a} />
            ))}
          </div>

          {lockedPreview.length > 0 && (
            <>
              <div className="pane-head profile-sec-head">Próximas</div>
              <div className="profile-ach-list">
                {lockedPreview.map((a) => (
                  <AchievementRow key={a.id} a={a} />
                ))}
              </div>
            </>
          )}

          <div className="profile-actions">
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => {
                setOpen(false);
                openApp('vault');
              }}
            >
              abrir vault
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => {
                setOpen(false);
                openApp('settings');
              }}
            >
              ajustes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
