// Sprint C3 — Coaching & Rotation page.
import React, { useEffect, useState } from 'react';
import api from '../api';

export default function CoachingPage() {
  const [state, setState] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [closers, setClosers] = useState([]);
  const [coty, setCoty] = useState(null);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('rotation');

  async function load() {
    try {
      const s = await api.get('/coaching/state');
      setState(s.data);
    } catch (e) { setMsg(e?.response?.data?.error || e.message); }
  }
  useEffect(() => { load(); }, []);

  async function loadCandidates() {
    const r = await api.get('/coaching/candidates');
    setCandidates(r.data.candidates);
  }
  async function loadClosers() {
    const r = await api.get('/coaching/closing-lineup');
    setClosers(r.data.closers);
  }
  async function loadCoty() {
    const r = await api.get('/coaching/coty');
    setCoty(r.data);
  }

  async function setPace(pace) {
    setMsg('');
    try {
      await api.post('/coaching/pace', { pace });
      setMsg(`Pace set to ${pace}`);
      load();
    } catch (e) { setMsg(e?.response?.data?.error || e.message); }
  }

  async function saveRotation() {
    setMsg('');
    try {
      const rotation = (state.coaching.rotation || []).map(r => ({
        playerId: Number(r.playerId), targetMinutes: Number(r.targetMinutes),
      }));
      await api.post('/coaching/rotation', { rotation });
      setMsg('Rotation saved');
      load();
    } catch (e) { setMsg(e?.response?.data?.error || e.message); }
  }

  function updateRotEntry(idx, field, value) {
    const next = { ...state, coaching: { ...state.coaching, rotation: [...state.coaching.rotation] } };
    next.coaching.rotation[idx] = { ...next.coaching.rotation[idx], [field]: value };
    setState(next);
  }
  function removeRotEntry(idx) {
    const next = { ...state, coaching: { ...state.coaching, rotation: state.coaching.rotation.filter((_, i) => i !== idx) } };
    setState(next);
  }
  function addRotEntry(playerId) {
    if ((state.coaching.rotation || []).length >= 8) return;
    const next = { ...state, coaching: { ...state.coaching, rotation: [...(state.coaching.rotation || []), { playerId, targetMinutes: 24 }] } };
    setState(next);
  }

  async function hire(c) {
    setMsg('');
    try {
      await api.post('/coaching/hire', { coach: c });
      setMsg(`Hired ${c.name}`);
      setCandidates([]);
      load();
    } catch (e) { setMsg(e?.response?.data?.error || e.message); }
  }
  async function fire() {
    if (!window.confirm('Fire current head coach?')) return;
    try {
      const r = await api.post('/coaching/fire');
      setMsg(r.data.message + (r.data.buyout ? ` (buyout $${r.data.buyout}M)` : ''));
      load();
    } catch (e) { setMsg(e?.response?.data?.error || e.message); }
  }

  if (!state) return <div style={{ padding: 24, color: '#fff' }}>Loading…</div>;

  const remainingRoster = (state.roster || []).filter(p =>
    !(state.coaching.rotation || []).some(r => Number(r.playerId) === Number(p.playerId))
  );

  return (
    <div style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Coaching</h1>
        <a href="/front-office" style={{ color: '#9cf' }}>← Front Office</a>
      </div>

      <section style={{ background: '#1c1f2a', padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Head Coach</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><b>Name</b><br />{state.coach.name || '—'}</div>
          <div><b>Style</b><br />{state.coach.style}</div>
          <div><b>Salary</b><br />${state.coach.salary}M ({state.coach.yearsRemaining}y left)</div>
          <div><b>Offense</b><br />{state.coach.offenseRating}</div>
          <div><b>Defense</b><br />{state.coach.defenseRating}</div>
          <div><b>Development</b><br />{state.coach.developmentRating}</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={fire} style={btnDanger}>Fire</button>
          <button onClick={loadCandidates} style={btnPrimary}>Browse Candidates</button>
        </div>
        {candidates.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3>Available Coaches</h3>
            <table style={tableStyle}>
              <thead><tr><th>Name</th><th>Age</th><th>Style</th><th>OFF</th><th>DEF</th><th>DEV</th><th>Salary</th><th>Years</th><th></th></tr></thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td><td>{c.age}</td><td>{c.style}</td>
                    <td>{c.offenseRating}</td><td>{c.defenseRating}</td><td>{c.developmentRating}</td>
                    <td>${c.salary}M</td><td>{c.yearsRemaining}</td>
                    <td><button onClick={() => hire(c)} style={btnPrimary}>Hire</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['rotation', 'pace', 'closers', 'coty'].map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'closers') loadClosers(); if (t === 'coty') loadCoty(); }}
            style={tab === t ? tabActive : tabIdle}>{t.toUpperCase()}</button>
        ))}
      </div>

      {tab === 'rotation' && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>8-Man Rotation</h2>
          <table style={tableStyle}>
            <thead><tr><th>#</th><th>Player</th><th>Rating</th><th>Target Minutes</th><th></th></tr></thead>
            <tbody>
              {(state.coaching.rotation || []).map((r, idx) => {
                const p = state.roster.find(x => Number(x.playerId) === Number(r.playerId));
                return (
                  <tr key={r.playerId}>
                    <td>{idx + 1}</td>
                    <td>{p ? `${p.firstName} ${p.lastName}` : `#${r.playerId}`}</td>
                    <td>{p?.rating}</td>
                    <td>
                      <input type="number" min="0" max="40" value={r.targetMinutes}
                        onChange={e => updateRotEntry(idx, 'targetMinutes', e.target.value)}
                        style={{ width: 60 }} />
                    </td>
                    <td><button onClick={() => removeRotEntry(idx)} style={btnDanger}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(state.coaching.rotation || []).length < 8 && (
            <div style={{ marginTop: 8 }}>
              <select onChange={e => { if (e.target.value) addRotEntry(Number(e.target.value)); e.target.value = ''; }}
                defaultValue="" style={{ padding: 6 }}>
                <option value="">+ Add player to rotation</option>
                {remainingRoster.map(p => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.firstName} {p.lastName} ({p.position}, {p.rating})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button onClick={saveRotation} style={btnPrimary}>Save Rotation</button>
          </div>
        </section>
      )}

      {tab === 'pace' && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Pace</h2>
          <p>Current: <b>{state.coaching.pace}</b></p>
          <div style={{ display: 'flex', gap: 8 }}>
            {state.pacePresets.map(p => (
              <button key={p} onClick={() => setPace(p)} style={state.coaching.pace === p ? btnPrimary : btnSecondary}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <p style={{ marginTop: 16, opacity: 0.8, fontSize: 14 }}>
            Slow = ~85 possessions, Medium = ~100, Fast = ~115. Affects total game volume.
          </p>
        </section>
      )}

      {tab === 'closers' && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Suggested Closing Lineup</h2>
          <p style={{ opacity: 0.8 }}>Top 5 by rating + 0.5×clutch + 0.2×IQ.</p>
          <table style={tableStyle}>
            <thead><tr><th>#</th><th>Player</th><th>Rating</th><th>Clutch</th><th>IQ</th></tr></thead>
            <tbody>
              {closers.map((c, i) => (
                <tr key={c.playerId}>
                  <td>{i + 1}</td><td>{c.firstName} {c.lastName}</td>
                  <td>{c.rating}</td><td>{c.clutch}</td><td>{c.iq}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'coty' && coty && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Coach of the Year</h2>
          {coty.winner ? (
            <p>Current leader: <b>{coty.winner.coachName}</b> — {coty.winner.teamName}<br />
              {coty.winner.wins} W vs {coty.winner.expectedWins.toFixed(1)} expected (Δ +{coty.winner.delta.toFixed(1)})</p>
          ) : <p>No games played yet.</p>}
          {coty.history && coty.history.length > 0 && (
            <>
              <h3>History</h3>
              <table style={tableStyle}>
                <thead><tr><th>Season</th><th>Coach</th><th>Team</th><th>Wins</th><th>Δ</th></tr></thead>
                <tbody>
                  {coty.history.map((h, i) => (
                    <tr key={i}><td>{h.season}</td><td>{h.coachName}</td><td>{h.teamName}</td><td>{h.wins}</td><td>+{h.delta?.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {msg && <div style={{ marginTop: 12, padding: 10, background: '#243', borderRadius: 6 }}>{msg}</div>}
    </div>
  );
}

const cardStyle = { background: '#1c1f2a', padding: 16, borderRadius: 8, marginBottom: 16 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: 8 };
const btnPrimary = { padding: '6px 14px', background: '#3a7bd5', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 8 };
const btnSecondary = { padding: '6px 14px', background: '#444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 8 };
const btnDanger = { padding: '4px 10px', background: '#a33', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 8 };
const tabIdle = { padding: '6px 14px', background: '#2a2d38', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const tabActive = { padding: '6px 14px', background: '#3a7bd5', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
