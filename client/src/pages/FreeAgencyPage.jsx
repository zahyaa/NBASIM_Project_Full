// Sprint A3 — Free Agency page. Browse free agents, make offers (with
// CPU competing bids), resolve the round, plus re-sign your own
// expiring players.
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const card = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 12,
  padding: 20,
  color: '#e2e8f0',
  marginBottom: 20,
};

const fmtM = (n) => `$${(Number(n) || 0).toFixed(1)}M`;

export default function FreeAgencyPage() {
  const { token } = useAuth();
  const [finance, setFinance] = useState(null);
  const [freeAgents, setFreeAgents] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offerFor, setOfferFor] = useState(null); // FA being offered
  const [salary, setSalary] = useState(0);
  const [years, setYears] = useState(2);
  const [pendingOffers, setPendingOffers] = useState({}); // playerId -> offers[]
  const [resolveSummary, setResolveSummary] = useState(null);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [faRes, expRes, finRes] = await Promise.all([
        fetch('/api/frontoffice/freeagents', { headers }),
        fetch('/api/frontoffice/expiring', { headers }),
        fetch('/api/frontoffice/finance', { headers }),
      ]);
      const fa = await faRes.json();
      const exp = await expRes.json();
      const fin = await finRes.json();
      setFreeAgents(fa.freeAgents || []);
      setExpiring(exp.expiring || []);
      setFinance(fin.finance);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const openOffer = (fa) => {
    setOfferFor(fa);
    setSalary(fa.askingSalary);
    setYears(fa.askingYears || 2);
  };

  const submitOffer = async () => {
    if (!offerFor) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/frontoffice/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId: offerFor.playerId, salary, years }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Offer failed');
      setPendingOffers(prev => ({ ...prev, [offerFor.playerId]: j.offers }));
      setOfferFor(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/frontoffice/offers/resolve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Resolve failed');
      setResolveSummary(j.results);
      setPendingOffers({});
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resign = async (p, askSalary, askYears) => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/frontoffice/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId: p.playerId, salary: askSalary, years: askYears }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Re-sign failed');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = Object.keys(pendingOffers).length;

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: '0 20px', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#f97316', margin: 0 }}>📝 Free Agency</h1>
        {finance && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            Cap: {fmtM(finance.salaryCap)} · Payroll: {fmtM(finance.payroll)} · Space: <span style={{ color: finance.capSpace >= 0 ? '#22c55e' : '#ef4444' }}>{fmtM(finance.capSpace)}</span>
          </div>
        )}
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>⚠️ {error}</div>}

      {/* Re-signing window */}
      <div style={card}>
        <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>🔁 Re-Sign Your Expiring Players</h2>
        {expiring.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>No expiring contracts on your roster this season.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                <th style={{ padding: 8 }}>Player</th>
                <th style={{ padding: 8, textAlign: 'right' }}>OVR</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Current</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Yrs Left</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Re-Sign</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map(p => (
                <ResignRow key={p.playerId} player={p} onResign={resign} disabled={busy} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending offers + Resolve */}
      {pendingCount > 0 && (
        <div style={card}>
          <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>📨 Pending Offers ({pendingCount})</h2>
          {Object.entries(pendingOffers).map(([pid, offers]) => {
            const fa = freeAgents.find(f => Number(f.playerId) === Number(pid));
            const name = fa ? `${fa.firstName} ${fa.lastName}` : `Player #${pid}`;
            return (
              <div key={pid} style={{ marginBottom: 12, padding: 10, background: '#020617', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{name}</div>
                {offers.map((o, i) => (
                  <div key={i} style={{ fontSize: 12, color: o.isUser ? '#f97316' : '#94a3b8', marginLeft: 8 }}>
                    {o.isUser ? '⭐ You' : `🤖 ${o.teamName}`}: {fmtM(o.salary)}/yr × {o.years}y {o.usesMLE ? '(MLE)' : ''}
                  </div>
                ))}
              </div>
            );
          })}
          <button
            onClick={resolve}
            disabled={busy}
            style={{ background: '#10b981', color: '#020617', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
          >
            ▶️ Resolve All Offers
          </button>
        </div>
      )}

      {/* Resolve summary */}
      {resolveSummary && (
        <div style={card}>
          <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>📋 Last Round Results</h2>
          {resolveSummary.length === 0 ? (
            <div style={{ color: '#94a3b8' }}>No offers were submitted this round.</div>
          ) : resolveSummary.map((r, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
              {r.outcome === 'signed-user' && <span style={{ color: '#22c55e' }}>✅ Signed {r.name} · {fmtM(r.salary)}/yr × {r.years}y</span>}
              {r.outcome === 'signed-cpu' && <span style={{ color: '#94a3b8' }}>❌ {r.name} → {r.team} ({fmtM(r.salary)}/yr × {r.years}y)</span>}
              {r.outcome === 'declined' && <span style={{ color: '#fbbf24' }}>🚫 {r.name} declined all offers</span>}
              {r.outcome === 'user-cap-fail' && <span style={{ color: '#ef4444' }}>⚠️ {r.name}: {r.reason}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Free agent pool */}
      <div style={card}>
        <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>Free Agent Pool ({freeAgents.length})</h2>
        {freeAgents.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>No free agents available — advance to the next season to refresh the pool.</div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, background: '#0f172a' }}>
                  <th style={{ padding: 8 }}>Player</th>
                  <th style={{ padding: 8 }}>Pos</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>OVR</th>
                  <th style={{ padding: 8 }}>Last Team</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Asking</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Yrs</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {freeAgents.slice(0, 60).map(fa => {
                  const hasPending = !!pendingOffers[fa.playerId];
                  return (
                    <tr key={fa.playerId} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: 8 }}>{fa.firstName} {fa.lastName}</td>
                      <td style={{ padding: 8, color: '#94a3b8' }}>{fa.position}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fa.rating}</td>
                      <td style={{ padding: 8, color: '#94a3b8', fontSize: 12 }}>{fa.previousTeam}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fmtM(fa.askingSalary)}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fa.askingYears}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        <button
                          onClick={() => openOffer(fa)}
                          disabled={busy || hasPending}
                          style={{
                            background: hasPending ? '#475569' : fa.canAfford ? '#f97316' : fa.needsMLE ? '#f59e0b' : '#475569',
                            color: '#020617',
                            border: 'none',
                            borderRadius: 4,
                            padding: '4px 10px',
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: hasPending ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {hasPending ? 'Offer Sent' : 'Make Offer'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Offer modal */}
      {offerFor && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{ ...card, width: 380, marginBottom: 0 }}>
            <h3 style={{ marginTop: 0, color: '#fbbf24' }}>Offer to {offerFor.firstName} {offerFor.lastName}</h3>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              OVR {offerFor.rating} · Asking {fmtM(offerFor.askingSalary)}/yr × {offerFor.askingYears}y · {offerFor.previousTeam}
            </div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Salary (millions)</label>
            <input
              type="number" step="0.5" min="1" max="50"
              value={salary} onChange={e => setSalary(parseFloat(e.target.value))}
              style={{ width: '100%', padding: 8, marginBottom: 12, background: '#020617', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 4 }}
            />
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Years (1–5)</label>
            <input
              type="number" min="1" max="5"
              value={years} onChange={e => setYears(parseInt(e.target.value, 10))}
              style={{ width: '100%', padding: 8, marginBottom: 16, background: '#020617', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 4 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitOffer} disabled={busy} style={{ flex: 1, background: '#f97316', color: '#020617', border: 'none', borderRadius: 6, padding: 10, fontWeight: 700, cursor: 'pointer' }}>
                Submit Offer
              </button>
              <button onClick={() => setOfferFor(null)} disabled={busy} style={{ flex: 1, background: '#475569', color: '#fff', border: 'none', borderRadius: 6, padding: 10, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResignRow({ player, onResign, disabled }) {
  const [salary, setSalary] = useState(Math.max(player.currentSalary, 5));
  const [years, setYears] = useState(3);
  return (
    <tr style={{ borderBottom: '1px solid #1e293b' }}>
      <td style={{ padding: 8 }}>{player.firstName} {player.lastName}</td>
      <td style={{ padding: 8, textAlign: 'right' }}>{player.rating}</td>
      <td style={{ padding: 8, textAlign: 'right' }}>{fmtM(player.currentSalary)}</td>
      <td style={{ padding: 8, textAlign: 'right' }}>{player.yearsRemaining}</td>
      <td style={{ padding: 8, textAlign: 'right' }}>
        <input type="number" step="0.5" min="1" max="50" value={salary} onChange={e => setSalary(parseFloat(e.target.value))}
          style={{ width: 60, padding: 4, marginRight: 4, background: '#020617', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 4 }} />
        <input type="number" min="1" max="5" value={years} onChange={e => setYears(parseInt(e.target.value, 10))}
          style={{ width: 40, padding: 4, marginRight: 4, background: '#020617', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 4 }} />
        <button onClick={() => onResign(player, salary, years)} disabled={disabled}
          style={{ background: '#10b981', color: '#020617', border: 'none', borderRadius: 4, padding: '4px 10px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
          Re-sign
        </button>
      </td>
    </tr>
  );
}
