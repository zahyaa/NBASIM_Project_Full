import React, { useState, useEffect, useRef, useMemo } from 'react';

/* ────────────────────────────────────────────
   ESPN-Style GameCast
   - Scoreboard with logos + quarter scores
   - Game Leaders
   - Win Probability graph
   - Shot Chart (half-court)
   - Team Stats comparison
   - Color-coded play-by-play
   ──────────────────────────────────────────── */

const PLAY_COLORS = {
  score: '#22c55e', miss: '#64748b', turnover: '#ef4444', block: '#a855f7',
  steal: '#f59e0b', foul: '#f97316', info: '#3b82f6', default: '#94a3b8',
};

function getPlayColor(type) { return PLAY_COLORS[type] || PLAY_COLORS.default; }

// ─── MINI COMPONENTS ──────────────────────

function Scoreboard({ teamA, teamB, logoA, logoB, scoreA, scoreB, quarter, clock, quarterScoresA, quarterScoresB }) {
  const diff = scoreA - scoreB;
  return (
    <div style={S.scoreboard}>
      <div style={S.sbTeam}>
        {logoA && <img src={logoA} alt="" style={S.sbLogo} onError={e => e.target.style.display = 'none'} />}
        <div style={{ ...S.sbName, color: diff > 0 ? '#22c55e' : '#e2e8f0' }}>{teamA}</div>
        <div style={{ ...S.sbScore, color: diff > 0 ? '#22c55e' : '#fff' }}>{scoreA}</div>
      </div>
      <div style={S.sbCenter}>
        <div style={S.sbPeriod}>{quarter || ''}</div>
        <div style={S.sbClock}>{clock || ''}</div>
        {quarterScoresA && (
          <div style={S.qScores}>
            <div style={S.qRow}>{quarterScoresA.map((s, i) => <span key={i} style={S.qCell}>{s}</span>)}</div>
            <div style={S.qRow}>{quarterScoresB.map((s, i) => <span key={i} style={S.qCell}>{s}</span>)}</div>
          </div>
        )}
      </div>
      <div style={S.sbTeam}>
        {logoB && <img src={logoB} alt="" style={S.sbLogo} onError={e => e.target.style.display = 'none'} />}
        <div style={{ ...S.sbName, color: diff < 0 ? '#22c55e' : '#e2e8f0' }}>{teamB}</div>
        <div style={{ ...S.sbScore, color: diff < 0 ? '#22c55e' : '#fff' }}>{scoreB}</div>
      </div>
    </div>
  );
}

function GameLeaders({ leaders }) {
  if (!leaders) return null;
  const cats = [
    { key: 'points', label: 'Points', stat: 'pts' },
    { key: 'rebounds', label: 'Rebounds', stat: 'reb' },
    { key: 'assists', label: 'Assists', stat: 'ast' },
  ];
  return (
    <div style={S.leadersPanel}>
      <h3 style={S.panelTitle}>GAME LEADERS</h3>
      <div style={S.leadersGrid}>
        {cats.map(c => (
          <div key={c.key} style={S.leaderRow}>
            <div style={S.leaderPlayer}>
              <span style={S.leaderName}>{leaders[c.key]?.A?.name || '—'}</span>
              <span style={S.leaderStat}>{leaders[c.key]?.A?.[c.stat] || 0}</span>
            </div>
            <div style={S.leaderLabel}>{c.label}</div>
            <div style={S.leaderPlayer}>
              <span style={S.leaderStat}>{leaders[c.key]?.B?.[c.stat] || 0}</span>
              <span style={S.leaderName}>{leaders[c.key]?.B?.name || '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WinProbChart({ data, teamA, teamB }) {
  if (!data || data.length < 2) return null;
  const w = 500, h = 120, pad = 30;
  const points = data.map(d => ({
    x: pad + (d.time / 100) * (w - 2 * pad),
    y: pad + ((100 - d.probA) / 100) * (h - 2 * pad),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <div style={S.chartPanel}>
      <h3 style={S.panelTitle}>WIN PROBABILITY</h3>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="#334155" strokeDasharray="4" />
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" />
        <text x={pad} y={14} fill="#3b82f6" fontSize="10" fontWeight="600">{teamA}</text>
        <text x={w - pad} y={14} fill="#ef4444" fontSize="10" fontWeight="600" textAnchor="end">{teamB}</text>
        <text x={pad - 4} y={pad + 4} fill="#64748b" fontSize="8" textAnchor="end">100%</text>
        <text x={pad - 4} y={h - pad + 4} fill="#64748b" fontSize="8" textAnchor="end">0%</text>
        {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
          <text key={q} x={pad + ((i + 1) * 25 / 100) * (w - 2 * pad)} y={h - 4} fill="#64748b" fontSize="8" textAnchor="middle">{q}</text>
        ))}
      </svg>
    </div>
  );
}

function ShotChart({ shots, teamA, teamB }) {
  if (!shots || shots.length === 0) return null;
  return (
    <div style={S.chartPanel}>
      <h3 style={S.panelTitle}>SHOT CHART</h3>
      <svg viewBox="0 0 500 300" style={{ width: '100%', height: 'auto', background: '#1a2332', borderRadius: 8 }}>
        {/* Court lines */}
        <rect x="100" y="0" width="300" height="280" fill="none" stroke="#334155" strokeWidth="1" />
        <rect x="175" y="180" width="150" height="100" fill="none" stroke="#334155" strokeWidth="1" />
        <circle cx="250" cy="180" r="60" fill="none" stroke="#334155" strokeWidth="1" />
        <circle cx="250" cy="270" r="8" fill="none" stroke="#f97316" strokeWidth="2" />
        <path d="M 100 280 Q 100 60 250 60 Q 400 60 400 280" fill="none" stroke="#334155" strokeWidth="1" />
        {shots.map((s, i) => {
          const isA = s.team === teamA;
          const sx = Math.max(5, Math.min(495, s.x));
          const sy = Math.max(5, Math.min(295, (s.y - 200) * 300 / 270));
          return (
            <circle key={i} cx={sx} cy={sy} r={s.made ? 4 : 3}
              fill={s.made ? (isA ? '#3b82f6' : '#ef4444') : 'none'}
              stroke={s.made ? 'none' : (isA ? '#3b82f680' : '#ef444480')}
              strokeWidth={s.made ? 0 : 1.5} opacity={0.8} />
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 6 }}>
        <span style={{ color: '#3b82f6', fontSize: 11 }}>● {teamA}</span>
        <span style={{ color: '#ef4444', fontSize: 11 }}>● {teamB}</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>○ Missed</span>
      </div>
    </div>
  );
}

function TeamStats({ statsA, statsB, teamA, teamB }) {
  if (!statsA) return null;
  const pct = (m, a) => a > 0 ? ((m / a) * 100).toFixed(1) : '0.0';
  const rows = [
    { label: 'Field Goal %', a: `${pct(statsA.fgm, statsA.fga)}% (${statsA.fgm}-${statsA.fga})`, b: `${pct(statsB.fgm, statsB.fga)}% (${statsB.fgm}-${statsB.fga})`, numA: +pct(statsA.fgm, statsA.fga), numB: +pct(statsB.fgm, statsB.fga) },
    { label: 'Three Point %', a: `${pct(statsA.fg3m, statsA.fg3a)}% (${statsA.fg3m}-${statsA.fg3a})`, b: `${pct(statsB.fg3m, statsB.fg3a)}% (${statsB.fg3m}-${statsB.fg3a})`, numA: +pct(statsA.fg3m, statsA.fg3a), numB: +pct(statsB.fg3m, statsB.fg3a) },
    { label: 'Free Throw %', a: `${pct(statsA.ftm, statsA.fta)}% (${statsA.ftm}-${statsA.fta})`, b: `${pct(statsB.ftm, statsB.fta)}% (${statsB.ftm}-${statsB.fta})`, numA: +pct(statsA.ftm, statsA.fta), numB: +pct(statsB.ftm, statsB.fta) },
    { label: 'Rebounds', a: statsA.reb, b: statsB.reb, numA: statsA.reb, numB: statsB.reb },
    { label: 'Assists', a: statsA.ast, b: statsB.ast, numA: statsA.ast, numB: statsB.ast },
    { label: 'Steals', a: statsA.stl, b: statsB.stl, numA: statsA.stl, numB: statsB.stl },
    { label: 'Blocks', a: statsA.blk, b: statsB.blk, numA: statsA.blk, numB: statsB.blk },
    { label: 'Turnovers', a: statsA.turnover, b: statsB.turnover, numA: statsB.turnover, numB: statsA.turnover },
    { label: 'Largest Lead', a: statsA.largestLead, b: statsB.largestLead, numA: statsA.largestLead, numB: statsB.largestLead },
  ];
  return (
    <div style={S.statsPanel}>
      <h3 style={S.panelTitle}>TEAM STATS</h3>
      <div style={S.statsHeader}>
        <span style={{ color: '#3b82f6', fontWeight: 700 }}>{teamA}</span>
        <span></span>
        <span style={{ color: '#ef4444', fontWeight: 700 }}>{teamB}</span>
      </div>
      {rows.map(r => (
        <div key={r.label} style={S.statsRow}>
          <span style={{ ...S.statsVal, color: r.numA >= r.numB ? '#e2e8f0' : '#64748b' }}>{r.a}</span>
          <span style={S.statsLabel}>{r.label}</span>
          <span style={{ ...S.statsVal, color: r.numB >= r.numA ? '#e2e8f0' : '#64748b', textAlign: 'right' }}>{r.b}</span>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────

export default function GameCast({ plays, teamA, teamB, scoreA, scoreB, onFinished,
  logoA, logoB, teamStatsA, teamStatsB, shots, winProbability, leaders }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(800);
  const [activeTab, setActiveTab] = useState('playbyplay');
  const timerRef = useRef(null);
  const listRef = useRef(null);

  const visiblePlays = plays.slice(0, currentIndex + 1);
  const currentPlay = plays[currentIndex];
  const finished = currentIndex >= plays.length - 1;

  const quarterScores = useMemo(() => {
    if (!teamStatsA?.quarterScores) return null;
    const qA = [], qB = [];
    for (let i = 0; i < teamStatsA.quarterScores.length; i++) {
      const qNum = i < 4 ? i + 1 : `OT${i - 3}`;
      const qPlays = plays.filter(p => p.quarter === qNum || p.quarter === `${qNum}`);
      if (qPlays.length > 0 && plays.indexOf(qPlays[0]) <= currentIndex) {
        qA.push(teamStatsA.quarterScores[i]);
        qB.push(teamStatsB.quarterScores[i]);
      }
    }
    return { a: qA, b: qB };
  }, [currentIndex, plays, teamStatsA, teamStatsB]);

  useEffect(() => {
    if (!isPlaying || finished) {
      clearInterval(timerRef.current);
      if (finished && onFinished) onFinished();
      return;
    }
    timerRef.current = setInterval(() => {
      setCurrentIndex(i => {
        if (i >= plays.length - 1) { clearInterval(timerRef.current); return i; }
        return i + 1;
      });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [isPlaying, speed, finished, plays.length, onFinished]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [currentIndex]);

  const fastForward = () => { setCurrentIndex(plays.length - 1); setIsPlaying(false); };
  const progress = plays.length > 0 ? ((currentIndex + 1) / plays.length) * 100 : 0;

  const tabs = [
    { key: 'playbyplay', label: 'Play-by-Play' },
    { key: 'stats', label: 'Team Stats' },
    { key: 'shotchart', label: 'Shot Chart' },
    { key: 'winprob', label: 'Win Prob' },
    { key: 'leaders', label: 'Leaders' },
  ];

  return (
    <div style={S.container}>
      <Scoreboard
        teamA={teamA} teamB={teamB} logoA={logoA} logoB={logoB}
        scoreA={currentPlay?.scoreA ?? 0} scoreB={currentPlay?.scoreB ?? 0}
        quarter={currentPlay?.quarter ? (typeof currentPlay.quarter === 'number' ? `Q${currentPlay.quarter}` : currentPlay.quarter) : ''}
        clock={currentPlay?.clock || ''}
        quarterScoresA={finished ? quarterScores?.a : null}
        quarterScoresB={finished ? quarterScores?.b : null}
      />

      <div style={S.progressBar}><div style={{ ...S.progressFill, width: `${progress}%` }} /></div>

      {currentPlay && (
        <div style={{ ...S.currentPlay, borderColor: getPlayColor(currentPlay.type), animation: 'fadeSlideIn 0.4s ease-out' }}>
          <span style={{ ...S.cpTeam, color: getPlayColor(currentPlay.type) }}>{currentPlay.team}</span>
          <span style={S.cpText}>{currentPlay.text}</span>
        </div>
      )}

      <div style={S.controls}>
        <button onClick={() => setIsPlaying(!isPlaying)} style={S.ctrlBtn} disabled={finished}>
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <div style={S.speedGroup}>
          {[{ v: 1200, l: 'Slow' }, { v: 800, l: '1x' }, { v: 400, l: '2x' }, { v: 100, l: '4x' }].map(s => (
            <button key={s.v} onClick={() => setSpeed(s.v)}
              style={speed === s.v ? { ...S.speedBtn, ...S.speedActive } : S.speedBtn}>{s.l}</button>
          ))}
        </div>
        <button onClick={fastForward} style={S.ctrlBtn} disabled={finished}>Skip ⏭</button>
      </div>

      <div style={S.tabBar}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={activeTab === t.key ? { ...S.tab, ...S.tabActive } : S.tab}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'playbyplay' && (
        <div ref={listRef} style={S.playLog}>
          {visiblePlays.map((play, idx) => (
            <div key={idx} style={{
              ...S.playEntry,
              borderLeft: `3px solid ${getPlayColor(play.type)}`,
              background: idx === currentIndex ? '#1e3a5f' : 'transparent',
            }}>
              <span style={S.playClock}>{typeof play.quarter === 'number' ? `Q${play.quarter}` : play.quarter} {play.clock}</span>
              <span style={{ ...S.playTeam, color: getPlayColor(play.type) }}>{play.team}</span>
              <span>{play.text}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'stats' && <TeamStats statsA={teamStatsA} statsB={teamStatsB} teamA={teamA} teamB={teamB} />}
      {activeTab === 'shotchart' && <ShotChart shots={shots} teamA={teamA} teamB={teamB} />}
      {activeTab === 'winprob' && <WinProbChart data={winProbability} teamA={teamA} teamB={teamB} />}
      {activeTab === 'leaders' && <GameLeaders leaders={leaders} />}

      {finished && (
        <div style={S.finalScore}>
          <h2 style={{ color: '#f97316', margin: '0 0 8px' }}>Final Score</h2>
          <div style={S.finalLine}>
            <span style={{ color: scoreA > scoreB ? '#22c55e' : '#e2e8f0' }}>{teamA} {scoreA}</span>
            <span style={{ color: '#64748b', margin: '0 12px' }}>—</span>
            <span style={{ color: scoreB > scoreA ? '#22c55e' : '#e2e8f0' }}>{scoreB} {teamB}</span>
          </div>
          <div style={S.winnerLine}>{scoreA > scoreB ? teamA : teamB} wins!</div>
        </div>
      )}

      <style>{`@keyframes fadeSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

const S = {
  container: { background: '#0f172a', borderRadius: 12, padding: 20, maxWidth: 860, margin: '0 auto' },
  scoreboard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: 12, padding: '20px 24px', border: '1px solid #334155', marginBottom: 4 },
  sbTeam: { textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  sbLogo: { width: 48, height: 48, objectFit: 'contain' },
  sbName: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  sbScore: { fontSize: 48, fontWeight: 800, lineHeight: 1 },
  sbCenter: { textAlign: 'center', minWidth: 100 },
  sbPeriod: { color: '#f97316', fontSize: 18, fontWeight: 700 },
  sbClock: { color: '#e2e8f0', fontSize: 22, fontWeight: 600 },
  qScores: { marginTop: 6 },
  qRow: { display: 'flex', gap: 4, justifyContent: 'center' },
  qCell: { background: '#0f172a', color: '#94a3b8', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600 },
  progressBar: { height: 3, borderRadius: 2, background: '#1e293b', marginBottom: 10, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #f97316, #f59e0b)', transition: 'width 0.3s ease', borderRadius: 2 },
  currentPlay: { background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 8, padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 },
  cpTeam: { fontWeight: 700, fontSize: 13, minWidth: 60 },
  cpText: { color: '#e2e8f0', fontSize: 14 },
  controls: { display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  ctrlBtn: { padding: '8px 18px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  speedGroup: { display: 'flex', gap: 4 },
  speedBtn: { padding: '6px 12px', borderRadius: 4, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 11 },
  speedActive: { border: '1px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' },
  tabBar: { display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 4 },
  tab: { padding: '8px 14px', borderRadius: '6px 6px 0 0', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  tabActive: { color: '#f97316', borderBottom: '2px solid #f97316' },
  playLog: { maxHeight: 320, overflowY: 'auto', background: '#0f172a', borderRadius: 8, padding: 8 },
  playEntry: { padding: '6px 10px', borderBottom: '1px solid #1e293b', fontSize: 13, color: '#cbd5e1', display: 'flex', gap: 10, borderRadius: 4, marginBottom: 2 },
  playClock: { color: '#64748b', minWidth: 70, fontSize: 12 },
  playTeam: { minWidth: 50, fontWeight: 600, fontSize: 12 },
  finalScore: { textAlign: 'center', padding: 24, marginTop: 12, background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: 12, border: '1px solid #334155' },
  finalLine: { fontSize: 28, fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center' },
  winnerLine: { color: '#22c55e', fontSize: 18, fontWeight: 700, marginTop: 8 },
  panelTitle: { color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' },
  leadersPanel: { background: '#1e293b', borderRadius: 10, padding: 16 },
  leadersGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  leaderRow: { display: 'flex', alignItems: 'center', gap: 8 },
  leaderPlayer: { flex: 1, display: 'flex', alignItems: 'center', gap: 6 },
  leaderName: { color: '#e2e8f0', fontSize: 13, fontWeight: 600 },
  leaderStat: { color: '#f97316', fontSize: 18, fontWeight: 800 },
  leaderLabel: { color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', minWidth: 70, textAlign: 'center' },
  statsPanel: { background: '#1e293b', borderRadius: 10, padding: 16 },
  statsHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 },
  statsRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155', fontSize: 13 },
  statsVal: { flex: 1, fontSize: 13 },
  statsLabel: { flex: 1, textAlign: 'center', color: '#94a3b8', fontSize: 12 },
  chartPanel: { background: '#1e293b', borderRadius: 10, padding: 16 },
};
