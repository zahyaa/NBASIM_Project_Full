// Sprint D1 — Season awards computation.
//
// CPU games are simulated via quickSimRecord (no box scores), so per-player
// season totals don't naturally exist league-wide. We synthesize realistic
// per-game averages from each player's rating, position, role (starter vs
// bench), age and team success — then run award algorithms on the synthetic
// stat lines. Every computation is deterministic for the same inputs so
// rerunning the awards on the same season yields identical results.
//
// Public API:
//   computeSeasonAwards(user) -> {
//     mvp, dpoy, roy, sixthMan, mip, allNBA, allDefensive, allRookie,
//     leagueLeaders, statLines
//   }

const SEASON_GAMES = 82;

// Deterministic [0,1) noise from a stable seed (player id + season).
function noise(playerId, salt) {
  let h = (Number(playerId) || 0) * 2654435761 + salt * 1597334677;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1597334677) >>> 0;
  return ((h ^ (h >>> 17)) >>> 0) / 4294967296;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round1(x) { return Math.round(x * 10) / 10; }

// --- Synthetic stat line ----------------------------------------------------

function synthesizeStatLine(player, ctx) {
  const seasonNumber = ctx.seasonNumber || 1;
  const r = (player.rating || 60)
    + (player.boost?.offense || 0) * 0.4
    + (player.boost?.defense || 0) * 0.2
    + (player.boost?.athleticism || 0) * 0.2;
  const off = r + (player.boost?.offense || 0);
  const def = r + (player.boost?.defense || 0);
  const ath = r + (player.boost?.athleticism || 0);
  const iq = player.iq || 70;
  const clutch = player.clutch || 0;
  const pos = (player.position || 'G').toUpperCase();

  const isStarter = !!ctx.isStarter;
  // Starters average ~32 mpg, bench ~18, deep bench ~9.
  const mpg = ctx.minutes != null ? ctx.minutes : (isStarter ? 32 : ctx.benchOrder < 3 ? 22 : 12);
  const minWeight = mpg / 32;

  // Games played: scale by injuries + role.
  const injuredGames = (player.injury?.gamesRemaining || 0);
  const baseGp = isStarter ? 75 : 65;
  const gp = clamp(Math.round(baseGp - injuredGames * 0.5), 0, SEASON_GAMES);

  // Position-shaped scoring + rebounds + assists + defense.
  const ppg = clamp(
    (off - 60) * 0.65 * minWeight + clutch * 0.04 + (noise(player.playerId, 1) - 0.5) * 2.5,
    0, 38
  );
  const isBigPos = pos === 'C' || pos === 'PF' || pos === 'F-C' || pos === 'F';
  const rpg = clamp(
    (isBigPos ? (def - 55) * 0.22 + 4 : (def - 65) * 0.10 + 2) * minWeight
      + (noise(player.playerId, 2) - 0.5) * 1.2,
    0, 16
  );
  const isGuardPos = pos === 'PG' || pos === 'G' || pos === 'SG';
  const apg = clamp(
    (isGuardPos ? (iq - 60) * 0.16 + 4 : (iq - 65) * 0.05 + 1.5) * minWeight
      + (noise(player.playerId, 3) - 0.5) * 1.0,
    0, 12
  );
  const spg = clamp(
    (def - 60) * 0.04 * minWeight + (isGuardPos ? 0.4 : 0.2)
      + (noise(player.playerId, 4) - 0.5) * 0.4,
    0, 3
  );
  const bpg = clamp(
    (isBigPos ? (def - 60) * 0.10 : (def - 65) * 0.03) * minWeight
      + (noise(player.playerId, 5) - 0.5) * 0.3,
    0, 4
  );
  const tov = clamp(
    (40 / Math.max(40, iq)) * 1.5 * minWeight
      + (noise(player.playerId, 6) - 0.5) * 0.6,
    0.3, 5
  );
  const fgPct = clamp(0.40 + (off - 70) * 0.005 + (noise(player.playerId, 7) - 0.5) * 0.04, 0.30, 0.65);
  const tpPct = clamp(0.31 + (off - 75) * 0.003 + (noise(player.playerId, 8) - 0.5) * 0.04, 0.20, 0.50);
  const ftPct = clamp(0.70 + (off - 70) * 0.004 + (noise(player.playerId, 9) - 0.5) * 0.06, 0.40, 0.95);

  // Composite advanced stats used by award scoring.
  const ts = ppg / Math.max(1, (ppg / fgPct) * 1.0); // crude TS%
  const usg = clamp(ppg / 24 + tov * 0.04, 0.10, 0.40);

  return {
    playerId: player.playerId,
    name: `${player.firstName || ''} ${player.lastName || ''}`.trim(),
    position: pos,
    age: player.age || 0,
    rating: player.rating || 0,
    teamName: ctx.teamName,
    isUserTeam: !!ctx.isUserTeam,
    teamWins: ctx.teamWins || 0,
    isStarter,
    isBench: !isStarter,
    seasonNumber,

    gp,
    mpg: round1(mpg),
    ppg: round1(ppg),
    rpg: round1(rpg),
    apg: round1(apg),
    spg: round1(spg),
    bpg: round1(bpg),
    topg: round1(tov),
    fgPct: Math.round(fgPct * 1000) / 1000,
    tpPct: Math.round(tpPct * 1000) / 1000,
    ftPct: Math.round(ftPct * 1000) / 1000,
    tsPct: round1(ts),
    usg: round1(usg),
  };
}

// --- Roster gathering -------------------------------------------------------

function collectStatLines(user) {
  const seasonNumber = user.seasonNumber || 1;
  const lines = [];

  const pushTeam = (team, wins, isUserTeam) => {
    const players = (team?.players || []).slice();
    // Starters = top 5 by rating.
    const sorted = players.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const starterIds = new Set(sorted.slice(0, 5).map(p => p.playerId));
    const benchOrder = new Map();
    sorted.slice(5).forEach((p, i) => benchOrder.set(p.playerId, i));

    for (const p of players) {
      const isStarter = starterIds.has(p.playerId);
      lines.push(synthesizeStatLine(p, {
        teamName: team.name,
        teamWins: wins,
        isStarter,
        benchOrder: benchOrder.get(p.playerId) ?? 99,
        isUserTeam,
        seasonNumber,
      }));
    }
  };

  pushTeam(user.team, user.seasonWins || 0, true);
  for (const cpu of user.cpuTeams || []) {
    const rec = (user.cpuRecords || []).find(r => r.name === cpu.name) || { wins: 0 };
    pushTeam(cpu, rec.wins || 0, false);
  }
  return lines;
}

// --- Rookie detection -------------------------------------------------------

function isRookieLine(line) {
  // synthetic rookie ids start at 20_000_000 (rookieClass.js); drafted
  // rookies keep that id when added to a roster.
  if (Number(line.playerId) >= 20000000) return true;
  // Fall back to age — anyone 19-21 is treated as a rookie if no synthetic
  // id is present (e.g. legacy NBA api players carry small ids).
  return (line.age || 0) > 0 && (line.age || 0) <= 21;
}

// --- Award algorithms -------------------------------------------------------

function rankBy(list, scoreFn, n = 5) {
  return list
    .map(x => ({ ...x, score: scoreFn(x) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function mvpScore(s) {
  // Box stats + efficiency + team success.
  const teamFactor = 0.5 + (s.teamWins / SEASON_GAMES); // 0.5..1.5
  const games = s.gp / SEASON_GAMES;
  return (s.ppg * 1.0 + s.apg * 0.65 + s.rpg * 0.55 + s.spg * 0.6 + s.bpg * 0.5)
    * teamFactor * (0.5 + games * 0.5);
}

function dpoyScore(s) {
  const teamFactor = 0.6 + (s.teamWins / SEASON_GAMES) * 0.6;
  return (s.spg * 4.5 + s.bpg * 4.0 + s.rpg * 0.4) * teamFactor;
}

function sixthManScore(s) {
  if (!s.isBench) return -Infinity;
  return s.ppg * 1.0 + s.apg * 0.5 + s.rpg * 0.4;
}

function rookieScore(s) {
  return s.ppg * 1.0 + s.apg * 0.55 + s.rpg * 0.5 + s.spg * 0.4 + s.bpg * 0.4;
}

// All-NBA: 1st/2nd/3rd. Roster = 2 G, 2 F, 1 C per team. We'll loosen the
// position filter (accept G/PG/SG for guards, F/SF/PF for forwards, C/PF for
// centers when only PFs exist) to keep things working for thin player pools.
function allNBATeams(lines, scoreFn) {
  const guards = lines.filter(l => /G/.test(l.position) || l.position === 'PG' || l.position === 'SG');
  const forwards = lines.filter(l => /F/.test(l.position) || l.position === 'SF' || l.position === 'PF');
  const centers = lines.filter(l => l.position === 'C' || /F-C|C-F/i.test(l.position));

  // Fallbacks if the buckets are sparse.
  const safeForwards = forwards.length ? forwards : lines;
  const safeCenters = centers.length ? centers : safeForwards;

  const sortedG = guards.slice().sort((a, b) => scoreFn(b) - scoreFn(a));
  const sortedF = safeForwards.slice().sort((a, b) => scoreFn(b) - scoreFn(a));
  const sortedC = safeCenters.slice().sort((a, b) => scoreFn(b) - scoreFn(a));

  const used = new Set();
  const pickN = (arr, n) => {
    const out = [];
    for (const x of arr) {
      if (used.has(x.playerId)) continue;
      out.push(x);
      used.add(x.playerId);
      if (out.length === n) break;
    }
    return out;
  };

  const teams = [];
  for (let i = 0; i < 3; i++) {
    teams.push({
      tier: ['1st', '2nd', '3rd'][i],
      guards:   pickN(sortedG, 2),
      forwards: pickN(sortedF, 2),
      centers:  pickN(sortedC, 1),
    });
  }
  return teams;
}

function allDefTeams(lines) {
  return allNBATeams(lines, dpoyScore).slice(0, 2)
    .map((t, i) => ({ ...t, tier: ['1st', '2nd'][i] }));
}

function allRookieTeams(lines) {
  const rookies = lines.filter(isRookieLine);
  if (rookies.length === 0) return [];
  // 5 best on each tier ignoring positional buckets — rookie pools are
  // small so positional balance is not enforced.
  const sorted = rankBy(rookies, rookieScore, 10);
  return [
    { tier: '1st', players: sorted.slice(0, 5) },
    { tier: '2nd', players: sorted.slice(5, 10) },
  ];
}

// --- Most Improved ----------------------------------------------------------
// Reuses lastDevelopmentReport.biggestRisers (Sprint B1). Picks the top
// non-rookie riser with at least +3 rating.

function mostImproved(user, lines) {
  const risers = user.lastDevelopmentReport?.biggestRisers || [];
  for (const r of risers) {
    const line = lines.find(l => l.playerId === r.playerId);
    if (!line) continue;
    if (isRookieLine(line)) continue;
    if ((r.delta || 0) < 3) continue;
    return { ...line, ratingDelta: r.delta };
  }
  return null;
}

// --- League leaders ---------------------------------------------------------

function leagueLeaders(lines) {
  const top = (key) => lines.slice().sort((a, b) => b[key] - a[key]).slice(0, 5);
  return {
    points:   top('ppg'),
    rebounds: top('rpg'),
    assists:  top('apg'),
    steals:   top('spg'),
    blocks:   top('bpg'),
  };
}

// --- Public ----------------------------------------------------------------

function trim(line) {
  // Slim shape stored in user.career — avoid embedding the entire stat line.
  if (!line) return null;
  return {
    playerId: line.playerId,
    name: line.name,
    position: line.position,
    teamName: line.teamName,
    isUserTeam: !!line.isUserTeam,
    rating: line.rating,
    age: line.age,
    gp: line.gp,
    ppg: line.ppg,
    rpg: line.rpg,
    apg: line.apg,
    spg: line.spg,
    bpg: line.bpg,
  };
}

function computeSeasonAwards(user) {
  const lines = collectStatLines(user);
  if (lines.length === 0) return null;

  const mvpTop = rankBy(lines, mvpScore, 5);
  const dpoyTop = rankBy(lines, dpoyScore, 5);
  const sixthTop = rankBy(lines, sixthManScore, 5).filter(x => x.score > -Infinity);
  const rookieLines = lines.filter(isRookieLine);
  const royTop = rankBy(rookieLines, rookieScore, 5);

  return {
    seasonNumber: user.seasonNumber || 1,
    mvp:       trim(mvpTop[0]),
    mvpTop5:   mvpTop.map(trim),
    dpoy:      trim(dpoyTop[0]),
    dpoyTop5:  dpoyTop.map(trim),
    sixthMan:  trim(sixthTop[0] || null),
    sixthTop5: sixthTop.map(trim),
    roy:       trim(royTop[0] || null),
    royTop5:   royTop.map(trim),
    mip:       (() => {
      const m = mostImproved(user, lines);
      return m ? { ...trim(m), ratingDelta: m.ratingDelta } : null;
    })(),
    allNBA:        allNBATeams(lines, mvpScore).map(t => ({
      tier: t.tier,
      players: [...t.guards, ...t.forwards, ...t.centers].map(trim),
    })),
    allDefensive:  allDefTeams(lines).map(t => ({
      tier: t.tier,
      players: [...t.guards, ...t.forwards, ...t.centers].map(trim),
    })),
    allRookie:     allRookieTeams(lines).map(t => ({
      tier: t.tier, players: t.players.map(trim),
    })),
    leagueLeaders: (() => {
      const ll = leagueLeaders(lines);
      return Object.fromEntries(Object.entries(ll).map(([k, v]) => [k, v.map(trim)]));
    })(),
    statLines: lines.map(trim),
  };
}

module.exports = {
  computeSeasonAwards,
  synthesizeStatLine,
  collectStatLines,
  // exported for tests
  _internal: { mvpScore, dpoyScore, rookieScore, sixthManScore, isRookieLine },
};
