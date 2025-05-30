import React, { useState, useRef, useEffect } from 'react';
import SelectTeam from './components/SelectTeam';

const QUARTERS = 4;
const MINUTES_PER_QUARTER = 12;
const SECONDS_PER_QUARTER = MINUTES_PER_QUARTER * 60;
const OVERTIME_MINUTES = 5;
const OVERTIME_SECONDS = OVERTIME_MINUTES * 60;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function App() {
  const [teamA, setTeamA] = useState('');
  const [playersA, setPlayersA] = useState([]);
  const [teamB, setTeamB] = useState('');
  const [playersB, setPlayersB] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);

  // Game simulation state
  const [quarter, setQuarter] = useState(1);
  const [clock, setClock] = useState(SECONDS_PER_QUARTER);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isOvertime, setIsOvertime] = useState(false);

  // Play-by-play and box score
  const [playByPlay, setPlayByPlay] = useState([]);
  const [boxScoreA, setBoxScoreA] = useState({});
  const [boxScoreB, setBoxScoreB] = useState({});
  const [hotPlayerA, setHotPlayerA] = useState('');
  const [coldPlayerA, setColdPlayerA] = useState('');
  const [hotPlayerB, setHotPlayerB] = useState('');
  const [coldPlayerB, setColdPlayerB] = useState('');
  const [starPlayer, setStarPlayer] = useState('');

  const intervalRef = useRef(null);

  // Initialize box scores
  useEffect(() => {
    if (playersA.length) {
      setBoxScoreA(Object.fromEntries(playersA.map(p => [p, 0])));
    }
    if (playersB.length) {
      setBoxScoreB(Object.fromEntries(playersB.map(p => [p, 0])));
    }
  }, [playersA, playersB]);

  // Start game and simulation
  const handleStartGame = () => {
    setGameStarted(true);
    setQuarter(1);
    setClock(SECONDS_PER_QUARTER);
    setScoreA(0);
    setScoreB(0);
    setGameOver(false);
    setPlayByPlay([]);
    setBoxScoreA(Object.fromEntries(playersA.map(p => [p, 0])));
    setBoxScoreB(Object.fromEntries(playersB.map(p => [p, 0])));
    setHotPlayerA('');
    setColdPlayerA('');
    setHotPlayerB('');
    setColdPlayerB('');
    setStarPlayer('');
  };

  // Automatic simulation effect
  useEffect(() => {
    if (gameStarted && !gameOver) {
      intervalRef.current = setInterval(() => {
        handleSimulatePlay();
      }, 500); // 0.5 seconds per play
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line
  }, [gameStarted, gameOver, quarter, clock, boxScoreA, boxScoreB]);

  // Simulate a play: advance clock, randomly assign points, update play-by-play and box score
  const handleSimulatePlay = () => {
    if (gameOver) return;

    // Simulate time elapsed for a play (random 5-24 seconds)
    const elapsed = Math.min(clock, getRandomInt(5, 24));
    let newClock = clock - elapsed;

    // Randomly pick team and player
    const team = Math.random() < 0.5 ? 'A' : 'B';
    const players = team === 'A' ? playersA : playersB;
    const boxScore = team === 'A' ? { ...boxScoreA } : { ...boxScoreB };
    const player = players[getRandomInt(0, players.length - 1)];

    // Simulate scoring: 0, 2, or 3 points
    let points = 0;
    let playText = '';
    const shot = Math.random();
    if (shot < 0.5) {
      points = 0;
      playText = `${player} missed a shot.`;
    } else if (shot < 0.9) {
      points = 2;
      playText = `${player} scored a 2-point basket!`;
    } else {
      points = 3;
      playText = `${player} hit a 3-pointer!`;
    }

    // Update box score and team score
    if (points > 0) {
      boxScore[player] += points;
      if (team === 'A') setScoreA(prev => prev + points);
      else setScoreB(prev => prev + points);
    }

    // Update play-by-play
    setPlayByPlay(prev => [
      ...prev,
      `${isOvertime ? 'OT' : `Q${quarter}`} ${formatTime(newClock)} - ${team === 'A' ? teamA : teamB}: ${playText}`
    ]);

    // Update box score state
    if (team === 'A') setBoxScoreA(boxScore);
    else setBoxScoreB(boxScore);

    // If quarter or overtime ends
    if (newClock <= 0) {
      if (!isOvertime && quarter < QUARTERS) {
        setQuarter(q => q + 1);
        setClock(SECONDS_PER_QUARTER);
      } else if (!isOvertime && quarter === QUARTERS && scoreA === scoreB) {
        // Start overtime
        setIsOvertime(true);
        setClock(OVERTIME_SECONDS);
        setPlayByPlay(prev => [...prev, '--- Overtime begins! ---']);
      } else if (isOvertime && scoreA === scoreB) {
        // If still tied after overtime, run another overtime
        setClock(OVERTIME_SECONDS);
        setPlayByPlay(prev => [...prev, '--- Double Overtime! ---']);
      } else {
        setClock(0);
        setGameOver(true);
        setTimeout(() => {
          computeHotColdStar();
        }, 500);
      }
    } else {
      setClock(newClock);
    }
  };

  // Compute hot/cold/star players at end of game
  const computeHotColdStar = () => {
    const getHotCold = (boxScore) => {
      const entries = Object.entries(boxScore);
      entries.sort((a, b) => b[1] - a[1]);
      return {
        hot: entries[0][0],
        cold: entries[entries.length - 1][0]
      };
    };
    const hotColdA = getHotCold(boxScoreA);
    const hotColdB = getHotCold(boxScoreB);
    setHotPlayerA(hotColdA.hot);
    setColdPlayerA(hotColdA.cold);
    setHotPlayerB(hotColdB.hot);
    setColdPlayerB(hotColdB.cold);

    // Star player: highest points overall
    const allPlayers = [
      ...Object.entries(boxScoreA).map(([name, pts]) => ({ name, pts, team: teamA })),
      ...Object.entries(boxScoreB).map(([name, pts]) => ({ name, pts, team: teamB })),
    ];
    allPlayers.sort((a, b) => b.pts - a.pts);
    setStarPlayer(`${allPlayers[0].name} (${allPlayers[0].team})`);
  };

  const handleReset = () => {
    setGameStarted(false);
    setQuarter(1);
    setClock(SECONDS_PER_QUARTER);
    setScoreA(0);
    setScoreB(0);
    setGameOver(false);
    setPlayByPlay([]);
    setBoxScoreA({});
    setBoxScoreB({});
    setHotPlayerA('');
    setColdPlayerA('');
    setHotPlayerB('');
    setColdPlayerB('');
    setStarPlayer('');
    setTeamA('');
    setPlayersA([]);
    setTeamB('');
    setPlayersB([]);
    setIsOvertime(false);
  };

  return (
    <div style={{ padding: 32 }}>
      <h1>BASKETBALL SIMULATION GAME</h1>
      {!gameStarted ? (
        <div style={{ display: 'flex', gap: 40 }}>
          <div>
            <h2>Team A</h2>
            <SelectTeam
              onSelectTeam={setTeamA}
              onSelectPlayers={setPlayersA}
              excludeTeam={teamB}
            />
            <div style={{ marginTop: 16 }}>
              <strong>Selected Team:</strong> {teamA || 'None'}
              <ul>
                {playersA.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h2>Team B</h2>
            <SelectTeam
              onSelectTeam={setTeamB}
              onSelectPlayers={setPlayersB}
              excludeTeam={teamA}
            />
            <div style={{ marginTop: 16 }}>
              <strong>Selected Team:</strong> {teamB || 'None'}
              <ul>
                {playersB.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              onClick={handleStartGame}
              disabled={
                !teamA ||
                !teamB ||
                teamA === teamB ||
                playersA.length !== 5 ||
                playersB.length !== 5
              }
            >
              Start Game
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h2>Game Started!</h2>
          <div style={{ display: 'flex', gap: 40 }}>
            <div>
              <h3>{teamA}</h3>
              <ul>
                {playersA.map((p) => (
                  <li key={p}>
                    {p} — <b>{boxScoreA[p] || 0} pts</b>
                    {gameOver && p === hotPlayerA && <span style={{ color: 'red' }} aria-label="hot" role="img">🔥 Hot</span>}
                    {gameOver && p === coldPlayerA && <span style={{ color: 'blue' }} aria-label="cold" role="img">❄️ Cold</span>}
                  </li>
                ))}
              </ul>
              <h3>Score: {scoreA}</h3>
            </div>
            <div>
              <h3>{teamB}</h3>
              <ul>
                {playersB.map((p) => (
                  <li key={p}>
                    {p} — <b>{boxScoreB[p] || 0} pts</b>
                    {gameOver && p === hotPlayerB && <span style={{ color: 'red' }} aria-label="hot" role="img">🔥 Hot</span>}
                    {gameOver && p === coldPlayerB && <span style={{ color: 'blue' }} aria-label="cold" role="img">❄️ Cold</span>}
                  </li>
                ))}
              </ul>
              <h3>Score: {scoreB}</h3>
            </div>
          </div>
          <div style={{ marginTop: 32 }}>
            <h3>
              {isOvertime
                ? 'Overtime'
                : `Quarter: ${quarter} / ${QUARTERS}`}
            </h3>
            <h3>
              Time: {formatTime(clock)}
            </h3>
            {!gameOver ? (
              <div>Simulating...</div>
            ) : (
              <div>
                <h2>Game Over!</h2>
                <h2>
                  {scoreA === scoreB
                    ? 'It\'s a tie!'
                    : scoreA > scoreB
                    ? `${teamA} Wins!`
                    : `${teamB} Wins!`}
                </h2>
                <h3>Star Player: <span style={{ color: 'gold' }} aria-label="star" role="img">{starPlayer}</span></h3>
                <button onClick={handleReset}>Restart</button>
              </div>
            )}
          </div>
          <div style={{ marginTop: 32 }}>
            <h2>Play-by-Play</h2>
            <div style={{ maxHeight: 200, overflowY: 'auto', background: '#f9f9f9', padding: 10 }}>
              {playByPlay.slice().reverse().map((play, idx) => (
                <div key={idx}>{play}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
