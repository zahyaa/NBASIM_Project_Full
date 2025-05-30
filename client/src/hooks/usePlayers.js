import { useEffect, useState } from 'react';
import { fetchPlayers } from '../api/api';

export function usePlayers(teamId, season) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamId || !season) return;
    setLoading(true);
    fetchPlayers(teamId, season)
      .then(setPlayers)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [teamId, season]);

  return { players, loading, error };
}
