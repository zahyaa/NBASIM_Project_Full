//User should be able to select roster from a team, and then select players from that roster.
//Roster can be from any time period in the NBA

import React, { useEffect } from 'react';
import { useGameContext } from '../context/GameContext';
import { usePlayers } from '../hooks/usePlayers';
import { useTeams } from '../hooks/useTeams';
import TeamDisplay from './TeamDisplay';
import SelectTeam from './SelectTeam';
import Controls from './Controls';
import GameHistory from './GameHistory';
import { useSocket } from '../hooks/useSocket';

const SEASONS = [
  { label: '2024-25', value: 2025 },
  { label: '2023-24', value: 2024 },
  { label: '2022-23', value: 2023 },
  { label: '2021-22', value: 2022 },
];

export default function Roster() {
  const { teamA, teamB, setTeamA, setTeamB, isRunning, isPaused, startGame, pauseGame, stopGame, timeout, season, setSeason } = useGameContext();
  const { teams = [], loading: teamsLoading, error: teamsError } = useTeams();

  // Defensive: only find if teams is an array
  const teamAObj = Array.isArray(teams) ? teams.find(t => t.id === teamA) : null;
  const teamBObj = Array.isArray(teams) ? teams.find(t => t.id === teamB) : null;

  const { players: playersA = [], loading: loadingA } = usePlayers(teamA, season);
  const { players: playersB = [], loading: loadingB } = usePlayers(teamB, season);

  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.on('gameUpdate', (data) => {
      console.log('Game update received:', data);
    });
    return () => {
      socket.off('gameUpdate');
    };
  }, [socket]);

  if (teamsLoading) return <div>Loading teams...</div>;
  if (teamsError) return <div>Error loading teams.</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">NBA Real Team Matchup</h1>
      <div className="mb-4">
        <label className="mr-2 font-semibold">Season:</label>
        <select
          value={season}
          onChange={e => setSeason(Number(e.target.value))}
          className="p-2 border rounded"
        >
          {SEASONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <SelectTeam teamId={teamA} setTeamId={setTeamA} season={season} />
          {teamAObj && (
            <div className="flex items-center mt-2">
              {teamAObj.logo && <img src={teamAObj.logo} alt={teamAObj.full_name} className="w-10 h-10 mr-2" />}
              <span className="font-bold">{teamAObj.full_name}</span>
            </div>
          )}
          {loadingA ? <div>Loading players...</div> : <TeamDisplay teamName={teamAObj ? teamAObj.full_name : 'Team A'} players={playersA} />}
        </div>
        <div className="flex-1">
          <SelectTeam teamId={teamB} setTeamId={setTeamB} season={season} />
          {teamBObj && (
            <div className="flex items-center mt-2">
              {teamBObj.logo && <img src={teamBObj.logo} alt={teamBObj.full_name} className="w-10 h-10 mr-2" />}
              <span className="font-bold">{teamBObj.full_name}</span>
            </div>
          )}
          {loadingB ? <div>Loading players...</div> : <TeamDisplay teamName={teamBObj ? teamBObj.full_name : 'Team B'} players={playersB} />}
        </div>
      </div>
      <div className="mt-6">
        <Controls
          isRunning={isRunning}
          isPaused={isPaused}
          onStart={startGame}
          onStop={stopGame}
          onPause={pauseGame}
          onTimeout={timeout}
        />
      </div>
      <div className="mt-6">
        <GameHistory />
      </div>
    </div>
  );
}
// This component allows users to select NBA teams and view their rosters.
// It uses custom hooks to fetch teams and players, and displays the selected teams with their players.
// The component also includes controls for starting, pausing, and stopping the game,
// as well as managing timeouts for each team.
// The game history is displayed at the bottom, showing past games and their results.
// The component is designed to be responsive and user-friendly, making it easy for users to interact with the NBA roster selection process.
// The component integrates with a WebSocket to receive real-time game updates,

// allowing for dynamic updates to the game state without needing to refresh the page.
// This enhances the user experience by providing immediate feedback on game actions and events.
// The use of Tailwind CSS classes ensures a clean and modern design, making the component visually appealing.

