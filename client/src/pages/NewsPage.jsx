// News Page — AI-generated headlines: game recaps, trade rumors,
// achievement spotlights, All-Star news, playoff drama. Filter by kind.
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const KINDS = [
  { id: '', label: 'All' },
  { id: 'game', label: 'Games' },
  { id: 'trade', label: 'Trades' },
  { id: 'allstar', label: 'All-Star' },
  { id: 'achievement', label: 'Awards' },
  { id: 'system', label: 'League' },
];

export default function NewsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [news, setNews] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const url = filter ? `/api/news?kind=${filter}` : '/api/news';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNews(data.news || []);
    } catch (err) { setError(err.message); }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const clear = async () => {
    if (!window.confirm('Clear all news?')) return;
    await fetch('/api/news', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  return (
    <div style={s.container} data-testid="news-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.header}>
        <h1 style={s.title}>📰 League News</h1>
        <p style={s.subtitle}>AI-generated headlines from around the league</p>
      </div>

      <div style={s.filters}>
        {KINDS.map(k => (
          <button key={k.id} onClick={() => setFilter(k.id)} style={{ ...s.filterBtn, ...(filter === k.id ? s.activeFilter : {}) }}>
            {k.label}
          </button>
        ))}
        <button onClick={clear} style={s.clearBtn}>Clear All</button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.feed}>
        {news.length === 0 && <div style={s.empty}>No headlines yet. Play games to generate news.</div>}
        {news.map(n => (
          <div key={n.id} style={{ ...s.card, ...kindStyle(n.kind) }} data-testid={`news-${n.kind}`}>
            <div style={s.kindBadge}>{n.kind.toUpperCase()}</div>
            <div style={s.headline}>{n.headline}</div>
            <div style={s.body}>{n.body}</div>
            <div style={s.meta}>Season {n.seasonNumber} · {new Date(n.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function kindStyle(kind) {
  switch (kind) {
    case 'game': return { borderLeft: '4px solid #60a5fa' };
    case 'trade': return { borderLeft: '4px solid #f97316' };
    case 'allstar': return { borderLeft: '4px solid #facc15' };
    case 'achievement': return { borderLeft: '4px solid #10b981' };
    default: return { borderLeft: '4px solid #94a3b8' };
  }
}

const s = {
  container: { padding: 24, color: '#fff', minHeight: '100vh', background: '#0f172a' },
  backBtn: { background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 16 },
  header: { textAlign: 'center', marginBottom: 24 },
  title: { fontSize: 28, marginBottom: 4 },
  subtitle: { color: '#94a3b8', fontSize: 14 },
  filters: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' },
  filterBtn: { padding: '6px 14px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  activeFilter: { background: '#f97316', color: '#fff', borderColor: '#f97316' },
  clearBtn: { padding: '6px 14px', background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  error: { padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 16 },
  feed: { maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#1e293b', padding: 14, borderRadius: 6 },
  kindBadge: { fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 4 },
  headline: { fontSize: 16, fontWeight: 600, marginBottom: 6 },
  body: { color: '#cbd5e1', fontSize: 14, marginBottom: 8 },
  meta: { fontSize: 11, color: '#64748b' },
  empty: { textAlign: 'center', color: '#64748b', padding: 60 },
};
