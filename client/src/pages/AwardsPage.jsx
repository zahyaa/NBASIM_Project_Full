// Sprint D1 — Awards ceremony page. Shows MVP, DPOY, ROY, 6MOY, MIP, the
// All-NBA / All-Defensive / All-Rookie teams, and league leaders for the
// most recently completed season — plus a history view of every prior
// season's winners.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AWARD_DEFS = [
  { key: 'mvp',      label: 'Most Valuable Player',     emoji: '🏆', accent: '#fbbf24' },
  { key: 'dpoy',     label: 'Defensive Player of the Year', emoji: '🛡️', accent: '#3b82f6' },
  { key: 'roy',      label: 'Rookie of the Year',       emoji: '🌟', accent: '#10b981' },
  { key: 'sixthMan', label: 'Sixth Man of the Year',    emoji: '🎯', accent: '#a855f7' },
  { key: 'mip',      label: 'Most Improved Player',     emoji: '📈', accent: '#f97316' },
];

export default function AwardsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('current');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cur, hist] = await Promise.all([
          fetch('/api/awards/season',  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
          fetch('/api/awards/history', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        ]);
        if (cancelled) return;
        if (cur.error) throw new Error(cur.error);
        setCurrent(cur.currentSeasonAwards || null);
        setHistory(hist.seasons || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const recompute = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/awards/recompute', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCurrent(d.awards || null);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={s.container} data-testid="awards-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>← Main Menu</button>
      <h1 style={s.title}>🏆 Season Awards</h1>
      <p style={s.sub}>End-of-season honors for the league.</p>

      <div style={s.tabs}>
        <button
          style={{ ...s.tab, ...(tab === 'current' ? s.tabActive : {}) }}
          onClick={() => setTab('current')}
        >Current Season</button>
        <button
          style={{ ...s.tab, ...(tab === 'history' ? s.tabActive : {}) }}
          onClick={() => setTab('history')}
        >History ({history.length})</button>
      </div>

      {error && <div style={s.error}>{error}</div>}
      {loading && <p style={s.help}>Loading awards…</p>}

      {tab === 'current' && !loading && (
        <>
          {!current && (
            <div style={s.empty}>
              <p>No awards computed yet. Awards are calculated automatically when you advance to the next season — but you can also preview them right now.</p>
              <button onClick={recompute} style={s.primaryBtn}>Compute Awards Preview</button>
            </div>
          )}
          {current && (
            <>
              <div style={s.heroGrid}>
                {AWARD_DEFS.map(def => (
                  <AwardCard key={def.key} def={def} winner={current[def.key]} />
                ))}
              </div>
              <h2 style={s.section}>All-NBA Teams</h2>
              <TeamTiers tiers={current.allNBA} />
              <h2 style={s.section}>All-Defensive Teams</h2>
              <TeamTiers tiers={current.allDefensive} />
              <h2 style={s.section}>All-Rookie Teams</h2>
              <TeamTiers tiers={current.allRookie} flat />
              <h2 style={s.section}>League Leaders</h2>
              <Leaders leaders={current.leagueLeaders} />
              <div style={{ marginTop: 24 }}>
                <button onClick={recompute} style={s.secondaryBtn}>↻ Re-run Awards</button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'history' && !loading && (
        <>
          {!history.length && <p style={s.help}>No completed seasons yet.</p>}
          {history.slice().reverse().map(yr => (
            <div key={yr.seasonNumber} style={s.historyCard}>
              <h3 style={s.historyTitle}>Season {yr.seasonNumber}</h3>
              <div style={s.historyGrid}>
                {AWARD_DEFS.map(def => (
                  <div key={def.key} style={s.historyAward}>
                    <span style={s.historyAwardLabel}>{def.emoji} {def.label}</span>
                    <span style={s.historyAwardWinner}>
                      {yr[def.key]?.name || '—'}
                      {yr[def.key]?.teamName && <em style={s.historyTeam}> · {yr[def.key].teamName}</em>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AwardCard({ def, winner }) {
  if (!winner) {
    return (
      <div style={{ ...s.card, borderColor: def.accent }}>
        <div style={s.cardEmoji}>{def.emoji}</div>
        <div style={s.cardLabel}>{def.label}</div>
        <div style={s.cardName}>—</div>
      </div>
    );
  }
  return (
    <div style={{ ...s.card, borderColor: def.accent }}>
      <div style={s.cardEmoji}>{def.emoji}</div>
      <div style={s.cardLabel}>{def.label}</div>
      <div style={s.cardName}>{winner.name}</div>
      <div style={s.cardTeam}>{winner.teamName} · {winner.position}</div>
      <div style={s.cardStats}>
        {winner.ppg != null && <span>{winner.ppg} PPG</span>}
        {winner.rpg != null && <span>{winner.rpg} RPG</span>}
        {winner.apg != null && <span>{winner.apg} APG</span>}
        {winner.spg != null && <span>{winner.spg} SPG</span>}
        {winner.bpg != null && <span>{winner.bpg} BPG</span>}
      </div>
      {winner.ratingDelta != null && <div style={s.cardDelta}>+{winner.ratingDelta} rating</div>}
    </div>
  );
}

function TeamTiers({ tiers, flat }) {
  if (!tiers || !tiers.length) return <p style={s.help}>—</p>;
  return (
    <div style={s.teamGrid}>
      {tiers.map(t => (
        <div key={t.tier} style={s.teamTier}>
          <div style={s.teamTierLabel}>{t.tier} Team</div>
          <ul style={s.teamList}>
            {(t.players || []).map(p => (
              <li key={p.playerId} style={s.teamRow}>
                <span style={s.teamName}>{p.name}</span>
                <span style={s.teamPos}>{p.position}</span>
                <span style={s.teamTeam}>{p.teamName}</span>
                {!flat && (
                  <span style={s.teamStats}>
                    {p.ppg} / {p.rpg} / {p.apg}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Leaders({ leaders }) {
  if (!leaders) return null;
  const cats = [
    { key: 'points',   label: 'Points',   stat: 'ppg' },
    { key: 'rebounds', label: 'Rebounds', stat: 'rpg' },
    { key: 'assists',  label: 'Assists',  stat: 'apg' },
    { key: 'steals',   label: 'Steals',   stat: 'spg' },
    { key: 'blocks',   label: 'Blocks',   stat: 'bpg' },
  ];
  return (
    <div style={s.leadersGrid}>
      {cats.map(c => (
        <div key={c.key} style={s.leaderCol}>
          <div style={s.leaderTitle}>{c.label}</div>
          <ol style={s.leaderList}>
            {(leaders[c.key] || []).map(p => (
              <li key={p.playerId}>
                <strong>{p.name}</strong> <em style={{ color: '#94a3b8' }}>{p.teamName}</em>
                <span style={{ float: 'right', color: '#fbbf24', fontWeight: 700 }}>{p[c.stat]}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

const s = {
  container: { padding: 24, color: '#fff', minHeight: '100vh', background: '#0f172a', maxWidth: 1200, margin: '0 auto' },
  backBtn: { background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 12 },
  title: { fontSize: 32, margin: '0 0 4px' },
  sub: { color: '#94a3b8', margin: '0 0 16px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: { padding: '8px 16px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  tabActive: { background: '#f97316', color: '#fff', borderColor: '#f97316' },
  empty: { textAlign: 'center', padding: 60, background: '#1e293b', borderRadius: 12 },
  error: { padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 12 },
  help: { color: '#94a3b8' },
  primaryBtn: { padding: '10px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 },
  secondaryBtn: { padding: '8px 14px', background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 },
  card: { background: '#1e293b', border: '2px solid', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  cardEmoji: { fontSize: 36, marginBottom: 6 },
  cardLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  cardName: { fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 6 },
  cardTeam: { fontSize: 12, color: '#cbd5e1', marginTop: 2 },
  cardStats: { display: 'flex', gap: 8, marginTop: 10, fontSize: 11, color: '#fbbf24', fontWeight: 600, flexWrap: 'wrap', justifyContent: 'center' },
  cardDelta: { marginTop: 6, fontSize: 12, color: '#10b981', fontWeight: 700 },
  section: { color: '#fbbf24', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1, margin: '24px 0 12px' },
  teamGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 },
  teamTier: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14 },
  teamTierLabel: { color: '#fbbf24', fontWeight: 700, fontSize: 14, marginBottom: 8 },
  teamList: { listStyle: 'none', padding: 0, margin: 0 },
  teamRow: { display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #334155', fontSize: 13, alignItems: 'center', flexWrap: 'wrap' },
  teamName: { color: '#fff', fontWeight: 600, flex: '1 1 120px' },
  teamPos: { color: '#94a3b8', fontSize: 11 },
  teamTeam: { color: '#cbd5e1', fontSize: 11 },
  teamStats: { color: '#fbbf24', fontSize: 11, fontWeight: 600, marginLeft: 'auto' },
  leadersGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  leaderCol: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 12 },
  leaderTitle: { color: '#fbbf24', fontWeight: 700, marginBottom: 8 },
  leaderList: { paddingLeft: 22, margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.8 },
  historyCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14, marginBottom: 12 },
  historyTitle: { color: '#fbbf24', margin: '0 0 8px', fontSize: 16 },
  historyGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 },
  historyAward: { display: 'flex', flexDirection: 'column', padding: '6px 8px', background: '#0f172a', borderRadius: 6 },
  historyAwardLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600 },
  historyAwardWinner: { fontSize: 14, color: '#fff', fontWeight: 600 },
  historyTeam: { color: '#94a3b8', fontStyle: 'normal', fontSize: 12 },
};
