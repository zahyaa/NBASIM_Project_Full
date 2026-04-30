import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const SEVERITY_COLOR = {
  'season-ending': '#dc2626',
  major: '#f97316',
  moderate: '#eab308',
  minor: '#60a5fa',
};

export default function InjuryReportPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/season/injuries', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load injuries');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div style={{ padding: 40, color: '#cbd5e1' }}>Loading injury report…</div>;
  if (error) return <div style={{ padding: 40, color: '#f87171' }}>⚠️ {error}</div>;

  const list = (data?.injuries || []).filter(i => filter === 'all' || (filter === 'mine' && i.isUserTeam));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1 style={{ color: '#f87171', marginBottom: 8 }}>🏥 Injury Report</h1>
      <div style={{ color: '#94a3b8', marginBottom: 16 }}>
        {data.total} active injuries league-wide ({data.userTeamCount} on your team)
      </div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['all', 'mine'].map(k => (
          <button key={k} onClick={() => setFilter(k)} style={{
            background: filter === k ? '#dc2626' : '#1e293b',
            color: '#fff', border: 0, borderRadius: 6, padding: '6px 14px',
            cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>
            {k === 'all' ? 'League' : 'My Team'}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 20, color: '#94a3b8' }}>
          No active injuries. Healthy locker rooms all around.
        </div>
      ) : (
        <table style={{ width: '100%', background: '#1e293b', borderRadius: 8, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0f172a' }}>
              <th style={th}>Player</th>
              <th style={th}>Team</th>
              <th style={th}>Pos</th>
              <th style={th}>OVR</th>
              <th style={th}>Injury</th>
              <th style={th}>Severity</th>
              <th style={th}>Games Out</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ ...td, color: p.isUserTeam ? '#fbbf24' : '#cbd5e1', fontWeight: p.isUserTeam ? 600 : 400 }}>{p.name}</td>
                <td style={td}>{p.team}</td>
                <td style={td}>{p.position}</td>
                <td style={td}>{p.rating}</td>
                <td style={td}>{p.injuryType}</td>
                <td style={{ ...td, color: SEVERITY_COLOR[p.severity] || '#cbd5e1', textTransform: 'capitalize' }}>{p.severity}</td>
                <td style={{ ...td, color: '#f87171', fontWeight: 600 }}>{p.gamesRemaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: '8px 12px', color: '#cbd5e1' };
