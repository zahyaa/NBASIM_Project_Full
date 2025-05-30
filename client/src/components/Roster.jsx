//User should be able to select roster from a team, and then select players from that roster.
//Roster can be from any time period in the NBA

import React, { useState, useEffect } from 'react';
import { useGameContext } from '../context/GameContext';
import { usePlayers } from '../hooks/usePlayers';
import { useTeams } from '../hooks/useTeams';
import TeamDisplay from './TeamDisplay';
import SelectTeam from './SelectTeam';
import Controls from './Controls';
import GameHistory from './GameHistory';
import { useSocket } from '../hooks/useSocket';

export default function Roster() {
  const { teamA, teamB, setTeamA, setTeamB, isRunning, isPaused, startGame, pauseGame, stopGame, timeout } = useGameContext();
  const teams = useTeams();
  const playersA = usePlayers(teamA);
  const playersB = usePlayers(teamB);
  const socket = useSocket();

  useEffect(() => {
    socket.on('gameUpdate', (data) => {
      // Handle game updates from the server
      console.log('Game update received:', data);
    });

    return () => {
      socket.off('gameUpdate');
    };
  }, [socket]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">NBA Roster Selection</h1>
      <div className="flex flex-col md:flex-row gap-4">
        <SelectTeam teamId={1} setTeamId={setTeamA} />
        <SelectTeam teamId={2} setTeamId={setTeamB} />
      </div>
      <div className="mt-6">
        <h2 className="text-xl font-semibold">Selected Teams</h2>
        <div className="flex flex-col md:flex-row gap-4 mt-4">
          {teamA && <TeamDisplay teamName={teamA} players={playersA} />}
          {teamB && <TeamDisplay teamName={teamB} players={playersB} />}
        </div>
      </div>
      <Controls
        isRunning={isRunning}
        isPaused={isPaused}
        onStart={startGame}
        onStop={stopGame}
        onPause={pauseGame}
        onTimeout={(team) => timeout(team)}
      />
      <GameHistory />
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

