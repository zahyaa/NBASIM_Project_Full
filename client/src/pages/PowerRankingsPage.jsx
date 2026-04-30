import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Sprint E2 — power rankings page. Pulls /api/league/power-rankings, lets
// the user take a weekly "snapshot" that gets stored in history.
export default function PowerRankingsPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (snapshot = false) => {
    setBusy(true); setError('');
    try {
      const url = `/api/league/power-rankings${snapshot ? '?snapshot=true' : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setData(body);
      const histRes = await fetch('/api/league/power-rankings/history', { headers: { Authorization: `Bearer ${token}` } });
      if (histRes.ok) {
        const h = await histRes.json();
        setHistory(h.history || []);
      }
    } catch (err) { setError(err.message); }
    setBusy(false);
  }, [token]);

  useEffect(() => { load(false); }, [load]);

  if (!data) {
    return <div style={{ color: '#fff', padding: 24 }}>{error || 'Loading power rankings...'}</div>;
  }

  return (
    <div style={{ color: '#fff', padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ marginRight: 'auto' }}>Power Rankings</h2>
        <button
          onClick={() => load(true)}
          disabled={busy}
          style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}
        >
          {busy ? '...' : '📸 Snapshot Week'}
        </button>
      </div>
      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#0f172a', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#1e293b' }}>
            <th style={th}>#</th>
            <th style={th}>Team</th>
            <th style={th}>Conf</th>
            <th style={th}>Record</th>
            <th style={th}>Win%</th>
            <th style={th}>Avg Rating</th>
            <th style={th}>Trend</th>
            <th style={th}>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.rankings.map(row => (
            <tr key={row.name} style={{ background: row.isUser ? '#1f3b5b' : 'transparent', borderTop: '1px solid #1e293b' }}>
              <td style={td}>{row.rank}</td>
              <td style={{ ...td, fontWeight: row.isUser ? 700 : 500 }}>
                {row.city ? `${row.city} ` : ''}{row.name}{row.isUser ? ' ⭐' : ''}
              </td>
              <td style={td}>{row.conference}</td>
              <td style={td}>{row.wins}-{row.losses}</td>
              <td style={td}>{(row.winPct * 100).toFixed(1)}%</td>
              <td style={td}>{row.avgRating}</td>
              <td style={{ ...td, color: row.trend > 0 ? '#22c55e' : row.trend < 0 ? '#f87171' : '#94a3b8' }}>
                {row.trend > 0 ? `+${row.trend}` : row.trend}
              </td>
              <td style={td}>{row.score.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>History</h3>
          <div style={{ color: '#94a3b8', fontSize: 14 }}>
            {history.length} snapshot{history.length === 1 ? '' : 's'} recorded.
            Latest: Season {history[history.length - 1].seasonNumber}, Week {history[history.length - 1].week}.
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 13, color: '#cbd5e1' };
const td = { padding: '8px 12px', fontSize: 14 };
