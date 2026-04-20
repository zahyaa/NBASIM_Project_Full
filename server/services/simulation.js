/**
 * Stat-based game simulation engine.
 * Uses player ratings to weight scoring probability.
 */

function pickWeightedPlayer(players) {
  const total = players.reduce((sum, p) => sum + (p.rating || 50), 0);
  let r = Math.random() * total;
  for (const p of players) {
    r -= p.rating || 50;
    if (r <= 0) return p;
  }
  return players[players.length - 1];
}

function simulateGame(teamA, teamB) {
  const QUARTERS = 4;
  const SECONDS_PER_QUARTER = 720;

  const scoreA = { total: 0, players: {} };
  const scoreB = { total: 0, players: {} };

  // Init player box scores
  for (const p of teamA.players) {
    scoreA.players[p.playerId] = { name: `${p.firstName} ${p.lastName}`, pts: 0, reb: 0, ast: 0 };
  }
  for (const p of teamB.players) {
    scoreB.players[p.playerId] = { name: `${p.firstName} ${p.lastName}`, pts: 0, reb: 0, ast: 0 };
  }

  const plays = [];

  for (let q = 1; q <= QUARTERS; q++) {
    let clock = SECONDS_PER_QUARTER;

    while (clock > 0) {
      const elapsed = Math.floor(Math.random() * 20) + 5; // 5–24 sec
      clock = Math.max(0, clock - elapsed);

      const isTeamA = Math.random() < 0.5;
      const roster = isTeamA ? teamA.players : teamB.players;
      const box = isTeamA ? scoreA : scoreB;
      const teamName = isTeamA ? teamA.name : teamB.name;

      // Pick active players (top 5 by rating)
      const active = roster.slice(0, 5);
      const player = pickWeightedPlayer(active);
      const pBox = box.players[player.playerId];

      // Shot outcome weighted by rating
      const shotChance = 0.35 + (player.rating / 99) * 0.25; // 35%–60%
      const roll = Math.random();

      let points = 0;
      let playText = '';

      if (roll < shotChance * 0.6) {
        // 2-pointer made
        points = 2;
        playText = `${player.firstName} ${player.lastName} drives and scores a 2-pointer!`;
      } else if (roll < shotChance * 0.8) {
        // 3-pointer made
        points = 3;
        playText = `${player.firstName} ${player.lastName} drains a 3-pointer!`;
      } else if (roll < shotChance * 0.9) {
        // Free throws
        points = 1;
        playText = `${player.firstName} ${player.lastName} hits a free throw.`;
      } else if (roll < 0.75) {
        // Missed shot
        playText = `${player.firstName} ${player.lastName} misses the shot.`;
        // Rebound
        const rebTeam = Math.random() < 0.6 ? roster : (isTeamA ? teamB.players : teamA.players);
        const rebounder = pickWeightedPlayer(rebTeam.slice(0, 5));
        const rebBox = (rebTeam === roster ? box : (isTeamA ? scoreB : scoreA));
        rebBox.players[rebounder.playerId].reb += 1;
        playText += ` ${rebounder.firstName} ${rebounder.lastName} grabs the rebound.`;
      } else if (roll < 0.85) {
        // Assist play
        const assister = active.find(p => p.playerId !== player.playerId) || player;
        const assistBox = box.players[assister.playerId];
        points = 2;
        assistBox.ast += 1;
        playText = `${assister.firstName} ${assister.lastName} dishes to ${player.firstName} ${player.lastName} for the easy bucket!`;
      } else {
        // Turnover
        playText = `${player.firstName} ${player.lastName} turns the ball over.`;
      }

      if (points > 0) {
        pBox.pts += points;
        box.total += points;
      }

      const mins = Math.floor(clock / 60);
      const secs = clock % 60;
      plays.push({
        quarter: q,
        clock: `${mins}:${String(secs).padStart(2, '0')}`,
        team: teamName,
        text: playText,
        scoreA: scoreA.total,
        scoreB: scoreB.total,
      });
    }
  }

  // Handle overtime if tied
  let otPeriod = 0;
  while (scoreA.total === scoreB.total && otPeriod < 10) {
    otPeriod++;
    let clock = 300; // 5 min OT

    plays.push({
      quarter: `OT${otPeriod}`,
      clock: '5:00',
      team: '',
      text: `--- Overtime ${otPeriod} begins! ---`,
      scoreA: scoreA.total,
      scoreB: scoreB.total,
    });

    while (clock > 0) {
      const elapsed = Math.floor(Math.random() * 20) + 5;
      clock = Math.max(0, clock - elapsed);

      const isTeamA = Math.random() < 0.5;
      const roster = isTeamA ? teamA.players : teamB.players;
      const box = isTeamA ? scoreA : scoreB;
      const teamName = isTeamA ? teamA.name : teamB.name;
      const active = roster.slice(0, 5);
      const player = pickWeightedPlayer(active);
      const pBox = box.players[player.playerId];

      const shotChance = 0.35 + (player.rating / 99) * 0.25;
      const roll = Math.random();
      let points = 0;
      let playText = '';

      if (roll < shotChance * 0.6) {
        points = 2;
        playText = `${player.firstName} ${player.lastName} scores a 2-pointer!`;
      } else if (roll < shotChance * 0.8) {
        points = 3;
        playText = `${player.firstName} ${player.lastName} hits a 3-pointer!`;
      } else {
        playText = `${player.firstName} ${player.lastName} misses.`;
      }

      if (points > 0) {
        pBox.pts += points;
        box.total += points;
      }

      const mins = Math.floor(clock / 60);
      const secs = clock % 60;
      plays.push({
        quarter: `OT${otPeriod}`,
        clock: `${mins}:${String(secs).padStart(2, '0')}`,
        team: teamName,
        text: playText,
        scoreA: scoreA.total,
        scoreB: scoreB.total,
      });
    }
  }

  // Tie-break after max overtime
  if (scoreA.total === scoreB.total) {
    scoreA.total += 1;
    plays.push({
      quarter: 'Final',
      clock: '0:00',
      team: teamA.name,
      text: `${teamA.name} wins in a tiebreaker!`,
      scoreA: scoreA.total,
      scoreB: scoreB.total,
    });
  }

  // Determine star player
  const allPlayerStats = [
    ...Object.values(scoreA.players).map(p => ({ ...p, team: teamA.name })),
    ...Object.values(scoreB.players).map(p => ({ ...p, team: teamB.name })),
  ];
  allPlayerStats.sort((a, b) => b.pts - a.pts);

  return {
    teamA: teamA.name,
    teamB: teamB.name,
    scoreA: scoreA.total,
    scoreB: scoreB.total,
    boxScoreA: scoreA.players,
    boxScoreB: scoreB.players,
    plays,
    starPlayer: allPlayerStats[0],
    winner: scoreA.total > scoreB.total ? teamA.name : teamB.name,
  };
}

module.exports = { simulateGame, pickWeightedPlayer };
