import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function BlacktopPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [teamSize, setTeamSize] = useState(3);
  const [targetScore, setTargetScore] = useState(21);
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [resultsA, setResultsA] = useState([]);
  const [resultsB, setResultsB] = useState([]);
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
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

  const addPlayer = (player, team, setTeam) => {
    if (team.length >= teamSize) return;
    if (team.some(p => p.id === player.id)) return;
    setTeam([...team, player]);
  };

  const removePlayer = (id, team, setTeam) => {
    setTeam(team.filter(p => p.id !== id));
  };

  const handleSimulate = async () => {
    if (teamA.length !== teamSize || teamB.length !== teamSize) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/simulate/blacktop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teamA, teamB, targetScore }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSimResult(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const TeamPicker = ({ label, search, setSearch, results, setResults, team, setTeam, color }) => (
    <div style={s.pickerPanel}>
      <h3 style={{ ...s.pickerTitle, color }}>{label} ({team.length}/{teamSize})</h3>
      <div style={s.roster}>
        {team.map(p => (
          <div key={p.id} style={s.rosterItem}>
            <span style={s.rosterName}>{p.firstName} {p.lastName}</span>
            <span style={{ ...s.rosterRating, background: color }}>{p.rating}</span>
            <button onClick={() => removePlayer(p.id, team, setTeam)} style={s.removeBtn}>✕</button>
          </div>
        ))}
      </div>
      {team.length < teamSize && (
        <>
          <div style={s.searchRow}>
            <input type="text" placeholder="Search player..." value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchPlayers(search, setResults)} style={s.input} />
            <button onClick={() => searchPlayers(search, setResults)} style={{ ...s.searchBtn, background: color }}>Go</button>
          </div>
          <div style={s.resultsList}>
            {results.filter(p => !team.some(t => t.id === p.id)).map(p => (
              <button key={p.id} onClick={() => addPlayer(p, team, setTeam)} style={s.resultItem}>
                <span style={s.resultName}>{p.firstName} {p.lastName}</span>
                <span style={s.resultPos}>{p.position}</span>
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
          <h1 style={s.resultTitle}>Blacktop {teamSize}v{teamSize}</h1>
          <div style={s.scoreboard}>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>Your Team</div>
              <div style={s.scoreNum}>{simResult.scoreA}</div>
            </div>
            <div style={s.vsText}>VS</div>
            <div style={s.scoreTeam}>
              <div style={s.scoreLabel}>CPU Team</div>
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
            <button onClick={() => { setSimResult(null); setTeamA([]); setTeamB([]); }} style={s.playAgainBtn}>Play Again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>Blacktop</h1>
      <p style={s.subtitle}>Half-court streetball. Pick your squad and run it.</p>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.config}>
        <div style={s.configItem}>
          <label style={s.configLabel}>Team Size</label>
          <div style={s.optionGroup}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => { setTeamSize(n); setTeamA(a => a.slice(0, n)); setTeamB(b => b.slice(0, n)); }}
                style={teamSize === n ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{n}v{n}</button>
            ))}
          </div>
        </div>
        <div style={s.configItem}>
          <label style={s.configLabel}>Target Score</label>
          <div style={s.optionGroup}>
            {[11, 15, 21].map(n => (
              <button key={n} onClick={() => setTargetScore(n)}
                style={targetScore === n ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{n}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={s.pickersRow}>
        <TeamPicker label="Your Team" search={searchA} setSearch={setSearchA}
          results={resultsA} setResults={setResultsA} team={teamA} setTeam={setTeamA} color="#3b82f6" />
        <div style={s.vsCenter}>VS</div>
        <TeamPicker label="CPU Team" search={searchB} setSearch={setSearchB}
          results={resultsB} setResults={setResultsB} team={teamB} setTeam={setTeamB} color="#ef4444" />
      </div>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={handleSimulate}
          disabled={teamA.length !== teamSize || teamB.length !== teamSize || loading}
          style={teamA.length !== teamSize || teamB.length !== teamSize ? { ...s.simBtn, opacity: 0.5 } : s.simBtn}>
          {loading ? 'Simulating...' : `Start ${teamSize}v${teamSize}`}
        </button>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  title: { color: '#ef4444', fontSize: 36, textAlign: 'center', margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', textAlign: 'center', margin: '0 0 20px', fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  config: { display: 'flex', gap: 24, justifyContent: 'center', marginBottom: 24 },
  configItem: { textAlign: 'center' },
  configLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 },
  optionGroup: { display: 'flex', gap: 8 },
  optionBtn: { padding: '8px 14px', borderRadius: 8, border: '2px solid #334155', background: '#0f172a', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  optionActive: { border: '2px solid #ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.1)' },
  pickersRow: { display: 'flex', gap: 24, maxWidth: 950, margin: '0 auto', alignItems: 'flex-start' },
  vsCenter: { color: '#f97316', fontSize: 28, fontWeight: 800, paddingTop: 40, minWidth: 50, textAlign: 'center' },
  pickerPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  pickerTitle: { fontSize: 16, margin: '0 0 10px', fontWeight: 700 },
  roster: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
  rosterItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#0f172a', borderRadius: 6 },
  rosterName: { flex: 1, fontWeight: 600, fontSize: 13 },
  rosterRating: { color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700, fontSize: 12 },
  removeBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  searchRow: { display: 'flex', gap: 6 },
  input: { flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13 },
  searchBtn: { padding: '8px 14px', borderRadius: 6, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  resultsList: { maxHeight: 200, overflowY: 'auto', marginTop: 8 },
  resultItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#e2e8f0', cursor: 'pointer', width: '100%', textAlign: 'left' },
  resultName: { flex: 1, fontWeight: 600, fontSize: 13 },
  resultPos: { color: '#64748b', fontSize: 11 },
  resultRating: { color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700, fontSize: 11 },
  simBtn: { padding: '14px 40px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 18 },
  // Results
  resultCard: { maxWidth: 700, margin: '0 auto', background: '#1e293b', borderRadius: 16, padding: 24 },
  resultTitle: { color: '#ef4444', textAlign: 'center', fontSize: 28, margin: '0 0 16px', fontWeight: 800 },
  scoreboard: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: 16 },
  scoreTeam: { textAlign: 'center' },
  scoreLabel: { color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 4 },
  scoreNum: { color: '#fff', fontSize: 48, fontWeight: 800 },
  vsText: { color: '#f97316', fontSize: 24, fontWeight: 800 },
  winnerText: { color: '#22c55e', textAlign: 'center', fontSize: 20, fontWeight: 700, marginBottom: 16 },
  playLog: { maxHeight: 350, overflowY: 'auto', background: '#0f172a', borderRadius: 8, padding: 8 },
  playEntry: { padding: '6px 10px', borderBottom: '1px solid #1e293b', fontSize: 13, color: '#cbd5e1', display: 'flex', gap: 10 },
  playScore: { color: '#64748b', minWidth: 50, fontSize: 12, fontWeight: 600 },
  playAgainBtn: { padding: '12px 32px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 },
};
