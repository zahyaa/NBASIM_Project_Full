import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function MultiplayerPage() {
  const navigate = useNavigate();

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.card}>
        <div style={s.icon}>🌐</div>
        <h1 style={s.title}>Multiplayer</h1>
        <p style={s.subtitle}>Online head-to-head is coming soon.</p>
        <div style={s.features}>
          <div style={s.feature}>
            <span style={s.featureIcon}>🏀</span>
            <span>Challenge friends to full 5v5 games</span>
          </div>
          <div style={s.feature}>
            <span style={s.featureIcon}>⚡</span>
            <span>Real-time draft battles</span>
          </div>
          <div style={s.feature}>
            <span style={s.featureIcon}>🏆</span>
            <span>Ranked matchmaking and leaderboards</span>
          </div>
        </div>
        <div style={s.badge}>UNDER CONSTRUCTION</div>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, position: 'absolute', top: 24, left: 24 },
  card: { background: '#1e293b', borderRadius: 20, padding: '48px 40px', textAlign: 'center', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { color: '#06b6d4', fontSize: 32, margin: '0 0 8px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', fontSize: 16, margin: '0 0 28px' },
  features: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28, textAlign: 'left' },
  feature: { display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 14 },
  featureIcon: { fontSize: 20 },
  badge: { display: 'inline-block', padding: '8px 24px', borderRadius: 20, background: 'rgba(6,182,212,0.15)', color: '#06b6d4', fontWeight: 700, fontSize: 13, letterSpacing: 2 },
};
