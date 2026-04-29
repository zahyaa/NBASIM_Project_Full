// Fantasy GM — Team Management. Locked until /api/draft/setup completes.
// Lineup, sign / release, trade with CPU, injuries, contracts.
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function TeamManagementPage() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState(user?.team || { players: [] });
  const [cpuTeams, setCpuTeams] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('lineup'); // lineup | sign | trade | injuries | contracts

  const refresh = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/team', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeam(data.team);
      setCpuTeams(data.cpuTeams || []);
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
    } catch (err) {
      setError(err.message);
    }
  }, [token, setUser]);

  useEffect(() => { refresh(); }, [refresh]);

  const players = team?.players || [];

  // ---- Lineup ----
  const [starters, setStarters] = useState(new Set());
  useEffect(() => {
    setStarters(new Set(players.filter(p => p.inLineup).map(p => p.playerId)));
  }, [team]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleStarter = (id) => {
    setStarters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const saveLineup = async () => {
    setError('');
    try {
      const res = await fetch('/api/team/lineup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ starterIds: [...starters] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeam(data.team);
    } catch (err) { setError(err.message); }
  };

  // ---- Sign (free agent search via NBA API) ----
  const [signQuery, setSignQuery] = useState('');
  const [signResults, setSignResults] = useState([]);
  const [signing, setSigning] = useState(false);

  const searchFreeAgents = async () => {
    if (!signQuery.trim()) return;
    setSigning(true);
    setError('');
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(signQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      // Filter out anyone already in the league.
      const taken = new Set(players.map(p => p.playerId));
      cpuTeams.forEach(t => t.players.forEach(p => taken.add(p.playerId)));
      setSignResults((data.data || []).filter(p => !taken.has(p.id)));
    } catch (err) { setError(err.message); }
    setSigning(false);
  };

  const signPlayer = async (p) => {
    try {
      const res = await fetch('/api/team/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          player: {
            playerId: p.id, firstName: p.firstName, lastName: p.lastName,
            position: p.position, rating: p.rating, stats: p.stats,
            contract: { years: 1, salary: Math.round((p.rating || 70) * 0.4) },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSignResults(prev => prev.filter(x => x.id !== p.id));
      refresh();
    } catch (err) { setError(err.message); }
  };

  const releasePlayer = async (playerId) => {
    try {
      const res = await fetch('/api/team/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      refresh();
    } catch (err) { setError(err.message); }
  };

  // ---- Trade ----
  const [offerId, setOfferId] = useState('');
  const [tradeCpuTeam, setTradeCpuTeam] = useState('');
  const [tradeTargetId, setTradeTargetId] = useState('');
  const [tradeMsg, setTradeMsg] = useState('');

  const submitTrade = async () => {
    setTradeMsg('');
    setError('');
    try {
      const res = await fetch('/api/team/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          offerPlayerId: Number(offerId),
          targetCpuTeamName: tradeCpuTeam,
          targetPlayerId: Number(tradeTargetId),
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setTradeMsg(`Rejected: ${data.reason}`);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setTradeMsg('Accepted!');
      refresh();
    } catch (err) { setError(err.message); }
  };

  // ---- Contracts ----
  const [contractFor, setContractFor] = useState('');
  const [contractYears, setContractYears] = useState(2);
  const [contractSalary, setContractSalary] = useState(20);

  const saveContract = async () => {
    if (!contractFor) return;
    try {
      const res = await fetch('/api/team/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId: Number(contractFor), years: contractYears, salary: contractSalary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      refresh();
    } catch (err) { setError(err.message); }
  };

  const tabs = [
    { k: 'lineup', label: 'Lineup' },
    { k: 'sign', label: 'Sign / Release' },
    { k: 'trade', label: 'Trade' },
    { k: 'injuries', label: 'Injuries' },
    { k: 'contracts', label: 'Contracts' },
  ];

  const tradeCpu = cpuTeams.find(t => t.name === tradeCpuTeam);

  return (
    <div style={s.container} data-testid="team-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.header}>
        <h1 style={s.title}>Team Management</h1>
        <p style={s.subtitle}>
          {team?.name || 'My Team'}
          {team?.city ? ` · ${team.city}` : ''}
          {team?.division ? ` · ${team.division}` : ''}
          {team?.coach ? ` · Coach ${team.coach}` : ''}
          {' · '}{players.length} players
        </p>
      </div>

      {error && <div style={s.error} data-testid="team-error">{error}</div>}

      <div style={s.tabBar}>
        {tabs.map(t => (
          <button
            key={t.k}
            data-testid={`tab-${t.k}`}
            onClick={() => setTab(t.k)}
            style={tab === t.k ? { ...s.tab, ...s.tabActive } : s.tab}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lineup' && (
        <div style={s.panel}>
          <p style={s.help}>Pick up to 5 starters. ({starters.size}/5)</p>
          <ul style={s.list}>
            {players.map(p => (
              <li key={p.playerId} style={s.row}>
                <input
                  type="checkbox"
                  data-testid={`starter-${p.playerId}`}
                  checked={starters.has(p.playerId)}
                  onChange={() => toggleStarter(p.playerId)}
                />
                <span style={s.name}>{p.firstName} {p.lastName}</span>
                <span style={s.meta}>{p.position} · {p.rating}</span>
                {p.injured && <span style={s.injTag}>INJ</span>}
              </li>
            ))}
          </ul>
          <button onClick={saveLineup} data-testid="save-lineup-btn" style={s.primary}>Save Lineup</button>
        </div>
      )}

      {tab === 'sign' && (
        <div style={s.panel}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search free-agent name..."
              value={signQuery}
              onChange={e => setSignQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchFreeAgents()}
              style={s.input}
            />
            <button onClick={searchFreeAgents} disabled={signing} style={s.primary}>
              {signing ? '...' : 'Search'}
            </button>
          </div>
          <ul style={s.list}>
            {signResults.map(p => (
              <li key={p.id} style={s.row}>
                <span style={s.name}>{p.firstName} {p.lastName}</span>
                <span style={s.meta}>{p.position} · {p.rating}</span>
                <button onClick={() => signPlayer(p)} style={s.primarySmall}>Sign</button>
              </li>
            ))}
          </ul>
          <h3 style={{ ...s.help, marginTop: 24 }}>Roster — Release</h3>
          <ul style={s.list}>
            {players.map(p => (
              <li key={p.playerId} style={s.row}>
                <span style={s.name}>{p.firstName} {p.lastName}</span>
                <span style={s.meta}>{p.position} · {p.rating}</span>
                <button onClick={() => releasePlayer(p.playerId)} style={s.dangerSmall}>Release</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'trade' && (
        <div style={s.panel}>
          <div style={s.tradeRow}>
            <div style={s.tradeSide}>
              <label style={s.label}>Offer (your player)</label>
              <select value={offerId} onChange={e => setOfferId(e.target.value)} style={s.select}>
                <option value="">— Select —</option>
                {players.map(p => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.firstName} {p.lastName} ({p.rating})
                  </option>
                ))}
              </select>
            </div>
            <div style={s.tradeSide}>
              <label style={s.label}>CPU Team</label>
              <select value={tradeCpuTeam} onChange={e => { setTradeCpuTeam(e.target.value); setTradeTargetId(''); }} style={s.select}>
                <option value="">— Select —</option>
                {cpuTeams.map(t => (
                  <option key={t.name} value={t.name}>{t.name} ({t.division})</option>
                ))}
              </select>
              <label style={s.label}>Target Player</label>
              <select value={tradeTargetId} onChange={e => setTradeTargetId(e.target.value)} style={s.select}>
                <option value="">— Select —</option>
                {(tradeCpu?.players || []).map(p => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.firstName} {p.lastName} ({p.rating})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={submitTrade} disabled={!offerId || !tradeCpuTeam || !tradeTargetId} style={s.primary}>
            Propose Trade
          </button>
          {tradeMsg && <p style={{ marginTop: 10, color: tradeMsg.startsWith('Accepted') ? '#22c55e' : '#fca5a5' }}>{tradeMsg}</p>}
        </div>
      )}

      {tab === 'injuries' && (
        <div style={s.panel}>
          <p style={s.help}>Players currently injured.</p>
          <ul style={s.list}>
            {players.filter(p => p.injured).map(p => (
              <li key={p.playerId} style={s.row}>
                <span style={s.name}>{p.firstName} {p.lastName}</span>
                <span style={s.meta}>{p.position}</span>
                <span style={s.injTag}>{p.injuryDaysRemaining || '?'} days</span>
              </li>
            ))}
            {players.filter(p => p.injured).length === 0 && (
              <li style={{ color: '#64748b', padding: 10 }}>No injuries — full strength.</li>
            )}
          </ul>
        </div>
      )}

      {tab === 'contracts' && (
        <div style={s.panel}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={s.label}>Player</label>
              <select value={contractFor} onChange={e => setContractFor(e.target.value)} style={s.select}>
                <option value="">— Select —</option>
                {players.map(p => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.firstName} {p.lastName} ({p.rating})
                    {p.contract?.years ? ` · ${p.contract.years}y / $${p.contract.salary}M` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={s.label}>Years</label>
              <input type="number" min={1} max={5} value={contractYears} onChange={e => setContractYears(Number(e.target.value))} style={s.input} />
            </div>
            <div>
              <label style={s.label}>Salary ($M)</label>
              <input type="number" min={1} max={60} value={contractSalary} onChange={e => setContractSalary(Number(e.target.value))} style={s.input} />
            </div>
            <button onClick={saveContract} disabled={!contractFor} style={s.primary}>Save</button>
          </div>
          <h3 style={{ ...s.help, marginTop: 18 }}>Current Contracts</h3>
          <ul style={s.list}>
            {players.map(p => (
              <li key={p.playerId} style={s.row}>
                <span style={s.name}>{p.firstName} {p.lastName}</span>
                <span style={s.meta}>
                  {p.contract?.years ? `${p.contract.years}y / $${p.contract.salary}M` : 'No contract'}
                </span>
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
  title: { color: '#10b981', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', margin: 0, fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 700, textAlign: 'center', fontSize: 13 },
  tabBar: { display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  tabActive: { border: '1px solid #10b981', color: '#10b981', background: 'rgba(16,185,129,0.1)' },
  panel: { background: '#1e293b', borderRadius: 12, padding: 18, maxWidth: 900, margin: '0 auto' },
  help: { color: '#94a3b8', fontSize: 13, marginTop: 0 },
  list: { listStyle: 'none', padding: 0, margin: '8px 0' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #334155' },
  name: { flex: 1, fontWeight: 600, fontSize: 13 },
  meta: { color: '#94a3b8', fontSize: 12 },
  injTag: { background: '#7f1d1d', color: '#fca5a5', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700 },
  label: { display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, width: '100%', marginBottom: 8 },
  primary: { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  primarySmall: { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  dangerSmall: { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  tradeRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 },
  tradeSide: { background: '#0f172a', padding: 12, borderRadius: 10 },
};
