import React from 'react';

export default function Controls({
  isRunning,
  isPaused,
  onStart,
  onStop,
  onPause,
  onTimeout,
  onFastForward
}) {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      <button onClick={onStart} disabled={isRunning}>Start</button>
      <button onClick={onPause} disabled={!isRunning}>{isPaused ? 'Resume' : 'Pause'}</button>
      <button onClick={onStop}>Stop</button>
      <button onClick={() => onTimeout('teamA')}>Timeout Team A</button>
      <button onClick={() => onTimeout('teamB')}>Timeout Team B</button>
      <button onClick={onFastForward}>Fast Forward</button>
    </div>
  );
}

// This component renders the control buttons for starting, pausing, stopping the game,
// and managing timeouts for both teams. It also includes a fast forward button.
// The buttons are disabled based on the current state of the game (running or paused).
// 
// 
//
