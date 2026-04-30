// Sprint E1 — CPU front-office behavior.
//
// Encapsulates the league-wide AI moves: re-signing stars, reacting to
// injuries, signing free agents, and updating each franchise's strategic
// `direction` (contender / middling / rebuild / tank).
//
// All entry points are idempotent and safe to call multiple times per
// game tick or offseason rollover.

const { rosterEntryFromOffer } = require('./freeAgency');

// ----------------------------------------------------------- direction AI

/**
 * Recompute every CPU team's `direction` from last season's record + the
 * average roster age. Called once per offseason.
 *
 *  contender — strong record OR top-tier roster, all-veteran
 *  middling  — average everything
 *  rebuild   — bad record + young roster
 *  tank      — bad record + young roster + worst quartile (chases lottery)
 */
function updateCpuDirections(user) {
  const teams = user?.cpuTeams || [];
  const records = user?.cpuRecords || [];

  const ranked = teams
    .map(t => {
      const rec = records.find(r => r.name === t.name) || { wins: 0, losses: 0 };
      const games = (rec.wins + rec.losses) || 1;
      const winPct = rec.wins / games;
      const ages = (t.players || []).map(p => p.age || 24);
      const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : 26;
      const avgRating = (t.players || []).reduce((s, p) => s + (p.rating || 0), 0) /
                        Math.max(1, (t.players || []).length);
      return { team: t, winPct, avgAge, avgRating };
    })
    .sort((a, b) => a.winPct - b.winPct);

  const tankCutoff = Math.max(2, Math.floor(ranked.length * 0.15)); // bottom 15%

  ranked.forEach((row, idx) => {
    const t = row.team;
    if (row.winPct >= 0.6 || row.avgRating >= 80) t.direction = 'contender';
    else if (idx < tankCutoff && row.avgAge <= 25) t.direction = 'tank';
    else if (row.winPct <= 0.42 && row.avgAge <= 26) t.direction = 'rebuild';
    else t.direction = 'middling';
  });

  if (teams.length) user.markModified('cpuTeams');
}

// -------------------------------------------------------- offseason resign

/**
 * Before generic contract rollover converts everyone to FAs, give each CPU
 * team a chance to re-sign their own expiring stars (rating ≥ 80). The new
 * contract is fair-market based on rating with 1-3 extra years. Contender
 * teams are most aggressive, rebuilds skip the move.
 *
 * Mutates the player's contract in place — the rollover step then sees a
 * fresh multi-year deal and won't expire it.
 */
function cpuReSignStars(user, rng = Math.random) {
  const events = [];
  for (const cpu of user.cpuTeams || []) {
    if (cpu.direction === 'rebuild' || cpu.direction === 'tank') continue;
    const expiring = (cpu.players || []).filter(p => {
      const c = p.contract || {};
      const yrs = c.yearsRemaining ?? c.years ?? 1;
      return yrs <= 1 && (p.rating || 0) >= 80;
    });
    for (const p of expiring) {
      const aggressive = cpu.direction === 'contender';
      if (!aggressive && rng() < 0.25) continue; // 25% miss for non-contenders
      const newSalary = salaryForRating(p.rating);
      const newYears = aggressive ? 3 : 2;
      p.contract = {
        ...(p.contract?.toObject?.() || p.contract || {}),
        salary: newSalary,
        years: newYears,
        yearsRemaining: newYears,
        contractType: p.rating >= 88 ? 'max' : 'standard',
        signedAt: new Date(),
      };
      events.push({ team: cpu.name, player: `${p.firstName} ${p.lastName}`, salary: newSalary, years: newYears });
    }
  }
  if (events.length) user.markModified('cpuTeams');
  return events;
}

function salaryForRating(rating = 75) {
  if (rating >= 92) return 42;
  if (rating >= 88) return 35;
  if (rating >= 85) return 28;
  if (rating >= 82) return 22;
  if (rating >= 80) return 16;
  return 8;
}

// ------------------------------------------------------- injury reaction

/**
 * Look for CPU teams with a star (rating ≥ 80) sidelined for 20+ games
 * and not already replaced this season. They sign the best available free
 * agent that fits their remaining cap room. Cooldown via
 * `cpu._lastInjurySignSeason` so they don't make the same move twice.
 */
function cpuReactToInjuries(user, rng = Math.random) {
  const events = [];
  const fas = user.freeAgents || [];
  if (!fas.length) return events;

  for (const cpu of user.cpuTeams || []) {
    if (cpu._lastInjurySignSeason === user.seasonNumber) continue;
    const downStar = (cpu.players || []).find(p =>
      (p.rating || 0) >= 80 &&
      p.injury?.isInjured &&
      (p.injury?.gamesRemaining || 0) >= 20
    );
    if (!downStar) continue;

    if ((cpu.players || []).length >= 15) continue;
    const payroll = (cpu.players || []).reduce((s, p) => s + ((p.contract && p.contract.salary) || 0), 0);
    const headroom = 165 - payroll;
    if (headroom < 2) continue;

    // Pick the best FA they can afford (rating-weighted, prefer 75-85 range).
    const target = fas
      .filter(f => (f.askingSalary || 1) <= headroom)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    if (!target) continue;

    const offer = {
      teamName: cpu.name,
      salary: Math.min(headroom, target.askingSalary || 5),
      years: target.askingYears || 2,
      isUser: false,
    };
    cpu.players.push(rosterEntryFromOffer(target, offer));
    cpu._lastInjurySignSeason = user.seasonNumber;
    user.freeAgents = fas.filter(f => f.playerId !== target.playerId);
    events.push({
      team: cpu.name,
      injured: `${downStar.firstName} ${downStar.lastName}`,
      signed: `${target.firstName} ${target.lastName}`,
      salary: offer.salary,
    });
    void rng; // currently deterministic; kept for parity with other helpers
  }
  if (events.length) {
    user.markModified('cpuTeams');
    user.markModified('freeAgents');
  }
  return events;
}

// ---------------------------------------------------- league-wide FA tick

/**
 * Each tick a small fraction of free agents get signed by CPU teams, even
 * if the user never opens the FA page. Keeps the pool from stagnating.
 * Returns the list of signing events.
 */
function cpuFreeAgentTick(user, { rate = 0.10, rng = Math.random } = {}) {
  const fas = user.freeAgents || [];
  if (!fas.length || !user.cpuTeams?.length) return [];
  const events = [];
  const remaining = [];

  for (const fa of fas) {
    if (rng() > rate) { remaining.push(fa); continue; }
    // Find a CPU willing/able to sign.
    const candidates = user.cpuTeams.filter(t => {
      if ((t.players || []).length >= 15) return false;
      const payroll = (t.players || []).reduce((s, p) => s + ((p.contract && p.contract.salary) || 0), 0);
      return (165 - payroll) >= (fa.askingSalary || 1);
    });
    if (!candidates.length) { remaining.push(fa); continue; }
    // Contenders prioritize rating ≥ 78; rebuilds prefer young (no age field
    // in pool, so just take a random match below 80).
    const sorted = candidates.sort((a, b) => {
      const aPref = a.direction === 'contender' && fa.rating >= 78 ? 1 : 0;
      const bPref = b.direction === 'contender' && fa.rating >= 78 ? 1 : 0;
      return bPref - aPref;
    });
    const winner = sorted[0];
    const offer = {
      teamName: winner.name,
      salary: fa.askingSalary || 4,
      years: fa.askingYears || 2,
      isUser: false,
    };
    winner.players.push(rosterEntryFromOffer(fa, offer));
    events.push({ team: winner.name, player: `${fa.firstName} ${fa.lastName}`, salary: offer.salary });
  }
  user.freeAgents = remaining;
  if (events.length) {
    user.markModified('cpuTeams');
    user.markModified('freeAgents');
  }
  return events;
}

// -------------------------------------------------------- power rankings

/**
 * Compute power rankings for every team (user + CPUs). Blend of:
 *   55% record win-pct, 35% average roster rating, 10% trend (last 5 games)
 *
 * Stored snapshot history can power the "weekly update" UI element.
 */
function computePowerRankings(user) {
  const all = [];

  // User
  const uTotal = (user.seasonWins + user.seasonLosses) || 1;
  const uPct = user.seasonWins / uTotal;
  const uRating = avgRating(user.team?.players);
  const uTrend = lastNTrend(user.schedule, 5);
  all.push({
    name: user.team?.name || 'My Team',
    city: user.team?.city || '',
    conference: user.conference || '',
    division: user.team?.division || '',
    isUser: true,
    wins: user.seasonWins, losses: user.seasonLosses,
    winPct: uPct,
    avgRating: uRating,
    trend: uTrend,
    score: rankingScore(uPct, uRating, uTrend),
  });

  for (const t of user.cpuTeams || []) {
    const rec = (user.cpuRecords || []).find(r => r.name === t.name) || { wins: 0, losses: 0 };
    const total = (rec.wins + rec.losses) || 1;
    const pct = rec.wins / total;
    const rating = avgRating(t.players);
    all.push({
      name: t.name, city: t.city, conference: t.conference, division: t.division,
      isUser: false,
      wins: rec.wins, losses: rec.losses,
      winPct: pct, avgRating: rating,
      trend: 0,
      score: rankingScore(pct, rating, 0),
    });
  }
  all.sort((a, b) => b.score - a.score);
  all.forEach((row, i) => { row.rank = i + 1; });
  return all;
}

function avgRating(players) {
  if (!players?.length) return 70;
  return Math.round(players.reduce((s, p) => s + (p.rating || 0), 0) / players.length);
}

function lastNTrend(schedule, n) {
  if (!Array.isArray(schedule)) return 0;
  const played = schedule.filter(g => g.played).slice(-n);
  if (!played.length) return 0;
  const wins = played.filter(g => g.win).length;
  return Math.round(((wins / played.length) - 0.5) * 100); // -50..+50
}

function rankingScore(pct, rating, trend) {
  return (pct * 0.55) + ((rating / 99) * 0.35) + ((trend / 100) * 0.10);
}

module.exports = {
  updateCpuDirections,
  cpuReSignStars,
  cpuReactToInjuries,
  cpuFreeAgentTick,
  computePowerRankings,
};
