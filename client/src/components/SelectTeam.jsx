//select team, gives user the ability to select NBA teams.
import React, { useState, useEffect } from 'react';
import { usePlayers } from '../hooks/usePlayers';
import { useTeams } from '../hooks/useTeams';
import { useGameContext } from '../context/GameContext';

const SEASONS = [
  { label: '2024-25', value: 2025 },
  { label: '2023-24', value: 2024 },
  { label: '2022-23', value: 2023 },
  { label: '2021-22', value: 2022 },
];

const QUARTERS = [1, 2, 3, 4];

export default function SelectTeam({ teamId, setTeamId }) {
  const [selectedTeam, setSelectedTeam] = useState(teamId || '');
  const [selectedSeason, setSelectedSeason] = useState(SEASONS[0].value);
  const [selectedQuarter, setSelectedQuarter] = useState(1);

  const teams = useTeams();
  const players = usePlayers(selectedTeam, selectedSeason); // Assumes usePlayers supports season
  const { setTeamA, setTeamB, setQuarter, setSeason } = useGameContext();

  useEffect(() => {
    if (selectedTeam) {
      if (teamId === 1) {
        setTeamA(selectedTeam);
      } else {
        setTeamB(selectedTeam);
      }
    }
  }, [selectedTeam, teamId, setTeamA, setTeamB]);

  useEffect(() => {
    setSeason && setSeason(selectedSeason);
  }, [selectedSeason, setSeason]);

  useEffect(() => {
    setQuarter && setQuarter(selectedQuarter);
  }, [selectedQuarter, setQuarter]);

  return (
    <div className="flex flex-col items-center">
      <h2>Select Team</h2>
      <select
        value={selectedTeam}
        onChange={e => setSelectedTeam(e.target.value)}
        className="mb-4 p-2 border rounded"
      >
        <option value="">Select a team</option>
        {teams.map(team => (
          <option key={team.id} value={team.id}>
            {team.full_name}
          </option>
        ))}
      </select>

      <h2>Select Season</h2>
      <select
        value={selectedSeason}
        onChange={e => setSelectedSeason(Number(e.target.value))}
        className="mb-4 p-2 border rounded"
      >
        {SEASONS.map(season => (
          <option key={season.value} value={season.value}>
            {season.label}
          </option>
        ))}
      </select>

      <h2>Select Quarter</h2>
      <select
        value={selectedQuarter}
        onChange={e => setSelectedQuarter(Number(e.target.value))}
        className="mb-4 p-2 border rounded"
      >
        {QUARTERS.map(q => (
          <option key={q} value={q}>
            Quarter {q}
          </option>
        ))}
      </select>

      {selectedTeam && (
        <div>
          <h3>Players ({SEASONS.find(s => s.value === selectedSeason)?.label}):</h3>
          <ul>
            {players && players.length > 0 ? (
              players.map(player => (
                <li key={player.id}>
                  {player.first_name} {player.last_name}
                </li>
              ))
            ) : (
              <li>No players found for this team/season.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
// This component allows the user to select an NBA team from a dropdown list.
// It fetches the list of teams and players using custom hooks.
// When a team is selected, it updates the context with the selected team for Team A or Team B.
// It also displays the players of the selected team.
// The component uses `useEffect` to update the context whenever the selected team changes.
// The selected team is stored in the component's state and passed to the context for further use in the game logic.
// The component is styled with Tailwind CSS classes for a clean and responsive design.
// The dropdown allows users to select a team, and upon selection, it fetches and displays the players of that team.
// The component is designed to be reusable and can be integrated into a larger application where team selection is required.
// The component is flexible enough to be used in different parts of the application where team selection is needed.
// The component can be easily extended to include more features, such as team logos or additional player statistics.

// The component is designed to be user-friendly, with clear labels and a simple interface for selecting teams and viewing players.