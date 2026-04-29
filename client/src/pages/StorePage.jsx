// Fantasy GM — Store page. Locked until /api/draft/setup completes.
// Spend tokens to apply boosts or heal injuries on roster players.
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function StorePage() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tokens, setTokens] = useState(user?.tokens || 0);
  const [inventory, setInventory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/store', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems(data.items);
      setTokens(data.tokens);
      setInventory(data.inventory || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const roster = user?.team?.players || [];

  const purchase = async (item) => {
    if (!selectedPlayerId) {
      setError('Select a player to apply this item to first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/store/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: item.itemId, playerId: Number(selectedPlayerId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTokens(data.tokens);
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
      load();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div style={s.container} data-testid="store-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.header}>
        <h1 style={s.title}>GM Store</h1>
        <p style={s.subtitle}>
          Balance: <span style={s.tokens} data-testid="store-tokens">{tokens}</span> tokens
        </p>
      </div>

      {error && <div style={s.error} data-testid="store-error">{error}</div>}

      <div style={s.targetRow}>
        <label style={s.label}>Apply purchases to:</label>
        <select
          data-testid="store-target-select"
          value={selectedPlayerId}
          onChange={e => setSelectedPlayerId(e.target.value)}
          style={s.select}
        >
          <option value="">— Select a player —</option>
          {roster.map(p => (
            <option key={p.playerId} value={p.playerId}>
              {p.firstName} {p.lastName} ({p.position}) — {p.rating}
              {p.injured ? ' [INJ]' : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }} data-testid="brand-filters">
        {['', 'Nike', 'Adidas', 'Puma', 'New Balance'].map(b => (
          <button key={b || 'all'} onClick={() => setBrandFilter(b)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1px solid #334155',
            background: brandFilter === b ? '#f97316' : '#0f172a',
            color: brandFilter === b ? '#fff' : '#94a3b8',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>{b || 'All'}</button>
        ))}
      </div>

      <div style={s.grid}>
        {items.filter(it => !brandFilter || it.brand === brandFilter).map(item => {
          const affordable = tokens >= item.cost;
          return (
            <div key={item.itemId} style={s.card} data-testid={`store-item-${item.itemId}`}>
              <h3 style={s.cardTitle}>{item.name}</h3>
              {item.brand && <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{item.brand.toUpperCase()}</div>}
              <p style={s.cardDesc}>
                {item.boost && (
                  <>
                    {item.boost.offense ? `+${item.boost.offense} OFF ` : ''}
                    {item.boost.defense ? `+${item.boost.defense} DEF ` : ''}
                    {item.boost.athleticism ? `+${item.boost.athleticism} ATH` : ''}
                  </>
                )}
                {item.healInjury && 'Heals current injury'}
              </p>
              <div style={s.cost}>{item.cost} tokens</div>
              <button
                disabled={busy || !affordable || !selectedPlayerId}
                onClick={() => purchase(item)}
                data-testid={`buy-${item.itemId}`}
                style={{
                  ...s.buyBtn,
                  opacity: (busy || !affordable || !selectedPlayerId) ? 0.5 : 1,
                  cursor: (busy || !affordable || !selectedPlayerId) ? 'not-allowed' : 'pointer',
                }}
              >
                {affordable ? 'Buy' : 'Not enough tokens'}
              </button>
            </div>
          );
        })}
      </div>

      {inventory.length > 0 && (
        <div style={s.invPanel}>
          <h2 style={s.panelTitle}>Inventory ({inventory.length})</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {inventory.slice(-12).reverse().map((it, i) => (
              <li key={i} style={s.invRow}>
                {it.name} → player #{it.appliedToPlayerId}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12 },
  header: { textAlign: 'center', marginBottom: 16 },
  title: { color: '#eab308', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', margin: 0, fontSize: 14 },
  tokens: { color: '#fbbf24', fontWeight: 700 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 700, textAlign: 'center', fontSize: 13 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  targetRow: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, minWidth: 280 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, maxWidth: 1100, margin: '0 auto' },
  card: { background: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155' },
  cardTitle: { color: '#fbbf24', margin: '0 0 6px', fontSize: 16, fontWeight: 700 },
  cardDesc: { color: '#94a3b8', fontSize: 13, margin: '0 0 8px', minHeight: 36 },
  cost: { color: '#22c55e', fontWeight: 700, marginBottom: 10 },
  buyBtn: { width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: '#eab308', color: '#0f172a', fontWeight: 700, fontSize: 14 },
  invPanel: { maxWidth: 1100, margin: '24px auto 0', background: '#1e293b', borderRadius: 12, padding: 16 },
  panelTitle: { color: '#eab308', margin: '0 0 10px', fontSize: 16, fontWeight: 700 },
  invRow: { padding: '6px 8px', color: '#cbd5e1', fontSize: 13, borderBottom: '1px solid #334155' },
};
