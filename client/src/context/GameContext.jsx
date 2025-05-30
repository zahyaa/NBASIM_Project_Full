import React, { createContext, useContext, useState } from 'react';

const GameContext = createContext();

export function GameProvider({ children }) {
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Dummy implementations for controls
  const startGame = () => setIsRunning(true);
  const pauseGame = () => setIsPaused(p => !p);
  const stopGame = () => setIsRunning(false);
  const timeout = (team) => {};

  return (
    <GameContext.Provider value={{
      teamA, setTeamA,
      teamB, setTeamB,
      isRunning, isPaused,
      startGame, pauseGame, stopGame, timeout
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  return useContext(GameContext);
}