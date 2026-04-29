import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Card-pack acquisition flow. Replaces the old fantasy draft UI.
// Three modes, decided by the user's current state:
//   A. Setup       — user.draftStarted is false. Show team-creation form.
//   B. Pack store  — draftStarted true, roster < 15. Show three pack tiers.
//   C. Lock roster — roster >= 15. Show "Lock In Roster" button.

const DIVISIONS = {
  East: ['Atlantic', 'Central', 'Southeast'],
  West: ['Northwest', 'Pacific', 'Southwest'],
};

const CITY_TIERS = {
  I: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Dallas', 'Philadelphia',
    'Boston', 'Miami', 'Atlanta', 'Washington D.C.', 'Phoenix', 'San Francisco',
  ],
  II: [
    'Denver', 'Seattle', 'Minneapolis', 'Detroit', 'Cleveland', 'Charlotte',
    'Portland', 'San Diego', 'Tampa', 'Baltimore', 'St. Louis', 'Pittsburgh',
    'Cincinnati', 'Brooklyn',
  ],
  III: [
    'Oklahoma City', 'Memphis', 'Salt Lake City', 'New Orleans', 'Sacramento',
    'San Antonio', 'Indianapolis', 'Milwaukee', 'Orlando', 'Louisville',
    'Nashville', 'Las Vegas', 'Albuquerque', 'Tucson', 'Omaha',
    'Colorado Springs', 'Raleigh', 'Honolulu', 'Jacksonville',
  ],
};

const NBA_COACHES = [
  'Phil Jackson', 'Gregg Popovich', 'Pat Riley', 'Red Auerbach', 'Steve Kerr',
  'Erik Spoelstra', 'Tyronn Lue', 'Doc Rivers', 'Rick Carlisle', 'Larry Brown',
  'Chuck Daly', 'Lenny Wilkens', 'Don Nelson', 'Jerry Sloan', "Mike D'Antoni",
  'Tom Thibodeau', 'Mike Budenholzer', 'Monty Williams', 'Ime Udoka',
  'Joe Mazzulla', 'Jason Kidd', 'Mark Daigneault', 'Chauncey Billups',
  'Quin Snyder', 'JJ Redick', 'Wes Unseld Jr.',
];

const TIER_COLORS = {
  basic: '#22c55e',
  premium: '#60a5fa',
  ultimate: '#facc15',
};

function ratingColor(r) {
  if (r >= 90) return '#facc15';
  if (r >= 85) return '#60a5fa';
  if (r >= 78) return '#22c55e';
  if (r >= 70) return '#94a3b8';
  return '#64748b';
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ---------------- Setup form -----------------
function SetupForm({ token, onDone }) {
  const [conference, setConference] = useState('');
  const [division, setDivision] = useState('');
  const [marketTier, setMarketTier] = useState('');
  const [city, setCity] = useState('');
  const [coach, setCoach] = useState('');
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cities = marketTier
    ? CITY_TIERS[marketTier]
    : [...CITY_TIERS.I, ...CITY_TIERS.II, ...CITY_TIERS.III];

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/packs/setup', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          conference,
          division,
          league: 'NBA',
          city,
          coach,
          teamName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = conference && division && city && coach && teamName.trim();

  return (
    <form onSubmit={submit} style={S.formBox}>
      <h2 style={S.h2}>Create Your Franchise</h2>
      <p style={S.sub}>
        Pick a city, conference, division, and head coach. Your team name is
        permanent. After setup you'll get <b>100 tokens</b> to start opening
        card packs.
      </p>

      <label style={S.label}>Team Name
        <input style={S.input} value={teamName} onChange={e => setTeamName(e.target.value)}
               placeholder="e.g. Brooklyn Nets" maxLength={50} />
      </label>

      <label style={S.label}>Conference
        <select style={S.input} value={conference} onChange={e => { setConference(e.target.value); setDivision(''); }}>
          <option value="">— pick conference —</option>
          <option value="East">Eastern</option>
          <option value="West">Western</option>
        </select>
      </label>

      {conference && (
        <label style={S.label}>Division
          <select style={S.input} value={division} onChange={e => setDivision(e.target.value)}>
            <option value="">— pick division —</option>
            {DIVISIONS[conference].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      )}

      <label style={S.label}>Market Tier (optional filter)
        <select style={S.input} value={marketTier} onChange={e => { setMarketTier(e.target.value); setCity(''); }}>
          <option value="">All cities</option>
          <option value="I">Tier I — Major</option>
          <option value="II">Tier II — Mid</option>
          <option value="III">Tier III — Small</option>
        </select>
      </label>

      <label style={S.label}>City
        <select style={S.input} value={city} onChange={e => setCity(e.target.value)}>
          <option value="">— pick city —</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label style={S.label}>Head Coach
        <select style={S.input} value={coach} onChange={e => setCoach(e.target.value)}>
          <option value="">— pick coach —</option>
          {NBA_COACHES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      {error && <div style={S.error}>{error}</div>}

      <button type="submit" disabled={!canSubmit || busy} style={S.primaryBtn}>
        {busy ? 'Creating…' : 'Create Team & Get 100 Tokens'}
      </button>
    </form>
  );
}

// ---------------- Pack store -----------------
function PackStore({ token, user, refreshUser }) {
  const [tiers, setTiers] = useState(null);
  const [busy, setBusy] = useState(null); // tier key currently buying
  const [lastPack, setLastPack] = useState(null); // { tier, cards, refund }
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/packs/tiers', { headers: authHeaders(token) })
      .then(r => r.json())
      .then(setTiers)
      .catch(() => setError('Could not load pack catalog'));
  }, [token]);

  const roster = user?.team?.players || [];
  const tokens = user?.tokens || 0;
  const rosterSize = roster.length;
  const rosterFull = rosterSize >= 15;

  async function buyPack(tierKey) {
    setError('');
    setBusy(tierKey);
    try {
      const res = await fetch('/api/packs/buy', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ tier: tierKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pack purchase failed');
      setLastPack({ tier: tierKey, cards: data.cards, refund: data.refund });
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function lockRoster() {
    setError('');
    setCompleting(true);
    try {
      const res = await fetch('/api/packs/complete', {
        method: 'POST',
        headers: authHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lock failed');
      await refreshUser();
      navigate('/game');
    } catch (err) {
      setError(err.message);
      setCompleting(false);
    }
  }

  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => (b.rating || 0) - (a.rating || 0)),
    [roster],
  );

  return (
    <div>
      <div style={S.headerBar}>
        <div>
          <h2 style={{ ...S.h2, marginBottom: 4 }}>{user.team?.city} {user.team?.name}</h2>
          <div style={S.sub}>
            {user.team?.division} · Coach {user.team?.coach}
          </div>
        </div>
        <div style={S.statRow}>
          <div style={S.statBox}><div style={S.statNum}>{tokens}</div><div style={S.statLbl}>Tokens</div></div>
          <div style={S.statBox}>
            <div style={{ ...S.statNum, color: rosterFull ? '#22c55e' : '#fbbf24' }}>{rosterSize}/15</div>
            <div style={S.statLbl}>Roster</div>
          </div>
        </div>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {rosterFull ? (
        <div style={S.lockBox}>
          <h3 style={{ margin: 0, color: '#22c55e' }}>Roster Full</h3>
          <p style={S.sub}>Lock in your 15-man roster to start the season.</p>
          <button onClick={lockRoster} disabled={completing} style={S.primaryBtn}>
            {completing ? 'Locking…' : 'Lock In Roster & Start Season'}
          </button>
        </div>
      ) : (
        <div style={S.tiersGrid}>
          {tiers && Object.entries(tiers.tiers).map(([key, t]) => {
            const cant = tokens < t.cost || busy != null;
            return (
              <div key={key} style={{ ...S.tierCard, borderColor: TIER_COLORS[key] }}>
                <div style={{ ...S.tierLabel, color: TIER_COLORS[key] }}>{t.label}</div>
                <div style={S.tierCost}>{t.cost} <span style={{ fontSize: 12, color: '#94a3b8' }}>tokens</span></div>
                <div style={S.sub}>5 random players</div>
                <div style={S.sub}>Rating range: {t.min}–{t.max}</div>
                <button onClick={() => buyPack(key)} disabled={cant}
                        style={{ ...S.primaryBtn, background: TIER_COLORS[key], color: '#0f172a' }}>
                  {busy === key ? 'Opening…' : `Open ${t.label}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {lastPack && (
        <div style={S.lastPackBox}>
          <div style={S.lastPackHeader}>
            <h3 style={{ margin: 0, color: TIER_COLORS[lastPack.tier] }}>
              {tiers?.tiers[lastPack.tier]?.label} — {lastPack.cards.length} cards
            </h3>
            {lastPack.refund > 0 && (
              <span style={{ color: '#fbbf24', fontSize: 12 }}>
                Refunded {lastPack.refund} tokens (roster cap)
              </span>
            )}
            <button onClick={() => setLastPack(null)} style={S.dismissBtn}>×</button>
          </div>
          <div style={S.cardsRow}>
            {lastPack.cards.map(c => (
              <div key={c.id} style={S.card}>
                <div style={{ ...S.cardRating, background: ratingColor(c.rating) }}>{c.rating}</div>
                <div style={S.cardName}>{c.firstName} {c.lastName}</div>
                <div style={S.sub}>{c.position} · {c.league}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ ...S.h2, fontSize: 18, marginTop: 24 }}>Your Roster ({rosterSize}/15)</h3>
      {rosterSize === 0 ? (
        <p style={S.sub}>No players yet — open your first pack above.</p>
      ) : (
        <div style={S.rosterGrid}>
          {sortedRoster.map(p => (
            <div key={p.playerId} style={S.rosterCard}>
              <div style={{ ...S.cardRating, background: ratingColor(p.rating) }}>{p.rating}</div>
              <div style={S.cardName}>{p.firstName} {p.lastName}</div>
              <div style={S.sub}>{p.position}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Top-level page -----------------
export default function PacksPage() {
  const { token, user, setUser } = useAuth();

  async function refreshUser() {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUser(await res.json());
  }

  if (!user) return <div style={{ color: '#fff', padding: 40 }}>Loading…</div>;

  return (
    <div style={S.page}>
      <h1 style={S.h1}>🎴 Card Packs</h1>
      {!user.draftStarted ? (
        <SetupForm token={token} onDone={refreshUser} />
      ) : (
        <PackStore token={token} user={user} refreshUser={refreshUser} />
      )}
    </div>
  );
}

const S = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 24, color: '#e2e8f0' },
  h1: { color: '#f97316', marginBottom: 16 },
  h2: { color: '#fbbf24', fontSize: 22, margin: '0 0 8px' },
  sub: { color: '#94a3b8', fontSize: 13, margin: '4px 0' },
  formBox: { maxWidth: 520, background: '#0f172a', padding: 20, borderRadius: 10, border: '1px solid #1e293b' },
  label: { display: 'block', margin: '12px 0', color: '#cbd5e1', fontSize: 14 },
  input: { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', background: '#020617',
           border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 14 },
  primaryBtn: { padding: '10px 18px', background: '#f97316', color: '#0f172a', border: 'none',
                borderRadius: 6, fontWeight: 700, cursor: 'pointer', marginTop: 12, fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fecaca', padding: 8, borderRadius: 6, fontSize: 13, marginTop: 8 },
  headerBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap',
               background: '#0f172a', padding: 16, borderRadius: 10, border: '1px solid #1e293b', marginBottom: 16 },
  statRow: { display: 'flex', gap: 12 },
  statBox: { background: '#020617', padding: '8px 14px', borderRadius: 8, textAlign: 'center', minWidth: 80 },
  statNum: { fontSize: 24, fontWeight: 800, color: '#f97316' },
  statLbl: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' },
  tiersGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 },
  tierCard: { background: '#0f172a', border: '2px solid', borderRadius: 10, padding: 18, textAlign: 'center' },
  tierLabel: { fontSize: 18, fontWeight: 800, marginBottom: 4 },
  tierCost: { fontSize: 30, fontWeight: 800, color: '#fbbf24', marginBottom: 6 },
  lockBox: { background: '#0f172a', border: '2px solid #22c55e', borderRadius: 10, padding: 20, textAlign: 'center' },
  lastPackBox: { marginTop: 16, padding: 14, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10 },
  lastPackHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  dismissBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' },
  cardsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  card: { background: '#020617', padding: 10, borderRadius: 8, border: '1px solid #334155' },
  cardRating: { display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontWeight: 800, color: '#0f172a', marginBottom: 6 },
  cardName: { fontWeight: 700, fontSize: 14, color: '#e2e8f0' },
  rosterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 8 },
  rosterCard: { background: '#0f172a', padding: 8, borderRadius: 6, border: '1px solid #1e293b' },
};
