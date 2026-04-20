import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const US_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'Austin', 'Jacksonville', 'San Jose',
  'Indianapolis', 'San Francisco', 'Charlotte', 'Seattle', 'Denver', 'Nashville',
  'Oklahoma City', 'Portland', 'Las Vegas', 'Memphis', 'Louisville', 'Baltimore',
  'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Sacramento', 'Mesa',
  'Atlanta', 'Kansas City', 'Omaha', 'Colorado Springs', 'Raleigh', 'Miami',
  'Minneapolis', 'Cleveland', 'Tampa', 'New Orleans', 'Orlando', 'Detroit',
  'St. Louis', 'Pittsburgh', 'Cincinnati', 'Salt Lake City', 'Boston',
  'Brooklyn', 'Washington D.C.', 'Honolulu',
];

const NBA_COACHES = [
  'Phil Jackson', 'Gregg Popovich', 'Pat Riley', 'Red Auerbach', 'Steve Kerr',
  'Erik Spoelstra', 'Tyronn Lue', 'Doc Rivers', 'Rick Carlisle', 'Larry Brown',
  'Chuck Daly', 'Lenny Wilkens', 'Don Nelson', 'Jerry Sloan', "Mike D'Antoni",
  'Tom Thibodeau', 'Mike Budenholzer', 'Monty Williams', 'Ime Udoka',
  'Joe Mazzulla', 'Jason Kidd', 'Mark Daigneault', 'Chauncey Billups',
  'Quin Snyder', 'JJ Redick', 'Wes Unseld Jr.',
];

const DREAM_TEAMS = [
  { label: "90s All-Stars", names: ['Michael Jordan', 'Scottie Pippen', 'Hakeem Olajuwon', 'Karl Malone', 'John Stockton'] },
  { label: "2000s Elite", names: ['Kobe Bryant', 'Tim Duncan', 'Allen Iverson', 'Kevin Garnett', 'Shaquille ONeal'] },
  { label: "Modern Icons", names: ['LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo', 'Nikola Jokic'] },
  { label: "Old School Legends", names: ['Wilt Chamberlain', 'Bill Russell', 'Kareem Abdul-Jabbar', 'Oscar Robertson', 'Jerry West'] },
];

const ERA_FILTERS = [
  { label: 'All Eras', value: null },
  { label: '60s–70s', value: ['Pioneer', 'Classic'] },
  { label: '80s', value: ['Showtime'] },
  { label: '90s', value: ['Golden'] },
  { label: '00s', value: ['New School'] },
  { label: '10s+', value: ['Modern', 'Current'] },
];

export default function DraftPage() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();
  const [rawPool, setRawPool] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [teamName, setTeamName] = useState(user?.team?.name || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [eraFilter, setEraFilter] = useState(null);
  const [loadingPreset, setLoadingPreset] = useState('');

  const [conference, setConference] = useState(user?.conference || '');
  const [league, setLeague] = useState(user?.league || '');
  const [city, setCity] = useState(user?.team?.city || '');
  const [coach, setCoach] = useState(user?.team?.coach || '');
  const [cityFilter, setCityFilter] = useState('');
  const [coachFilter, setCoachFilter] = useState('');
  const [setupDone, setSetupDone] = useState(!!(user?.conference && user?.league));

  const roster = user?.team?.players || [];

  const pool = useMemo(() => {
    const draftedIds = new Set(roster.map(p => p.playerId));
    let filtered = rawPool.filter(p => !draftedIds.has(p.id));
    if (eraFilter) {
      filtered = filtered.filter(p => p.era && eraFilter.includes(p.era.era));
    }
    return filtered;
  }, [rawPool, roster, eraFilter]);

  const loadDreamTeam = async (preset) => {
    setLoadingPreset(preset.label);
    setError('');
    try {
      const results = await Promise.all(
        preset.names.map(name =>
          fetch(`/api/nba/players/search?q=${encodeURIComponent(name)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.json())
        )
      );
      const players = results.map(r => r.data?.[0]).filter(Boolean);
      setSearchResults(players);
    } catch (err) {
      setError(err.message);
    }
    setLoadingPreset('');
  };

  const filteredCities = cityFilter
    ? US_CITIES.filter(c => c.toLowerCase().includes(cityFilter.toLowerCase()))
    : US_CITIES;

  const filteredCoaches = coachFilter
    ? NBA_COACHES.filter(c => c.toLowerCase().includes(coachFilter.toLowerCase()))
    : NBA_COACHES;

  const handleSetup = async () => {
    if (!conference || !league) return;
    setError('');
    try {
      const res = await fetch('/api/draft/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conference, league, city, coach, draftType: 'fantasy' }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
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
    setError('');
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const draftedIds = new Set(roster.map(p => p.playerId));
      setSearchResults(data.data.filter(p => !draftedIds.has(p.id)));
    } catch (err) {
      setError(err.message);
    }
    setSearching(false);
  };

  const fetchPool = useCallback(async () => {
    if (!setupDone) return;
    setLoading(true);
    try {
      const conf = user?.conference || conference;
      const res = await fetch(`/api/draft/pool?season=${user?.season || 2024}&conference=${conf}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load draft pool');
      setRawPool(await res.json());
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [token, user?.season, user?.conference, conference, setupDone]);

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
    } catch (err) {
      setError(err.message);
    }
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
    } catch (err) {
      setError(err.message);
    }
  };

  const PlayerCard = ({ player }) => (
    <div style={s.playerCard}>
      {player.teamLogo && <img src={player.teamLogo} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
      <div style={s.playerInfo}>
        <span style={s.playerName}>{player.firstName} {player.lastName}</span>
        <span style={s.playerMeta}>
          {player.position} | {player.team}
          {player.era && <span style={{ marginLeft: 6, color: player.era.color, fontWeight: 700, fontSize: 11 }}>{player.era.era}</span>}
        </span>
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
          <h1 style={s.title}>Fantasy Draft</h1>
          <p style={s.subtitle}>Create your dream team from all NBA eras</p>
          {error && <div style={s.error}>{error}</div>}
          <div style={s.setupForm}>
            <label style={s.label}>League</label>
            <div style={s.optionGroup}>
              {['NBA', 'G-League', 'EuroLeague'].map(l => (
                <button key={l} onClick={() => setLeague(l)}
                  style={league === l ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{l}</button>
              ))}
            </div>
            <label style={s.label}>Conference</label>
            <div style={s.optionGroup}>
              {['East', 'West'].map(c => (
                <button key={c} onClick={() => setConference(c)}
                  style={conference === c ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{c}ern Conference</button>
              ))}
            </div>
            <label style={s.label}>City</label>
            <input type="text" placeholder="Filter cities..." value={cityFilter}
              onChange={e => setCityFilter(e.target.value)} style={s.filterInput} />
            <div style={s.scrollBox}>
              {filteredCities.map(c => (
                <button key={c} onClick={() => setCity(c)}
                  style={city === c ? { ...s.listItem, ...s.listItemActive } : s.listItem}>{c}</button>
              ))}
            </div>
            <label style={s.label}>Coach</label>
            <input type="text" placeholder="Filter coaches..." value={coachFilter}
              onChange={e => setCoachFilter(e.target.value)} style={s.filterInput} />
            <div style={s.scrollBox}>
              {filteredCoaches.map(c => (
                <button key={c} onClick={() => setCoach(c)}
                  style={coach === c ? { ...s.listItem, ...s.listItemActive } : s.listItem}>{c}</button>
              ))}
            </div>
            <button onClick={handleSetup} disabled={!conference || !league}
              style={!conference || !league ? { ...s.startBtn, opacity: 0.5 } : s.startBtn}>
              Start Draft
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.header}>
        <h1 style={s.title}>Fantasy Draft</h1>
        <p style={s.subtitle}>
          {user?.league || league} — {user?.conference || conference}ern Conference
          {user?.team?.city ? ` | ${user.team.city}` : ''}
          {user?.team?.coach ? ` | Coach: ${user.team.coach}` : ''}
          {' | '}({roster.length}/12)
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <input type="text" placeholder="Team Name" value={teamName}
            onChange={e => setTeamName(e.target.value)} style={s.teamInput} />
        </div>
      </div>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.searchBar}>
        <input type="text" placeholder="Search any NBA player (active or retired)..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()} style={s.searchInput} />
        <button onClick={handleSearch} disabled={searching} style={s.searchBtn}>
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {/* Dream Team Presets */}
      <div style={s.presetsRow}>
        <span style={s.presetsLabel}>Dream Teams:</span>
        {DREAM_TEAMS.map(dt => (
          <button key={dt.label} onClick={() => loadDreamTeam(dt)}
            disabled={!!loadingPreset}
            style={s.presetBtn}>
            {loadingPreset === dt.label ? '...' : dt.label}
          </button>
        ))}
      </div>

      {/* Era Filters */}
      <div style={s.eraRow}>
        {ERA_FILTERS.map(ef => (
          <button key={ef.label}
            onClick={() => setEraFilter(ef.value)}
            style={eraFilter === ef.value ? { ...s.eraBtn, ...s.eraBtnActive } : s.eraBtn}>
            {ef.label}
          </button>
        ))}
      </div>
      {searchResults.length > 0 && (
        <div style={s.searchPanel}>
          <h3 style={s.panelTitle}>Search Results ({searchResults.length})</h3>
          <div style={s.poolList}>
            {searchResults.map(p => <PlayerCard key={p.id} player={p} />)}
          </div>
        </div>
      )}
      <div style={s.layout}>
        <div style={s.poolPanel}>
          <h2 style={s.panelTitle}>Available Players</h2>
          {loading ? <div style={s.loadingText}>Loading draft pool...</div> : (
            <div style={s.poolList}>{pool.map(p => <PlayerCard key={p.id} player={p} />)}</div>
          )}
        </div>
        <div style={s.rosterPanel}>
          <h2 style={s.panelTitle}>Your Roster</h2>
          {roster.length === 0 ? <p style={s.emptyText}>No players yet. Start drafting!</p> : (
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
            <button onClick={handleComplete} style={s.completeBtn}>Complete Draft ({roster.length} players)</button>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  setupCard: { maxWidth: 520, margin: '40px auto', background: '#1e293b', borderRadius: 16, padding: '32px 28px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  setupForm: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  optionGroup: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  optionBtn: { padding: '10px 20px', borderRadius: 8, border: '2px solid #334155', background: '#0f172a', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  optionActive: { border: '2px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' },
  filterInput: { padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  scrollBox: { maxHeight: 150, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, background: '#0f172a', borderRadius: 8, padding: 8 },
  listItem: { padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  listItemActive: { border: '1px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' },
  startBtn: { padding: '14px 24px', borderRadius: 10, border: 'none', background: '#f97316', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16, marginTop: 8 },
  header: { textAlign: 'center', marginBottom: 16 },
  title: { color: '#f97316', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', margin: 0, fontSize: 14 },
  teamInput: { padding: '8px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, width: 200 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  searchBar: { display: 'flex', gap: 8, maxWidth: 600, margin: '0 auto 16px', justifyContent: 'center' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 },
  searchBtn: { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  searchPanel: { background: '#1e293b', borderRadius: 12, padding: 16, maxWidth: 1100, margin: '0 auto 16px', border: '1px solid #a855f7' },
  layout: { display: 'flex', gap: 24, maxWidth: 1100, margin: '0 auto' },
  poolPanel: { flex: 2, background: '#1e293b', borderRadius: 12, padding: 20 },
  rosterPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  panelTitle: { color: '#f97316', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  loadingText: { color: '#94a3b8', textAlign: 'center', padding: 40 },
  poolList: { maxHeight: '60vh', overflowY: 'auto' },
  playerCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #334155' },
  playerInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  playerName: { fontWeight: 600, fontSize: 14 },
  playerMeta: { color: '#94a3b8', fontSize: 12 },
  ratingBadge: { background: '#f97316', color: '#fff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 },
  draftBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  rosterList: { display: 'flex', flexDirection: 'column', gap: 6 },
  rosterItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#0f172a', borderRadius: 6 },
  rosterName: { flex: 1, fontWeight: 600, fontSize: 13 },
  rosterPos: { color: '#64748b', fontSize: 12 },
  ratingSmall: { background: '#f97316', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700, fontSize: 11 },
  emptyText: { color: '#64748b', textAlign: 'center', padding: 20 },
  completeBtn: { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 12 },
  // Dream Teams & Era Filters
  presetsRow: { display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', maxWidth: 1100, margin: '0 auto 10px' },
  presetsLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  presetBtn: { padding: '6px 14px', borderRadius: 6, border: '1px solid #a855f7', background: 'transparent', color: '#a855f7', fontWeight: 600, cursor: 'pointer', fontSize: 12, transition: 'all 0.2s' },
  eraRow: { display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16, maxWidth: 1100, margin: '0 auto 16px' },
  eraBtn: { padding: '6px 14px', borderRadius: 20, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  eraBtnActive: { border: '1px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' },
};
