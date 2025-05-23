import React from 'react';

export default function TeamSelector({ onSelect }) {
  const teams = [
    { id: 1, name: 'Lakers' },
    { id: 2, name: 'Warriors' },
    { id: 3, name: 'Celtics' }
  ];

  return (
    <select onChange={e => onSelect(e.target.value)}>
      {teams.map(team => (
        <option key={team.id} value={team.id}>{team.name}</option>
      ))}
    </select>
  );
}
