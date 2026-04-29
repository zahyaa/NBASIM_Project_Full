import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import GameCast from '../components/GameCast';

// Game Day page — Phase 2.
// All opponents are the user's made-up CPU franchises (per the requirement
// "Remove real NBA teams. All teams have to be made up. With active players").
// Two flows are supported:
//   - "Season game": play the next game on the user's 82-game schedule
//     via /api/season/play-next (counts toward seasonWins/Losses + standings)
//   - "Exhibition": pick any CPU opponent and run /api/simulate freely
export default function GamePage() {
  const { token, user, setUser } = useAuth();
  const [cpuTeams, setCpuTeams] = useState([]);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('season');
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [rewardToast, setRewardToast] = useState(null);
  const [standings, setStandings] = useState(null);

  const roster = user?.team?.players || [];

  const refreshUser = useCallback(async () => {
    const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (meRes.ok) setUser(await meRes.json());
  }, [token, setUser]);

  const loadGameData = useCallback(async () => {
    try {
      const [teamRes, schedRes, standRes] = await Promise.all([
        fetch('/api/team', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/season/schedule', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/season/standings', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (teamRes.ok) {
        const data = await teamRes.json();
        setCpuTeams(data.cpuTeams || []);
      }
      if (schedRes.ok) {
        const data = await schedRes.json();
        setScheduleInfo(data);
      }
      if (standRes.ok) setStandings(await standRes.json());
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { loadGameData(); }, [loadGameData]);

  const nextScheduledGame = scheduleInfo?.schedule?.find(g => !g.played);

  // Quick rank summary derived from /api/season/standings so the user sees
  // where their team stands without leaving Game Day.
  const ordinal = n => {
    const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const rankInfo = (() => {
    if (!standings || !standings.standings.length) return null;
    const sortFn = (a, b) => (b.wins - a.wins) || (a.losses - b.losses);
    const sorted = [...standings.standings].sort(sortFn);
    const userRow = sorted.find(r => r.isUser);
    if (!userRow) return null;
    const conf = sorted.filter(r => r.conference === userRow.conference);
    const div = sorted.filter(r => r.conference === userRow.conference && r.division === userRow.division);
    return {
      league: { rank: sorted.findIndex(r => r.isUser) + 1, of: sorted.length },
      conf:   { rank: conf.findIndex(r => r.isUser) + 1,   of: conf.length, name: userRow.conference },
      div:    { rank: div.findIndex(r => r.isUser) + 1,    of: div.length,  name: userRow.division },
    };
  })();

  const handlePlayNext = async () => {
    setLoading(true); setError(''); setSimResult(null); setRewardToast(null);
    try {
      const res = await fetch('/api/season/play-next', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to play game');
      setSimResult(data);
      if (data.tokensAwarded > 0 || (data.newAchievements || []).length) {
        setRewardToast({
          tokens: data.tokensAwarded,
          achievements: data.newAchievements || [],
        });
      }
      await refreshUser();
      await loadGameData();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleSimSeason = async () => {
    if (!window.confirm('Fast-forward through every remaining game this season?')) return;
    setLoading(true); setError(''); setSimResult(null); setRewardToast(null);
    try {
      const res = await fetch('/api/season/simulate-rest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
      if (!res.ok) throw new Error(data.error || 'Failed to sim season');
      if (data.tokensAwarded > 0 || (data.newAchievements || []).length) {
        setRewardToast({ tokens: data.tokensAwarded || 0, achievements: data.newAchievements || [] });
      }
      await refreshUser();
      await loadGameData();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleExhibition = async () => {
    if (!selectedOpponent) return;
    setLoading(true); setError(''); setSimResult(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          opponentName: selectedOpponent.name,
          opponentPlayers: (selectedOpponent.players || []).map(p => ({
            playerId: p.playerId, firstName: p.firstName, lastName: p.lastName,
            position: p.position, rating: p.rating, stats: p.stats,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSimResult(data);
      await refreshUser();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  if (!user?.draftStarted || !user?.draftCompleted) {
    return (
      <div style={styles.container} data-testid="game-page-locked">
        <h1 style={styles.title}>Game Day</h1>
        <p style={{ color: '#fbbf24', textAlign: 'center', marginTop: 40 }}>
          Locked — complete your fantasy draft to play games.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container} data-testid="game-page">
      <h1 style={styles.title}>Game Day</h1>
      <p style={styles.record} data-testid="game-record">
        Season {user?.seasonNumber || 1} of 5 · This season: {user?.seasonWins || 0}W – {user?.seasonLosses || 0}L
        {' · '}Career: {user?.wins || 0}W – {user?.losses || 0}L
      </p>
      {rankInfo && (
        <div style={styles.rankBar} data-testid="game-rank-bar">
          <span data-testid="rank-league">{ordinal(rankInfo.league.rank)} in League ({rankInfo.league.of})</span>
          <span style={styles.rankSep}>·</span>
          <span data-testid="rank-conf">{ordinal(rankInfo.conf.rank)} in {rankInfo.conf.name}ern Conf</span>
          <span style={styles.rankSep}>·</span>
          <span data-testid="rank-div">{ordinal(rankInfo.div.rank)} in {rankInfo.div.name} Div</span>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
      {rewardToast && (
        <div style={styles.toast} data-testid="reward-toast">
          + {rewardToast.tokens} tokens earned!
          {rewardToast.achievements.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 12 }}>
              Achievements: {rewardToast.achievements.map(a => a.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {!simResult && (
        <div style={styles.modeRow}>
          <button data-testid="mode-season" onClick={() => setMode('season')}
            style={{ ...styles.modeBtn, background: mode === 'season' ? '#f97316' : '#334155' }}>Season Game</button>
          <button data-testid="mode-exhibition" onClick={() => setMode('exhibition')}
            style={{ ...styles.modeBtn, background: mode === 'exhibition' ? '#f97316' : '#334155' }}>Exhibition</button>
        </div>
      )}

      {!simResult ? (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Your Team ({user?.team?.name || 'My Team'})</h2>
            <div style={styles.rosterGrid}>
              {roster.slice(0, 5).map(p => (
                <div key={p.playerId} style={styles.playerChip}>
                  <span style={styles.chipRating}>{p.rating}</span>
                  {p.firstName} {p.lastName}
                  <span style={styles.chipPos}>{p.position}</span>
                </div>
              ))}
            </div>
          </div>

          {mode === 'season' ? (
            <div style={styles.section} data-testid="season-panel">
              <h2 style={styles.sectionTitle}>Next Scheduled Game</h2>
              {scheduleInfo && scheduleInfo.schedule.length === 0 && (
                <p style={{ color: '#94a3b8' }}>No schedule yet — start your season from the Standings page.</p>
              )}
              {nextScheduledGame ? (
                <>
                  <p style={{ margin: '6px 0' }}>
                    Game <strong>{nextScheduledGame.gameNumber}</strong> of {scheduleInfo.schedule.length}
                    {' '}vs <strong data-testid="next-opponent">{nextScheduledGame.opponent}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button data-testid="play-next-btn" onClick={handlePlayNext} disabled={loading} style={styles.simBtn}>
                      {loading ? 'Simulating...' : 'Play Next Game'}
                    </button>
                    <button data-testid="sim-season-btn" onClick={handleSimSeason} disabled={loading}
                      style={{ ...styles.simBtn, background: '#dc2626' }}>
                      {loading ? 'Simulating...' : '⏭ Sim Season'}
                    </button>
                  </div>
                </>
              ) : scheduleInfo?.schedule?.length > 0 ? (
                <p style={{ color: '#22c55e' }}>Season complete! Visit the Standings page to advance.</p>
              ) : null}
            </div>
          ) : (
            <>
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Choose an Opponent (CPU League)</h2>
                <div style={styles.opponentGrid}>
                  {cpuTeams.map(team => (
                    <button key={team.name} data-testid={`opponent-${team.name}`}
                      onClick={() => setSelectedOpponent(team)}
                      style={{ ...styles.opponentBtn,
                        border: selectedOpponent?.name === team.name ? '2px solid #f97316' : '2px solid #334155' }}>
                      {team.name}
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {team.conference} · {team.division}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {selectedOpponent && (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>{selectedOpponent.name} Roster</h3>
                  <div style={styles.rosterGrid}>
                    {(selectedOpponent.players || []).slice(0, 5).map(p => (
                      <div key={p.playerId} style={styles.playerChip}>
                        <span style={styles.chipRating}>{p.rating}</span>
                        {p.firstName} {p.lastName}
                        <span style={styles.chipPos}>{p.position}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button data-testid="simulate-btn" onClick={handleExhibition}
                disabled={loading || !selectedOpponent} style={styles.simBtn}>
                {loading ? 'Simulating...' : 'Simulate Exhibition'}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <GameCast
            plays={simResult.plays}
            teamA={simResult.teamA} teamB={simResult.teamB}
            scoreA={simResult.scoreA} scoreB={simResult.scoreB}
            teamStatsA={simResult.teamStatsA} teamStatsB={simResult.teamStatsB}
            shots={simResult.shots} winProbability={simResult.winProbability}
            leaders={simResult.leaders}
          />
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button data-testid="play-again-btn" onClick={() => { setSimResult(null); setRewardToast(null); }} style={styles.simBtn}>
              Back to Game Day
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#e2e8f0', padding: 24 },
  title: { color: '#f97316', textAlign: 'center', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  record: { color: '#94a3b8', textAlign: 'center', margin: '0 0 20px', fontSize: 14 },
  rankBar: {
    color: '#fbbf24', textAlign: 'center', margin: '-12px auto 16px',
    fontSize: 13, fontWeight: 700, maxWidth: 800,
    background: '#0f172a', padding: '6px 12px', borderRadius: 8,
    border: '1px solid #1e3a8a', display: 'flex', justifyContent: 'center',
    gap: 8, flexWrap: 'wrap',
  },
  rankSep: { color: '#475569', fontWeight: 400 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px',
    borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  toast: { background: '#14532d', color: '#bbf7d0', padding: '10px 14px',
    borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontWeight: 700 },
  modeRow: { display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 16 },
  modeBtn: { color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
    fontWeight: 700, cursor: 'pointer' },
  section: { background: '#1e293b', borderRadius: 12, padding: 20, maxWidth: 800,
    margin: '0 auto 16px' },
  sectionTitle: { color: '#f97316', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  rosterGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  playerChip: { background: '#0f172a', borderRadius: 8, padding: '8px 14px',
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  chipRating: { background: '#f97316', color: '#fff', borderRadius: 4,
    padding: '2px 6px', fontWeight: 700, fontSize: 11 },
  chipPos: { color: '#64748b', fontSize: 11 },
  opponentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 },
  opponentBtn: { background: '#0f172a', color: '#e2e8f0', borderRadius: 8,
    padding: '10px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13, textAlign: 'left' },
  simBtn: { display: 'block', margin: '20px auto 0', padding: '14px 32px',
    borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff',
    fontWeight: 700, cursor: 'pointer', fontSize: 16 },
};
