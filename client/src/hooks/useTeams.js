import { useEffect, useState } from 'react';
import { fetchTeams } from '../api/api';

export function useTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchTeams()
      .then(setTeams)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { teams, loading, error };
}