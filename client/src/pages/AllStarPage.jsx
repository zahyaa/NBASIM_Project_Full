// All-Star Page — vote for your East/West starters, then run Saturday +
// Sunday events (3-Point, Slam Dunk, Skills, East-vs-West game).
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AllStarPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [ballot, setBallot] = useState({ east: [], west: [], voted: false });
  const [allStar, setAllStar] = useState(null);
  const [eastIds, setEastIds] = useState([]);
  const [westIds, setWestIds] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [b, st] = await Promise.all([
        fetch('/api/allstar/ballot', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/allstar/state',  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      setBallot(b);
      setAllStar(st.allStar);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id, conf) => {
    const set = conf === 'east' ? eastIds : westIds;
    const setter = conf === 'east' ? setEastIds : setWestIds;
    if (set.includes(id)) setter(set.filter(x => x !== id));
    else if (set.length < 12) setter([...set, id]);
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/allstar/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eastIds, westIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const runEvent = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/allstar/run-event', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAllStar(data.allStar);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const eventDone = allStar && allStar.gameMVP;

  return (
    <div style={s.container} data-testid="allstar-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.header}>
        <h1 style={s.title}>⭐ All-Star Weekend</h1>
        <p style={s.subtitle}>2000s-style — vote your starters, then watch Saturday Night and Sunday's game</p>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {eventDone ? (
        <EventResults allStar={allStar} />
      ) : ballot.voted ? (
        <div style={s.center}>
          <p style={{ marginBottom: 16 }}>Ballots are in. Tip-off time!</p>
          <button onClick={runEvent} disabled={busy} style={s.primaryBtn}>Run All-Star Weekend</button>
        </div>
      ) : (
        <>
          <div style={s.voteHeader}>
            <span>Pick up to 12 East and 12 West starters</span>
            <button onClick={submit} disabled={busy || (eastIds.length === 0 && westIds.length === 0)} style={s.primaryBtn}>
              Submit Ballot ({eastIds.length}E / {westIds.length}W)
            </button>
          </div>
          <div style={s.confs}>
            <Conference name="East" players={ballot.east} selected={eastIds} onToggle={(id) => toggle(id, 'east')} />
            <Conference name="West" players={ballot.west} selected={westIds} onToggle={(id) => toggle(id, 'west')} />
          </div>
        </>
      )}
    </div>
  );
}

function Conference({ name, players, selected, onToggle }) {
  return (
    <div style={s.confColumn}>
      <h3 style={s.confTitle}>{name}</h3>
      {players.map(p => {
        const checked = selected.includes(p.playerId);
        return (
          <div key={p.playerId} onClick={() => onToggle(p.playerId)} style={{ ...s.playerRow, ...(checked ? s.checkedRow : {}) }}>
            <input type="checkbox" checked={checked} readOnly style={{ marginRight: 8 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{p.firstName} {p.lastName}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.position} · {p.teamName}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12 }}>
              <div>OVR <strong style={{ color: '#facc15' }}>{p.rating}</strong></div>
              <div style={{ color: '#94a3b8' }}>POP {p.popularity}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventResults({ allStar }) {
  const eastWon = allStar.eastScore > allStar.westScore;
  return (
    <div style={s.results}>
      <div style={s.scoreboard}>
        <div style={{ ...s.scoreSide, color: eastWon ? '#facc15' : '#fff' }}>
          <div style={{ fontSize: 14 }}>EAST</div>
          <div style={{ fontSize: 48, fontWeight: 700 }}>{allStar.eastScore}</div>
        </div>
        <div style={{ fontSize: 24, color: '#64748b' }}>vs</div>
        <div style={{ ...s.scoreSide, color: !eastWon ? '#facc15' : '#fff' }}>
          <div style={{ fontSize: 14 }}>WEST</div>
          <div style={{ fontSize: 48, fontWeight: 700 }}>{allStar.westScore}</div>
        </div>
      </div>
      <div style={s.mvpCard}>🏆 MVP: <strong style={{ color: '#facc15' }}>{allStar.gameMVP}</strong></div>
      <div style={s.contestGrid}>
        <Contest name="3-Point Contest" winner={allStar.threePointWinner} icon="🎯" />
        <Contest name="Slam Dunk Contest" winner={allStar.dunkWinner} icon="🏀" />
        <Contest name="Skills Challenge" winner={allStar.skillsWinner} icon="⚡" />
      </div>
    </div>
  );
}

function Contest({ name, winner, icon }) {
  return (
    <div style={s.contestCard}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>{name}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#facc15', marginTop: 4 }}>{winner}</div>
    </div>
  );
}

const s = {
  container: { padding: 24, color: '#fff', minHeight: '100vh', background: '#0f172a' },
  backBtn: { background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 16 },
  header: { textAlign: 'center', marginBottom: 24 },
  title: { fontSize: 28, marginBottom: 4 },
  subtitle: { color: '#94a3b8', fontSize: 14 },
  error: { padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 16, textAlign: 'center' },
  center: { textAlign: 'center', padding: 60, background: '#1e293b', borderRadius: 12 },
  primaryBtn: { padding: '10px 20px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 },
  voteHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: 12, background: '#1e293b', borderRadius: 8 },
  confs: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  confColumn: { background: '#1e293b', padding: 12, borderRadius: 8 },
  confTitle: { textAlign: 'center', color: '#facc15', borderBottom: '1px solid #334155', paddingBottom: 8 },
  playerRow: { display: 'flex', alignItems: 'center', padding: 8, borderBottom: '1px solid #1e293b', cursor: 'pointer' },
  checkedRow: { background: '#0c4a6e' },
  results: { maxWidth: 800, margin: '0 auto' },
  scoreboard: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: 24, background: '#1e293b', borderRadius: 12, marginBottom: 16 },
  scoreSide: { textAlign: 'center' },
  mvpCard: { textAlign: 'center', padding: 16, background: 'linear-gradient(90deg, #1e293b, #334155, #1e293b)', borderRadius: 8, fontSize: 18, marginBottom: 16 },
  contestGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  contestCard: { textAlign: 'center', padding: 16, background: '#1e293b', borderRadius: 8 },
};
