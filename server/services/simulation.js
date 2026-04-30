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
  // Sprint B3 — clutch / IQ / leadership wiring.
  const { teamChemistryMul, clutchMul, iqDeltas } = require('./attributes');
  const chemA = teamChemistryMul((teamA?.players || []).slice(0, 5));
  const chemB = teamChemistryMul((teamB?.players || []).slice(0, 5));

  // Sprint C1 — commentary library + home-court advantage.
  const { commentary, CROWD } = require('./commentary');
  // homeSide: 'A' | 'B' | undefined. Home team gets +2% shot chance and
  // a -5% drop on opponent FT make rate.
  const homeSide = opts.homeSide;
  const homeBoostA = homeSide === 'A' ? 0.02 : 0;
  const homeBoostB = homeSide === 'B' ? 0.02 : 0;
  const ftDropA = homeSide === 'B' ? 0.05 : 0; // A is on the road
  const ftDropB = homeSide === 'A' ? 0.05 : 0;

  // Sprint C1 — momentum + hot/cold streak state per team & player.
  let runA = 0, runB = 0;        // consecutive made buckets per team
  let momA = 0, momB = 0;        // possessions left of momentum boost
  const playerStreak = {};       // playerId -> consecutive makes (positive) or misses (negative)

  // Sprint C2 — advanced situations.
  // Full-court press: opts.pressA / opts.pressB raise that side's steal rate
  // and slightly hurt opponent shot chance, but expose them to fast-break
  // points on broken presses.
  const pressA = !!opts.pressA;
  const pressB = !!opts.pressB;
  // Per-game challenges (1 per coach, surfaces in result.challenges).
  const challenges = { A: opts.challengesA != null ? opts.challengesA : 1, B: opts.challengesB != null ? opts.challengesB : 1 };
  const challengeLog = [];
  // Foul tracking — fouled-out players are removed from the active rotation.
  const fouledOut = new Set();
  let techA = 0, techB = 0; // technicals issued
  let flagA = 0, flagB = 0; // flagrants
  let and1A = 0, and1B = 0; // and-1 buckets

  // Coach playbook bonus — sharper sets => higher shot conversion.
  // User defaults to 7 (neutral); CPU teams get 7–10 from generation.
  const coachA = teamA?.coachRating ?? 7;
  const coachB = teamB?.coachRating ?? 7;
  // Each rating point above 7 adds +1.5% to that team's shot chance.
  const coachBoostA = (coachA - 7) * 0.015;
  const coachBoostB = (coachB - 7) * 0.015;

  // Sprint C3 — coach style modifiers (offensive/defensive/balanced/dev).
  // Layered on top of coachRating. Loaded lazily so the engine still works
  // when callers don't pass coachInfo (legacy paths).
  const { coachStyleMods, buildAssignmentLookup, defensivePenalty, paceMod } = require('./coaching');
  const styleA = coachStyleMods(teamA?.coachInfo);
  const styleB = coachStyleMods(teamB?.coachInfo);

  // Sprint C3 — defensive assignments. opts.defensiveAssignmentsA is an
  // array [{defenderId, opponentScorerId}] passed by the user side; the
  // CPU may also pass one for itself.
  const assignA = buildAssignmentLookup(opts.defensiveAssignmentsA || [], teamA?.players || []);
  const assignB = buildAssignmentLookup(opts.defensiveAssignmentsB || [], teamB?.players || []);

  // Sprint C3 — pace control. Affects elapsed-per-possession (smaller
  // elapsed = more possessions per quarter).
  const paceA = paceMod(opts.paceA || teamA?.coachInfo?.preferredPace);
  const paceB = paceMod(opts.paceB || teamB?.coachInfo?.preferredPace);
  const avgPaceMul = (paceA.possessionMul + paceB.possessionMul) / 2;

  // Mid-game play calling (item 2). Each side may pass an offensive +
  // defensive scheme via opts.playCallA / opts.playCallB. The offensive
  // call boosts THAT team's shot conversion; the defensive call drops the
  // OPPONENT's shot conversion. ±8% per call (aggressive setting).
  const playCallA = opts.playCallA || {};
  const playCallB = opts.playCallB || {};
  const PLAY_BOOST = 0.08;
  const offBoostA = playCallA.offensive ? PLAY_BOOST : 0;
  const offBoostB = playCallB.offensive ? PLAY_BOOST : 0;
  const defDropA  = playCallB.defensive ? PLAY_BOOST : 0; // B's defense hurts A
  const defDropB  = playCallA.defensive ? PLAY_BOOST : 0; // A's defense hurts B

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
      // Sprint C3 — pace mul shortens/lengthens average possession.
      const elapsed = Math.max(3, Math.round((Math.floor(Math.random() * 20) + 5) / avgPaceMul));
      clock = Math.max(0, clock - elapsed);

      const isTeamA = Math.random() < 0.5;
      const roster = isTeamA ? teamA.players : teamB.players;
      const box = isTeamA ? boxA : boxB;
      const tStats = isTeamA ? statsA : statsB;
      const oStats = isTeamA ? statsB : statsA;
      const oBox = isTeamA ? boxB : boxA;
      const teamName = isTeamA ? teamA.name : teamB.name;
      const oRoster = isTeamA ? teamB.players : teamA.players;

      // Sprint C1 — blowout mercy: 25+ point lead in Q4 means the
      // winning side substitutes its bench in for the rest of the game.
      const leadForMercy = isTeamA ? (scoreATot - scoreBTot) : (scoreBTot - scoreATot);
      const blowoutQ4 = q === 4 && leadForMercy >= 25;
      // Sprint C2 — exclude fouled-out players from the active pool and
      // reduce weight on players with foul trouble (3+ in H1, 5 in H2).
      const isHealthyForRotation = (p) => !fouledOut.has(p.playerId);
      let basePool = blowoutQ4 && roster.length > 5
        ? roster.slice(5, Math.min(10, roster.length))
        : roster.slice(0, 5);
      basePool = basePool.filter(isHealthyForRotation);
      // Backfill from bench if the active 5 has lost players to foul-out.
      if (basePool.length < 5) {
        for (const p of roster.slice(5)) {
          if (basePool.length >= 5) break;
          if (isHealthyForRotation(p)) basePool.push(p);
        }
      }
      const active = basePool.length ? basePool : roster.slice(0, 5);
      // Foul-trouble: temporarily down-weight starters with 3+ fouls in H1
      // or 5 in H2 by halving their pick weight (clone with reduced rating).
      const weighted = active.map(p => {
        const fb = (box[p.playerId] && box[p.playerId].pf) || 0;
        const inTrouble = (q <= 2 && fb >= 3) || (q >= 3 && fb >= 5);
        return inTrouble ? { ...(p.toObject ? p.toObject() : p), rating: Math.round((p.rating || 70) * 0.5) } : p;
      });
      const player = pickWeightedPlayer(weighted);
      if (!player) continue;
      const pBox = box[player.playerId];
      pBox.min += Math.round(elapsed / 60 * 10) / 10;      const sideMul = isTeamA ? shotMulA : shotMulB;
      // Play-call adjustment: offensive scheme boosts your conversion;
      // opponent's defensive scheme drops it. Both apply if active.
      const playAdj = isTeamA
        ? (offBoostA - defDropA)
        : (offBoostB - defDropB);
      // Sprint B3 — clutch + chemistry shot multipliers.
      const marginAbs = Math.abs(scoreATot - scoreBTot);
      const clutchM = clutchMul(player, { quarter: q, marginAbs });
      const chemM = isTeamA ? chemA : chemB;
      // Sprint C1 — home-court, momentum, hot/cold streaks.
      const homeAdj = isTeamA ? homeBoostA : homeBoostB;
      const momentumActive = (isTeamA ? momA : momB) > 0;
      const momentumAdj = momentumActive ? 0.05 : 0;
      const streakCount = playerStreak[player.playerId] || 0;
      let streakAdj = 0;
      if (streakCount >= 3) streakAdj = 0.04;          // hot: +4%
      else if (streakCount <= -4) streakAdj = -0.05;   // cold: -5%
      // Sprint C2 — full-court press: opponent press drops your shot chance
      // ~1.5% (rushed offense) while raising the steal threshold band.
      const oppressed = isTeamA ? pressB : pressA;
      const pressDrop = oppressed ? 0.015 : 0;
      // Sprint C3 — coach style + assigned-defender penalty.
      const styleOwn = isTeamA ? styleA.ownShotBoost : styleB.ownShotBoost;
      const styleOpp = isTeamA ? styleB.oppShotDrop : styleA.oppShotDrop;
      const guardLookup = isTeamA ? assignB : assignA; // opponent's lookup
      const guardPenalty = defensivePenalty(player, guardLookup);
      const rawChance = (0.35 + (player.rating / 99) * 0.25 + (isTeamA ? coachBoostA : coachBoostB) + playAdj + homeAdj + momentumAdj + streakAdj - pressDrop + styleOwn - styleOpp + guardPenalty) * sideMul * clutchM * chemM;
      const shotChance = Math.max(0.25, Math.min(0.85, rawChance));
      // Made-shot ceiling: scoring outcomes occupy [0, made]; misses, steals,
      // assists, blocks, turnovers, fouls split the remaining (1 - made)
      // proportionally so miss rates scale inversely with difficulty.
      const made    = shotChance * 0.88;
      const rem     = 1 - made;
      // Sprint B3 — IQ shifts assist/turnover splits.
      const { assistDelta, turnoverDelta } = iqDeltas(player);
      const tMiss2  = made + rem * 0.32;
      const tMiss3  = made + rem * 0.50;
      const tAst    = made + rem * (0.62 + assistDelta);
      // Sprint C2 — pressing defense raises steal probability (~+5pp)
      // but the offense gets fast-break paint conversions when they break
      // the press (handled in paint branch).
      const tStl    = made + rem * (oppressed ? 0.79 : 0.74);
      const tBlk    = made + rem * 0.84;
      const tTO     = made + rem * (0.95 + turnoverDelta);
      // remaining tail = foul
      const roll = Math.random();
      // Sprint C2 — intentional foul: trailing team in final minute of Q4
      // intentionally fouls when 3+ down and they are on defense.
      const finalMinute = q === 4 && clock <= 60;
      const trailingByThree = finalMinute && (
        (isTeamA && (scoreATot - scoreBTot) <= -3) ||
        (!isTeamA && (scoreBTot - scoreATot) <= -3)
      );
      // Trailing side commits the foul on opponent possession; here `isTeamA`
      // = possessing side, so when the OPPOSITE team trails, opponent will
      // foul this possession. We model that by forcing the foul branch with
      // a synthetic high roll so the play resolves as a non-shooting foul
      // sending the offense to the line. We only do this 70% of possessions
      // to keep some variety.
      const oppTrails = finalMinute && (
        (isTeamA && (scoreATot - scoreBTot) >= 3) ||
        (!isTeamA && (scoreBTot - scoreATot) >= 3)
      );
      const forceIntentionalFoul = oppTrails && Math.random() < 0.7;

      let points = 0;
      let playText = '';
      let playType = '';

      if (forceIntentionalFoul) {
        // Defensive intentional foul on the offensive star (highest rated active opponent).
        const fouler = (oRoster.slice(0, 5).filter(p => !fouledOut.has(p.playerId)).sort((a, b) => (a.rating || 0) - (b.rating || 0))[0]) || oRoster[0];
        const foulerBox = oBox[fouler.playerId];
        if (foulerBox) foulerBox.pf++; oStats.pf++;
        const ftMake = 0.78 - (isTeamA ? ftDropA : ftDropB);
        let ftPts = 0;
        if (Math.random() < ftMake) ftPts++;
        if (Math.random() < ftMake) ftPts++;
        pBox.fta += 2; tStats.fta += 2;
        if (ftPts) { pBox.ftm += ftPts; tStats.ftm += ftPts; pBox.pts += ftPts; tStats.pts += ftPts; points = ftPts; }
        if (isTeamA) scoreATot += ftPts; else scoreBTot += ftPts;
        playText = `Intentional foul by ${fouler.firstName} ${fouler.lastName}! ${player.firstName} ${player.lastName} hits ${ftPts}/2.`;
        playType = 'foul';
        if (foulerBox && foulerBox.pf >= 6 && !fouledOut.has(fouler.playerId)) {
          fouledOut.add(fouler.playerId);
          playText += ` ${fouler.firstName} ${fouler.lastName} has fouled out!`;
        }
      } else if (roll < shotChance * 0.45) {
        // 2-pointer in paint
        points = 2;
        pBox.fgm++; pBox.fga++; tStats.fgm++; tStats.fga++;
        tStats.ptsInPaint += 2;
        // Sprint C2 — and-1: 10% chance contact triggers an extra FT.
        const isAnd1 = Math.random() < 0.10;
        if (isAnd1) {
          const ftMake = 0.75 - (isTeamA ? ftDropA : ftDropB);
          if (Math.random() < ftMake) { pBox.pts += 1; tStats.pts += 1; pBox.ftm++; tStats.ftm++; points += 1; }
          pBox.fta += 1; tStats.fta += 1;
          if (isTeamA) and1A++; else and1B++;
        }
        // Sprint C2 — fast-break note when defense was pressing and we broke it.
        const wasFastBreak = oppressed && Math.random() < 0.35;
        playText = wasFastBreak ? commentary('fastbreak', { player }) : commentary('paint', { player });
        if (isAnd1) playText += ` AND-ONE! Foul on the play \u2014 free throw to follow.`;
        playType = 'score';
        shots.push({ team: teamName, x: randomShotLocation('paint').x, y: randomShotLocation('paint').y, made: true, type: '2pt' });
      } else if (roll < shotChance * 0.65) {
        // Mid-range 2
        points = 2;
        pBox.fgm++; pBox.fga++; tStats.fgm++; tStats.fga++;
        playText = commentary('mid', { player });
        playType = 'score';
        shots.push({ team: teamName, ...randomShotLocation('mid'), made: true, type: '2pt' });
      } else if (roll < shotChance * 0.8) {
        // 3-pointer
        points = 3;
        pBox.fgm++; pBox.fga++; pBox.fg3m++; pBox.fg3a++;
        tStats.fgm++; tStats.fga++; tStats.fg3m++; tStats.fg3a++;
        playText = commentary('three', { player });
        playType = 'score';
        shots.push({ team: teamName, ...randomShotLocation('3pt'), made: true, type: '3pt' });
      } else if (roll < shotChance * 0.88) {
        // Free throws (2 attempts) — Sprint C1: home crowd drops opponent FT make rate.
        const ftMake = 0.75 - (isTeamA ? ftDropA : ftDropB);
        const ft1 = Math.random() < ftMake;
        const ft2 = Math.random() < ftMake;
        pBox.fta += 2; tStats.fta += 2;
        if (ft1) { pBox.ftm++; tStats.ftm++; points++; }
        if (ft2) { pBox.ftm++; tStats.ftm++; points++; }
        playText = `${commentary('ft', { player })} ${ft1 ? '✓' : '✗'}/${ft2 ? '✓' : '✗'} (${points} pts)`;
        playType = points > 0 ? 'score' : 'miss';
      } else if (roll < tMiss2) {
        // Missed 2pt
        pBox.fga++; tStats.fga++;
        playText = commentary('miss2', { player });
        playType = 'miss';
        shots.push({ team: teamName, ...randomShotLocation('mid'), made: false, type: '2pt' });
        // Rebound
        const offReb = Math.random() < 0.3;
        const rebRoster = offReb ? active : oRoster.slice(0, 5);
        const rebounder = pickWeightedPlayer(rebRoster);
        const rebBox = offReb ? box[rebounder.playerId] : oBox[rebounder.playerId];
        const rebStats = offReb ? tStats : oStats;
        rebBox.reb++; rebStats.reb++;
        playText += ' ' + commentary(offReb ? 'putback' : 'rebound', { player: rebounder, reb: rebounder });
      } else if (roll < tMiss3) {
        // Missed 3pt
        pBox.fga++; pBox.fg3a++; tStats.fga++; tStats.fg3a++;
        playText = commentary('miss3', { player });
        playType = 'miss';
        shots.push({ team: teamName, ...randomShotLocation('3pt'), made: false, type: '3pt' });
        const rebounder = pickWeightedPlayer(oRoster.slice(0, 5));
        oBox[rebounder.playerId].reb++; oStats.reb++;
        playText += ' ' + commentary('rebound', { reb: rebounder });
      } else if (roll < tAst) {
        // Assist + score
        const assister = active.find(p => p.playerId !== player.playerId) || player;
        box[assister.playerId].ast++; tStats.ast++;
        points = 2;
        pBox.fgm++; pBox.fga++; tStats.fgm++; tStats.fga++;
        playText = commentary('assist', { player, assist: assister });
        playType = 'score';
        shots.push({ team: teamName, ...randomShotLocation('paint'), made: true, type: '2pt' });
      } else if (roll < tStl) {
        // Steal
        const stealer = pickWeightedPlayer(oRoster.slice(0, 5));
        oBox[stealer.playerId].stl++; oStats.stl++;
        pBox.turnover++; tStats.turnover++;
        playText = commentary('steal', { player, defender: stealer });
        playType = 'steal';
      } else if (roll < tBlk) {
        // Block
        const blocker = pickWeightedPlayer(oRoster.slice(0, 5));
        oBox[blocker.playerId].blk++; oStats.blk++;
        pBox.fga++; tStats.fga++;
        playText = commentary('block', { player, defender: blocker });
        playType = 'block';
        shots.push({ team: teamName, ...randomShotLocation('paint'), made: false, type: '2pt', blocked: true });
      } else if (roll < tTO) {
        // Turnover
        pBox.turnover++; tStats.turnover++;
        playText = commentary('turnover', { player });
        playType = 'turnover';
      } else {
        // Foul — Sprint C2 expansion: 2% flagrant (2 FTs + possession),
        // ~1% technical (1 FT). Otherwise normal personal foul.
        pBox.pf++; tStats.pf++;
        const fr = Math.random();
        if (fr < 0.02) {
          // Flagrant: opponent shoots 2 FTs.
          const fouled = pickWeightedPlayer(oRoster.slice(0, 5)) || oRoster[0];
          const ftMake = 0.75 - (isTeamA ? ftDropA : ftDropB);
          let ftPts = 0;
          if (Math.random() < ftMake) ftPts++;
          if (Math.random() < ftMake) ftPts++;
          oBox[fouled.playerId].fta += 2; oStats.fta += 2;
          if (ftPts) { oBox[fouled.playerId].ftm += ftPts; oStats.ftm += ftPts; oBox[fouled.playerId].pts += ftPts; oStats.pts += ftPts; }
          if (isTeamA) { scoreBTot += ftPts; flagA++; } else { scoreATot += ftPts; flagB++; }
          playText = `FLAGRANT FOUL on ${player.firstName} ${player.lastName}! ${fouled.firstName} ${fouled.lastName} hits ${ftPts}/2 from the line.`;
          playType = 'flagrant';
        } else if (fr < 0.03) {
          // Technical: opponent shoots 1 FT.
          const shooter = pickWeightedPlayer(oRoster.slice(0, 5)) || oRoster[0];
          const ftMake = 0.78 - (isTeamA ? ftDropA : ftDropB);
          const make = Math.random() < ftMake;
          oBox[shooter.playerId].fta += 1; oStats.fta += 1;
          if (make) {
            oBox[shooter.playerId].ftm++; oStats.ftm++;
            oBox[shooter.playerId].pts++; oStats.pts++;
            if (isTeamA) scoreBTot++; else scoreATot++;
          }
          if (isTeamA) techA++; else techB++;
          playText = `TECHNICAL FOUL on ${player.firstName} ${player.lastName}. ${shooter.firstName} ${shooter.lastName} ${make ? 'sinks' : 'misses'} the technical.`;
          playType = 'technical';
        } else {
          playText = commentary('foul', { player });
          playType = 'foul';
        }
        // Sprint C2 — foul-out: 6 personal fouls => ejected.
        if (pBox.pf >= 6 && !fouledOut.has(player.playerId)) {
          fouledOut.add(player.playerId);
          playText += ` ${player.firstName} ${player.lastName} has fouled out!`;
        }
      }

      if (points > 0) {
        pBox.pts += points;
        tStats.pts += points;
        if (isTeamA) scoreATot += points; else scoreBTot += points;
      }

      // Sprint C1 — momentum + hot/cold streak bookkeeping.
      const wasMade = points > 0 && (playType === 'score');
      // Made FG (not FT-only) updates the player streak. FT trips don't count.
      if (wasMade && roll < shotChance * 0.8) {
        playerStreak[player.playerId] = Math.max(1, (playerStreak[player.playerId] || 0)) + 1;
        // Reset cold flags for same player
      } else if (playType === 'miss' || playType === 'block') {
        playerStreak[player.playerId] = Math.min(-1, (playerStreak[player.playerId] || 0)) - 1;
      }
      // Team run tracking — counts consecutive scoring possessions.
      if (wasMade) {
        if (isTeamA) { runA += 1; runB = 0; } else { runB += 1; runA = 0; }
        // 3+ consecutive scores triggers 2-possession momentum window.
        if (isTeamA && runA >= 3) momA = 2; else if (!isTeamA && runB >= 3) momB = 2;
      } else if (playType === 'miss' || playType === 'turnover' || playType === 'block' || playType === 'steal') {
        if (isTeamA) runA = 0; else runB = 0;
      }
      // Decrement momentum window on opposing possession.
      if (isTeamA) { if (momB > 0) momB -= 1; } else { if (momA > 0) momA -= 1; }

      // Hot-streak / cold-streak / crowd callouts attach to text only.
      const sc = playerStreak[player.playerId] || 0;
      if (sc === 3 && wasMade) playText += ` 🔥 ${player.firstName} ${player.lastName} is HEATING UP!`;
      else if (sc >= 5 && wasMade) playText += ` 🔥🔥 ${player.firstName} ${player.lastName} IS ON FIRE!`;
      else if (sc <= -4 && (playType === 'miss' || playType === 'block')) {
        playText += ` ❄️ ${player.firstName} ${player.lastName} can\u2019t buy a bucket.`;
      }
      if (wasMade && (runA === 6 || runB === 6)) {
        playText += ' ' + (homeSide === (runA === 6 ? 'A' : 'B') ? CROWD.homeIgnites : CROWD.bigRun);
      }
      if (blowoutQ4) playText += ' [Bench unit in — mercy minutes]';

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
      const elapsed = Math.max(3, Math.round((Math.floor(Math.random() * 20) + 5) / avgPaceMul));
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

      const playAdj = isTeamA
        ? (offBoostA - defDropA)
        : (offBoostB - defDropB);
      const rawChance = (0.35 + (player.rating / 99) * 0.25 + (isTeamA ? coachBoostA : coachBoostB) + playAdj)
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
    // Play-call & timeout metadata for the live game UI (item 2).
    playCallA: {
      offensive: playCallA.offensive || null,
      defensive: playCallA.defensive || null,
    },
    playCallB: {
      offensive: playCallB.offensive || null,
      defensive: playCallB.defensive || null,
    },
    timeoutsA: typeof opts.timeoutsA === 'number' ? opts.timeoutsA : 6,
    timeoutsB: typeof opts.timeoutsB === 'number' ? opts.timeoutsB : 6,
    // Sprint C2 — advanced game situations report.
    situations: {
      and1: { A: and1A, B: and1B },
      flagrants: { A: flagA, B: flagB },
      technicals: { A: techA, B: techB },
      fouledOut: Array.from(fouledOut),
      challengesRemaining: { A: challenges.A, B: challenges.B },
      challengeLog,
      pressA, pressB,
    },
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
