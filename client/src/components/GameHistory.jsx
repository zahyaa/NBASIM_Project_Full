import React, { useEffect, useState } from 'react';

export default function GameHistory() {
  const [games, setGames] = useState([]);

  useEffect(() => {
    fetch('http://localhost:5000/api/games')
      .then(res => res.json())
      .then(setGames);
  }, []);

  return (
    <div>
      <h2>Game History</h2>
      <ul>
        {games.map(game => (
          <li key={game._id}>{game.teamA} ({game.scoreA}) vs {game.teamB} ({game.scoreB})</li>
        ))}
      </ul>
    </div>
  );
}
