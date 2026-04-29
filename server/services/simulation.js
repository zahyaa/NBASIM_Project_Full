/**
 * Enhanced stat-based game simulation engine.
 * Tracks ESPN-style box scores, team stats, shot chart, quarter scores, win probability.
 */

// Difficulty modifiers — applied to the CPU side when the user plays a CPU.
// Higher difficulty = CPU shoots better and adds a quick-sim score bonus.
// 'pro' is neutral (the historical default behaviour).
const DIFFICULTY_MODS = {
  easy:    { cpuShotMul: 0.85, cpuScoreBonus: -7,  userShotMul: 1.05, userScoreBonus: +3 },
  pro:     { cpuShotMul: 1.00, cpuScoreBonus:  0,  userShotMul: 1.00, userScoreBonus:  0 },
  hard:    { cpuShotMul: 1.08, cpuScoreBonus: +6,  userShotMul: 0.97, userScoreBonus: -2 },
  allstar: { cpuShotMul: 1.15, cpuScoreBonus: +11, userShotMul: 0.94, userScoreBonus: -4 },
  legacy:  { cpuShotMul: 1.22, cpuScoreBonus: +16, userShotMul: 0.90, userScoreBonus: -7 },
};

function getDifficultyMods(difficulty) {
  return DIFFICULTY_MODS[difficulty] || DIFFICULTY_MODS.pro;
}

function pickWeightedPlayer(players) {
  if (!players || players.length === 0) return null;
  const total = players.reduce((sum, p) => sum + (p.rating || 50), 0);
  let r = Math.random() * total;
  for (const p of players) {
    r -= p.rating || 50;
    if (r <= 0) return p;
  }
  return players[players.length - 1];
}

function initPlayerBox(p) {
  return {
    name: `${p.firstName} ${p.lastName}`,
    playerId: p.playerId,
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    turnover: 0, min: 0, pf: 0,
  };
}

function initTeamStats() {
  return {
    pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    reb: 0, ast: 0, stl: 0, blk: 0, turnover: 0, pf: 0,
    largestLead: 0, fastBreakPts: 0, ptsInPaint: 0, benchPts: 0,
    quarterScores: [],
  };
}

// Random court position for shot chart (x: 0-500, y: 0-470)
function randomShotLocation(shotType) {
  if (shotType === '3pt') {
    // Arc: outside the 3-point line
    const angle = Math.random() * Math.PI;
    const r = 180 + Math.random() * 50;
    return { x: Math.round(250 + r * Math.cos(angle)), y: Math.round(420 - r * Math.sin(angle)) };
  }
  if (shotType === 'paint') {
    return { x: Math.round(200 + Math.random() * 100), y: Math.round(350 + Math.random() * 90) };
  }
  // Mid-range
  const angle = Math.random() * Math.PI;
  const r = 80 + Math.random() * 100;
  return { x: Math.round(250 + r * Math.cos(angle)), y: Math.round(400 - r * Math.sin(angle)) };
}

function simulateGame(teamA, teamB, opts = {}) {
  const QUARTERS = 4;
  const SECONDS_PER_QUARTER = 720;

  // Coach playbook bonus — sharper sets => higher shot conversion.
  // User defaults to 7 (neutral); CPU teams get 7–10 from generation.
  const coachA = teamA?.coachRating ?? 7;
  const coachB = teamB?.coachRating ?? 7;
  // Each rating point above 7 adds +1.5% to that team's shot chance.
  const coachBoostA = (coachA - 7) * 0.015;
  const coachBoostB = (coachB - 7) * 0.015;

  // Difficulty multipliers applied per side. userSide ('A'|'B') marks which
  // team is the human; the other side gets the CPU mod. When userSide is
  // omitted (CPU vs CPU, or user vs user) both sides stay at 1.0.
  const mods = getDifficultyMods(opts.difficulty);
  let shotMulA = 1, shotMulB = 1;
  if (opts.userSide === 'A') { shotMulA = mods.userShotMul; shotMulB = mods.cpuShotMul; }
  else if (opts.userSide === 'B') { shotMulA = mods.cpuShotMul; shotMulB = mods.userShotMul; }

  const boxA = {}, boxB = {};
  const statsA = initTeamStats(), statsB = initTeamStats();

  for (const p of teamA.players) boxA[p.playerId] = initPlayerBox(p);
  for (const p of teamB.players) boxB[p.playerId] = initPlayerBox(p);

  const plays = [];
  const shots = [];        // Shot chart data
  const winProb = [];       // Win probability timeline
  let scoreATot = 0, scoreBTot = 0;

  for (let q = 1; q <= QUARTERS; q++) {
    let clock = SECONDS_PER_QUARTER;
    const qStartA = scoreATot, qStartB = scoreBTot;

    while (clock > 0) {
      const elapsed = Math.floor(Math.random() * 20) + 5;
      clock = Math.max(0, clock - elapsed);

      const isTeamA = Math.random() < 0.5;
      const roster = isTeamA ? teamA.players : teamB.players;
      const box = isTeamA ? boxA : boxB;
      const tStats = isTeamA ? statsA : statsB;
      const oStats = isTeamA ? statsB : statsA;
      const oBox = isTeamA ? boxB : boxA;
      const teamName = isTeamA ? teamA.name : teamB.name;
      const oRoster = isTeamA ? teamB.players : teamA.players;

      const active = roster.slice(0, 5);
      const player = pickWeightedPlayer(active);
      if (!player) continue;
      const pBox = box[player.playerId];
      pBox.min += Math.round(elapsed / 60 * 10) / 10;

      const sideMul = isTeamA ? shotMulA : shotMulB;
      // Clamp to a sane range so legacy + elite players can't push above ~0.85
      // and miss-bucket thresholds remain reachable at every difficulty.
      const rawChance = (0.35 + (player.rating / 99) * 0.25 + (isTeamA ? coachBoostA : coachBoostB)) * sideMul;
      const shotChance = Math.max(0.25, Math.min(0.85, rawChance));
      // Made-shot ceiling: scoring outcomes occupy [0, made]; misses, steals,
      // assists, blocks, turnovers, fouls split the remaining (1 - made)
      // proportionally so miss rates scale inversely with difficulty.
      const made    = shotChance * 0.88;
      const rem     = 1 - made;
      const tMiss2  = made + rem * 0.32;
      const tMiss3  = made + rem * 0.50;
      const tAst    = made + rem * 0.62;
      const tStl    = made + rem * 0.74;
      const tBlk    = made + rem * 0.84;
      const tTO     = made + rem * 0.95;
      // remaining tail = foul
      const roll = Math.random();

      let points = 0;
      let playText = '';
      let playType = '';

      if (roll < shotChance * 0.45) {
        // 2-pointer in paint
        points = 2;
        pBox.fgm++; pBox.fga++; tStats.fgm++; tStats.fga++;
        tStats.ptsInPaint += 2;
        playText = `${player.firstName} ${player.lastName} drives and scores!`;
        playType = 'score';
        shots.push({ team: teamName, x: randomShotLocation('paint').x, y: randomShotLocation('paint').y, made: true, type: '2pt' });
      } else if (roll < shotChance * 0.65) {
        // Mid-range 2
        points = 2;
        pBox.fgm++; pBox.fga++; tStats.fgm++; tStats.fga++;
        playText = `${player.firstName} ${player.lastName} hits a mid-range jumper!`;
        playType = 'score';
        shots.push({ team: teamName, ...randomShotLocation('mid'), made: true, type: '2pt' });
      } else if (roll < shotChance * 0.8) {
        // 3-pointer
        points = 3;
        pBox.fgm++; pBox.fga++; pBox.fg3m++; pBox.fg3a++;
        tStats.fgm++; tStats.fga++; tStats.fg3m++; tStats.fg3a++;
        playText = `${player.firstName} ${player.lastName} drains a 3-pointer!`;
        playType = 'score';
        shots.push({ team: teamName, ...randomShotLocation('3pt'), made: true, type: '3pt' });
      } else if (roll < shotChance * 0.88) {
        // Free throws (2 attempts)
        const ft1 = Math.random() < 0.75;
        const ft2 = Math.random() < 0.75;
        pBox.fta += 2; tStats.fta += 2;
        if (ft1) { pBox.ftm++; tStats.ftm++; points++; }
        if (ft2) { pBox.ftm++; tStats.ftm++; points++; }
        playText = `${player.firstName} ${player.lastName} goes to the line: ${ft1 ? '✓' : '✗'}/${ft2 ? '✓' : '✗'} (${points} pts)`;
        playType = points > 0 ? 'score' : 'miss';
      } else if (roll < tMiss2) {
        // Missed 2pt
        pBox.fga++; tStats.fga++;
        playText = `${player.firstName} ${player.lastName} misses the shot.`;
        playType = 'miss';
        shots.push({ team: teamName, ...randomShotLocation('mid'), made: false, type: '2pt' });
        // Rebound
        const offReb = Math.random() < 0.3;
        const rebRoster = offReb ? active : oRoster.slice(0, 5);
        const rebounder = pickWeightedPlayer(rebRoster);
        const rebBox = offReb ? box[rebounder.playerId] : oBox[rebounder.playerId];
        const rebStats = offReb ? tStats : oStats;
        rebBox.reb++; rebStats.reb++;
        playText += ` ${rebounder.firstName} ${rebounder.lastName} grabs the rebound.`;
      } else if (roll < tMiss3) {
        // Missed 3pt
        pBox.fga++; pBox.fg3a++; tStats.fga++; tStats.fg3a++;
        playText = `${player.firstName} ${player.lastName} misses the three.`;
        playType = 'miss';
        shots.push({ team: teamName, ...randomShotLocation('3pt'), made: false, type: '3pt' });
        const rebounder = pickWeightedPlayer(oRoster.slice(0, 5));
        oBox[rebounder.playerId].reb++; oStats.reb++;
        playText += ` ${rebounder.firstName} ${rebounder.lastName} rebounds.`;
      } else if (roll < tAst) {
        // Assist + score
        const assister = active.find(p => p.playerId !== player.playerId) || player;
        box[assister.playerId].ast++; tStats.ast++;
        points = 2;
        pBox.fgm++; pBox.fga++; tStats.fgm++; tStats.fga++;
        playText = `${assister.firstName} ${assister.lastName} finds ${player.firstName} ${player.lastName} for the easy bucket!`;
        playType = 'score';
        shots.push({ team: teamName, ...randomShotLocation('paint'), made: true, type: '2pt' });
      } else if (roll < tStl) {
        // Steal
        const stealer = pickWeightedPlayer(oRoster.slice(0, 5));
        oBox[stealer.playerId].stl++; oStats.stl++;
        pBox.turnover++; tStats.turnover++;
        playText = `${stealer.firstName} ${stealer.lastName} steals it from ${player.firstName} ${player.lastName}!`;
        playType = 'steal';
      } else if (roll < tBlk) {
        // Block
        const blocker = pickWeightedPlayer(oRoster.slice(0, 5));
        oBox[blocker.playerId].blk++; oStats.blk++;
        pBox.fga++; tStats.fga++;
        playText = `${blocker.firstName} ${blocker.lastName} blocks ${player.firstName} ${player.lastName}!`;
        playType = 'block';
        shots.push({ team: teamName, ...randomShotLocation('paint'), made: false, type: '2pt', blocked: true });
      } else if (roll < tTO) {
        // Turnover
        pBox.turnover++; tStats.turnover++;
        playText = `${player.firstName} ${player.lastName} turns the ball over.`;
        playType = 'turnover';
      } else {
        // Foul
        pBox.pf++; tStats.pf++;
        playText = `Foul on ${player.firstName} ${player.lastName}.`;
        playType = 'foul';
      }

      if (points > 0) {
        pBox.pts += points;
        tStats.pts += points;
        if (isTeamA) scoreATot += points; else scoreBTot += points;
      }

      // Track largest lead
      const diff = isTeamA ? scoreATot - scoreBTot : scoreBTot - scoreATot;
      if (diff > tStats.largestLead) tStats.largestLead = diff;

      const mins = Math.floor(clock / 60);
      const secs = clock % 60;
      const clockStr = `${mins}:${String(secs).padStart(2, '0')}`;

      plays.push({
        quarter: q, clock: clockStr, team: teamName, text: playText,
        scoreA: scoreATot, scoreB: scoreBTot, type: playType,
      });

      // Win probability snapshot every ~5 plays
      if (plays.length % 5 === 0) {
        const totalTime = QUARTERS * SECONDS_PER_QUARTER;
        const elapsed2 = (q - 1) * SECONDS_PER_QUARTER + (SECONDS_PER_QUARTER - clock);
        const pct = elapsed2 / totalTime;
        const scoreDiff = scoreATot - scoreBTot;
        // Logistic model: higher lead + later game = more certain
        const k = 0.15 + pct * 0.35;
        const probA = 1 / (1 + Math.exp(-k * scoreDiff));
        winProb.push({ time: +(pct * 100).toFixed(1), probA: +(probA * 100).toFixed(1), probB: +((1 - probA) * 100).toFixed(1) });
      }
    }

    // Quarter scores
    statsA.quarterScores.push(scoreATot - qStartA);
    statsB.quarterScores.push(scoreBTot - qStartB);
  }

  // Overtime
  let otPeriod = 0;
  while (scoreATot === scoreBTot && otPeriod < 10) {
    otPeriod++;
    let clock = 300;
    const qStartA2 = scoreATot, qStartB2 = scoreBTot;

    plays.push({ quarter: `OT${otPeriod}`, clock: '5:00', team: '', text: `--- Overtime ${otPeriod} begins! ---`, scoreA: scoreATot, scoreB: scoreBTot, type: 'info' });

    while (clock > 0) {
      const elapsed = Math.floor(Math.random() * 20) + 5;
      clock = Math.max(0, clock - elapsed);

      const isTeamA = Math.random() < 0.5;
      const roster = isTeamA ? teamA.players : teamB.players;
      const box = isTeamA ? boxA : boxB;
      const tStats = isTeamA ? statsA : statsB;
      const teamName = isTeamA ? teamA.name : teamB.name;

      const active = roster.slice(0, 5);
      const player = pickWeightedPlayer(active);
      if (!player) continue;
      const pBox = box[player.playerId];

      const rawChance = (0.35 + (player.rating / 99) * 0.25 + (isTeamA ? coachBoostA : coachBoostB))
        * (isTeamA ? shotMulA : shotMulB);
      const shotChance = Math.max(0.25, Math.min(0.85, rawChance));
      const roll = Math.random();
      let points = 0;
      let playText = '';

      if (roll < shotChance * 0.6) {
        points = 2; pBox.fgm++; pBox.fga++; tStats.fgm++; tStats.fga++;
        playText = `${player.firstName} ${player.lastName} scores!`;
      } else if (roll < shotChance * 0.8) {
        points = 3; pBox.fgm++; pBox.fga++; pBox.fg3m++; pBox.fg3a++;
        tStats.fgm++; tStats.fga++; tStats.fg3m++; tStats.fg3a++;
        playText = `${player.firstName} ${player.lastName} hits a 3!`;
      } else {
        pBox.fga++; tStats.fga++;
        playText = `${player.firstName} ${player.lastName} misses.`;
      }

      if (points > 0) {
        pBox.pts += points; tStats.pts += points;
        if (isTeamA) scoreATot += points; else scoreBTot += points;
      }

      const mins = Math.floor(clock / 60);
      const secs = clock % 60;
      plays.push({ quarter: `OT${otPeriod}`, clock: `${mins}:${String(secs).padStart(2, '0')}`, team: teamName, text: playText, scoreA: scoreATot, scoreB: scoreBTot, type: points > 0 ? 'score' : 'miss' });
    }

    statsA.quarterScores.push(scoreATot - qStartA2);
    statsB.quarterScores.push(scoreBTot - qStartB2);
  }

  if (scoreATot === scoreBTot) {
    scoreATot += 1; statsA.pts += 1;
    plays.push({ quarter: 'Final', clock: '0:00', team: teamA.name, text: `${teamA.name} wins in a tiebreaker!`, scoreA: scoreATot, scoreB: scoreBTot, type: 'info' });
  }

  // Game leaders
  const allBoxA = Object.values(boxA);
  const allBoxB = Object.values(boxB);
  const allPlayers = [...allBoxA.map(p => ({ ...p, teamSide: 'A' })), ...allBoxB.map(p => ({ ...p, teamSide: 'B' }))];
  const leaders = {
    points: { A: allBoxA.sort((a, b) => b.pts - a.pts)[0], B: allBoxB.sort((a, b) => b.pts - a.pts)[0] },
    rebounds: { A: allBoxA.sort((a, b) => b.reb - a.reb)[0], B: allBoxB.sort((a, b) => b.reb - a.reb)[0] },
    assists: { A: allBoxA.sort((a, b) => b.ast - a.ast)[0], B: allBoxB.sort((a, b) => b.ast - a.ast)[0] },
  };

  allPlayers.sort((a, b) => b.pts - a.pts);

  return {
    teamA: teamA.name,
    teamB: teamB.name,
    scoreA: scoreATot,
    scoreB: scoreBTot,
    boxScoreA: boxA,
    boxScoreB: boxB,
    teamStatsA: statsA,
    teamStatsB: statsB,
    plays,
    shots,
    winProbability: winProb,
    leaders,
    starPlayer: allPlayers[0],
    winner: scoreATot > scoreBTot ? teamA.name : teamB.name,
  };
}

/**
 * 1-on-1 simulation: two players, first to targetScore (default 21).
 */
function simulate1v1(playerA, playerB, targetScore = 21) {
  const scoreA = { total: 0 };
  const scoreB = { total: 0 };
  const plays = [];
  let possession = Math.random() < 0.5;

  while (scoreA.total < targetScore && scoreB.total < targetScore && plays.length < 500) {
    const attacker = possession ? playerA : playerB;
    const defender = possession ? playerB : playerA;
    const atkScore = possession ? scoreA : scoreB;
    const defRating = defender.rating || 50;
    const atkRating = attacker.rating || 50;

    const shotChance = 0.30 + (atkRating / 99) * 0.30 - (defRating / 99) * 0.10;
    const roll = Math.random();
    let points = 0;
    let text = '';
    let outcome = ''; // 'score' | 'miss' | 'block' | 'turnover'

    if (roll < shotChance * 0.55) {
      points = 2;
      outcome = 'score';
      text = `${attacker.firstName} ${attacker.lastName} scores a mid-range jumper!`;
    } else if (roll < shotChance * 0.75) {
      points = 3;
      outcome = 'score';
      text = `${attacker.firstName} ${attacker.lastName} drains a 3-pointer!`;
    } else if (roll < shotChance * 0.85) {
      points = 1;
      outcome = 'score';
      text = `${attacker.firstName} ${attacker.lastName} hits a free throw.`;
    } else if (roll < 0.7) {
      outcome = 'miss';
      text = `${attacker.firstName} ${attacker.lastName} misses the shot.`;
    } else if (roll < 0.82) {
      outcome = 'block';
      text = `${defender.firstName} ${defender.lastName} blocks the shot!`;
    } else {
      outcome = 'turnover';
      text = `${attacker.firstName} ${attacker.lastName} turns it over.`;
    }

    if (points > 0) {
      atkScore.total += points;
    } else {
      // Miss / block / turnover → possession flips
      possession = !possession;
    }

    plays.push({ text, scoreA: scoreA.total, scoreB: scoreB.total, outcome });
  }

  const winnerName =
    scoreA.total === scoreB.total
      ? (Math.random() < 0.5 ? `${playerA.firstName} ${playerA.lastName}` : `${playerB.firstName} ${playerB.lastName}`)
      : scoreA.total > scoreB.total
        ? `${playerA.firstName} ${playerA.lastName}`
        : `${playerB.firstName} ${playerB.lastName}`;
  return {
    playerA: `${playerA.firstName} ${playerA.lastName}`,
    playerB: `${playerB.firstName} ${playerB.lastName}`,
    scoreA: scoreA.total,
    scoreB: scoreB.total,
    plays,
    winner: winnerName,
    targetScore,
  };
}

/**
 * Blacktop simulation: small-team half-court game to a target score (max 21).
 */
function simulateBlacktop(teamA, teamB, targetScore = 21) {
  targetScore = Math.min(21, Math.max(5, targetScore));
  const scoreA = { total: 0, players: {} };
  const scoreB = { total: 0, players: {} };

  for (const p of teamA.players) {
    scoreA.players[p.playerId] = { name: `${p.firstName} ${p.lastName}`, pts: 0 };
  }
  for (const p of teamB.players) {
    scoreB.players[p.playerId] = { name: `${p.firstName} ${p.lastName}`, pts: 0 };
  }

  const plays = [];
  let possession = Math.random() < 0.5;

  while (scoreA.total < targetScore && scoreB.total < targetScore && plays.length < 500) {
    const roster = possession ? teamA.players : teamB.players;
    const box = possession ? scoreA : scoreB;
    const teamName = possession ? teamA.name : teamB.name;
    const player = pickWeightedPlayer(roster);
    const pBox = box.players[player.playerId];

    const shotChance = 0.32 + (player.rating / 99) * 0.28;
    const roll = Math.random();
    let points = 0;
    let text = '';

    if (roll < shotChance * 0.5) {
      points = 2;
      text = `${player.firstName} ${player.lastName} scores a bucket!`;
    } else if (roll < shotChance * 0.75) {
      points = 3;
      text = `${player.firstName} ${player.lastName} hits a 3!`;
    } else if (roll < shotChance * 0.85) {
      points = 1;
      text = `${player.firstName} ${player.lastName} hits a free throw.`;
    } else if (roll < 0.72) {
      text = `${player.firstName} ${player.lastName} misses.`;
    } else if (roll < 0.82 && roster.length > 1) {
      const other = roster.find(p2 => p2.playerId !== player.playerId) || player;
      points = 2;
      text = `${other.firstName} ${other.lastName} finds ${player.firstName} ${player.lastName} for the easy score!`;
    } else {
      text = `${player.firstName} ${player.lastName} turns it over.`;
    }

    if (points > 0) {
      pBox.pts += points;
      box.total += points;
    } else {
      possession = !possession;
    }

    plays.push({ team: teamName, text, scoreA: scoreA.total, scoreB: scoreB.total });
  }

  let winnerName;
  if (scoreA.total > scoreB.total) winnerName = teamA.name;
  else if (scoreB.total > scoreA.total) winnerName = teamB.name;
  else winnerName = Math.random() < 0.5 ? teamA.name : teamB.name;

  return {
    teamA: teamA.name,
    teamB: teamB.name,
    scoreA: scoreA.total,
    scoreB: scoreB.total,
    boxScoreA: scoreA.players,
    boxScoreB: scoreB.players,
    plays,
    winner: winnerName,
    targetScore,
  };
}

module.exports = { simulateGame, simulate1v1, simulateBlacktop, pickWeightedPlayer, getDifficultyMods };
