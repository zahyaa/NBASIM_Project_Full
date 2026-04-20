/**
 * OneOnOnePage.jsx — 1v1 Pickup Game Mode
 * 
 * Lets users pick ANY two NBA players (from any era) and simulate a 1v1
 * first-to-21 street ball game. Players are fetched from the balldontlie API
 * via our backend (/api/nba/players/search).
 * 
 * FLOW:
 *   1. User picks Player A (left panel) and Player B (right panel)
 *      - Type to search (auto-searches after 400ms debounce, min 2 chars)
 *      - Or click a "Recommended Guard" quick-pick button
 *      - Or click a "Popular Matchup" preset (e.g. MJ vs LeBron)
 *   2. Click "Start Game" → POST /api/simulate/1v1
 *   3. Server returns { playerA, playerB, scoreA, scoreB, plays[], winner }
 *   4. Results screen shows scoreboard + play-by-play log
 *   5. User can Rematch, Swap & Play, or New Matchup
 * 
 * KEY DATA SHAPE from search API (/api/nba/players/search?q=...):
 *   { id, firstName, lastName, position, team, teamId, teamLogo, rating,
 *     height, weight, jersey, country, draftYear, era: { era, decade, color } }
 * 
 * SENT TO simulate API (POST /api/simulate/1v1):
 *   { playerA: <full player object>, playerB: <full player object>, targetScore: 21 }
 *   Server sanitizes to: { playerId, firstName, lastName, position, rating }
 *   Server uses playerId = p.playerId || p.id (so sending "id" from search works)
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Pre-built matchup buttons shown when no players are selected yet.
// Each entry has player names (a, b) used as search queries, and a display label.
const POPULAR_MATCHUPS = [
  { a: 'Michael Jordan', b: 'LeBron James', label: 'MJ vs LeBron' },
  { a: 'Kobe Bryant', b: 'Michael Jordan', label: 'Kobe vs MJ' },
  { a: 'Stephen Curry', b: 'Magic Johnson', label: 'Curry vs Magic' },
  { a: 'Shaquille ONeal', b: 'Wilt Chamberlain', label: 'Shaq vs Wilt' },
  { a: 'Kevin Durant', b: 'Larry Bird', label: 'KD vs Bird' },
  { a: 'Allen Iverson', b: 'Kyrie Irving', label: 'AI vs Kyrie' },
];

// Quick-pick guard buttons shown below the search box when no search results are displayed.
// Each guard has a name (used as the search query), an era label, and a color for styling.
const RECOMMENDED_GUARDS = [
  { name: 'Stephen Curry', era: 'Current', color: '#3b82f6' },
  { name: 'Magic Johnson', era: 'Showtime', color: '#f59e0b' },
  { name: 'Allen Iverson', era: 'New School', color: '#8b5cf6' },
  { name: 'Kyrie Irving', era: 'Current', color: '#3b82f6' },
  { name: 'Chris Paul', era: 'Modern', color: '#06b6d4' },
  { name: 'Isiah Thomas', era: 'Showtime', color: '#f59e0b' },
  { name: 'John Stockton', era: 'Golden', color: '#22c55e' },
  { name: 'Russell Westbrook', era: 'Modern', color: '#06b6d4' },
  { name: 'Damian Lillard', era: 'Current', color: '#3b82f6' },
  { name: 'Steve Nash', era: 'New School', color: '#8b5cf6' },
  { name: 'Gary Payton', era: 'Golden', color: '#22c55e' },
  { name: 'Jason Kidd', era: 'New School', color: '#8b5cf6' },
];

export default function OneOnOnePage() {
  const { token } = useAuth();       // JWT token for authenticated API calls
  const navigate = useNavigate();     // React Router navigation

  // --- STATE ---
  const [searchA, setSearchA] = useState('');      // Search text for Player A input
  const [searchB, setSearchB] = useState('');      // Search text for Player B input
  const [resultsA, setResultsA] = useState([]);    // Search results array for Player A
  const [resultsB, setResultsB] = useState([]);    // Search results array for Player B
  const [playerA, setPlayerA] = useState(null);    // Selected player A object (null = not chosen)
  const [playerB, setPlayerB] = useState(null);    // Selected player B object (null = not chosen)
  const [simResult, setSimResult] = useState(null); // Simulation result from server (null = not simulated yet)
  const [loading, setLoading] = useState(false);    // True while simulation POST is in-flight
  const [error, setError] = useState('');            // Error message string (empty = no error)
  const [loadingMatchup, setLoadingMatchup] = useState(''); // Which popular matchup button is loading
  const [searchLoading, setSearchLoading] = useState(false); // True while any search/quickPick fetch is in-flight

  // Refs to hold debounce timer IDs so we can clear them on re-render
  const debounceA = useRef(null);
  const debounceB = useRef(null);

  /**
   * searchPlayers — Fetch player search results from the backend.
   * @param {string} query  - The search text (e.g. "LeBron")
   * @param {Function} setter - State setter to store results (setResultsA or setResultsB)
   * 
   * Uses AbortController with an 8-second timeout to prevent the page from
   * hanging if the backend is down or slow. Shows "Searching..." in the UI
   * while searchLoading is true.
   * 
   * API: GET /api/nba/players/search?q=LeBron
   * Response: { data: [{ id, firstName, lastName, position, team, rating, era, ... }] }
   */
  const searchPlayers = async (query, setter) => {
    if (!query.trim()) { setter([]); return; }
    setSearchLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // 8s timeout
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setter(data.data);
    } catch (err) {
      clearTimeout(timer);
      if (err.name !== 'AbortError') setError(err.message);
      else setError('Server not responding — make sure the backend is running.');
    }
    setSearchLoading(false);
  };

  // Auto-search: fires 400ms after user stops typing (debounced), requires 2+ chars.
  // Clears results if text is too short. Cleanup function cancels pending timer.
  useEffect(() => {
    clearTimeout(debounceA.current);
    if (searchA.trim().length >= 2) {
      debounceA.current = setTimeout(() => searchPlayers(searchA, setResultsA), 400);
    } else { setResultsA([]); }
    return () => clearTimeout(debounceA.current);
  }, [searchA]);

  useEffect(() => {
    clearTimeout(debounceB.current);
    if (searchB.trim().length >= 2) {
      debounceB.current = setTimeout(() => searchPlayers(searchB, setResultsB), 400);
    } else { setResultsB([]); }
    return () => clearTimeout(debounceB.current);
  }, [searchB]);

  /**
   * loadMatchup — Load a preset matchup by searching both player names in parallel.
   * Used by the "Popular Matchups" buttons and "Random Matchup" button.
   * Sets both playerA and playerB from the first search result of each query.
   */
  const loadMatchup = async (nameA, nameB, label) => {
    setLoadingMatchup(label); // shows '...' on the button being loaded
    setError('');
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/nba/players/search?q=${encodeURIComponent(nameA)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/nba/players/search?q=${encodeURIComponent(nameB)}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
      if (dataA.data?.[0]) setPlayerA(dataA.data[0]); // Pick first result
      if (dataB.data?.[0]) setPlayerB(dataB.data[0]);
    } catch (err) {
      setError(err.message);
    }
    setLoadingMatchup('');
  };

  // Picks a random entry from POPULAR_MATCHUPS and loads it
  const loadRandomMatchup = async () => {
    const random = POPULAR_MATCHUPS[Math.floor(Math.random() * POPULAR_MATCHUPS.length)];
    await loadMatchup(random.a, random.b, 'Random');
  };

  /**
   * handleSimulate — Send both selected players to the server for 1v1 simulation.
   * 
   * POST /api/simulate/1v1
   * Body: { playerA: {full player obj}, playerB: {full player obj}, targetScore: 21 }
   * 
   * The server sanitizes each player to { playerId, firstName, lastName, position, rating }.
   * It uses `p.playerId || p.id` so the "id" field from search API works as playerId.
   * 
   * Response: { playerA, playerB, scoreA, scoreB, plays[], winner, targetScore }
   * plays[] = array of { text: "description", scoreA: number, scoreB: number }
   * 
   * 15-second AbortController timeout to prevent indefinite hanging.
   */
  const handleSimulate = async () => {
    if (!playerA || !playerB) return;
    setLoading(true);
    setError('');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000); // 15s timeout
    try {
      const res = await fetch('/api/simulate/1v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerA, playerB, targetScore: 21 }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSimResult(data); // Triggers re-render to show results screen
    } catch (err) {
      clearTimeout(timer);
      if (err.name !== 'AbortError') setError(err.message);
      else setError('Simulation timed out — make sure the backend is running.');
    }
    setLoading(false);
  };

  // Rematch: clear results, keep same players, re-run simulation after a tick
  const handleRematch = () => {
    setSimResult(null);
    setTimeout(() => handleSimulate(), 100);
  };

  // Small UI component: displays a colored era badge (e.g. "Showtime", "Current")
  const EraBadge = ({ era }) => era ? (
    <span style={{ ...s.eraBadge, background: era.color + '22', color: era.color }}>{era.era}</span>
  ) : null;

  /**
   * quickPick — One-click player selection from the "Recommended Guards" buttons.
   * Searches for the guard by name and auto-selects the first result.
   * @param {string} name       - Guard name to search (e.g. "Stephen Curry")
   * @param {Function} setSelected - State setter (setPlayerA or setPlayerB)
   */
  const quickPick = async (name, setSelected) => {
    setSearchLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // 8s timeout
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (data.data?.[0]) setSelected(data.data[0]); // Auto-select first match
    } catch (err) {
      clearTimeout(timer);
      if (err.name !== 'AbortError') setError(err.message);
      else setError('Server not responding — make sure the backend is running.');
    }
    setSearchLoading(false);
  };

  /**
   * PlayerPicker — Inline component for selecting one player.
   * Three states:
   *   1. Player already selected → shows card with rating, name, position, "Change" button
   *   2. No player, search results exist → shows clickable results list
   *   3. No player, no results → shows "Recommended Guards" quick-pick buttons
   * Also shows "Searching..." when searchLoading is true.
   */
  const PlayerPicker = ({ label, search, setSearch, results, setResults, selected, setSelected, color }) => (
    <div style={s.pickerPanel}>
      <h3 style={{ ...s.pickerTitle, color }}>{label}</h3>
      {selected ? (
        <div style={s.selectedCard}>
          <div style={{ ...s.selectedRating, background: color }}>{selected.rating}</div>
          <div>
            <div style={s.selectedName}>{selected.firstName} {selected.lastName}</div>
            <div style={s.selectedMeta}>
              {selected.teamLogo && <img src={selected.teamLogo} alt="" style={{ width: 16, height: 16, objectFit: 'contain', verticalAlign: 'middle', marginRight: 4 }} onError={e => e.target.style.display='none'} />}
              {selected.position} | {selected.team}
            </div>
            <EraBadge era={selected.era} />
          </div>
          <button onClick={() => { setSelected(null); setResults([]); }} style={s.changeBtn}>Change</button>
        </div>
      ) : (
        <>
          <div style={s.searchRow}>
            <input type="text" placeholder="Search player..." value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchPlayers(search, setResults)} style={s.input} />
            <button onClick={() => searchPlayers(search, setResults)} disabled={searchLoading} style={{ ...s.searchBtn, background: color }}>{searchLoading ? '...' : 'Search'}</button>
          </div>
          {searchLoading ? (
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>Searching...</p>
          ) : results.length > 0 ? (
          <div style={s.resultsList}>
            {results.map(p => (
              <button key={p.id} onClick={() => setSelected(p)} style={s.resultItem}>
                <span style={s.resultName}>{p.firstName} {p.lastName}</span>
                {p.era && <span style={{ ...s.eraBadgeSmall, color: p.era.color }}>{p.era.decade}</span>}
                <span style={s.resultMeta}>{p.position}</span>
                <span style={{ ...s.resultRating, background: color }}>{p.rating}</span>
              </button>
            ))}
          </div>
          ) : (
          <div>
            <p style={{ color: '#64748b', fontSize: 12, margin: '10px 0 6px', fontWeight: 600 }}>Recommended Guards</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {RECOMMENDED_GUARDS.map(g => (
                <button key={g.name} onClick={() => quickPick(g.name, setSelected)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${g.color}40`, background: `${g.color}12`, color: g.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {g.name}
                  <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 10 }}>{g.era}</span>
                </button>
              ))}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );

  // ===================== RESULTS SCREEN =====================
  // If simulation has been run, show the results instead of the picker UI.
  // Displays: scoreboard, play-by-play log, and Rematch/Swap/New Matchup buttons.
  if (simResult) {
    return (
      <div style={s.container}>
        <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
        <div style={s.resultCard}>
          <h1 style={s.resultTitle}>1v1 Final</h1>
          <div style={s.scoreboard}>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>{simResult.playerA}</div>
              <div style={s.scoreNum}>{simResult.scoreA}</div>
            </div>
            <div style={s.vs}>VS</div>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>{simResult.playerB}</div>
              <div style={s.scoreNum}>{simResult.scoreB}</div>
            </div>
          </div>
          <p style={s.winnerText}>{simResult.winner} wins!</p>
          <div style={s.playLog}>
            {simResult.plays.map((play, i) => (
              <div key={i} style={s.playEntry}>
                <span style={s.playScore}>{play.scoreA}-{play.scoreB}</span>
                <span>{play.text}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={handleRematch} style={s.playAgainBtn}>Rematch</button>
            <button onClick={() => {
              const tmpA = playerA; setPlayerA(playerB); setPlayerB(tmpA); setSimResult(null);
            }} style={{ ...s.playAgainBtn, background: '#f97316' }}>Swap &amp; Play</button>
            <button onClick={() => { setSimResult(null); setPlayerA(null); setPlayerB(null); }} style={{ ...s.playAgainBtn, background: '#334155' }}>New Matchup</button>
          </div>
        </div>
      </div>
    );
  }

  // ===================== PLAYER SELECTION SCREEN =====================
  // Main UI: two side-by-side PlayerPicker panels with a VS divider.
  // Popular Matchups section shown only when neither player is selected.
  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>One on One</h1>
      <p style={s.subtitle}>Pick any two NBA players from any era. First to 21 wins.</p>
      {error && <div style={s.error}>{error}</div>}

      {/* Popular Matchups — only shown before any player is selected */}
      {!playerA && !playerB && (
        <div style={s.matchupsSection}>
          <h3 style={s.matchupsTitle}>Popular Matchups</h3>
          <div style={s.matchupsGrid}>
            {POPULAR_MATCHUPS.map(m => (
              <button key={m.label} onClick={() => loadMatchup(m.a, m.b, m.label)}
                disabled={!!loadingMatchup}
                style={s.matchupBtn}>
                {loadingMatchup === m.label ? '...' : m.label}
              </button>
            ))}
            <button onClick={loadRandomMatchup} disabled={!!loadingMatchup}
              style={{ ...s.matchupBtn, background: '#f97316', color: '#fff', border: 'none' }}>
              {loadingMatchup === 'Random' ? '...' : 'Random Matchup'}
            </button>
          </div>
        </div>
      )}

      <div style={s.pickersRow}>
        <PlayerPicker label="Your Player" search={searchA} setSearch={setSearchA}
          results={resultsA} setResults={setResultsA}
          selected={playerA} setSelected={setPlayerA} color="#3b82f6" />
        <div style={s.vsCenter}>VS</div>
        <PlayerPicker label="CPU Player" search={searchB} setSearch={setSearchB}
          results={resultsB} setResults={setResultsB}
          selected={playerB} setSelected={setPlayerB} color="#ef4444" />
      </div>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={handleSimulate} disabled={!playerA || !playerB || loading}
          style={!playerA || !playerB ? { ...s.simBtn, opacity: 0.5 } : s.simBtn}>
          {loading ? 'Simulating...' : 'Start Game'}
        </button>
      </div>
    </div>
  );
}

// ===================== STYLES =====================
// All inline styles for this page (no CSS files).
const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  title: { color: '#3b82f6', fontSize: 36, textAlign: 'center', margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', textAlign: 'center', margin: '0 0 24px', fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  pickersRow: { display: 'flex', gap: 24, maxWidth: 900, margin: '0 auto', alignItems: 'flex-start' },
  vsCenter: { color: '#f97316', fontSize: 28, fontWeight: 800, paddingTop: 60, minWidth: 50, textAlign: 'center' },
  pickerPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  pickerTitle: { fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  searchRow: { display: 'flex', gap: 8 },
  input: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 },
  searchBtn: { padding: '10px 16px', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  resultsList: { maxHeight: 300, overflowY: 'auto', marginTop: 10 },
  resultItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#e2e8f0', cursor: 'pointer', width: '100%', textAlign: 'left' },
  resultName: { flex: 1, fontWeight: 600, fontSize: 14 },
  resultMeta: { color: '#64748b', fontSize: 12 },
  resultRating: { color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700, fontSize: 12 },
  selectedCard: { display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#0f172a', borderRadius: 8 },
  selectedRating: { color: '#fff', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 },
  selectedName: { fontWeight: 700, fontSize: 18 },
  selectedMeta: { color: '#94a3b8', fontSize: 13 },
  changeBtn: { marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: 'none', background: '#334155', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  simBtn: { padding: '14px 40px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 18 },
  // Matchups
  matchupsSection: { maxWidth: 700, margin: '0 auto 20px', textAlign: 'center' },
  matchupsTitle: { color: '#94a3b8', fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  matchupsGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  matchupBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s' },
  // Era badges
  eraBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, marginTop: 4 },
  eraBadgeSmall: { fontSize: 10, fontWeight: 700 },
  // Results
  resultCard: { maxWidth: 700, margin: '0 auto', background: '#1e293b', borderRadius: 16, padding: 24 },
  resultTitle: { color: '#3b82f6', textAlign: 'center', fontSize: 28, margin: '0 0 16px', fontWeight: 800 },
  scoreboard: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: 16 },
  scoreTeam: { textAlign: 'center' },
  scoreLabel: { color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 4 },
  scoreNum: { color: '#fff', fontSize: 48, fontWeight: 800 },
  vs: { color: '#f97316', fontSize: 24, fontWeight: 800 },
  winnerText: { color: '#22c55e', textAlign: 'center', fontSize: 20, fontWeight: 700, marginBottom: 16 },
  playLog: { maxHeight: 350, overflowY: 'auto', background: '#0f172a', borderRadius: 8, padding: 8 },
  playEntry: { padding: '6px 10px', borderBottom: '1px solid #1e293b', fontSize: 13, color: '#cbd5e1', display: 'flex', gap: 10 },
  playScore: { color: '#64748b', minWidth: 50, fontSize: 12, fontWeight: 600 },
  playAgainBtn: { padding: '12px 32px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 },
};
