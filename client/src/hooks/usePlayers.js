import { useEffect, useState } from 'react';

export function usePlayers(teamId = 1) {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    async function fetchPlayers() {
      const res = await fetch(`https://www.balldontlie.io/api/v1/players?team_ids[]=${teamId}&per_page=5`);
      const data = await res.json();
      setPlayers(data.data);
    }
    fetchPlayers();
  }, [teamId]);

  return players;
}
