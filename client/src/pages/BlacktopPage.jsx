/**
 * BlacktopPage.jsx — Blacktop (Half-Court Streetball) Game Mode
 * 
 * Lets users build two small teams (1v1 up to 5v5) from ANY NBA players
 * across all eras, then simulate a half-court game to a target score.
 * 
 * FLOW:
 *   1. User configures: team size (1v1 – 5v5) and target score (11, 15, or 21)
 *   2. User builds Team A (left) and Team B (right)
 *      - Type to search (auto-searches after 400ms debounce, min 2 chars)
 *      - Or click a "Recommended Guard" quick-pick button
 *   3. Click "Start {N}v{N}" → POST /api/simulate/blacktop
 *   4. Server returns { teamA, teamB, scoreA, scoreB, boxScoreA, boxScoreB, plays[], winner }
 *   5. Results screen shows scoreboard + play-by-play log
 *   6. User can Rematch, Swap & Play, or New Game
 * 
 * IMPORTANT: The simulate API expects teams as objects { name: string, players: array },
 * NOT flat arrays. The request body must be:
 *   { teamA: { name: 'Team A', players: [...] }, teamB: { name: 'Team B', players: [...] }, targetScore }
 * Server route: POST /api/simulate/blacktop (see server/routes/simulate.js)
 * Server sanitizes each player to: { playerId, firstName, lastName, position, rating }
 * Server uses playerId = p.playerId || p.id (so the "id" field from search API works)
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Quick-pick guard buttons shown below the search box when no search results are displayed.
// Each guard has a name (used as the search query), an era label, and a color for styling.
// Guards already on the team are filtered out in the UI.
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

export default function BlacktopPage() {
  const { token } = useAuth();       // JWT token for authenticated API calls
  const navigate = useNavigate();     // React Router navigation

  // --- STATE ---
  const [teamSize, setTeamSize] = useState(3);        // How many players per team (1–5)
  const [targetScore, setTargetScore] = useState(21);  // Game ends when a team hits this score
  const [searchA, setSearchA] = useState('');           // Search text for Team A input
  const [searchB, setSearchB] = useState('');           // Search text for Team B input
  const [resultsA, setResultsA] = useState([]);         // Search results array for Team A
  const [resultsB, setResultsB] = useState([]);         // Search results array for Team B
  const [teamA, setTeamA] = useState([]);               // Selected players for Team A (array of player objects)
  const [teamB, setTeamB] = useState([]);               // Selected players for Team B (array of player objects)
  const [simResult, setSimResult] = useState(null);     // Simulation result from server (null = not simulated yet)
  const [loading, setLoading] = useState(false);        // True while simulation POST is in-flight
  const [error, setError] = useState('');                // Error message string (empty = no error)
  const [searchLoading, setSearchLoading] = useState(false); // True while any search/quickPick fetch is in-flight

  // Refs to hold debounce timer IDs so we can clear them on re-render
  const debounceA = useRef(null);
  const debounceB = useRef(null);

  /**
   * searchPlayers — Fetch player search results from the backend.
   * @param {string} query  - The search text (e.g. "Curry")
   * @param {Function} setter - State setter to store results (setResultsA or setResultsB)
   * 
   * Uses AbortController with an 8-second timeout to prevent the page from
   * hanging if the backend is down or slow. Shows "Searching..." in the UI.
   * 
   * API: GET /api/nba/players/search?q=Curry
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

  // Add a player to a team (checks max size and duplicate by id)
  const addPlayer = (player, team, setTeam) => {
    if (team.length >= teamSize) return;              // Team already full
    if (team.some(p => p.id === player.id)) return;   // Already on this team
    setTeam([...team, player]);
  };

  // Remove a player from a team by their id
  const removePlayer = (id, team, setTeam) => {
    setTeam(team.filter(p => p.id !== id));
  };

  /**
   * handleSimulate — Send both teams to the server for blacktop simulation.
   * 
   * POST /api/simulate/blacktop
   * Body: {
   *   teamA: { name: 'Team A', players: [player objects...] },
   *   teamB: { name: 'Team B', players: [player objects...] },
   *   targetScore: 11 | 15 | 21
   * }
   * 
   * IMPORTANT: Must wrap players in { name, players } objects!
   * Sending flat arrays like { teamA: [...], teamB: [...] } will fail with
   * "Both teams with players arrays required" because server reads teamA.players.
   * 
   * Response: { teamA, teamB, scoreA, scoreB, boxScoreA, boxScoreB, plays[], winner, targetScore }
   * 
   * 15-second AbortController timeout to prevent indefinite hanging.
   */
  const handleSimulate = async () => {
    if (teamA.length !== teamSize || teamB.length !== teamSize) return; // Both teams must be full
    setLoading(true);
    setError('');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000); // 15s timeout
    try {
      const res = await fetch('/api/simulate/blacktop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          teamA: { name: 'Team A', players: teamA },  // Wrap in { name, players } object
          teamB: { name: 'Team B', players: teamB },  // Wrap in { name, players } object
          targetScore,
        }),
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

  /**
   * quickPick — One-click player addition from the "Recommended Guards" buttons.
   * Searches for the guard by name and adds the first result to the team.
   * Uses functional state update (setTeam(prev => ...)) to avoid stale closure issues
   * where the team array might be outdated by the time the async fetch resolves.
   * 
   * @param {string} name   - Guard name to search (e.g. "Stephen Curry")
   * @param {Array} team    - Current team array (used for pre-check)
   * @param {Function} setTeam - State setter (setTeamA or setTeamB)
   */
  const quickPick = async (name, team, setTeam) => {
    if (team.length >= teamSize) return; // Team already full, bail out
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
      if (data.data?.[0]) {
        // Functional update to get latest state and avoid duplicates
        setTeam(prev => {
          if (prev.length >= teamSize) return prev;                    // Re-check: team full
          if (prev.some(p => p.id === data.data[0].id)) return prev;   // Re-check: already on team
          return [...prev, data.data[0]]; // Add player
        });
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name !== 'AbortError') setError(err.message);
      else setError('Server not responding — make sure the backend is running.');
    }
    setSearchLoading(false);
  };

  /**
   * TeamPicker — Inline component for building one team's roster.
   * Shows:
   *   - Current roster with remove (✕) buttons
   *   - Search input + results list (if team not full)
   *   - "Recommended Guards" quick-pick buttons (if no search results)
   *   - "Searching..." indicator when searchLoading is true
   * Players already on the team are filtered out of both results and recommendations.
   */
  const TeamPicker = ({ label, search, setSearch, results, setResults, team, setTeam, color }) => (
    <div style={s.pickerPanel}>
      <h3 style={{ ...s.pickerTitle, color }}>{label} ({team.length}/{teamSize})</h3>
      <div style={s.roster}>
        {team.map(p => (
          <div key={p.id} style={s.rosterItem}>
            <span style={s.rosterName}>{p.firstName} {p.lastName}</span>
            {p.era && <span style={{ fontSize: 10, color: p.era.color, fontWeight: 700 }}>{p.era.decade}</span>}
            <span style={{ ...s.rosterRating, background: color }}>{p.rating}</span>
            <button onClick={() => removePlayer(p.id, team, setTeam)} style={s.removeBtn}>✕</button>
          </div>
        ))}
      </div>
      {team.length < teamSize && (
        <>
          <div style={s.searchRow}>
            <input type="text" placeholder="Search player..." value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchPlayers(search, setResults)} style={s.input} />
            <button onClick={() => searchPlayers(search, setResults)} disabled={searchLoading} style={{ ...s.searchBtn, background: color }}>{searchLoading ? '...' : 'Go'}</button>
          </div>
          {searchLoading ? (
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>Searching...</p>
          ) : results.filter(p => !team.some(t => t.id === p.id)).length > 0 ? (
          <div style={s.resultsList}>
            {results.filter(p => !team.some(t => t.id === p.id)).map(p => (
              <button key={p.id} onClick={() => addPlayer(p, team, setTeam)} style={s.resultItem}>
                <span style={s.resultName}>{p.firstName} {p.lastName}</span>
                <span style={s.resultPos}>{p.position}</span>
                <span style={{ ...s.resultRating, background: color }}>{p.rating}</span>
              </button>
            ))}
          </div>
          ) : (
          <div>
            <p style={{ color: '#64748b', fontSize: 12, margin: '10px 0 6px', fontWeight: 600 }}>Recommended Guards</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {RECOMMENDED_GUARDS.filter(g => !team.some(t => `${t.firstName} ${t.lastName}` === g.name)).map(g => (
                <button key={g.name} onClick={() => quickPick(g.name, team, setTeam)}
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
  // If simulation has been run, show results instead of the team-building UI.
  // Displays: scoreboard, play-by-play log, and Rematch/Swap/New Game buttons.
  if (simResult) {
    return (
      <div style={s.container}>
        <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
        <div style={s.resultCard}>
          <h1 style={s.resultTitle}>Blacktop {teamSize}v{teamSize}</h1>
          <div style={s.scoreboard}>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>Your Team</div>
              <div style={s.scoreNum}>{simResult.scoreA}</div>
            </div>
            <div style={s.vsText}>VS</div>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>CPU Team</div>
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
            <button onClick={() => { setSimResult(null); setTimeout(handleSimulate, 100); }} style={s.playAgainBtn}>Rematch</button>
            <button onClick={() => {
              const tmpA = [...teamA]; setTeamA([...teamB]); setTeamB(tmpA); setSimResult(null);
            }} style={{ ...s.playAgainBtn, background: '#f97316' }}>Swap &amp; Play</button>
            <button onClick={() => { setSimResult(null); setTeamA([]); setTeamB([]); }} style={{ ...s.playAgainBtn, background: '#334155' }}>New Game</button>
          </div>
        </div>
      </div>
    );
  }

  // ===================== TEAM BUILDING SCREEN =====================
  // Main UI: config options (team size, target score), two TeamPicker panels, VS divider.
  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>Blacktop</h1>
      <p style={s.subtitle}>Half-court streetball. Pick your squad and run it.</p>
      {error && <div style={s.error}>{error}</div>}

      {/* Team size selector (1v1 through 5v5) and target score selector (11, 15, 21) */}
      <div style={s.config}>
        <div style={s.configItem}>
          <label style={s.configLabel}>Team Size</label>
          <div style={s.optionGroup}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => { setTeamSize(n); setTeamA(a => a.slice(0, n)); setTeamB(b => b.slice(0, n)); }}
                style={teamSize === n ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{n}v{n}</button>
            ))}
          </div>
        </div>
        <div style={s.configItem}>
          <label style={s.configLabel}>Target Score</label>
          <div style={s.optionGroup}>
            {[11, 15, 21].map(n => (
              <button key={n} onClick={() => setTargetScore(n)}
                style={targetScore === n ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{n}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={s.pickersRow}>
        <TeamPicker label="Your Team" search={searchA} setSearch={setSearchA}
          results={resultsA} setResults={setResultsA} team={teamA} setTeam={setTeamA} color="#3b82f6" />
        <div style={s.vsCenter}>VS</div>
        <TeamPicker label="CPU Team" search={searchB} setSearch={setSearchB}
          results={resultsB} setResults={setResultsB} team={teamB} setTeam={setTeamB} color="#ef4444" />
      </div>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={handleSimulate}
          disabled={teamA.length !== teamSize || teamB.length !== teamSize || loading}
          style={teamA.length !== teamSize || teamB.length !== teamSize ? { ...s.simBtn, opacity: 0.5 } : s.simBtn}>
          {loading ? 'Simulating...' : `Start ${teamSize}v${teamSize}`}
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
  title: { color: '#ef4444', fontSize: 36, textAlign: 'center', margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', textAlign: 'center', margin: '0 0 20px', fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  config: { display: 'flex', gap: 24, justifyContent: 'center', marginBottom: 24 },
  configItem: { textAlign: 'center' },
  configLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 },
  optionGroup: { display: 'flex', gap: 8 },
  optionBtn: { padding: '8px 14px', borderRadius: 8, border: '2px solid #334155', background: '#0f172a', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  optionActive: { border: '2px solid #ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.1)' },
  pickersRow: { display: 'flex', gap: 24, maxWidth: 950, margin: '0 auto', alignItems: 'flex-start' },
  vsCenter: { color: '#f97316', fontSize: 28, fontWeight: 800, paddingTop: 40, minWidth: 50, textAlign: 'center' },
  pickerPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  pickerTitle: { fontSize: 16, margin: '0 0 10px', fontWeight: 700 },
  roster: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
  rosterItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#0f172a', borderRadius: 6 },
  rosterName: { flex: 1, fontWeight: 600, fontSize: 13 },
  rosterRating: { color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700, fontSize: 12 },
  removeBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  searchRow: { display: 'flex', gap: 6 },
  input: { flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13 },
  searchBtn: { padding: '8px 14px', borderRadius: 6, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  resultsList: { maxHeight: 200, overflowY: 'auto', marginTop: 8 },
  resultItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#e2e8f0', cursor: 'pointer', width: '100%', textAlign: 'left' },
  resultName: { flex: 1, fontWeight: 600, fontSize: 13 },
  resultPos: { color: '#64748b', fontSize: 11 },
  resultRating: { color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700, fontSize: 11 },
  simBtn: { padding: '14px 40px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 18 },
  // Results
  resultCard: { maxWidth: 700, margin: '0 auto', background: '#1e293b', borderRadius: 16, padding: 24 },
  resultTitle: { color: '#ef4444', textAlign: 'center', fontSize: 28, margin: '0 0 16px', fontWeight: 800 },
  scoreboard: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: 16 },
  scoreTeam: { textAlign: 'center' },
  scoreLabel: { color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 4 },
  scoreNum: { color: '#fff', fontSize: 48, fontWeight: 800 },
  vsText: { color: '#f97316', fontSize: 24, fontWeight: 800 },
  winnerText: { color: '#22c55e', textAlign: 'center', fontSize: 20, fontWeight: 700, marginBottom: 16 },
  playLog: { maxHeight: 350, overflowY: 'auto', background: '#0f172a', borderRadius: 8, padding: 8 },
  playEntry: { padding: '6px 10px', borderBottom: '1px solid #1e293b', fontSize: 13, color: '#cbd5e1', display: 'flex', gap: 10 },
  playScore: { color: '#64748b', minWidth: 50, fontSize: 12, fontWeight: 600 },
  playAgainBtn: { padding: '12px 32px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 },
};
