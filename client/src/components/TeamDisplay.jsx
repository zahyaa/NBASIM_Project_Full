import React from 'react';

export default function TeamDisplay({ teamName, players }) {
  return (
    <div>
      <h3>{teamName}</h3>
      <ul>
        {players && players.length > 0 ? (
          players.map(player => (
            <li key={player.id}>
              {player.first_name} {player.last_name}
            </li>
          ))
        ) : (
          <li>No players found.</li>
        )}
      </ul>
    </div>
  );
}
