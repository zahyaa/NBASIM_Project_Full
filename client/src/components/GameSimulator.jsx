import React, { useEffect, useRef, useState } from 'react';
import TeamDisplay from './TeamDisplay';
import Controls from './Controls';
import SelectTeam from './SelectTeam';
import { usePlayers } from '../hooks/usePlayers';
import Quarter from './Quarter';
import GameHistory from './GameHistory';
import Roster from './Roster';
import TeamSelector from './TeamSelector';
import { useSocket } from '../hooks/useSocket';

export default function GameSimulator() {
  // State for team selection and season
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [season, setSeason] = useState(2025);

  const playersA = usePlayers(teamAId, season);
  const playersB = usePlayers(teamBId, season);

  const [clock, setClock] = useState(720); // 12 min
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState({ teamA: 0, teamB: 0 });
  const [playLog, setPlayLog] = useState([]);
  const intervalRef = useRef(null);
  const socket = useSocket();

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
  }, [isRunning, clock]);

  useEffect(() => {
    if (!socket) return;

    const handleGameUpdate = (data) => {
      // Example: handle incoming game updates
      console.log('Game update received:', data);
      // You can update state here if needed
    };

    socket.on('gameUpdate', handleGameUpdate);

    return () => {
      socket.off('gameUpdate', handleGameUpdate);
    };
  }, [socket]);

  // Only allow simulation if both teams are selected
  const canSimulate = teamAId && teamBId;

  return (
    <div>
      <h1>NBA Simulation</h1>
      <div className="flex gap-8 mb-4">
        <div>
          <SelectTeam teamId={teamAId} setTeamId={setTeamAId} setSeason={setSeason} />
        </div>
        <div>
          <SelectTeam teamId={teamBId} setTeamId={setTeamBId} setSeason={setSeason} />
        </div>
      </div>
      {canSimulate && (
        <>
          {/* Render Quarter component */}
          <Quarter quarter={1} timeLeft={clock} />

          <div>Clock: {Math.floor(clock / 60)}:{String(clock % 60).padStart(2, '0')}</div>
          <div>Score: Team A {score.teamA} - Team B {score.teamB}</div>
          <TeamDisplay teamName="Team A" players={playersA} />
          <TeamDisplay teamName="Team B" players={playersB} />
          <Controls
            isRunning={isRunning}
            isPaused={isPaused}
            onStart={() => setIsRunning(true)}
            onStop={() => { setIsRunning(false); setClock(2880); }}
            onPause={() => setIsPaused(p => !p)}
            onFastForward={fastForwardGame}
          />
          <div>
            <h2>Play-by-Play</h2>
            <ul>{playLog.map((line, idx) => <li key={idx}>{line}</li>)}</ul>
          </div>
        </>
      )}
      {!canSimulate && <div>Please select both teams and season to start simulation.</div>}

      {/* Render unused components for demonstration */}
      <div style={{ marginTop: 40 }}>
        <h2>Other Components Demo</h2>
        <Quarter quarter={1} timeLeft={clock} />
        <GameHistory />
        <TeamSelector />
        <Roster />
      </div>
    </div>
  );
}
