/**
 * OneOnOnePage.jsx — 1v1 Pickup Game Mode
 *
 * Flow:
 *   1. User types a full player name and presses Enter / clicks Search.
 *   2. User picks one of the search results → that becomes "Your Player".
 *   3. CPU auto-picks an opponent from a small curated pool, trying to match
 *      the position of the user's pick (G vs G, F vs F, C vs C).
 *   4. User clicks either:
 *        - "Simulate Game"  → instant final result with scoreboard + log.
 *        - "Watch Play-by-Play" → plays reveal one at a time on a timer.
 *   5. On Game Over: Rematch / Rematch (Watch) / New Matchup.
 *
 * API:
 *   GET  /api/nba/players/search?q=<full name>
 *   POST /api/simulate/1v1   { playerA, playerB, targetScore: 21 }
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// CPU candidate pool, grouped by primary position. The CPU picks one of these
// at random matching the user's position. All entries must be currently active
// (paid balldontlie API only indexes active rosters).
const CPU_POOL = {
  G: [
    'Stephen Curry', 'Damian Lillard', 'Kyrie Irving',
    'Shai Gilgeous-Alexander', 'Trae Young', 'Devin Booker',
    'Donovan Mitchell', 'Jalen Brunson', 'Tyrese Haliburton',
    'Ja Morant', 'LaMelo Ball',
  ],
  F: [
    'LeBron James', 'Jayson Tatum', 'Giannis Antetokounmpo',
    'Kevin Durant', 'Jaylen Brown', 'Jimmy Butler',
    'Paolo Banchero', 'Anthony Edwards', 'Pascal Siakam',
  ],
  C: [
    'Nikola Jokic', 'Joel Embiid', 'Anthony Davis',
    'Bam Adebayo', 'Karl-Anthony Towns', 'Victor Wembanyama',
    'Chet Holmgren',
  ],
};

// Reduce a balldontlie position string like "G", "F-C", "G-F" to a top-level group.
function positionGroup(pos) {
  const first = String(pos || '').trim().charAt(0).toUpperCase();
  if (first === 'G' || first === 'F' || first === 'C') return first;
  return 'F'; // sensible fallback
}

export default function OneOnOnePage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  // --- STATE ---
  const [searchA, setSearchA] = useState('');
  const [resultsA, setResultsA] = useState([]);
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [cpuPicking, setCpuPicking] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Watch mode (animated play-by-play). visiblePlays is the slice of
  // simResult.plays that has been revealed so far.
  const [watching, setWatching] = useState(false);
  const [visiblePlays, setVisiblePlays] = useState([]);
  const watchTimer = useRef(null);

  // Refs for in-flight request cancellation.
  const inflightRef = useRef(null);

  /**
   * searchPlayers — Look up players by name (used for Player A only).
   */
  const searchPlayers = async (query) => {
    if (!query.trim()) { setResultsA([]); return; }
    setSearchLoading(true);
    if (inflightRef.current) inflightRef.current.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResultsA(data.data || []);
      if (!data.data?.length) setError('No active players found for that name.');
      else setError('');
    } catch (err) {
      clearTimeout(timer);
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      if (inflightRef.current === ctrl) inflightRef.current = null;
      setSearchLoading(false);
    }
  };

  /**
   * pickCpuOpponent — Pick a CPU player from the pool, matching the user's
   * primary position group when possible. Tries up to 5 random names from
   * the matching group; falls back to any group if all fail.
   */
  const pickCpuOpponent = async (userPlayer) => {
    setCpuPicking(true);
    setError('');
    const group = positionGroup(userPlayer.position);
    const userFullName = `${userPlayer.firstName} ${userPlayer.lastName}`.toLowerCase();
    const tryNames = [...CPU_POOL[group]]
      .filter(n => n.toLowerCase() !== userFullName)
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);

    // Fallback pool if the position group has no resolvable matches.
    const fallback = Object.values(CPU_POOL).flat()
      .filter(n => n.toLowerCase() !== userFullName)
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);

    for (const name of [...tryNames, ...fallback]) {
      try {
        const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(name)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const candidate = (data.data || []).find(p => p.id !== userPlayer.id);
        if (candidate) {
          setPlayerB(candidate);
          setCpuPicking(false);
          return;
        }
      } catch {
        // try next name
      }
    }
    setError('CPU could not find an opponent. Please try a different player.');
    setCpuPicking(false);
  };

  // When the user picks a player, immediately auto-pick the CPU opponent.
  useEffect(() => {
    if (playerA && !playerB) {
      pickCpuOpponent(playerA);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerA]);

  /**
   * runSimulation — POST to /api/simulate/1v1 and return the result.
   */
  const runSimulation = async () => {
    if (!playerA || !playerB) return null;
    setLoading(true);
    setError('');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('/api/simulate/1v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerA, playerB, targetScore: 21 }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Simulation failed');
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.name !== 'AbortError') setError(err.message);
      else setError('Simulation timed out — make sure the backend is running.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Instant simulate: show full result immediately.
  const handleSimulate = async () => {
    const result = await runSimulation();
    if (result) {
      setSimResult(result);
      setVisiblePlays(result.plays); // show all immediately
      setWatching(false);
    }
  };

  // Watch mode: reveal plays one at a time with a small delay.
  const handleWatch = async () => {
    const result = await runSimulation();
    if (!result) return;
    setSimResult(result);
    setVisiblePlays([]);
    setWatching(true);
  };

  // Drive the watch timer: every 700ms, append the next play.
  useEffect(() => {
    if (!watching || !simResult) return;
    if (visiblePlays.length >= simResult.plays.length) {
      setWatching(false);
      return;
    }
    watchTimer.current = setTimeout(() => {
      setVisiblePlays(prev => simResult.plays.slice(0, prev.length + 1));
    }, 700);
    return () => clearTimeout(watchTimer.current);
  }, [watching, visiblePlays, simResult]);

  const skipWatch = () => {
    if (watchTimer.current) clearTimeout(watchTimer.current);
    setVisiblePlays(simResult?.plays || []);
    setWatching(false);
  };

  // Rematch with same players. Mode controls whether to animate or jump to final.
  const handleRematch = async (mode) => {
    setSimResult(null);
    setVisiblePlays([]);
    if (mode === 'watch') await handleWatch();
    else await handleSimulate();
  };

  const newMatchup = () => {
    setSimResult(null);
    setVisiblePlays([]);
    setPlayerA(null);
    setPlayerB(null);
    setSearchA('');
    setResultsA([]);
    setError('');
  };

  // ===================== RESULTS / WATCH SCREEN =====================
  if (simResult) {
    const totalPlays = simResult.plays.length;
    const shown = visiblePlays.length;
    const isFinal = !watching && shown >= totalPlays;
    // Live score: derive from last visible play (so the scoreboard ticks up in watch mode).
    const lastPlay = visiblePlays[visiblePlays.length - 1];
    const liveA = lastPlay ? lastPlay.scoreA : 0;
    const liveB = lastPlay ? lastPlay.scoreB : 0;
    return (
      <div style={s.container}>
        <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
        <div style={s.resultCard}>
          <h1 style={s.resultTitle}>{isFinal ? '1v1 Final' : 'Live: 1v1'}</h1>
          <div style={s.scoreboard}>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>{simResult.playerA}</div>
              <div style={s.scoreNum}>{isFinal ? simResult.scoreA : liveA}</div>
            </div>
            <div style={s.vs}>VS</div>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>{simResult.playerB}</div>
              <div style={s.scoreNum}>{isFinal ? simResult.scoreB : liveB}</div>
            </div>
          </div>
          {isFinal && <p style={s.winnerText}>{simResult.winner} wins!</p>}
          {watching && (
            <p style={{ ...s.winnerText, color: '#f97316' }}>
              Playing... {shown} / {totalPlays}
            </p>
          )}
          <div style={s.playLog}>
            {visiblePlays.map((play, i) => (
              <div key={i} style={s.playEntry}>
                <span style={s.playScore}>{play.scoreA}-{play.scoreB}</span>
                <span>{play.text}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {watching ? (
              <button onClick={skipWatch} style={{ ...s.playAgainBtn, background: '#64748b' }}>Skip to Final</button>
            ) : (
              <>
                <button onClick={() => handleRematch('simulate')} style={s.playAgainBtn}>Rematch</button>
                <button onClick={() => handleRematch('watch')} style={{ ...s.playAgainBtn, background: '#22c55e' }}>Rematch (Watch)</button>
                <button onClick={newMatchup} style={{ ...s.playAgainBtn, background: '#334155' }}>New Matchup</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===================== PLAYER SELECTION SCREEN =====================
  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>One on One</h1>
      <p style={s.subtitle}>Type a full player name. The CPU will pick its own challenger.</p>
      {error && <div style={s.error}>{error}</div>}

      <div style={s.pickersRow}>
        {/* ----- USER PICKER ----- */}
        <div style={s.pickerPanel}>
          <h3 style={{ ...s.pickerTitle, color: '#3b82f6' }}>Your Player</h3>
          {playerA ? (
            <div style={s.selectedCard}>
              <div style={{ ...s.selectedRating, background: '#3b82f6' }}>{playerA.rating}</div>
              <div>
                <div style={s.selectedName}>{playerA.firstName} {playerA.lastName}</div>
                <div style={s.selectedMeta}>{playerA.position} | {playerA.team}</div>
              </div>
              <button
                onClick={() => { setPlayerA(null); setPlayerB(null); setSearchA(''); setResultsA([]); }}
                style={s.changeBtn}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div style={s.searchRow}>
                <input
                  type="text"
                  placeholder="Type full name (e.g. LeBron James)"
                  value={searchA}
                  onChange={e => setSearchA(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchPlayers(searchA)}
                  style={s.input}
                />
                <button
                  onClick={() => searchPlayers(searchA)}
                  disabled={searchLoading || !searchA.trim()}
                  style={{ ...s.searchBtn, background: '#3b82f6', opacity: !searchA.trim() ? 0.5 : 1 }}
                >
                  {searchLoading ? '...' : 'Search'}
                </button>
              </div>
              {searchLoading ? (
                <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>Searching...</p>
              ) : resultsA.length > 0 ? (
                <div style={s.resultsList}>
                  {resultsA.map(p => (
                    <button key={p.id} onClick={() => setPlayerA(p)} style={s.resultItem}>
                      <span style={s.resultName}>{p.firstName} {p.lastName}</span>
                      <span style={s.resultMeta}>{p.position} | {p.team}</span>
                      <span style={{ ...s.resultRating, background: '#3b82f6' }}>{p.rating}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: 12, padding: '12px 4px', textAlign: 'center' }}>
                  Enter a full player name and press Search.
                </p>
              )}
            </>
          )}
        </div>

        <div style={s.vsCenter}>VS</div>

        {/* ----- CPU PANEL (auto-picked) ----- */}
        <div style={s.pickerPanel}>
          <h3 style={{ ...s.pickerTitle, color: '#ef4444' }}>CPU Player</h3>
          {!playerA ? (
            <p style={{ color: '#64748b', fontSize: 13, padding: '20px 4px', textAlign: 'center' }}>
              Pick your player first — the CPU will respond.
            </p>
          ) : cpuPicking ? (
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 24 }}>
              CPU is choosing an opponent...
            </p>
          ) : playerB ? (
            <div style={s.selectedCard}>
              <div style={{ ...s.selectedRating, background: '#ef4444' }}>{playerB.rating}</div>
              <div>
                <div style={s.selectedName}>{playerB.firstName} {playerB.lastName}</div>
                <div style={s.selectedMeta}>{playerB.position} | {playerB.team}</div>
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                  CPU matched position: {positionGroup(playerA.position)}
                </div>
              </div>
              <button onClick={() => pickCpuOpponent(playerA)} style={s.changeBtn}>Re-roll</button>
            </div>
          ) : (
            <p style={{ color: '#fca5a5', fontSize: 13, padding: 16, textAlign: 'center' }}>
              CPU could not find a match.{' '}
              <button onClick={() => pickCpuOpponent(playerA)} style={{ ...s.changeBtn, marginLeft: 4 }}>Retry</button>
            </p>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={handleSimulate}
          disabled={!playerA || !playerB || loading}
          style={!playerA || !playerB ? { ...s.simBtn, opacity: 0.5 } : s.simBtn}
        >
          {loading ? 'Simulating...' : 'Simulate Game'}
        </button>
        <button
          onClick={handleWatch}
          disabled={!playerA || !playerB || loading}
          style={!playerA || !playerB ? { ...s.simBtn, background: '#22c55e', opacity: 0.5 } : { ...s.simBtn, background: '#22c55e' }}
        >
          Watch Play-by-Play
        </button>
      </div>
    </div>
  );
}

// ===================== STYLES =====================
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
  simBtn: { padding: '14px 32px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 18 },
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
  playAgainBtn: { padding: '12px 28px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
};
