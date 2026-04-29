// Playoff bracket generator + best-of-7 series simulator.
//
// Builds a 16-team bracket (top 8 East + top 8 West) with the standard
// 1v8/2v7/3v6/4v5 first-round seeding, then advances winners through
// Conference Semifinals → Conference Finals → NBA Finals.
//
// All series use the same lightweight quickSimRecord() helper used for
// CPU-vs-CPU regular-season games so the bracket plays out instantly when
// the user clicks "Simulate Playoffs".

const { quickSimRecord, teamAvgRating, applyLineup } = require('./fantasyGM');
const { simulateGame } = require('./simulation');

const ROUND_NAMES = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];

function teamRecord(user, name) {
  if (user.team?.name === name) {
    return { name, conference: user.conference, wins: user.seasonWins, losses: user.seasonLosses };
  }
  const cpu = user.cpuTeams.find(t => t.name === name);
  const rec = (user.cpuRecords || []).find(r => r.name === name) || { wins: 0, losses: 0 };
  return cpu ? { name, conference: cpu.conference, wins: rec.wins, losses: rec.losses } : null;
}

function teamObject(user, name) {
  if (user.team?.name === name) {
    return { name, players: user.team.players, conference: user.conference };
  }
  const cpu = user.cpuTeams.find(t => t.name === name);
  return cpu ? { name: cpu.name, players: cpu.players, conference: cpu.conference } : null;
}

// Build the bracket: top 8 of each conference, seeded 1..8, paired 1v8/2v7/3v6/4v5.
function buildBracket(user) {
  const all = [];
  all.push({
    name: user.team.name || 'My Team',
    conference: user.conference,
    wins: user.seasonWins,
    losses: user.seasonLosses,
    isUser: true,
  });
  for (const t of user.cpuTeams) {
    const rec = (user.cpuRecords || []).find(r => r.name === t.name) || { wins: 0, losses: 0 };
    all.push({ name: t.name, conference: t.conference, wins: rec.wins, losses: rec.losses, isUser: false });
  }

  const sorted = (conf) => all
    .filter(t => t.conference === conf)
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses))
    .slice(0, 8)
    .map((t, i) => ({ ...t, seed: i + 1 }));

  const east = sorted('East');
  const west = sorted('West');

  function makeFirstRound(seeds, conference) {
    return [
      { conference, teamA: seeds[0], teamB: seeds[7] },
      { conference, teamA: seeds[3], teamB: seeds[4] },
      { conference, teamA: seeds[1], teamB: seeds[6] },
      { conference, teamA: seeds[2], teamB: seeds[5] },
    ].map(s => ({
      ...s,
      winsA: 0, winsB: 0, winner: '', results: [],
    }));
  }

  return [
    {
      name: ROUND_NAMES[0],
      series: [...makeFirstRound(east, 'East'), ...makeFirstRound(west, 'West')],
    },
    { name: ROUND_NAMES[1], series: [] },
    { name: ROUND_NAMES[2], series: [] },
    { name: ROUND_NAMES[3], series: [] },
  ];
}

// Play a best-of-7 series. Returns the mutated `series` with winner +
// individual game results. quickSimRecord operates on { players: [...] }.
// When `fullPlayByPlay` is true, runs the full simulateGame() per game and
// returns the rich game data array via the second return value (NOT stored
// on the series doc to keep the user record small).
function playSeries(series, user, rng = Math.random, opts = {}) {
  const fullPbp = !!opts.fullPlayByPlay;
  const games = [];
  if (series.winner) return { series, games };
  const teamA = teamObject(user, series.teamA.name) || { name: series.teamA.name, players: [] };
  const teamB = teamObject(user, series.teamB.name) || { name: series.teamB.name, players: [] };
  // Carry coachRating into the sim payload so playoff games respect it.
  const cpuA = user.cpuTeams.find(t => t.name === series.teamA.name);
  const cpuB = user.cpuTeams.find(t => t.name === series.teamB.name);
  if (cpuA) teamA.coachRating = cpuA.coachRating;
  if (cpuB) teamB.coachRating = cpuB.coachRating;
  // If the user's team is in this series, tilt the sim by user.difficulty.
  const userSide = teamA.name === user.team?.name ? 'A'
    : teamB.name === user.team?.name ? 'B' : null;
  const simOpts = { difficulty: user.difficulty, userSide };
  while (series.winsA < 4 && series.winsB < 4) {
    if (fullPbp && teamA.players.length && teamB.players.length) {
      // Honor the user's chosen starting 5 (inLineup) when their team plays.
      const aLineup = teamA.name === user.team.name ? applyLineup(teamA) : teamA;
      const bLineup = teamB.name === user.team.name ? applyLineup(teamB) : teamB;
      const g = simulateGame(aLineup, bLineup, simOpts);
      const winnerSide = g.scoreA > g.scoreB ? 'A' : 'B';
      series.results.push({
        scoreA: g.scoreA,
        scoreB: g.scoreB,
        winner: winnerSide === 'A' ? series.teamA.name : series.teamB.name,
      });
      games.push(g);
      if (winnerSide === 'A') series.winsA += 1; else series.winsB += 1;
    } else {
      const r = quickSimRecord(teamA, teamB, rng, simOpts);
      series.results.push({ scoreA: r.scoreA, scoreB: r.scoreB, winner: r.winner === 'A' ? series.teamA.name : series.teamB.name });
      if (r.winner === 'A') series.winsA += 1; else series.winsB += 1;
    }
  }
  series.winner = series.winsA === 4 ? series.teamA.name : series.teamB.name;
  return { series, games };
}

// Advance the bracket: build next round based on winners of the current
// round. Re-seeds first-round winners by original seed for the semis.
function advanceBracket(rounds, user) {
  const cur = rounds.findIndex(r => r.series.length && r.series.some(s => !s.winner));
  if (cur >= 0) return rounds; // unfinished round
  const lastFull = rounds.findIndex((r, i) => r.series.length && r.series.every(s => s.winner) && (i === rounds.length - 1 || rounds[i + 1].series.length === 0));
  if (lastFull < 0 || lastFull === rounds.length - 1) return rounds;

  const finished = rounds[lastFull];
  const next = rounds[lastFull + 1];

  if (lastFull === 0) {
    // Build conf semis. Pair 1v8-winner with 4v5-winner, 2v7-winner with 3v6-winner.
    ['East', 'West'].forEach(conf => {
      const confSeries = finished.series.filter(s => s.conference === conf);
      // index 0 (1v8), 1 (4v5), 2 (2v7), 3 (3v6)
      const winnerOf = (s) => ({
        name: s.winner,
        conference: conf,
        seed: s.winner === s.teamA.name ? s.teamA.seed : s.teamB.seed,
        isUser: (s.winner === s.teamA.name ? s.teamA.isUser : s.teamB.isUser),
      });
      next.series.push({
        conference: conf,
        teamA: winnerOf(confSeries[0]),
        teamB: winnerOf(confSeries[1]),
        winsA: 0, winsB: 0, winner: '', results: [],
      });
      next.series.push({
        conference: conf,
        teamA: winnerOf(confSeries[2]),
        teamB: winnerOf(confSeries[3]),
        winsA: 0, winsB: 0, winner: '', results: [],
      });
    });
  } else if (lastFull === 1) {
    // Build conference finals.
    ['East', 'West'].forEach(conf => {
      const confSeries = finished.series.filter(s => s.conference === conf);
      const winnerOf = (s) => ({
        name: s.winner,
        conference: conf,
        seed: s.winner === s.teamA.name ? s.teamA.seed : s.teamB.seed,
        isUser: (s.winner === s.teamA.name ? s.teamA.isUser : s.teamB.isUser),
      });
      next.series.push({
        conference: conf,
        teamA: winnerOf(confSeries[0]),
        teamB: winnerOf(confSeries[1]),
        winsA: 0, winsB: 0, winner: '', results: [],
      });
    });
  } else if (lastFull === 2) {
    // Build NBA Finals: East champ vs West champ.
    const east = finished.series.find(s => s.conference === 'East');
    const west = finished.series.find(s => s.conference === 'West');
    const winnerOf = (s, conf) => ({
      name: s.winner, conference: conf,
      seed: s.winner === s.teamA.name ? s.teamA.seed : s.teamB.seed,
      isUser: (s.winner === s.teamA.name ? s.teamA.isUser : s.teamB.isUser),
    });
    next.series.push({
      conference: 'Finals',
      teamA: winnerOf(east, 'East'),
      teamB: winnerOf(west, 'West'),
      winsA: 0, winsB: 0, winner: '', results: [],
    });
  }
  return rounds;
}

// Run every unfinished series in the current round, then keep advancing.
function simulateAll(rounds, user, rng = Math.random) {
  for (let r = 0; r < rounds.length; r++) {
    while (rounds[r].series.length === 0) {
      // Build it from previous round.
      advanceBracket(rounds, user);
      if (rounds[r].series.length === 0) return rounds; // can't advance
    }
    rounds[r].series.forEach(s => playSeries(s, user, rng));
    advanceBracket(rounds, user);
  }
  return rounds;
}

// Determine playoff result for the user (used by career.playoffResult).
function userPlayoffResult(rounds, userTeamName) {
  const finals = rounds[3]?.series?.[0];
  if (finals?.winner === userTeamName) return 'champion';
  if (finals && (finals.teamA?.name === userTeamName || finals.teamB?.name === userTeamName)) return 'finalist';
  const cf = rounds[2]?.series || [];
  if (cf.some(s => s.teamA?.name === userTeamName || s.teamB?.name === userTeamName)) return 'conf-finals';
  const semi = rounds[1]?.series || [];
  if (semi.some(s => s.teamA?.name === userTeamName || s.teamB?.name === userTeamName)) return 'semis';
  const r1 = rounds[0]?.series || [];
  if (r1.some(s => s.teamA?.name === userTeamName || s.teamB?.name === userTeamName)) return 'first-round';
  return 'missed';
}

module.exports = { buildBracket, playSeries, advanceBracket, simulateAll, userPlayoffResult, teamRecord, ROUND_NAMES };
