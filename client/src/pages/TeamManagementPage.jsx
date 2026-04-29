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
  const [customPlays, setCustomPlays] = useState([]);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/team', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeam(data.team);
      setCpuTeams(data.cpuTeams || []);
      // Pull user-authored plays from /api/playbook so the Coach's Playbook
      // tab shows custom plays designed in /playbook alongside the auto-generated ones.
      try {
        const pbRes = await fetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } });
        if (pbRes.ok) {
          const pb = await pbRes.json();
          setCustomPlays(pb.plays || []);
        }
      } catch (_) { /* non-fatal */ }
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
  const [lineupToast, setLineupToast] = useState('');
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
    setError(''); setLineupToast('');
    try {
      const res = await fetch('/api/team/lineup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ starterIds: [...starters] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeam(data.team);
      setLineupToast(`✅ Lineup saved · ${starters.size} starter${starters.size === 1 ? '' : 's'} will play every remaining game this season.`);
      setTimeout(() => setLineupToast(''), 5000);
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
    { k: 'playbook', label: "Coach's Playbook" },
  ];

  // Generate 10 playbooks tailored to the current roster. Each play picks
  // real players from the team for the relevant role (PG handler, top
  // scorer, best rebounder, sharpest shooter, etc.).
  const playbook = (() => {
    if (!players.length) return [];
    const byRating = [...players].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const byPos = (pos) => players.filter(p => (p.position || '').toUpperCase().startsWith(pos)).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const guards = [...byPos('G'), ...byPos('PG'), ...byPos('SG')];
    const wings = [...byPos('SF'), ...byPos('SG'), ...byPos('F')];
    const bigs = [...byPos('C'), ...byPos('PF'), ...byPos('F')];
    const fb = (i) => byRating[Math.min(i, byRating.length - 1)] || byRating[0];
    const pg = guards[0] || fb(1);
    const sg = guards[1] || wings[0] || fb(2);
    const sf = wings[0] || fb(2);
    const pf = bigs[1] || bigs[0] || fb(3);
    const c = bigs[0] || fb(4);
    const star = byRating[0];
    const sixth = byRating[5] || byRating[byRating.length - 1];
    const nm = (p) => p ? `${p.firstName} ${p.lastName}` : '—';
    return [
      { name: 'Horns Flare', type: 'Offense', desc: `Double high-post set with ${nm(pf)} and ${nm(c)}; ${nm(pg)} rejects the pick and flares ${nm(sg)} for an open three.` },
      { name: 'Pistol Action', type: 'Offense', desc: `${nm(pg)} dribbles into a side pick-and-roll with ${nm(c)}, ${nm(sf)} lifts to the wing for the kick-out.` },
      { name: 'Iverson Cut', type: 'Offense', desc: `${nm(star)} runs over staggered screens from ${nm(pf)} and ${nm(c)} into a mid-range pull-up.` },
      { name: 'Spain P&R', type: 'Offense', desc: `${nm(c)} screens for ${nm(pg)} while ${nm(sf)} back-screens ${nm(c)} — stack defense and get a lob or open shooter.` },
      { name: 'Hammer Set', type: 'Offense', desc: `${nm(sg)} drives baseline; ${nm(sf)} sets a back-screen on ${nm(pf)}'s defender for a corner three.` },
      { name: 'Floppy', type: 'Offense', desc: `${nm(sg)} chooses a side off ${nm(c)} or ${nm(pf)} screens — read the defense, take the open look.` },
      { name: 'Drag Flow', type: 'Transition', desc: `${nm(pg)} pushes; ${nm(c)} drag-screens at the arc, ${nm(sg)} fills the strong-side corner for a quick three.` },
      { name: 'Pack Line D', type: 'Defense', desc: `Sag off non-shooters, force ${nm(star)}'s match-up baseline; ${nm(c)} anchors the paint as help.` },
      { name: 'Switch 1–5', type: 'Defense', desc: `Switch every screen with ${nm(sf)} and ${nm(pf)} on the perimeter; ${nm(c)} drops only on rim-running 5s.` },
      { name: 'Bench Spark', type: 'Rotation', desc: `Bring ${nm(sixth)} as the 6th man with the second unit — lead ball-handler, free up ${nm(star)} to rest before the 4th.` },
    ];
  })();

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
          <p style={s.help}>
            Pick up to 5 starters. ({starters.size}/5) — your selection is saved
            and applied automatically to every remaining game this season
            (regular season, playoffs, exhibitions).
          </p>
          {lineupToast && (
            <div data-testid="lineup-toast"
                 style={{ padding: 10, background: '#065f46', borderRadius: 6, marginBottom: 12, color: '#fff', fontWeight: 600 }}>
              {lineupToast}
            </div>
          )}
          <ul style={s.list}>
            {players.map(p => (
              <li key={p.playerId} style={{ ...s.row, ...(starters.has(p.playerId) ? { background: '#0c4a6e', borderRadius: 6 } : {}) }}>
                <input
                  type="checkbox"
                  data-testid={`starter-${p.playerId}`}
                  checked={starters.has(p.playerId)}
                  onChange={() => toggleStarter(p.playerId)}
                />
                <span style={s.name}>{p.firstName} {p.lastName}</span>
                <span style={s.meta}>{p.position} · {p.rating}</span>
                {starters.has(p.playerId) && <span style={{ background: '#10b981', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>STARTER</span>}
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
      {tab === 'playbook' && (
        <div style={s.panel} data-testid="playbook-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ ...s.help, margin: 0 }}>
              10 plays generated from your current roster, plus any custom plays you design.
            </p>
            <button onClick={() => navigate('/playbook')}
                    style={{ padding: '8px 14px', background: '#f472b6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                    data-testid="open-playbook-page">
              📋 Design Custom Plays →
            </button>
          </div>

          {customPlays.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ color: '#f472b6', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>
                Your Custom Plays ({customPlays.length})
              </h3>
              <ul style={s.list}>
                {customPlays.map((p, i) => {
                  const nameOf = id => {
                    const pl = (team.players || []).find(x => String(x.playerId) === String(id));
                    return pl ? `${pl.firstName} ${pl.lastName}` : '—';
                  };
                  return (
                    <li key={p.id} style={{ ...s.row, alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}
                        data-testid={`custom-play-${i}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <span style={{ background: '#f472b6', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          CUSTOM
                        </span>
                        <span style={{ ...s.name, color: '#f472b6' }}>{p.name}</span>
                        <span style={s.meta}>{p.type} · {p.formation}</span>
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, paddingLeft: 36 }}>
                        Primary: <strong>{nameOf(p.primary)}</strong>
                        {' · '}Secondary: <strong>{nameOf(p.secondary)}</strong>
                        {' · '}Screener: <strong>{nameOf(p.screener)}</strong>
                        {p.description && <div style={{ marginTop: 4 }}>{p.description}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <h3 style={{ color: '#10b981', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 8px' }}>
            Auto-Generated Plays
          </h3>
          <ul style={s.list}>
            {playbook.map((p, i) => (
              <li key={p.name} style={{ ...s.row, alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}
                  data-testid={`play-${i}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span style={{ background: '#10b981', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ ...s.name, color: '#10b981' }}>{p.name}</span>
                  <span style={s.meta}>{p.type}</span>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, paddingLeft: 36 }}>
                  {p.desc}
                </div>
              </li>
            ))}
          </ul>
          {!playbook.length && <p style={s.help}>Draft a roster first to generate your playbook.</p>}
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
