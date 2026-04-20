import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const NBA_COACHES_ACTIVE = [
  'Steve Kerr', 'Erik Spoelstra', 'Tyronn Lue', 'Doc Rivers', 'Rick Carlisle',
  'Tom Thibodeau', 'Mike Budenholzer', 'Joe Mazzulla', 'Jason Kidd',
  'Mark Daigneault', 'Chauncey Billups', 'Quin Snyder', 'JJ Redick',
  'Wes Unseld Jr.', 'Ime Udoka', 'Taylor Jenkins', 'Willie Green',
  'Darko Rajakovic', 'Kenny Atkinson', 'Michael Malone',
];

export default function SeasonDraftPage() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();
  const [rawPool, setRawPool] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [conference, setConference] = useState('');
  const [city, setCity] = useState('');
  const [coach, setCoach] = useState('');
  const [setupDone, setSetupDone] = useState(false);

  const roster = user?.team?.players || [];

  const pool = useMemo(() => {
    const draftedIds = new Set(roster.map(p => p.playerId));
    return rawPool.filter(p => !draftedIds.has(p.id));
  }, [rawPool, roster]);

  const handleSetup = async () => {
    if (!conference) return;
    setError('');
    try {
      const res = await fetch('/api/draft/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conference, league: 'NBA', city, coach, draftType: 'season' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
      setSetupDone(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const draftedIds = new Set(roster.map(p => p.playerId));
      setSearchResults(data.data.filter(p => !draftedIds.has(p.id)));
    } catch (err) { setError(err.message); }
    setSearching(false);
  };

  const fetchPool = useCallback(async () => {
    if (!setupDone) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/draft/pool?season=2025&conference=${conference}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load draft pool');
      setRawPool(await res.json());
    } catch (err) { setError(err.message); }
    setLoading(false);
  }, [token, conference, setupDone]);

  useEffect(() => { if (setupDone) fetchPool(); }, [setupDone, fetchPool]);

  useEffect(() => {
    if (user?.draftCompleted) navigate('/game');
  }, [user?.draftCompleted, navigate]);

  const handlePick = async (player) => {
    setPicking(true);
    try {
      const res = await fetch('/api/draft/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          playerId: player.id, firstName: player.firstName, lastName: player.lastName,
          position: player.position, rating: player.rating, stats: player.stats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
      setRawPool(prev => prev.filter(p => p.id !== player.id));
      setSearchResults(prev => prev.filter(p => p.id !== player.id));
    } catch (err) { setError(err.message); }
    setPicking(false);
  };

  const handleComplete = async () => {
    try {
      const res = await fetch('/api/draft/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teamName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
    } catch (err) { setError(err.message); }
  };

  const PlayerCard = ({ player }) => (
    <div style={s.playerCard}>
      <div style={s.playerInfo}>
        <span style={s.playerName}>{player.firstName} {player.lastName}</span>
        <span style={s.playerMeta}>{player.position} | {player.team}</span>
      </div>
      <div style={s.ratingBadge}>{player.rating}</div>
      <button onClick={() => handlePick(player)} disabled={picking || roster.length >= 12} style={s.draftBtn}>Draft</button>
    </div>
  );

  if (!setupDone) {
    return (
      <div style={s.container}>
        <div style={s.setupCard}>
          <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
          <h1 style={s.title}>Season Draft</h1>
          <p style={s.subtitle}>Draft current-season NBA players for the 2025-26 season</p>
          {error && <div style={s.error}>{error}</div>}
          <div style={s.form}>
            <label style={s.label}>Conference</label>
            <div style={s.optionGroup}>
              {['East', 'West'].map(c => (
                <button key={c} onClick={() => setConference(c)}
                  style={conference === c ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{c}ern</button>
              ))}
            </div>
            <label style={s.label}>City</label>
            <select style={s.select} value={city} onChange={e => setCity(e.target.value)}>
              <option value="">Select city...</option>
              {['New York','Los Angeles','Chicago','Houston','Phoenix','Dallas','Miami','Atlanta',
                'Boston','Denver','Cleveland','Milwaukee','San Francisco','Memphis','Sacramento',
                'Portland','Minneapolis','Charlotte','Indianapolis','Detroit','Orlando','New Orleans',
                'Oklahoma City','San Antonio','Philadelphia','Brooklyn','Washington D.C.','Salt Lake City',
                'Toronto','Tampa'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={s.label}>Coach (Active)</label>
            <select style={s.select} value={coach} onChange={e => setCoach(e.target.value)}>
              <option value="">Select coach...</option>
              {NBA_COACHES_ACTIVE.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={handleSetup} disabled={!conference}
              style={!conference ? { ...s.startBtn, opacity: 0.5 } : s.startBtn}>Start Season Draft</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <h1 style={s.title}>Season Draft — 2025-26</h1>
        <p style={s.subtitle}>{conference}ern Conference | {roster.length}/12 players</p>
        <input type="text" placeholder="Team Name" value={teamName}
          onChange={e => setTeamName(e.target.value)} style={{ ...s.teamInput, marginTop: 8 }} />
      </div>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.searchBar}>
        <input type="text" placeholder="Search active NBA players..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()} style={s.searchInput} />
        <button onClick={handleSearch} disabled={searching} style={s.searchBtn}>{searching ? '...' : 'Search'}</button>
      </div>
      {searchResults.length > 0 && (
        <div style={s.searchPanel}>
          <h3 style={s.panelTitle}>Search Results</h3>
          <div style={s.poolList}>{searchResults.map(p => <PlayerCard key={p.id} player={p} />)}</div>
        </div>
      )}
      <div style={s.layout}>
        <div style={s.poolPanel}>
          <h2 style={s.panelTitle}>Draft Pool</h2>
          {loading ? <div style={s.loadingText}>Loading...</div> : (
            <div style={s.poolList}>{pool.map(p => <PlayerCard key={p.id} player={p} />)}</div>
          )}
        </div>
        <div style={s.rosterPanel}>
          <h2 style={s.panelTitle}>Your Roster</h2>
          {roster.length === 0 ? <p style={s.emptyText}>No players yet.</p> : (
            <div style={s.rosterList}>
              {roster.map(p => (
                <div key={p.playerId} style={s.rosterItem}>
                  <span style={s.rosterName}>{p.firstName} {p.lastName}</span>
                  <span style={s.rosterPos}>{p.position}</span>
                  <span style={s.ratingSmall}>{p.rating}</span>
                </div>
              ))}
            </div>
          )}
          {roster.length >= 5 && (
            <button onClick={handleComplete} style={s.completeBtn}>Complete Draft ({roster.length})</button>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  setupCard: { maxWidth: 480, margin: '40px auto', background: '#1e293b', borderRadius: 16, padding: '32px 28px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  form: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  optionGroup: { display: 'flex', gap: 8, justifyContent: 'center' },
  optionBtn: { padding: '10px 20px', borderRadius: 8, border: '2px solid #334155', background: '#0f172a', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  optionActive: { border: '2px solid #22c55e', color: '#22c55e', background: 'rgba(34,197,94,0.1)' },
  select: { padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, width: '100%' },
  startBtn: { padding: '14px 24px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16, marginTop: 8 },
  title: { color: '#22c55e', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', margin: 0, fontSize: 14 },
  teamInput: { padding: '8px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, width: 200 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  searchBar: { display: 'flex', gap: 8, maxWidth: 600, margin: '0 auto 16px' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 },
  searchBtn: { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  searchPanel: { background: '#1e293b', borderRadius: 12, padding: 16, maxWidth: 1100, margin: '0 auto 16px', border: '1px solid #a855f7' },
  layout: { display: 'flex', gap: 24, maxWidth: 1100, margin: '0 auto' },
  poolPanel: { flex: 2, background: '#1e293b', borderRadius: 12, padding: 20 },
  rosterPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  panelTitle: { color: '#22c55e', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  loadingText: { color: '#94a3b8', textAlign: 'center', padding: 40 },
  poolList: { maxHeight: '60vh', overflowY: 'auto' },
  playerCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #334155' },
  playerInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  playerName: { fontWeight: 600, fontSize: 14 },
  playerMeta: { color: '#94a3b8', fontSize: 12 },
  ratingBadge: { background: '#22c55e', color: '#fff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 },
  draftBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  rosterList: { display: 'flex', flexDirection: 'column', gap: 6 },
  rosterItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#0f172a', borderRadius: 6 },
  rosterName: { flex: 1, fontWeight: 600, fontSize: 13 },
  rosterPos: { color: '#64748b', fontSize: 12 },
  ratingSmall: { background: '#22c55e', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700, fontSize: 11 },
  emptyText: { color: '#64748b', textAlign: 'center', padding: 20 },
  completeBtn: { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 12 },
};
