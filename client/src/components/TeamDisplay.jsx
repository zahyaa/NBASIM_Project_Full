import React from 'react';

export default function TeamDisplay({ teamName }) {
  const players = ['PG', 'SG', 'SF', 'PF', 'C'];
  return (
    <div>
      <h3>{teamName}</h3>
      <ul>{players.map((p, i) => <li key={i}>{p} - Player {i+1}</li>)}</ul>
    </div>
  );
}
