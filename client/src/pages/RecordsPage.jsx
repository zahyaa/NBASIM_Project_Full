// Sprint D2 — Records, banners, and Hall of Fame.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RecordsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('franchise');
  const [franchise, setFranchise] = useState(null);
  const [leaders, setLeaders] = useState(null);
  const [banners, setBanners] = useState(null);
  const [hof, setHof] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [f, l, b, h] = await Promise.all([
          fetch('/api/records/franchise',     { headers }).then(r => r.json()),
          fetch('/api/records/leaders',       { headers }).then(r => r.json()),
          fetch('/api/records/banners',       { headers }).then(r => r.json()),
          fetch('/api/records/hall-of-fame',  { headers }).then(r => r.json()),
        ]);
        if (cancelled) return;
        setFranchise(f); setLeaders(l); setBanners(b); setHof(h);
      } catch (err) { if (!cancelled) setError(err.message); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div style={s.container} data-testid="records-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>← Main Menu</button>
      <h1 style={s.title}>📚 Franchise Records & History</h1>

      <div style={s.tabs}>
        {[
          { k: 'franchise', label: '🏢 Franchise' },
          { k: 'banners',   label: '🏆 Banners' },
          { k: 'leaders',   label: '📊 All-Time Leaders' },
          { k: 'hof',       label: '🌟 Hall of Fame' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
                  style={{ ...s.tab, ...(tab === t.k ? s.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={s.error}>{error}</div>}
      {loading && <p style={s.help}>Loading…</p>}

      {!loading && tab === 'franchise' && franchise && <Franchise data={franchise} />}
      {!loading && tab === 'banners' && banners && <Banners data={banners} />}
      {!loading && tab === 'leaders' && leaders && <Leaders data={leaders} />}
      {!loading && tab === 'hof' && hof && <HallOfFame data={hof} />}
    </div>
  );
}

function Franchise({ data }) {
  return (
    <>
      <div style={s.heroRow}>
        <Stat big label="Seasons" value={data.seasonsPlayed} />
        <Stat big label="Career W-L" value={`${data.totalWins}-${data.totalLosses}`} />
        <Stat big label="Win %" value={(data.winPct * 100).toFixed(1) + '%'} />
        <Stat big label="🏆 Titles" value={data.championships} accent="#fbbf24" />
        <Stat big label="Finals" value={data.finalsAppearances} />
      </div>

      <h2 style={s.section}>Best Season</h2>
      {data.bestSeason ? (
        <div style={s.recordRow}>
          <strong>Season {data.bestSeason.seasonNumber}</strong>
          <span>{data.bestSeason.wins}-{data.bestSeason.losses}</span>
          {data.bestSeason.champion && <span style={{ color: '#fbbf24' }}>🏆 Champion</span>}
        </div>
      ) : <p style={s.help}>—</p>}

      <h2 style={s.section}>Worst Season</h2>
      {data.worstSeason ? (
        <div style={s.recordRow}>
          <strong>Season {data.worstSeason.seasonNumber}</strong>
          <span>{data.worstSeason.wins}-{data.worstSeason.losses}</span>
        </div>
      ) : <p style={s.help}>—</p>}

      <h2 style={s.section}>Most Points in a Game</h2>
      {data.mostPointsInGame ? (
        <div style={s.recordRow}>
          <strong style={{ fontSize: 22, color: '#fbbf24' }}>{data.mostPointsInGame.points} pts</strong>
          <span>{data.mostPointsInGame.won ? 'beat' : 'lost to'} {data.mostPointsInGame.opponent}</span>
          <span>({data.mostPointsInGame.opponentScore} opp)</span>
        </div>
      ) : <p style={s.help}>No games on record yet.</p>}

      <h2 style={s.section}>Biggest Win</h2>
      {data.biggestWin ? (
        <div style={s.recordRow}>
          <strong style={{ fontSize: 22, color: '#10b981' }}>+{data.biggestWin.margin}</strong>
          <span>{data.biggestWin.score}</span>
          <span>vs {data.biggestWin.opponent}</span>
        </div>
      ) : <p style={s.help}>No wins on record yet.</p>}
    </>
  );
}

function Banners({ data }) {
  const banners = data.banners || [];
  const coty = data.coachOfTheYear || [];
  return (
    <>
      <h2 style={s.section}>🏆 Championship Banners ({banners.length})</h2>
      {!banners.length && <p style={s.help}>No championships yet — keep playing.</p>}
      <div style={s.bannerGrid}>
        {banners.map(b => (
          <div key={b.seasonNumber} style={s.banner}>
            <div style={s.bannerYear}>{b.year || `Season ${b.seasonNumber}`}</div>
            <div style={s.bannerTeam}>{b.teamName || 'Champions'}</div>
            <div style={s.bannerRecord}>{b.record}</div>
            <div style={s.bannerEmoji}>🏆</div>
          </div>
        ))}
      </div>

      <h2 style={s.section}>🎓 Coach of the Year</h2>
      {!coty.length && <p style={s.help}>No COY winners yet.</p>}
      {coty.map(c => (
        <div key={c.season} style={s.recordRow}>
          <strong>Season {c.season}</strong>
          <span>{c.coachName} — {c.teamName}</span>
          <span>{c.wins} W (+{c.delta} vs expected)</span>
        </div>
      ))}
    </>
  );
}

function Leaders({ data }) {
  const cats = [
    { k: 'points',   label: 'Points' },
    { k: 'rebounds', label: 'Rebounds' },
    { k: 'assists',  label: 'Assists' },
    { k: 'steals',   label: 'Steals' },
    { k: 'blocks',   label: 'Blocks' },
  ];
  if (!data.totalPlayers) return <p style={s.help}>No career data yet — finish a season to populate.</p>;
  return (
    <div style={s.leadersGrid}>
      {cats.map(c => (
        <div key={c.k} style={s.leaderCol}>
          <div style={s.leaderTitle}>{c.label}</div>
          <ol style={s.leaderList}>
            {(data[c.k] || []).map(p => (
              <li key={p.playerId} style={s.leaderRow}>
                <strong>{p.name}</strong>
                <em style={s.leaderPos}>{p.position}</em>
                <span style={s.leaderVal}>{p[c.k]}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function HallOfFame({ data }) {
  if (!data.total) return (
    <div style={s.empty}>
      <p>No inductees yet. Players become Hall-of-Fame eligible after they retire (leave every roster).</p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>
        Qualifying milestones: 1+ MVP, 3+ All-NBA, 1+ DPOY, 2+ rings, 12,000+ career points, or 90+ peak rating.
      </p>
    </div>
  );
  return (
    <>
      <p style={s.help}>{data.total} inductees</p>
      <div style={s.hofGrid}>
        {data.inducted.map(p => (
          <div key={p.playerId} style={s.hofCard}>
            <div style={s.hofEmoji}>🏛️</div>
            <div style={s.hofName}>{p.name}</div>
            <div style={s.hofMeta}>
              {p.position} · Peak {p.peakRating} · {p.seasons} seasons
            </div>
            <div style={s.hofTeams}>{p.teams.join(' / ')}</div>
            <div style={s.hofAwards}>
              {p.awards.mvps > 0 &&  <span style={s.hofBadge}>{p.awards.mvps}× MVP</span>}
              {p.awards.dpoys > 0 && <span style={s.hofBadge}>{p.awards.dpoys}× DPOY</span>}
              {p.awards.allNBA > 0 && <span style={s.hofBadge}>{p.awards.allNBA}× All-NBA</span>}
              {p.awards.allDefensive > 0 && <span style={s.hofBadge}>{p.awards.allDefensive}× All-D</span>}
              {p.awards.rings > 0 && <span style={{ ...s.hofBadge, background: '#7c2d12', color: '#fed7aa' }}>{p.awards.rings}× 🏆</span>}
            </div>
            <div style={s.hofStats}>
              {p.stats.points} pts · {p.stats.rebounds} reb · {p.stats.assists} ast
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, big, accent }) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, ...(big ? { fontSize: 26 } : {}), color: accent || '#fff' }}>{value}</div>
    </div>
  );
}

const s = {
  container: { padding: 24, color: '#fff', minHeight: '100vh', background: '#0f172a', maxWidth: 1200, margin: '0 auto' },
  backBtn: { background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 12 },
  title: { fontSize: 28, margin: '0 0 16px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  tabActive: { background: '#f97316', color: '#fff', borderColor: '#f97316' },
  error: { padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 12 },
  help: { color: '#94a3b8' },
  empty: { textAlign: 'center', padding: 60, background: '#1e293b', borderRadius: 12 },
  section: { color: '#fbbf24', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' },
  heroRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 },
  statCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14, textAlign: 'center' },
  statLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  statValue: { fontSize: 20, fontWeight: 800, marginTop: 4 },
  recordRow: { display: 'flex', gap: 16, padding: 12, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' },
  bannerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 },
  banner: { background: 'linear-gradient(160deg,#7c2d12,#1e293b)', border: '2px solid #fbbf24', borderRadius: 12, padding: 16, textAlign: 'center' },
  bannerYear: { fontSize: 12, color: '#fde68a', fontWeight: 700 },
  bannerTeam: { fontSize: 18, fontWeight: 800, color: '#fff', margin: '6px 0' },
  bannerRecord: { fontSize: 14, color: '#fbbf24' },
  bannerEmoji: { fontSize: 36, marginTop: 8 },
  leadersGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  leaderCol: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 12 },
  leaderTitle: { color: '#fbbf24', fontWeight: 700, marginBottom: 8 },
  leaderList: { paddingLeft: 22, margin: 0, fontSize: 13, color: '#cbd5e1' },
  leaderRow: { padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 },
  leaderPos: { color: '#94a3b8', fontStyle: 'normal', fontSize: 11 },
  leaderVal: { marginLeft: 'auto', color: '#fbbf24', fontWeight: 700 },
  hofGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  hofCard: { background: '#1e293b', border: '2px solid #fbbf24', borderRadius: 12, padding: 16, textAlign: 'center' },
  hofEmoji: { fontSize: 30 },
  hofName: { fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4 },
  hofMeta: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  hofTeams: { fontSize: 11, color: '#cbd5e1', marginTop: 4, fontStyle: 'italic' },
  hofAwards: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 },
  hofBadge: { background: '#0c4a6e', color: '#bae6fd', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  hofStats: { fontSize: 12, color: '#cbd5e1', marginTop: 10 },
};
