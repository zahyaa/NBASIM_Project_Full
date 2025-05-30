import React from 'react';
import GameSimulator from './components/GameSimulator';
import { GameProvider } from './context/GameContext';

export default function App() {
  return (
    <GameProvider>
      <GameSimulator />
    </GameProvider>
  );
}
