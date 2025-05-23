import React from 'react';

export default function Controls({ isRunning, isPaused, onStart, onStop, onPause, onTimeout, onFastForward }) {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      <button onClick={onStart} disabled={isRunning}>START</button>
      <button onClick={onPause} disabled={!isRunning}>{isPaused ? 'RESUME' : 'PAUSE'}</button>
      <button onClick={onStop} disabled={!isRunning}>STOP</button>
      <button onClick={() => onTimeout('teamA')}>Team A Timeout</button>
      <button onClick={() => onTimeout('teamB')}>Team B Timeout</button>
      <button onClick={onFastForward}>FAST FORWARD</button>
    </div>
  );
}
