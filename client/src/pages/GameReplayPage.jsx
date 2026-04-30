import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Sprint I — Game Replay viewer. Lists the user's recent games and plays
// back the stored play-by-play log for the selected one.
export default function GameReplayPage() {
  const { token } = useAuth();
  const [games, setGames] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/games', { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setGames(body);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);

  const open = async (id) => {
    setError(''); setActive(null);
    try {
      const res = await fetch(`/api/games/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setActive(body);
    } catch (err) { setError(err.message); }
  };

  return (
    <div style={{ color: '#fff', padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h2>Game Replays</h2>
      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        <div style={{ background: '#0f172a', padding: 12, borderRadius: 8, maxHeight: 600, overflow: 'auto' }}>
          {games.length === 0 && <div style={{ color: '#94a3b8' }}>No saved games yet.</div>}
          {games.map(g => (
            <button
              key={g._id}
              onClick={() => open(g._id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: active?._id === g._id ? '#1e3a5f' : 'transparent',
                color: '#fff', border: 'none', padding: '8px 10px',
                borderRadius: 4, cursor: 'pointer', fontSize: 13, marginBottom: 4,
              }}
            >
              <div style={{ fontWeight: 600 }}>{g.teamA} {g.scoreA} — {g.scoreB} {g.teamB}</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>{new Date(g.timestamp).toLocaleString()}</div>
            </button>
          ))}
        </div>

        <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, minHeight: 400 }}>
          {!active && <div style={{ color: '#94a3b8' }}>Pick a game from the list to view its play-by-play.</div>}
          {active && (
            <>
              <h3 style={{ marginTop: 0 }}>
                {active.teamA} {active.scoreA} — {active.scoreB} {active.teamB}
              </h3>
              <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
                {new Date(active.timestamp).toLocaleString()} · {active.history?.length || 0} plays
              </div>
              <div style={{ maxHeight: 480, overflow: 'auto', fontSize: 13 }}>
                {(active.history || []).map((p, i) => (
                  <div key={i} style={{
                    padding: '4px 8px',
                    borderBottom: '1px solid #1e293b',
                    color: p.type === 'info' ? '#fbbf24' : '#cbd5e1',
                    fontWeight: p.type === 'info' ? 600 : 400,
                  }}>
                    <span style={{ color: '#64748b', marginRight: 8 }}>
                      Q{p.quarter} {p.clock}
                    </span>
                    {p.text}
                    {(p.scoreA !== undefined && p.scoreB !== undefined) && (
                      <span style={{ color: '#64748b', marginLeft: 8 }}>
                        ({p.scoreA}-{p.scoreB})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
