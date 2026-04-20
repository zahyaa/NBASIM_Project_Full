import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MODES = [
  {
    key: 'fantasy',
    title: 'Fantasy Draft',
    desc: 'Draft legends from every era. MJ, LeBron, Wilt — all on one roster. Dream Team presets included.',
    icon: '\u{1F3C6}',
    path: '/draft',
    color: '#f97316',
  },
  {
    key: 'season',
    title: 'Season Draft',
    desc: 'Draft current-season NBA players including the incoming draft class.',
    icon: '\u{1F3C0}',
    path: '/season-draft',
    color: '#22c55e',
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
    desc: 'Streetball with any NBA player ever. 1v1 to 5v5 half-court. Mix eras freely.',
    icon: '\u{1F525}',
    path: '/blacktop',
    color: '#ef4444',
  },
  {
    key: 'bio',
    title: 'Players Bio',
    desc: 'Real NBA data. Search any player from 1946 to today. Stats, ratings, era badges.',
    icon: '\u{1F4CB}',
    path: '/players',
    color: '#a855f7',
  },
  {
    key: 'multiplayer',
    title: 'Multiplayer',
    desc: 'Under construction. Coming soon!',
    icon: '\u{1F6A7}',
    path: '/multiplayer',
    color: '#64748b',
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
  const { user } = useAuth();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>NBA SIM</h1>
        <p style={styles.tagline}>Every player. Every era. Your rules.</p>
        <p style={styles.subtitle}>Welcome, {user?.username}. Choose your game mode.</p>
        {user?.draftCompleted && (
          <p style={styles.record}>
            {user.team?.name || 'My Team'} | {user.wins}W - {user.losses}L
            <button onClick={() => navigate('/game')} style={styles.resumeBtn}>Resume Season</button>
          </p>
        )}
      </div>

      <div style={styles.grid}>
        {MODES.map(mode => (
          <button
            key={mode.key}
            onClick={() => navigate(mode.path)}
            style={{ ...styles.card, borderColor: mode.color }}
          >
            <div style={styles.cardIcon}>{mode.icon}</div>
            <h2 style={{ ...styles.cardTitle, color: mode.color }}>{mode.title}</h2>
            <p style={styles.cardDesc}>{mode.desc}</p>
          </button>
        ))}
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
};
