import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function DraftPage() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [teamName, setTeamName] = useState(user?.team?.name || '');

  // Conference & league setup
  const [conference, setConference] = useState(user?.conference || '');
  const [league, setLeague] = useState(user?.league || '');
  const [setupDone, setSetupDone] = useState(!!(user?.conference && user?.league));

  const roster = user?.team?.players || [];

  const handleSetup = async () => {
    if (!conference || !league) return;
    setError('');
    try {
      const res = await fetch('/api/draft/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conference, league }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      // Refresh user
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = await meRes.json();
      setUser(me);
      setSetupDone(true);
    } catch (err) {
      setError(err.message);
    }
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
      const data = await res.json();
      // Filter out already-drafted players
      const draftedIds = new Set(roster.map(p => p.playerId));
      setPool(data.filter(p => !draftedIds.has(p.id)));
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [token, user?.season, user?.conference, conference, setupDone, roster]);

  useEffect(() => {
    if (setupDone) fetchPool();
  }, [setupDone, fetchPool]);

  // Redirect once draft is complete
  useEffect(() => {
    if (user?.draftCompleted) {
      navigate('/game');
    }
  }, [user?.draftCompleted, navigate]);

  const handlePick = async (player) => {
    setPicking(true);
    try {
      const res = await fetch('/api/draft/pick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          playerId: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          position: player.position,
          rating: player.rating,
          stats: player.stats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Refresh user
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = await meRes.json();
      setUser(me);
      setPool(prev => prev.filter(p => p.id !== player.id));
    } catch (err) {
      setError(err.message);
    }
    setPicking(false);
  };

  const handleComplete = async () => {
    try {
      const res = await fetch('/api/draft/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = await meRes.json();
      setUser(me);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={styles.container}>
      {!setupDone ? (
        <div style={styles.setupCard}>
          <h1 style={styles.title}>Basketball Simulator</h1>
          <p style={styles.subtitle}>Choose your conference and league to start drafting</p>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.setupForm}>
            <label style={styles.label}>League</label>
            <div style={styles.optionGroup}>
              {['NBA', 'G-League', 'EuroLeague'].map(l => (
                <button
                  key={l}
                  onClick={() => setLeague(l)}
                  style={league === l ? { ...styles.optionBtn, ...styles.optionActive } : styles.optionBtn}
                >
                  {l}
                </button>
              ))}
            </div>

            <label style={styles.label}>Conference</label>
            <div style={styles.optionGroup}>
              {['East', 'West'].map(c => (
                <button
                  key={c}
                  onClick={() => setConference(c)}
                  style={conference === c ? { ...styles.optionBtn, ...styles.optionActive } : styles.optionBtn}
                >
                  {c}ern Conference
                </button>
              ))}
            </div>

            <button
              onClick={handleSetup}
              disabled={!conference || !league}
              style={!conference || !league ? { ...styles.startBtn, opacity: 0.5 } : styles.startBtn}
            >
              Start Draft
            </button>
          </div>
        </div>
      ) : (
      <><div style={styles.header}>
        <h1 style={styles.title}>Fantasy Draft</h1>
        <p style={styles.subtitle}>
          {user?.league || league} — {user?.conference || conference}ern Conference | Pick your roster ({roster.length}/12 players)
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Team Name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={styles.teamInput}
          />
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.layout}>
        {/* Draft Pool */}
        <div style={styles.poolPanel}>
          <h2 style={styles.panelTitle}>Available Players</h2>
          {loading ? (
            <div style={styles.loadingText}>Loading draft pool...</div>
          ) : (
            <div style={styles.poolList}>
              {pool.map(player => (
                <div key={player.id} style={styles.playerCard}>
                  <div style={styles.playerInfo}>
                    <span style={styles.playerName}>
                      {player.firstName} {player.lastName}
                    </span>
                    <span style={styles.playerMeta}>
                      {player.position} | {player.team}
                    </span>
                  </div>
                  <div style={styles.ratingBadge}>
                    {player.rating}
                  </div>
                  <button
                    onClick={() => handlePick(player)}
                    disabled={picking || roster.length >= 12}
                    style={styles.draftBtn}
                  >
                    Draft
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User's Roster */}
        <div style={styles.rosterPanel}>
          <h2 style={styles.panelTitle}>Your Roster</h2>
          {roster.length === 0 ? (
            <p style={styles.emptyText}>No players yet. Start drafting!</p>
          ) : (
            <div style={styles.rosterList}>
              {roster.map(p => (
                <div key={p.playerId} style={styles.rosterItem}>
                  <span style={styles.rosterName}>
                    {p.firstName} {p.lastName}
                  </span>
                  <span style={styles.rosterPos}>{p.position}</span>
                  <span style={styles.ratingSmall}>{p.rating}</span>
                </div>
              ))}
            </div>
          )}
          {roster.length >= 5 && (
            <button onClick={handleComplete} style={styles.completeBtn}>
              Complete Draft ({roster.length} players)
            </button>
          )}
        </div>
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
  // Setup screen
  setupCard: {
    maxWidth: 480,
    margin: '80px auto',
    background: '#1e293b',
    borderRadius: 16,
    padding: '40px 32px',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  setupForm: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 },
  label: { color: '#94a3b8', fontSize: 13, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 },
  optionGroup: { display: 'flex', gap: 8, justifyContent: 'center' },
  optionBtn: {
    padding: '10px 20px',
    borderRadius: 8,
    border: '2px solid #334155',
    background: '#0f172a',
    color: '#94a3b8',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 0.15s',
  },
  optionActive: {
    border: '2px solid #f97316',
    color: '#f97316',
    background: 'rgba(249,115,22,0.1)',
  },
  startBtn: {
    padding: '14px 24px',
    borderRadius: 10,
    border: 'none',
    background: '#f97316',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 16,
    marginTop: 8,
  },
  // Draft screen
  header: { textAlign: 'center', marginBottom: 16 },
  title: { color: '#f97316', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', margin: 0, fontSize: 14 },
  teamInput: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    fontSize: 14,
    width: 200,
  },
  error: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '8px 12px',
    borderRadius: 8,
    margin: '0 auto 12px',
    maxWidth: 600,
    textAlign: 'center',
    fontSize: 13,
  },
  layout: { display: 'flex', gap: 24, maxWidth: 1100, margin: '0 auto' },
  poolPanel: { flex: 2, background: '#1e293b', borderRadius: 12, padding: 20 },
  rosterPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  panelTitle: { color: '#f97316', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  loadingText: { color: '#94a3b8', textAlign: 'center', padding: 40 },
  poolList: { maxHeight: '70vh', overflowY: 'auto' },
  playerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderBottom: '1px solid #334155',
  },
  playerInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  playerName: { fontWeight: 600, fontSize: 14 },
  playerMeta: { color: '#94a3b8', fontSize: 12 },
  ratingBadge: {
    background: '#f97316',
    color: '#fff',
    borderRadius: '50%',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
  },
  draftBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  rosterList: { display: 'flex', flexDirection: 'column', gap: 6 },
  rosterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    background: '#0f172a',
    borderRadius: 8,
  },
  rosterName: { flex: 1, fontWeight: 600, fontSize: 13 },
  rosterPos: { color: '#94a3b8', fontSize: 12 },
  ratingSmall: {
    background: '#f97316',
    color: '#fff',
    borderRadius: 4,
    padding: '2px 8px',
    fontWeight: 700,
    fontSize: 12,
  },
  emptyText: { color: '#64748b', textAlign: 'center', padding: 20 },
  completeBtn: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#22c55e',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 16,
    fontSize: 14,
  },
};
