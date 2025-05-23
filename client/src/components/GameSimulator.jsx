import React, { useEffect, useRef, useState } from 'react';
import TeamDisplay from './TeamDisplay';
import Controls from './Controls';

export default function GameSimulator() {
  const [clock, setClock] = useState(2880); // 48 min
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState({ teamA: 0, teamB: 0 });
  const [timeouts, setTimeouts] = useState({ teamA: 6, teamB: 6 });
  const [playLog, setPlayLog] = useState([]);
  const intervalRef = useRef(null);

  function simulatePlay() {
    const chance = Math.random();
    if (chance < 0.05) {
      const team = Math.random() < 0.5 ? 'teamA' : 'teamB';
      const points = Math.random() < 0.7 ? 2 : 3;
      setScore(prev => ({ ...prev, [team]: prev[team] + points }));
      setPlayLog(prev => [...prev, `${team} scored ${points} points`]);
    }
  }

  function fastForwardGame() {
    clearInterval(intervalRef.current);
    while (clock > 0) {
      simulatePlay();
      setClock(c => c - 1);
    }
    setIsRunning(false);
  }

  function handleTimeout(team) {
    setTimeouts(prev => {
      if (prev[team] > 0) {
        setIsRunning(false);
        return { ...prev, [team]: prev[team] - 1 };
      }
      return prev;
    });
  }

  useEffect(() => {
    if (isRunning && clock > 0) {
      intervalRef.current = setInterval(() => {
        setClock(prev => prev - 1);
        simulatePlay();
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  return (
    <div>
      <h1>NBA Simulation</h1>
      <div>Clock: {Math.floor(clock / 60)}:{String(clock % 60).padStart(2, '0')}</div>
      <div>Score: Team A {score.teamA} - Team B {score.teamB}</div>
      <TeamDisplay teamName="Team A" />
      <TeamDisplay teamName="Team B" />
      <Controls
        isRunning={isRunning}
        isPaused={isPaused}
        onStart={() => setIsRunning(true)}
        onStop={() => { setIsRunning(false); setClock(2880); }}
        onPause={() => setIsPaused(p => !p)}
        onTimeout={handleTimeout}
        onFastForward={fastForwardGame}
      />
      <div>
        <h2>Play-by-Play</h2>
        <ul>{playLog.map((line, idx) => <li key={idx}>{line}</li>)}</ul>
      </div>
    </div>
  );
}
