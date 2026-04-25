import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function PlayerBioPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [bio, setBio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setBio(null);
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data.data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleSelectPlayer = async (player) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/nba/players/${player.id}/bio`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load player bio');
      setBio(await res.json());
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const StatRow = ({ label, value }) => (
    <div style={s.statRow}>
      <span style={s.statLabel}>{label}</span>
      <span style={s.statValue}>{value ?? 'N/A'}</span>
    </div>
  );

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>Players Bio</h1>
      <p style={s.subtitle}>Search and explore active NBA player profiles and stats</p>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.searchBar}>
        <input type="text" placeholder="Search by player name..." value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()} style={s.searchInput} />
        <button onClick={handleSearch} disabled={loading} style={s.searchBtn}>
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {!bio && results.length > 0 && (
        <div style={s.resultsGrid}>
          {results.map(p => (
            <button key={p.id} onClick={() => handleSelectPlayer(p)} style={s.playerTile}>
              {p.teamLogo && <img src={p.teamLogo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', marginBottom: 4 }} onError={e => e.target.style.display='none'} />}
              <div style={s.tileRating}>{p.rating}</div>
              <div style={s.tileName}>{p.firstName} {p.lastName}</div>
              <div style={s.tileMeta}>{p.position} | {p.team}</div>
              {p.era && <div style={{ color: p.era.color, fontSize: 11, fontWeight: 700, marginTop: 4 }}>{p.era.era}</div>}
            </button>
          ))}
        </div>
      )}
      {bio && (
        <div style={s.bioCard}>
          <button onClick={() => setBio(null)} style={s.bioBack}>&larr; Back to results</button>
          <div style={s.bioHeader}>
            <div style={s.bioRating}>{bio.rating}</div>
            <div>
              <h2 style={s.bioName}>{bio.firstName} {bio.lastName}</h2>
              <p style={s.bioTeam}>
                {bio.teamLogo && <img src={bio.teamLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', verticalAlign: 'middle', marginRight: 6 }} onError={e => e.target.style.display='none'} />}
                {bio.team} | #{bio.jerseyNumber || '—'}
              </p>
              {bio.era && <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700, background: bio.era.color + '22', color: bio.era.color, marginTop: 4 }}>{bio.era.era} Era</span>}
            </div>
          </div>
          <div style={s.infoGrid}>
            <StatRow label="Position" value={bio.position} />
            <StatRow label="Height" value={bio.height} />
            <StatRow label="Weight" value={bio.weight ? `${bio.weight} lbs` : null} />
            <StatRow label="Country" value={bio.country} />
            <StatRow label="College" value={bio.college} />
            <StatRow label="Draft Year" value={bio.draftYear} />
            <StatRow label="Draft Pick" value={bio.draftRound && bio.draftNumber ? `Round ${bio.draftRound}, Pick ${bio.draftNumber}` : 'Undrafted'} />
          </div>
          {bio.stats && (
            <>
              <h3 style={s.sectionTitle}>Season Averages</h3>
              <div style={s.statsGrid}>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.pts?.toFixed(1) || '—'}</div>
                  <div style={s.statBoxLabel}>PPG</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.reb?.toFixed(1) || '—'}</div>
                  <div style={s.statBoxLabel}>RPG</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.ast?.toFixed(1) || '—'}</div>
                  <div style={s.statBoxLabel}>APG</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.stl?.toFixed(1) || '—'}</div>
                  <div style={s.statBoxLabel}>SPG</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.blk?.toFixed(1) || '—'}</div>
                  <div style={s.statBoxLabel}>BPG</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.fg_pct ? (bio.stats.fg_pct * 100).toFixed(1) + '%' : '—'}</div>
                  <div style={s.statBoxLabel}>FG%</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.fg3_pct ? (bio.stats.fg3_pct * 100).toFixed(1) + '%' : '—'}</div>
                  <div style={s.statBoxLabel}>3P%</div>
                </div>
                <div style={s.statBox}>
                  <div style={s.statBoxNum}>{bio.stats.ft_pct ? (bio.stats.ft_pct * 100).toFixed(1) + '%' : '—'}</div>
                  <div style={s.statBoxLabel}>FT%</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  title: { color: '#a855f7', fontSize: 36, textAlign: 'center', margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', textAlign: 'center', margin: '0 0 24px', fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  searchBar: { display: 'flex', gap: 8, maxWidth: 500, margin: '0 auto 24px' },
  searchInput: { flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 15 },
  searchBtn: { padding: '12px 24px', borderRadius: 8, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 15 },
  resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, maxWidth: 800, margin: '0 auto' },
  playerTile: { padding: 16, background: '#1e293b', borderRadius: 10, border: '1px solid #334155', cursor: 'pointer', textAlign: 'center', color: '#e2e8f0' },
  tileRating: { background: '#a855f7', color: '#fff', borderRadius: '50%', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, marginBottom: 8 },
  tileName: { fontWeight: 700, fontSize: 15 },
  tileMeta: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  bioCard: { maxWidth: 600, margin: '0 auto', background: '#1e293b', borderRadius: 16, padding: 24 },
  bioBack: { background: 'none', border: 'none', color: '#a855f7', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'block' },
  bioHeader: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  bioRating: { background: '#a855f7', color: '#fff', borderRadius: '50%', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24 },
  bioName: { margin: 0, fontSize: 24, fontWeight: 800 },
  bioTeam: { color: '#94a3b8', margin: '4px 0 0', fontSize: 14 },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 },
  statRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155' },
  statLabel: { color: '#64748b', fontSize: 13 },
  statValue: { fontWeight: 600, fontSize: 13 },
  sectionTitle: { color: '#a855f7', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  statBox: { background: '#0f172a', borderRadius: 8, padding: '12px 8px', textAlign: 'center' },
  statBoxNum: { fontSize: 20, fontWeight: 800, color: '#fff' },
  statBoxLabel: { fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2, textTransform: 'uppercase' },
};
