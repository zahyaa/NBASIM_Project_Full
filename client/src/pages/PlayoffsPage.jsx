// Playoffs Page — locked until the regular season is complete.
// Bracket display fuses ESPN/NBA visual style: 4-column rounds (First Round
// → Conf Semis → Conf Finals → NBA Finals) with the Finals dead-center.
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function PlayoffsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ locked: true, started: false, completed: false, rounds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/playoffs/state', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState(data);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const action = async (path) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/playoffs/${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  if (state.locked) {
    return (
      <div style={s.container} data-testid="playoffs-locked">
        <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
        <h1 style={s.title}>🏀 Playoffs</h1>
        <div style={s.locked}>
          <p>Playoffs are locked until the regular season is complete.</p>
          <p>Finish all 82 games (or use Sim Season) to enter the bracket.</p>
          <button onClick={() => navigate('/standings')} style={s.primaryBtn}>Go to Standings</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container} data-testid="playoffs-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.header}>
        <h1 style={s.title}>🏀 NBA Playoffs — Season {user?.seasonNumber}</h1>
        {state.completed && state.champion && (
          <div style={s.championBanner}>
            🏆 Champion: <strong>{state.champion}</strong> over {state.runnerUp}
          </div>
        )}
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.controls}>
        {!state.started && <button style={s.primaryBtn} disabled={busy} onClick={() => action('start')}>Start Playoffs</button>}
        {state.started && !state.completed && (
          <>
            <button style={s.primaryBtn} disabled={busy} onClick={() => action('play-next')}>Play Next Series</button>
            <button style={s.secondaryBtn} disabled={busy} onClick={() => action('simulate-all')}>Simulate to Champion</button>
          </>
        )}
      </div>

      {state.started && (
        <div style={s.bracket}>
          {state.rounds.map((round, idx) => (
            <div key={idx} style={s.column}>
              <h3 style={s.roundTitle}>{round.name}</h3>
              {round.series.length === 0 && <div style={s.placeholder}>TBD</div>}
              {round.series.map((sr, i) => <SeriesCard key={i} series={sr} userTeam={user?.team?.name} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeriesCard({ series, userTeam }) {
  const isUserSeries = series.teamA?.name === userTeam || series.teamB?.name === userTeam;
  return (
    <div style={{ ...s.seriesCard, ...(isUserSeries ? s.userSeries : {}), ...(series.winner ? s.doneSeries : {}) }} data-testid="po-series">
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{series.conference}</div>
      <Row team={series.teamA} wins={series.winsA} winner={series.winner} userTeam={userTeam} />
      <Row team={series.teamB} wins={series.winsB} winner={series.winner} userTeam={userTeam} />
      {series.winner && <div style={s.winnerLine}>Winner: {series.winner}</div>}
    </div>
  );
}

function Row({ team, wins, winner, userTeam }) {
  if (!team) return <div style={{ color: '#475569', fontSize: 13 }}>TBD</div>;
  const won = winner === team.name;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: won ? 700 : 500, color: won ? '#facc15' : team.name === userTeam ? '#60a5fa' : '#e2e8f0' }}>
      <span>{team.seed ? `#${team.seed} ` : ''}{team.name}</span>
      <span>{wins}</span>
    </div>
  );
}

const s = {
  container: { padding: 24, color: '#fff', minHeight: '100vh', background: '#0f172a' },
  backBtn: { background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 16 },
  header: { textAlign: 'center', marginBottom: 24 },
  title: { fontSize: 28, marginBottom: 8 },
  championBanner: { padding: 12, background: 'linear-gradient(90deg, #facc15, #f97316)', color: '#0f172a', fontWeight: 700, borderRadius: 8 },
  locked: { textAlign: 'center', padding: 60, background: '#1e293b', borderRadius: 12 },
  controls: { display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 },
  primaryBtn: { padding: '10px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 },
  secondaryBtn: { padding: '10px 18px', background: '#334155', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  error: { padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 16, textAlign: 'center' },
  bracket: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start' },
  column: { display: 'flex', flexDirection: 'column', gap: 12 },
  roundTitle: { textAlign: 'center', color: '#fbbf24', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  placeholder: { textAlign: 'center', color: '#475569', padding: 12, background: '#1e293b', borderRadius: 8 },
  seriesCard: { background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155', fontSize: 13 },
  userSeries: { borderColor: '#60a5fa', background: '#0c4a6e' },
  doneSeries: { opacity: 0.85 },
  winnerLine: { marginTop: 6, fontSize: 11, color: '#10b981', fontWeight: 600 },
};
