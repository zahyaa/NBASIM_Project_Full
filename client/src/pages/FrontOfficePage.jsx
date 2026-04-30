// Sprint A1 — Front Office page. Shows salary cap summary, payroll, luxury
// tax, contract table, and the league's payroll standings.
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const card = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 12,
  padding: 20,
  color: '#e2e8f0',
};

const statBox = (label, value, accent = '#f97316', sub = '') => (
  <div style={{
    flex: 1,
    minWidth: 160,
    background: '#020617',
    border: `1px solid ${accent}`,
    borderRadius: 10,
    padding: 16,
  }}>
    <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: accent, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
  </div>
);

const fmtM = (n) => `$${(Number(n) || 0).toFixed(1)}M`;

const TYPE_COLOR = {
  rookie: '#60a5fa',
  minimum: '#94a3b8',
  standard: '#10b981',
  max: '#f97316',
};

function DevList({ title, items, positive }) {
  const color = positive ? '#10b981' : '#f87171';
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color }}>{title}</div>
      {(!items || items.length === 0) ? (
        <div style={{ fontSize: 12, color: '#64748b' }}>None</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.slice(0, 5).map((p, i) => (
            <li key={i} style={{ fontSize: 12, marginBottom: 3, color: '#cbd5e1' }}>
              <span style={{ color: p.isUser ? '#fbbf24' : '#cbd5e1' }}>{p.name}</span>
              <span style={{ color, marginLeft: 6 }}>
                {p.before}→{p.after} ({p.delta > 0 ? '+' : ''}{p.delta})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FrontOfficePage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [freeAgents, setFreeAgents] = useState([]);
  const [signingId, setSigningId] = useState(0);
  const [development, setDevelopment] = useState(null);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [finRes, faRes, devRes] = await Promise.all([
        fetch('/api/frontoffice/finance', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/frontoffice/freeagents', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/season/progression', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const json = await finRes.json();
      if (!finRes.ok) throw new Error(json.error || 'Failed to load finance');
      setData(json);
      if (faRes.ok) {
        const fa = await faRes.json();
        setFreeAgents(fa.freeAgents || []);
      }
      if (devRes.ok) {
        const dev = await devRes.json();
        setDevelopment(dev.report || null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const signFA = async (fa) => {
    setError('');
    setSigningId(fa.playerId);
    try {
      const res = await fetch('/api/team/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          player: {
            playerId: fa.playerId,
            firstName: fa.firstName,
            lastName: fa.lastName,
            position: fa.position,
            rating: fa.rating,
            contract: {
              salary: fa.askingSalary,
              yearsRemaining: fa.askingYears,
              years: fa.askingYears,
              contractType: fa.rating >= 85 ? 'max' : fa.rating >= 75 ? 'standard' : fa.rating >= 68 ? 'standard' : 'minimum',
            },
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Sign failed');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSigningId(0);
    }
  };

  if (loading) return <div style={{ color: '#fff', padding: 40, textAlign: 'center' }}>Loading front office…</div>;
  if (error) return <div style={{ color: '#f87171', padding: 40, textAlign: 'center' }}>⚠️ {error}</div>;
  if (!data) return null;

  const { finance, contracts, team, rosterMin, rosterMax, minPayroll, overCap, overTax, cpuPayrolls } = data;

  // Rank user's payroll vs CPU payrolls.
  const allPayrolls = [...cpuPayrolls.map(t => t.payroll), finance.payroll].sort((a, b) => b - a);
  const rank = allPayrolls.indexOf(finance.payroll) + 1;
  const totalTeams = allPayrolls.length;

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: '0 20px', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#f97316', margin: 0 }}>🏢 Front Office</h1>
        <div style={{ color: '#94a3b8', fontSize: 14 }}>
          {team.city} {team.name}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <a href="/free-agency" style={{ padding: '6px 12px', background: '#1e293b', color: '#fbbf24', textDecoration: 'none', borderRadius: 4, fontSize: 13 }}>Free Agency →</a>
        <a href="/trades" style={{ padding: '6px 12px', background: '#1e293b', color: '#fbbf24', textDecoration: 'none', borderRadius: 4, fontSize: 13 }}>Trade Machine →</a>
        <a href="/coaching" style={{ padding: '6px 12px', background: '#1e293b', color: '#fbbf24', textDecoration: 'none', borderRadius: 4, fontSize: 13 }}>Coaching →</a>
      </div>

      {/* Cap summary */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>Salary Cap</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {statBox('Salary Cap', fmtM(finance.salaryCap), '#10b981')}
          {statBox('Payroll', fmtM(finance.payroll), overCap ? '#ef4444' : '#f97316',
            `League rank #${rank} of ${totalTeams}`)}
          {statBox('Cap Space', fmtM(finance.capSpace), finance.capSpace < 0 ? '#ef4444' : '#22c55e')}
          {statBox('Luxury Tax', fmtM(finance.taxAmount), overTax ? '#ef4444' : '#94a3b8',
            `Tax line ${fmtM(finance.luxuryTaxLine)}`)}
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: '#94a3b8' }}>
          {overTax && <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ Over the luxury tax line — paying 1.5× on every dollar above {fmtM(finance.luxuryTaxLine)}.<br /></span>}
          {overCap && !overTax && <span style={{ color: '#fbbf24', fontWeight: 600 }}>⚠️ Over the soft cap — limited to mid-level exception signings.<br /></span>}
          {!overCap && <span>✅ Under the cap with {fmtM(finance.capSpace)} of room.<br /></span>}
          {finance.payroll < minPayroll && <span style={{ color: '#fbbf24' }}>⚠️ Below the {fmtM(minPayroll)} salary floor — sign more players.</span>}
          {finance.midLevelExceptionAvailable && <span style={{ color: '#60a5fa' }}>💼 Mid-level exception available (up to $12M/yr).</span>}
        </div>
      </div>

      {/* Roster size pill */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>Roster</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {contracts.length} player{contracts.length === 1 ? '' : 's'} under contract
            </div>
          </div>
          <div style={{ color: contracts.length < rosterMin ? '#ef4444' : '#22c55e', fontSize: 13 }}>
            {rosterMin}–{rosterMax} required
          </div>
        </div>
      </div>

      {/* Contract table */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>Contracts</h2>
        {contracts.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>No players under contract yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                  <th style={{ padding: 8 }}>Player</th>
                  <th style={{ padding: 8 }}>Pos</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>OVR</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Salary</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Years Left</th>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Clauses</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.playerId} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: 8 }}>{c.firstName} {c.lastName}</td>
                    <td style={{ padding: 8, color: '#94a3b8' }}>{c.position}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{c.rating}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{fmtM(c.salary)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{c.yearsRemaining}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{
                        background: TYPE_COLOR[c.contractType] || '#475569',
                        color: '#020617',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}>{c.contractType}</span>
                    </td>
                    <td style={{ padding: 8, fontSize: 11, color: '#94a3b8' }}>
                      {c.noTradeClause && <span title="No-Trade Clause" style={{ marginRight: 6 }}>🚫 NTC</span>}
                      {c.playerOption && <span title="Player Option" style={{ marginRight: 6 }}>P-OPT</span>}
                      {c.teamOption && <span title="Team Option">T-OPT</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Development Report (Sprint B1) */}
      {development && (
        <div style={{ ...card, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>
            Last Offseason Development <span style={{ fontSize: 13, color: '#94a3b8' }}>(Season {development.seasonNumber})</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <DevList title="🚀 Breakouts" items={development.breakouts} positive />
            <DevList title="📉 Busts" items={development.busts} />
            <DevList title="↗ Biggest Risers" items={development.biggestRisers} positive />
            <DevList title="↘ Biggest Fallers" items={development.biggestFallers} />
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
            {development.totalPlayers} players progressed.
          </div>
        </div>
      )}

      {/* Free Agents */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>Free Agents <span style={{ fontSize: 13, color: '#94a3b8' }}>({freeAgents.length})</span></h2>
        {error && <div style={{ color: '#f87171', marginBottom: 8 }}>⚠️ {error}</div>}
        {freeAgents.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>No free agents available — wait for the offseason.</div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, background: '#0f172a' }}>
                  <th style={{ padding: 8 }}>Player</th>
                  <th style={{ padding: 8 }}>Pos</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>OVR</th>
                  <th style={{ padding: 8 }}>Last Team</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Asking</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Years</th>
                  <th style={{ padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {freeAgents.slice(0, 50).map(fa => (
                  <tr key={fa.playerId} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: 8 }}>{fa.firstName} {fa.lastName}</td>
                    <td style={{ padding: 8, color: '#94a3b8' }}>{fa.position}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{fa.rating}</td>
                    <td style={{ padding: 8, color: '#94a3b8', fontSize: 12 }}>{fa.previousTeam}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{fmtM(fa.askingSalary)}/yr</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{fa.askingYears}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      <button
                        onClick={() => signFA(fa)}
                        disabled={signingId === fa.playerId || (!fa.canAfford && !fa.needsMLE) || contracts.length >= rosterMax}
                        style={{
                          background: fa.canAfford ? '#10b981' : fa.needsMLE ? '#f59e0b' : '#475569',
                          color: '#020617',
                          border: 'none',
                          borderRadius: 4,
                          padding: '4px 10px',
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: fa.canAfford || fa.needsMLE ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {signingId === fa.playerId ? '...' : fa.canAfford ? 'Sign' : fa.needsMLE ? 'Use MLE' : 'No Cap'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* League payrolls */}
      {cpuPayrolls.length > 0 && (
        <div style={card}>
          <h2 style={{ marginTop: 0, color: '#fbbf24', fontSize: 18 }}>League Payrolls</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                  <th style={{ padding: 8 }}>#</th>
                  <th style={{ padding: 8 }}>Team</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Payroll</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>vs Cap</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...cpuPayrolls.map(t => ({ ...t, isUser: false })),
                  { name: team.name, city: team.city, payroll: finance.payroll, isUser: true },
                ]
                  .sort((a, b) => b.payroll - a.payroll)
                  .map((t, i) => (
                    <tr key={`${t.name}-${i}`} style={{
                      borderBottom: '1px solid #1e293b',
                      background: t.isUser ? 'rgba(249,115,22,0.08)' : 'transparent',
                    }}>
                      <td style={{ padding: 8, color: '#94a3b8' }}>{i + 1}</td>
                      <td style={{ padding: 8, fontWeight: t.isUser ? 700 : 400, color: t.isUser ? '#f97316' : '#e2e8f0' }}>
                        {t.city} {t.name}{t.isUser ? ' (you)' : ''}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fmtM(t.payroll)}</td>
                      <td style={{
                        padding: 8,
                        textAlign: 'right',
                        color: t.payroll > finance.luxuryTaxLine ? '#ef4444'
                          : t.payroll > finance.salaryCap ? '#fbbf24'
                          : '#22c55e',
                      }}>
                        {t.payroll > finance.luxuryTaxLine ? 'Over Tax'
                          : t.payroll > finance.salaryCap ? 'Over Cap'
                          : `+${fmtM(finance.salaryCap - t.payroll)}`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
