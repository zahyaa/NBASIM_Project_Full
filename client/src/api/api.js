export async function fetchTeams() {
  const res = await fetch('/api/teams');
  if (!res.ok) throw new Error('Failed to fetch teams');
  return res.json();
}

export async function fetchPlayers(teamId, season) {
  const res = await fetch(`/api/players?teamId=${teamId}&season=${season}`);
  if (!res.ok) throw new Error('Failed to fetch players');
  return res.json();
}