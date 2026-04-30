// Sprint D2 — Records, history, championship banners and Hall of Fame.
//
// All of this is derived from data already stored on the user document:
//   user.career[]                 — per-season summaries (Sprint A2)
//   user.seasonAwards / careerAwards (Sprint D1)
//   user.coachOfTheYearHistory[]  — Sprint C3
//   user.gamesPlayed[]            — Game documents
//
// Public API:
//   computeFranchiseRecords(user, games)
//   computeAllTimeLeaders(user)
//   computeBanners(user)
//   evaluateHallOfFame(user, careerAwards)

// --- Franchise records ------------------------------------------------------

function computeFranchiseRecords(user, recentGames = []) {
  const career = user.career || [];

  const bestSeason = career.reduce((best, s) =>
    !best || s.wins > best.wins ? s : best, null);
  const worstSeason = career.reduce((worst, s) =>
    !worst || s.wins < worst.wins ? s : worst, null);

  // Pull point records from Game documents the caller passes in.
  let mostPointsGame = null;
  let biggestWin = null;
  for (const g of recentGames) {
    const teamA = g.teamA?.name === user.team?.name;
    const userScore = teamA ? g.scoreA : g.scoreB;
    const oppScore = teamA ? g.scoreB : g.scoreA;
    const won = userScore > oppScore;
    if (!mostPointsGame || userScore > mostPointsGame.points) {
      mostPointsGame = {
        gameId: String(g._id),
        points: userScore,
        opponent: teamA ? g.teamB?.name : g.teamA?.name,
        opponentScore: oppScore,
        won,
      };
    }
    if (won && (!biggestWin || (userScore - oppScore) > biggestWin.margin)) {
      biggestWin = {
        gameId: String(g._id),
        margin: userScore - oppScore,
        score: `${userScore}-${oppScore}`,
        opponent: teamA ? g.teamB?.name : g.teamA?.name,
      };
    }
  }

  const totalWins = career.reduce((s, x) => s + (x.wins || 0), 0);
  const totalLosses = career.reduce((s, x) => s + (x.losses || 0), 0);
  const championships = career.filter(c => c.champion).length;
  const finalsApps = career.filter(c =>
    ['champion', 'finalist'].includes(c.playoffResult)).length;

  return {
    teamName: user.team?.name || '',
    seasonsPlayed: career.length,
    totalWins,
    totalLosses,
    winPct: totalWins + totalLosses ? totalWins / (totalWins + totalLosses) : 0,
    championships,
    finalsAppearances: finalsApps,
    bestSeason,
    worstSeason,
    mostPointsInGame: mostPointsGame,
    biggestWin,
  };
}

// --- All-time league leaders -----------------------------------------------
//
// Aggregated across every season the user has played. We sum each player's
// per-season stat lines (saved on careerAwards[].statLines) into career
// totals and average columns. Players who appeared in multiple seasons are
// grouped by playerId.

function computeAllTimeLeaders(careerAwards) {
  const totals = new Map();
  for (const yr of careerAwards || []) {
    for (const line of yr.statLines || []) {
      const key = line.playerId;
      if (!key) continue;
      const acc = totals.get(key) || {
        playerId: key, name: line.name, position: line.position,
        seasons: 0, totalGp: 0,
        totalPoints: 0, totalAst: 0, totalReb: 0, totalStl: 0, totalBlk: 0,
        teams: new Set(),
      };
      acc.seasons += 1;
      acc.totalGp += line.gp || 0;
      acc.totalPoints += (line.ppg || 0) * (line.gp || 0);
      acc.totalAst += (line.apg || 0) * (line.gp || 0);
      acc.totalReb += (line.rpg || 0) * (line.gp || 0);
      acc.totalStl += (line.spg || 0) * (line.gp || 0);
      acc.totalBlk += (line.bpg || 0) * (line.gp || 0);
      if (line.teamName) acc.teams.add(line.teamName);
      totals.set(key, acc);
    }
  }
  const all = [...totals.values()].map(a => ({
    playerId: a.playerId,
    name: a.name,
    position: a.position,
    seasons: a.seasons,
    gp: a.totalGp,
    points: Math.round(a.totalPoints),
    rebounds: Math.round(a.totalReb),
    assists: Math.round(a.totalAst),
    steals: Math.round(a.totalStl),
    blocks: Math.round(a.totalBlk),
    teams: [...a.teams],
  }));
  const top = (key, n = 10) =>
    all.slice().sort((a, b) => b[key] - a[key]).slice(0, n);
  return {
    totalPlayers: all.length,
    points:   top('points'),
    rebounds: top('rebounds'),
    assists:  top('assists'),
    steals:   top('steals'),
    blocks:   top('blocks'),
  };
}

// --- Championship banners --------------------------------------------------

function computeBanners(user) {
  const banners = (user.career || [])
    .filter(c => c.champion || c.playoffResult === 'champion')
    .map(c => ({
      seasonNumber: c.seasonNumber,
      year: c.year,
      record: `${c.wins}-${c.losses}`,
      teamName: user.team?.name,
    }));
  return banners;
}

// --- Hall of Fame ----------------------------------------------------------
//
// A retired player qualifies for the Hall of Fame if their career profile
// hits any of the milestones below. "Retired" is approximated as a player
// from a previous season's awards roster who is no longer present on the
// user's current team or the CPU rosters.

function buildLivePlayerSet(user) {
  const ids = new Set();
  for (const p of (user.team?.players || [])) ids.add(p.playerId);
  for (const t of (user.cpuTeams || [])) {
    for (const p of (t.players || [])) ids.add(p.playerId);
  }
  return ids;
}

function evaluateHallOfFame(user, careerAwards) {
  const livePlayers = buildLivePlayerSet(user);

  // Aggregate every player who has ever appeared in awards data.
  const tally = new Map();
  for (const yr of careerAwards || []) {
    const mvpId = yr.mvp?.playerId;
    const dpoyId = yr.dpoy?.playerId;
    const royId = yr.roy?.playerId;
    const sixId = yr.sixthMan?.playerId;
    const mipId = yr.mip?.playerId;
    const allNBAIds = (yr.allNBA || []).flatMap(t => (t.players || []).map(p => p.playerId));
    const allDefIds = (yr.allDefensive || []).flatMap(t => (t.players || []).map(p => p.playerId));

    for (const line of yr.statLines || []) {
      const acc = tally.get(line.playerId) || {
        playerId: line.playerId, name: line.name, position: line.position,
        seasons: 0, mvps: 0, dpoys: 0, roys: 0, sixmoys: 0, mips: 0,
        allNBA: 0, allDef: 0,
        careerPoints: 0, careerReb: 0, careerAst: 0, careerStl: 0, careerBlk: 0,
        rings: 0, lastSeason: 0, peakRating: 0, teams: new Set(),
      };
      acc.seasons += 1;
      acc.lastSeason = Math.max(acc.lastSeason, yr.seasonNumber || 0);
      acc.peakRating = Math.max(acc.peakRating, line.rating || 0);
      acc.careerPoints += (line.ppg || 0) * (line.gp || 0);
      acc.careerReb += (line.rpg || 0) * (line.gp || 0);
      acc.careerAst += (line.apg || 0) * (line.gp || 0);
      acc.careerStl += (line.spg || 0) * (line.gp || 0);
      acc.careerBlk += (line.bpg || 0) * (line.gp || 0);
      if (line.teamName) acc.teams.add(line.teamName);
      if (line.playerId === mvpId) acc.mvps += 1;
      if (line.playerId === dpoyId) acc.dpoys += 1;
      if (line.playerId === royId) acc.roys += 1;
      if (line.playerId === sixId) acc.sixmoys += 1;
      if (line.playerId === mipId) acc.mips += 1;
      if (allNBAIds.includes(line.playerId)) acc.allNBA += 1;
      if (allDefIds.includes(line.playerId)) acc.allDef += 1;
      // Ring = on user team in a championship season.
      const careerEntry = (user.career || []).find(c => c.seasonNumber === yr.seasonNumber);
      if (careerEntry?.champion && line.isUserTeam) acc.rings += 1;
      tally.set(line.playerId, acc);
    }
  }

  const inducted = [];
  for (const p of tally.values()) {
    // Eligibility: retired (not on any current roster).
    if (livePlayers.has(p.playerId)) continue;
    // Qualifying milestones (any one):
    const meets =
      p.mvps >= 1 ||
      p.allNBA >= 3 ||
      p.dpoys >= 1 ||
      p.rings >= 2 ||
      p.careerPoints >= 12000 ||
      p.peakRating >= 90;
    if (!meets) continue;
    inducted.push({
      playerId: p.playerId,
      name: p.name,
      position: p.position,
      seasons: p.seasons,
      lastSeason: p.lastSeason,
      teams: [...p.teams],
      peakRating: p.peakRating,
      stats: {
        points: Math.round(p.careerPoints),
        rebounds: Math.round(p.careerReb),
        assists: Math.round(p.careerAst),
        steals: Math.round(p.careerStl),
        blocks: Math.round(p.careerBlk),
      },
      awards: {
        mvps: p.mvps, dpoys: p.dpoys, roys: p.roys,
        sixmoys: p.sixmoys, mips: p.mips,
        allNBA: p.allNBA, allDefensive: p.allDef,
        rings: p.rings,
      },
    });
  }
  // Best players first.
  inducted.sort((a, b) =>
    (b.awards.mvps - a.awards.mvps) ||
    (b.awards.allNBA - a.awards.allNBA) ||
    (b.peakRating - a.peakRating));
  return inducted;
}

// --- Player career stats (single-player view) -------------------------------

function playerCareerStats(careerAwards, playerId) {
  const seasons = [];
  let totals = {
    gp: 0, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
  };
  for (const yr of careerAwards || []) {
    const line = (yr.statLines || []).find(l => l.playerId === Number(playerId) || l.playerId === playerId);
    if (!line) continue;
    seasons.push({
      seasonNumber: yr.seasonNumber,
      teamName: line.teamName,
      gp: line.gp, ppg: line.ppg, rpg: line.rpg, apg: line.apg,
      spg: line.spg, bpg: line.bpg,
    });
    totals.gp += line.gp || 0;
    totals.points += (line.ppg || 0) * (line.gp || 0);
    totals.rebounds += (line.rpg || 0) * (line.gp || 0);
    totals.assists += (line.apg || 0) * (line.gp || 0);
    totals.steals += (line.spg || 0) * (line.gp || 0);
    totals.blocks += (line.bpg || 0) * (line.gp || 0);
  }
  if (seasons.length === 0) return null;
  return {
    seasons,
    careerTotals: {
      gp: totals.gp,
      points: Math.round(totals.points),
      rebounds: Math.round(totals.rebounds),
      assists: Math.round(totals.assists),
      steals: Math.round(totals.steals),
      blocks: Math.round(totals.blocks),
    },
    careerAverages: {
      ppg: totals.gp ? Math.round((totals.points / totals.gp) * 10) / 10 : 0,
      rpg: totals.gp ? Math.round((totals.rebounds / totals.gp) * 10) / 10 : 0,
      apg: totals.gp ? Math.round((totals.assists / totals.gp) * 10) / 10 : 0,
      spg: totals.gp ? Math.round((totals.steals / totals.gp) * 10) / 10 : 0,
      bpg: totals.gp ? Math.round((totals.blocks / totals.gp) * 10) / 10 : 0,
    },
  };
}

module.exports = {
  computeFranchiseRecords,
  computeAllTimeLeaders,
  computeBanners,
  evaluateHallOfFame,
  playerCareerStats,
};
