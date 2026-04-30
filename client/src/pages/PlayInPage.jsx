import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Sprint E2 — Play-In Tournament page. Shows seeds 7-10 in each
// conference, lets the user run the 3-game format to determine seeds 7/8.
export default function PlayInPage() {
  const { token } = useAuth();
  const [pool, setPool] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/playoffs/play-in/preview', { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setPool(body.pool);
      setResults(body.results || null);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/playoffs/play-in/run', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setResults(body.results);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  if (!pool) return <div style={{ color: '#fff', padding: 24 }}>{error || 'Loading...'}</div>;

  return (
    <div style={{ color: '#fff', padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h2>Play-In Tournament</h2>
      <p style={{ color: '#94a3b8' }}>
        Seeds 7-10 in each conference compete for the final two playoff spots.
        Format: 7 vs 8 (winner = #7 seed); 9 vs 10; loser of game 1 plays winner of game 2 for the #8 seed.
      </p>

      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 16 }}>
        <ConfPanel label="East" seeds={pool.east} result={results?.east} />
        <ConfPanel label="West" seeds={pool.west} result={results?.west} />
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={run}
          disabled={busy || !!results}
          style={{
            background: results ? '#475569' : '#f97316',
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '10px 20px', fontWeight: 700,
            cursor: results ? 'not-allowed' : 'pointer',
          }}
        >
          {results ? 'Tournament Complete' : busy ? 'Simulating...' : '▶ Run Play-In'}
        </button>
      </div>
    </div>
  );
}

function ConfPanel({ label, seeds, result }) {
  return (
    <div style={{ background: '#0f172a', padding: 16, borderRadius: 8 }}>
      <h3 style={{ marginTop: 0 }}>{label}</h3>
      <div style={{ marginBottom: 12 }}>
        {seeds.map(s => (
          <div key={s.seed} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
            <span>{s.seed}. {s.name}{s.isUser ? ' ⭐' : ''}</span>
            <span style={{ color: '#94a3b8' }}>{s.wins}-{s.losses}</span>
          </div>
        ))}
      </div>

      {result && (
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
          <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 600 }}>
            #7 Seed: {result.seed7?.name}
          </div>
          <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            #8 Seed: {result.seed8?.name}
          </div>
          {result.games?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {result.games.map((g, i) => (
                <div key={i} style={{ fontSize: 13, color: '#cbd5e1', padding: '3px 0' }}>
                  {g.label}: {g.teamA} {g.scoreA} — {g.scoreB} {g.teamB} → {g.winner}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
