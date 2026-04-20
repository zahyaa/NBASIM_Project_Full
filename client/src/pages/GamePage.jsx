import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import GameCast from '../components/GameCast';

export default function GamePage() {
  const { token, user, setUser } = useAuth();
  const [opponents, setOpponents] = useState([]);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [opponentRoster, setOpponentRoster] = useState([]);
  const [simResult, setSimResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingRoster, setFetchingRoster] = useState(false);
  const [error, setError] = useState('');

  const roster = user?.team?.players || [];

  // Fetch NBA teams as potential opponents
  const fetchOpponents = useCallback(async () => {
    try {
      const res = await fetch('/api/nba/teams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load teams');
      const data = await res.json();
      setOpponents(data);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => { fetchOpponents(); }, [fetchOpponents]);

  // When opponent is selected, fetch their roster
  useEffect(() => {
    if (!selectedOpponent) return;
    setFetchingRoster(true);
    fetch(`/api/nba/roster?team_id=${selectedOpponent.id}&season=${user?.season || 2024}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load opponent roster');
        return res.json();
      })
      .then(data => { setOpponentRoster(data); setFetchingRoster(false); })
      .catch(err => { setError(err.message); setFetchingRoster(false); });
  }, [selectedOpponent, token, user?.season]);

  const handleSimulate = async () => {
    if (!selectedOpponent || opponentRoster.length < 5) return;
    setLoading(true);
    setError('');
    setSimResult(null);

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          opponentName: selectedOpponent.full_name,
          opponentPlayers: opponentRoster.map(p => ({
            playerId: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            position: p.position,
            rating: p.rating,
            stats: p.stats,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSimResult(data);
      // Refresh user record
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(await meRes.json());
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Game Day</h1>
      <p style={styles.record}>
        Record: {user?.wins || 0}W – {user?.losses || 0}L
      </p>

      {error && <div style={styles.error}>{error}</div>}

      {!simResult ? (
        <>
          {/* Your Team */}
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

          {/* Pick Opponent */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Choose Opponent</h2>
            <div style={styles.opponentGrid}>
              {opponents.map(team => (
                <button
                  key={team.id}
                  onClick={() => setSelectedOpponent(team)}
                  style={{
                    ...styles.opponentBtn,
                    border: selectedOpponent?.id === team.id
                      ? '2px solid #f97316'
                      : '2px solid #334155',
                  }}
                >
                  {team.logoEspn && <img src={team.logoEspn} alt="" style={{ width: 24, height: 24, objectFit: 'contain', verticalAlign: 'middle', marginRight: 6 }} onError={e => e.target.style.display = 'none'} />}
                  {team.full_name}
                </button>
              ))}
            </div>
          </div>

          {/* Opponent Roster Preview */}
          {selectedOpponent && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>{selectedOpponent.full_name} Roster</h3>
              {fetchingRoster ? (
                <p style={{ color: '#94a3b8' }}>Loading roster...</p>
              ) : (
                <div style={styles.rosterGrid}>
                  {opponentRoster.slice(0, 5).map(p => (
                    <div key={p.id} style={styles.playerChip}>
                      <span style={styles.chipRating}>{p.rating}</span>
                      {p.firstName} {p.lastName}
                      <span style={styles.chipPos}>{p.position}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSimulate}
            disabled={loading || !selectedOpponent || opponentRoster.length < 5}
            style={styles.simBtn}
          >
            {loading ? 'Simulating...' : 'Simulate Game'}
          </button>
        </>
      ) : (
        <>
          <GameCast
            plays={simResult.plays}
            teamA={simResult.teamA}
            teamB={simResult.teamB}
            scoreA={simResult.scoreA}
            scoreB={simResult.scoreB}
            logoA={selectedOpponent ? null : null}
            logoB={selectedOpponent?.logoEspn || selectedOpponent?.logo || null}
            teamStatsA={simResult.teamStatsA}
            teamStatsB={simResult.teamStatsB}
            shots={simResult.shots}
            winProbability={simResult.winProbability}
            leaders={simResult.leaders}
          />
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button onClick={() => setSimResult(null)} style={styles.simBtn}>
              Play Again
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#e2e8f0',
    padding: 24,
  },
  title: { color: '#f97316', textAlign: 'center', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  record: { color: '#94a3b8', textAlign: 'center', margin: '0 0 20px', fontSize: 14 },
  error: {
    background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px',
    borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13,
  },
  section: {
    background: '#1e293b', borderRadius: 12, padding: 20, maxWidth: 800,
    margin: '0 auto 16px',
  },
  sectionTitle: { color: '#f97316', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  rosterGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  playerChip: {
    background: '#0f172a', borderRadius: 8, padding: '8px 14px',
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
  },
  chipRating: {
    background: '#f97316', color: '#fff', borderRadius: 4,
    padding: '2px 6px', fontWeight: 700, fontSize: 11,
  },
  chipPos: { color: '#64748b', fontSize: 11 },
  opponentGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8,
  },
  opponentBtn: {
    background: '#0f172a', color: '#e2e8f0', borderRadius: 8,
    padding: '10px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
  },
  simBtn: {
    display: 'block', margin: '20px auto 0', padding: '14px 32px',
    borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff',
    fontWeight: 700, cursor: 'pointer', fontSize: 16,
  },
};
