import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MODES = [
  {
    key: 'fantasy',
    title: 'Fantasy Draft',
    desc: 'Be the GM. Pick a city, conference, division, coach. Draft 12 players. Earn 500 tokens.',
    icon: '\u{1F3C6}',
    path: '/draft',
    color: '#f97316',
  },
  {
    key: 'store',
    title: 'Store',
    desc: 'Spend tokens on training, signature gear, and recovery to boost your roster.',
    icon: '\u{1F6CD}\u{FE0F}',
    path: '/store',
    color: '#eab308',
    requiresDraftStarted: true,
  },
  {
    key: 'team',
    title: 'Team Management',
    desc: 'Set the lineup, sign players, trade with CPU, manage injuries and contracts.',
    icon: '\u{1F4CB}',
    path: '/team',
    color: '#10b981',
    requiresDraftStarted: true,
  },
  {
    key: 'playbook',
    title: 'Playbook',
    desc: "Design custom plays for your roster. Saved straight to Coach's Playbook.",
    icon: '\u{1F4DD}',
    path: '/playbook',
    color: '#f472b6',
    requiresDraftStarted: true,
  },
  {
    key: 'defensive-playbook',
    title: 'Defensive Playbook',
    desc: 'Design NBA defensive sets — zones, presses, switches, traps. Pair with offensive plays in-game.',
    icon: '\u{1F6E1}\uFE0F',
    path: '/defensive-playbook',
    color: '#06b6d4',
    requiresDraftStarted: true,
  },
  {
    key: 'standings',
    title: 'Standings & Career',
    desc: 'Run an 82-game season. View league standings. 5-year career arc.',
    icon: '\u{1F4CA}',
    path: '/standings',
    color: '#22c55e',
    requiresDraftStarted: true,
  },
  {
    key: '1v1',
    title: 'One on One',
    desc: 'Instant matchups — MJ vs LeBron, Kobe vs AI. Popular matchups, random mode, and rematch.',
    icon: '\u{1F94A}',
    path: '/1v1',
    color: '#3b82f6',
  },
  {
    key: 'blacktop',
    title: 'Blacktop',
    desc: 'Streetball with active NBA players. 1v1 to 5v5 half-court.',
    icon: '\u{1F525}',
    path: '/blacktop',
    color: '#ef4444',
  },
  {
    key: 'bio',
    title: 'Players Bio',
    desc: 'Live NBA player data. Search any active player. Stats, ratings, team info.',
    icon: '\u{1F4D6}',
    path: '/players',
    color: '#a855f7',
  },
  {
    key: 'multiplayer',
    title: 'Multiplayer',
    desc: 'Public, private & playoff matches against real GMs. Subscription required.',
    icon: '\u{1F310}',
    path: '/multiplayer',
    color: '#06b6d4',
    requiresDraftStarted: true,
  },
  {
    key: 'how-to-play',
    title: 'How to Play',
    desc: 'Full guide — modes, fantasy economy, playoffs, multiplayer, tips.',
    icon: '\u{1F4DA}',
    path: '/how-to-play',
    color: '#60a5fa',
  },
  {
    key: 'settings',
    title: 'Settings',
    desc: 'Difficulty, reset draft, manage account.',
    icon: '\u{2699}\u{FE0F}',
    path: '/settings',
    color: '#94a3b8',
  },
];

export default function MainMenu() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [rankInfo, setRankInfo] = useState(null);

  // Pull standings if the user has completed their draft, so we can show
  // their League / Conference / Division rank front-and-center.
  useEffect(() => {
    if (!user?.draftCompleted || !token) return;
    let cancelled = false;
    fetch('/api/season/standings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data || !data.standings?.length) return;
        const sortFn = (a, b) => (b.wins - a.wins) || (a.losses - b.losses);
        const sorted = [...data.standings].sort(sortFn);
        const userRow = sorted.find(r => r.isUser);
        if (!userRow) return;
        const conf = sorted.filter(r => r.conference === userRow.conference);
        const div = sorted.filter(r => r.conference === userRow.conference && r.division === userRow.division);
        setRankInfo({
          gamesPlayed: data.gamesPlayed,
          gamesTotal: data.gamesTotal,
          league: { rank: sorted.findIndex(r => r.isUser) + 1, of: sorted.length },
          conf:   { rank: conf.findIndex(r => r.isUser) + 1,   of: conf.length, name: userRow.conference },
          div:    { rank: div.findIndex(r => r.isUser) + 1,    of: div.length,  name: userRow.division },
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.draftCompleted, user?.seasonWins, user?.seasonLosses, token]);

  const ordinal = n => {
    const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>BASKETBALL SIMULATOR</h1>
        <p style={styles.tagline}>Live NBA roster. Your rules.</p>
        <p style={styles.subtitle}>Welcome, {user?.username}. Choose your game mode.</p>
        {user?.draftCompleted && (
          <p style={styles.record} data-testid="career-summary">
            {user.team?.name || 'My Team'} | Season {user.seasonNumber || 1}/5
            {' · '}This Season: {user.seasonWins || 0}W-{user.seasonLosses || 0}L
            {' · '}Career: {user.wins}W-{user.losses}L
            <button onClick={() => navigate('/game')} style={styles.resumeBtn}>Resume Season</button>
          </p>
        )}
        {rankInfo && (
          <div style={styles.rankBanner} data-testid="menu-rank-banner">
            <button data-testid="menu-rank-league" onClick={() => navigate('/standings')} style={styles.rankPill}>
              <strong>{ordinal(rankInfo.league.rank)}</strong> in League
            </button>
            <button data-testid="menu-rank-conf" onClick={() => navigate('/standings')} style={styles.rankPill}>
              <strong>{ordinal(rankInfo.conf.rank)}</strong> in {rankInfo.conf.name}ern Conf
            </button>
            <button data-testid="menu-rank-div" onClick={() => navigate('/standings')} style={styles.rankPill}>
              <strong>{ordinal(rankInfo.div.rank)}</strong> in {rankInfo.div.name} Div
            </button>
            <span style={styles.rankGames}>
              {rankInfo.gamesPlayed} / {rankInfo.gamesTotal} games
            </span>
          </div>
        )}
      </div>

      <div style={styles.grid}>
        {MODES.map(mode => {
          const locked = mode.requiresDraftStarted && !user?.draftStarted;
          return (
            <button
              key={mode.key}
              onClick={() => !locked && navigate(mode.path)}
              disabled={locked}
              data-testid={`menu-${mode.key}`}
              style={{
                ...styles.card,
                borderColor: locked ? '#475569' : mode.color,
                opacity: locked ? 0.55 : 1,
                cursor: locked ? 'not-allowed' : 'pointer',
              }}
            >
              <div style={styles.cardIcon}>{mode.icon}</div>
              <h2 style={{ ...styles.cardTitle, color: locked ? '#94a3b8' : mode.color }}>
                {mode.title}
                {locked && <span style={styles.lockBadge}>{'\u{1F512}'} Locked</span>}
              </h2>
              <p style={styles.cardDesc}>
                {locked ? 'Start a fantasy draft to unlock.' : mode.desc}
              </p>
              {mode.key === 'store' && user?.draftStarted && (
                <p style={styles.tokenChip}>{user.tokens || 0} tokens</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#e2e8f0',
    padding: '40px 24px',
  },
  header: { textAlign: 'center', marginBottom: 40 },
  title: { color: '#f97316', fontSize: 48, margin: '0 0 4px', fontWeight: 800, letterSpacing: 3 },
  tagline: { color: '#e2e8f0', margin: '0 0 8px', fontSize: 18, fontWeight: 300, letterSpacing: 1 },
  subtitle: { color: '#94a3b8', margin: 0, fontSize: 16 },
  record: { color: '#60a5fa', marginTop: 12, fontSize: 14 },
  resumeBtn: {
    marginLeft: 12,
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#22c55e',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  rankBanner: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    gap: 8, flexWrap: 'wrap', marginTop: 12,
  },
  rankPill: {
    background: '#1e3a8a', color: '#fbbf24',
    border: '1px solid #f97316', borderRadius: 999,
    padding: '6px 14px', fontSize: 13, cursor: 'pointer',
  },
  rankGames: { color: '#94a3b8', fontSize: 12, marginLeft: 6 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 20,
    maxWidth: 1000,
    margin: '0 auto',
  },
  card: {
    background: '#1e293b',
    borderRadius: 16,
    padding: '28px 24px',
    border: '2px solid #334155',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'transform 0.15s, border-color 0.15s',
  },
  cardIcon: { fontSize: 36, marginBottom: 8 },
  cardTitle: { fontSize: 20, fontWeight: 700, margin: '0 0 8px' },
  cardDesc: { color: '#94a3b8', fontSize: 13, margin: 0, lineHeight: 1.5 },
  lockBadge: {
    marginLeft: 10, fontSize: 11, color: '#fca5a5', background: '#3f1f1f',
    padding: '2px 8px', borderRadius: 999, fontWeight: 600, letterSpacing: 0.5,
  },
  tokenChip: {
    display: 'inline-block', marginTop: 10, padding: '2px 10px', borderRadius: 999,
    background: '#451a03', color: '#fbbf24', fontSize: 12, fontWeight: 700,
  },
};
