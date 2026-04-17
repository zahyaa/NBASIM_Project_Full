import React, { useState, useEffect, useRef } from 'react';

/**
 * Animated play-by-play game cast.
 * Receives the full `plays` array from the simulation result
 * and streams them with animation.
 */
export default function GameCast({ plays, teamA, teamB, scoreA, scoreB, onFinished }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(800); // ms per play
  const timerRef = useRef(null);
  const listRef = useRef(null);

  const visiblePlays = plays.slice(0, currentIndex + 1);
  const currentPlay = plays[currentIndex];
  const finished = currentIndex >= plays.length - 1;

  // Auto-advance plays
  useEffect(() => {
    if (!isPlaying || finished) {
      clearInterval(timerRef.current);
      if (finished && onFinished) onFinished();
      return;
    }
    timerRef.current = setInterval(() => {
      setCurrentIndex(i => {
        if (i >= plays.length - 1) {
          clearInterval(timerRef.current);
          return i;
        }
        return i + 1;
      });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [isPlaying, speed, finished, plays.length, onFinished]);

  // Auto-scroll to latest play
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [currentIndex]);

  const fastForward = () => {
    setCurrentIndex(plays.length - 1);
    setIsPlaying(false);
  };

  return (
    <div style={styles.container}>
      {/* Scoreboard */}
      <div style={styles.scoreboard}>
        <div style={styles.teamScore}>
          <div style={styles.teamLabel}>{teamA}</div>
          <div style={styles.score}>{currentPlay?.scoreA ?? 0}</div>
        </div>
        <div style={styles.periodBadge}>
          {currentPlay?.quarter ? `Q${currentPlay.quarter}` : ''}
          <div style={styles.clock}>{currentPlay?.clock || '12:00'}</div>
        </div>
        <div style={styles.teamScore}>
          <div style={styles.teamLabel}>{teamB}</div>
          <div style={styles.score}>{currentPlay?.scoreB ?? 0}</div>
        </div>
      </div>

      {/* Current Play Highlight */}
      {currentPlay && (
        <div style={{
          ...styles.currentPlay,
          animation: 'fadeSlideIn 0.4s ease-out',
        }}>
          <span style={styles.playTeam}>{currentPlay.team}</span>
          <span style={styles.playText}>{currentPlay.text}</span>
        </div>
      )}

      {/* Controls */}
      <div style={styles.controls}>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          style={styles.controlBtn}
          disabled={finished}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={styles.speedSelect}
        >
          <option value={1200}>Slow</option>
          <option value={800}>Normal</option>
          <option value={400}>Fast</option>
          <option value={100}>Turbo</option>
        </select>
        <button onClick={fastForward} style={styles.controlBtn} disabled={finished}>
          Skip to End
        </button>
      </div>

      {/* Play-by-Play Log */}
      <div ref={listRef} style={styles.playLog}>
        {visiblePlays.map((play, idx) => (
          <div
            key={idx}
            style={{
              ...styles.playEntry,
              background: idx === currentIndex ? '#1e3a5f' : 'transparent',
              animation: idx === currentIndex ? 'fadeSlideIn 0.3s ease-out' : 'none',
            }}
          >
            <span style={styles.playClock}>
              {typeof play.quarter === 'string' ? play.quarter : `Q${play.quarter}`} {play.clock}
            </span>
            <span style={styles.playLogTeam}>{play.team}</span>
            <span>{play.text}</span>
          </div>
        ))}
      </div>

      {/* Final Score */}
      {finished && (
        <div style={styles.finalScore}>
          <h2 style={{ color: '#f97316', margin: '0 0 8px' }}>Final Score</h2>
          <div style={styles.finalLine}>
            {teamA} <strong>{scoreA}</strong> — <strong>{scoreB}</strong> {teamB}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    background: '#0f172a',
    borderRadius: 12,
    padding: 20,
    maxWidth: 800,
    margin: '0 auto',
  },
  scoreboard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#1e293b',
    borderRadius: 12,
    padding: '16px 32px',
    marginBottom: 16,
  },
  teamScore: { textAlign: 'center', flex: 1 },
  teamLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 4, fontWeight: 600 },
  score: { color: '#fff', fontSize: 48, fontWeight: 800 },
  periodBadge: {
    color: '#f97316',
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
    minWidth: 80,
  },
  clock: { color: '#e2e8f0', fontSize: 22, fontWeight: 600 },
  currentPlay: {
    background: '#1e3a5f',
    border: '1px solid #3b82f6',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 12,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    minHeight: 48,
  },
  playTeam: {
    color: '#f97316',
    fontWeight: 700,
    fontSize: 13,
    minWidth: 60,
  },
  playText: { color: '#e2e8f0', fontSize: 14 },
  controls: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 12,
  },
  controlBtn: {
    padding: '8px 18px',
    borderRadius: 6,
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  speedSelect: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#e2e8f0',
    fontSize: 13,
  },
  playLog: {
    maxHeight: 320,
    overflowY: 'auto',
    background: '#0f172a',
    borderRadius: 8,
    padding: 8,
  },
  playEntry: {
    padding: '6px 10px',
    borderBottom: '1px solid #1e293b',
    fontSize: 13,
    color: '#cbd5e1',
    display: 'flex',
    gap: 10,
    borderRadius: 4,
  },
  playClock: { color: '#64748b', minWidth: 70, fontSize: 12 },
  playLogTeam: { color: '#f97316', minWidth: 50, fontWeight: 600, fontSize: 12 },
  finalScore: {
    textAlign: 'center',
    padding: 20,
    marginTop: 12,
    background: '#1e293b',
    borderRadius: 12,
  },
  finalLine: { color: '#e2e8f0', fontSize: 24, fontWeight: 700 },
};
