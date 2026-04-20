import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function OneOnOnePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [resultsA, setResultsA] = useState([]);
  const [resultsB, setResultsB] = useState([]);
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchPlayers = async (query, setter) => {
    if (!query.trim()) return;
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setter(data.data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSimulate = async () => {
    if (!playerA || !playerB) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/simulate/1v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerA, playerB, targetScore: 21 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSimResult(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const PlayerPicker = ({ label, search, setSearch, results, setResults, selected, setSelected, color }) => (
    <div style={s.pickerPanel}>
      <h3 style={{ ...s.pickerTitle, color }}>{label}</h3>
      {selected ? (
        <div style={s.selectedCard}>
          <div style={{ ...s.selectedRating, background: color }}>{selected.rating}</div>
          <div>
            <div style={s.selectedName}>{selected.firstName} {selected.lastName}</div>
            <div style={s.selectedMeta}>{selected.position} | {selected.team}</div>
          </div>
          <button onClick={() => { setSelected(null); setResults([]); }} style={s.changeBtn}>Change</button>
        </div>
      ) : (
        <>
          <div style={s.searchRow}>
            <input type="text" placeholder="Search player..." value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchPlayers(search, setResults)} style={s.input} />
            <button onClick={() => searchPlayers(search, setResults)} style={{ ...s.searchBtn, background: color }}>Search</button>
          </div>
          <div style={s.resultsList}>
            {results.map(p => (
              <button key={p.id} onClick={() => setSelected(p)} style={s.resultItem}>
                <span style={s.resultName}>{p.firstName} {p.lastName}</span>
                <span style={s.resultMeta}>{p.position}</span>
                <span style={{ ...s.resultRating, background: color }}>{p.rating}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (simResult) {
    return (
      <div style={s.container}>
        <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
        <div style={s.resultCard}>
          <h1 style={s.resultTitle}>1v1 Final</h1>
          <div style={s.scoreboard}>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>{simResult.playerA}</div>
              <div style={s.scoreNum}>{simResult.scoreA}</div>
            </div>
            <div style={s.vs}>VS</div>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>{simResult.playerB}</div>
              <div style={s.scoreNum}>{simResult.scoreB}</div>
            </div>
          </div>
          <p style={s.winnerText}>{simResult.winner} wins!</p>
          <div style={s.playLog}>
            {simResult.plays.map((play, i) => (
              <div key={i} style={s.playEntry}>
                <span style={s.playScore}>{play.scoreA}-{play.scoreB}</span>
                <span>{play.text}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => { setSimResult(null); setPlayerA(null); setPlayerB(null); }} style={s.playAgainBtn}>Play Again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>One on One</h1>
      <p style={s.subtitle}>Pick your player and challenge the CPU. First to 21 wins.</p>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.pickersRow}>
        <PlayerPicker label="Your Player" search={searchA} setSearch={setSearchA}
          results={resultsA} setResults={setResultsA}
          selected={playerA} setSelected={setPlayerA} color="#3b82f6" />
        <div style={s.vsCenter}>VS</div>
        <PlayerPicker label="CPU Player" search={searchB} setSearch={setSearchB}
          results={resultsB} setResults={setResultsB}
          selected={playerB} setSelected={setPlayerB} color="#ef4444" />
      </div>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={handleSimulate} disabled={!playerA || !playerB || loading}
          style={!playerA || !playerB ? { ...s.simBtn, opacity: 0.5 } : s.simBtn}>
          {loading ? 'Simulating...' : 'Start Game'}
        </button>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  title: { color: '#3b82f6', fontSize: 36, textAlign: 'center', margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', textAlign: 'center', margin: '0 0 24px', fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  pickersRow: { display: 'flex', gap: 24, maxWidth: 900, margin: '0 auto', alignItems: 'flex-start' },
  vsCenter: { color: '#f97316', fontSize: 28, fontWeight: 800, paddingTop: 60, minWidth: 50, textAlign: 'center' },
  pickerPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  pickerTitle: { fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  searchRow: { display: 'flex', gap: 8 },
  input: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 },
  searchBtn: { padding: '10px 16px', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  resultsList: { maxHeight: 300, overflowY: 'auto', marginTop: 10 },
  resultItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#e2e8f0', cursor: 'pointer', width: '100%', textAlign: 'left' },
  resultName: { flex: 1, fontWeight: 600, fontSize: 14 },
  resultMeta: { color: '#64748b', fontSize: 12 },
  resultRating: { color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700, fontSize: 12 },
  selectedCard: { display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#0f172a', borderRadius: 8 },
  selectedRating: { color: '#fff', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 },
  selectedName: { fontWeight: 700, fontSize: 18 },
  selectedMeta: { color: '#94a3b8', fontSize: 13 },
  changeBtn: { marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: 'none', background: '#334155', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  simBtn: { padding: '14px 40px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 18 },
  // Results
  resultCard: { maxWidth: 700, margin: '0 auto', background: '#1e293b', borderRadius: 16, padding: 24 },
  resultTitle: { color: '#3b82f6', textAlign: 'center', fontSize: 28, margin: '0 0 16px', fontWeight: 800 },
  scoreboard: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: 16 },
  scoreTeam: { textAlign: 'center' },
  scoreLabel: { color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 4 },
  scoreNum: { color: '#fff', fontSize: 48, fontWeight: 800 },
  vs: { color: '#f97316', fontSize: 24, fontWeight: 800 },
  winnerText: { color: '#22c55e', textAlign: 'center', fontSize: 20, fontWeight: 700, marginBottom: 16 },
  playLog: { maxHeight: 350, overflowY: 'auto', background: '#0f172a', borderRadius: 8, padding: 8 },
  playEntry: { padding: '6px 10px', borderBottom: '1px solid #1e293b', fontSize: 13, color: '#cbd5e1', display: 'flex', gap: 10 },
  playScore: { color: '#64748b', minWidth: 50, fontSize: 12, fontWeight: 600 },
  playAgainBtn: { padding: '12px 32px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 },
};
