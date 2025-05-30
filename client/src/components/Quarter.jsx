//There is is a total time of 48 minutes in an NBA game, which is 2880 seconds.
//Write a function that breaks into 4 quarters, each lasting 12 minutes (720 seconds).

//         onStop={() => { setIsRunning(false); setClock(2880); }}
//         onPause={() => setIsPaused(!isPaused)}
//         onTimeout={handleTimeout}
//         onFastForward={fastForwardGame}
//       </div>




import React from 'react';
export default function Quarter({ quarter, timeLeft }) {
  return (
    <div className="quarter">
      <h3>Quarter {quarter}</h3>
      <p>Time Left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</p>
    </div>
  );
}
// This component displays the current quarter and the time left in that quarter.
// It takes `quarter` and `timeLeft` as props and formats the time for display.
// The component is styled with Tailwind CSS classes for a clean and responsive design.
// It can be used in a game simulation to show the progress of the game in terms of quarters.

