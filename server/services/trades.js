// Sprint A4 — Trade engine.
// Handles validation, CPU acceptance scoring, execution, and CPU-initiated
// proposals. All salaries are in millions USD.

const { calculatePayroll, refreshUserFinance, ROSTER_MIN, ROSTER_MAX } = require('./contracts');

const TRADE_DEADLINE_GAMES = 50; // ~week 20 of the 82-game season

// ---------------------------------------------------------------- helpers

function totalSalary(players) {
  return (players || []).reduce((sum, p) => sum + (p.contract?.salary || 0), 0);
}

function pickSnapshot(p) {
  return {
    pickId: p.pickId,
    year: p.year,
    round: p.round,
    originalTeam: p.originalTeam,
    estimatedValue: p.estimatedValue || 0,
  };
}

function playerSnapshot(p) {
  return {
    playerId: p.playerId,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    rating: p.rating,
    age: p.age || 0,
    salary: p.contract?.salary || 0,
    yearsRemaining: p.contract?.yearsRemaining || p.contract?.years || 0,
    contractType: p.contract?.contractType || 'standard',
  };
}

// --------------------------------------------------------------- backfill

/**
 * Lazily seed the user (and CPU teams) with two years of draft picks plus
 * a sane `direction` for each CPU team. Idempotent — safe to call on every
 * read of trade-related data.
 */
function ensureA4Fields(user) {
  let changed = false;
  const year = user.season || new Date().getFullYear();

  if (!user.ownedPicks) user.ownedPicks = [];
  if (user.ownedPicks.length === 0) {
    const teamLabel = (user.team?.city || user.team?.name || 'USR').toUpperCase().slice(0, 3);
    for (let y = 0; y < 2; y++) {
      for (let r = 1; r <= 2; r++) {
        user.ownedPicks.push({
          pickId: `${year + y}-R${r}-${teamLabel}`,
          year: year + y,
          round: r,
          originalTeam: user.team?.name || 'User',
          estimatedValue: r === 1 ? 60 - y * 5 : 25 - y * 5,
        });
      }
    }
    changed = true;
  }

  for (const cpu of user.cpuTeams || []) {
    if (!cpu.ownedPicks) cpu.ownedPicks = [];
    if (cpu.ownedPicks.length === 0) {
      const lbl = (cpu.city || cpu.name || 'CPU').toUpperCase().slice(0, 3);
      for (let y = 0; y < 2; y++) {
        for (let r = 1; r <= 2; r++) {
          cpu.ownedPicks.push({
            pickId: `${year + y}-R${r}-${lbl}`,
            year: year + y,
            round: r,
            originalTeam: cpu.name,
            estimatedValue: r === 1 ? 60 - y * 5 : 25 - y * 5,
          });
        }
      }
      changed = true;
    }
    if (!cpu.direction) {
      // Heuristic: average rating drives initial direction.
      const avg = (cpu.players || []).reduce((s, p) => s + (p.rating || 0), 0) /
                  Math.max(1, (cpu.players || []).length);
      cpu.direction = avg >= 80 ? 'contender' : avg >= 74 ? 'middling' : 'rebuild';
      changed = true;
    }
  }

  if (changed) {
    user.markModified('ownedPicks');
    user.markModified('cpuTeams');
  }
  return user;
}

// -------------------------------------------------------------- validate

/**
 * Salary matching: simplified NBA rule. When over the cap, outgoing salary
 * must be within 125% + $0.1M of incoming (and vice versa). Under the cap,
 * incoming just has to fit cap space.
 */
function validateSalaryMatch(outgoingPlayers, incomingPlayers, finance) {
  const out = totalSalary(outgoingPlayers);
  const inc = totalSalary(incomingPlayers);
  const overCap = (finance?.payroll || 0) > (finance?.salaryCap || 140);

  if (!overCap) {
    // Under cap: incoming must fit into cap space + outgoing freed salary.
    const projected = (finance.payroll || 0) - out + inc;
    if (projected > (finance.salaryCap || 140) + 12) {
      return { ok: false, reason: `Trade pushes payroll to $${projected.toFixed(1)}M (over hard cap).` };
    }
    return { ok: true };
  }

  // Over cap: 125% + 0.1M rule both directions.
  const limit = (x) => x * 1.25 + 0.1;
  if (out > 0 && inc > limit(out)) {
    return { ok: false, reason: `Incoming salary $${inc.toFixed(1)}M exceeds 125% of outgoing $${out.toFixed(1)}M.` };
  }
  if (inc > 0 && out > limit(inc)) {
    return { ok: false, reason: `Outgoing salary $${out.toFixed(1)}M exceeds 125% of incoming $${inc.toFixed(1)}M.` };
  }
  return { ok: true };
}

/**
 * No-trade clause check. Players with NTC must be in `approvedPlayerIds`
 * (passed by the route from req.body.approve = [...]).
 */
function enforceNoTradeClause(players, approvedIds = []) {
  const blocked = (players || []).filter(p => p.contract?.noTradeClause && !approvedIds.includes(p.playerId));
  return {
    ok: blocked.length === 0,
    blocked: blocked.map(p => ({ playerId: p.playerId, name: `${p.firstName} ${p.lastName}` })),
  };
}

/**
 * Roster size check: both sides must end up between ROSTER_MIN and
 * ROSTER_MAX after the swap.
 */
function validateRosterSizes(team, sending, receiving) {
  const size = (team.players || []).length - sending.length + receiving.length;
  if (size < ROSTER_MIN) return { ok: false, reason: `Trade leaves ${team.name || 'team'} with ${size} players (min ${ROSTER_MIN}).` };
  if (size > ROSTER_MAX) return { ok: false, reason: `Trade leaves ${team.name || 'team'} with ${size} players (max ${ROSTER_MAX}).` };
  return { ok: true };
}

/**
 * Trade deadline: locked once the user has played 50 of 82 regular-season
 * games (rough proxy for "after week 20"). Schedule.played is the source.
 */
function isPastTradeDeadline(user) {
  const played = (user.schedule || []).filter(g => g.played).length;
  return played >= TRADE_DEADLINE_GAMES;
}

// --------------------------------------------------------------- scoring

/**
 * CPU acceptance score. Positive = good for CPU (likely accept), negative
 * = bad. Threshold 0 means "barely fair". Direction modifies weights.
 */
function cpuAcceptanceScore({ cpuTeam, sendPlayers, sendPicks, receivePlayers, receivePicks }) {
  // What the CPU receives: sendPlayers/sendPicks (from user's POV → coming TO cpu).
  const receivedRating = (sendPlayers || []).reduce((s, p) => s + (p.rating || 0), 0);
  const givenRating    = (receivePlayers || []).reduce((s, p) => s + (p.rating || 0), 0);
  const receivedAge    = avg((sendPlayers || []).map(p => p.age || 25));
  const givenAge       = avg((receivePlayers || []).map(p => p.age || 25));
  const receivedSalary = totalSalary(sendPlayers);
  const givenSalary    = totalSalary(receivePlayers);
  const receivedPickValue = (sendPicks || []).reduce((s, p) => s + (p.estimatedValue || 0), 0);
  const givenPickValue    = (receivePicks || []).reduce((s, p) => s + (p.estimatedValue || 0), 0);

  let score = (receivedRating - givenRating) * 1.5;
  score += (receivedPickValue - givenPickValue) * 0.4;
  score += (givenSalary - receivedSalary) * 0.6; // CPU likes shedding salary

  // Direction tweaks.
  const dir = cpuTeam.direction || 'middling';
  if (dir === 'rebuild' || dir === 'tank') {
    // Rebuild values youth + picks, willing to take on bad contracts for assets.
    score += (givenAge - receivedAge) * 1.2;          // younger incoming = +
    score += (receivedPickValue - givenPickValue) * 0.6;
    score += (receivedSalary - givenSalary) * 0.2;    // less penalty on absorbing salary
  } else if (dir === 'contender') {
    // Contenders pay premium for win-now veterans, undervalue picks.
    score += (receivedRating - givenRating) * 1.0;    // double down on talent
    score -= (receivedPickValue - givenPickValue) * 0.3;
    if (receivedAge < 25) score -= 5;                 // youth less useful
  }

  return Math.round(score * 10) / 10;
}

function avg(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

// -------------------------------------------------------------- execute

function executeTrade(user, cpu, sendPlayers, sendPicks, receivePlayers, receivePicks, initiatedBy = 'user') {
  // Move players.
  const userKeptPlayers = (user.team.players || []).filter(p => !sendPlayers.find(sp => sp.playerId === p.playerId));
  const cpuKeptPlayers  = (cpu.players || []).filter(p => !receivePlayers.find(rp => rp.playerId === p.playerId));

  user.team.players = [...userKeptPlayers, ...receivePlayers];
  cpu.players       = [...cpuKeptPlayers, ...sendPlayers];

  // Move picks.
  const userKeptPicks = (user.ownedPicks || []).filter(p => !sendPicks.find(sp => sp.pickId === p.pickId));
  const cpuKeptPicks  = (cpu.ownedPicks || []).filter(p => !receivePicks.find(rp => rp.pickId === p.pickId));

  user.ownedPicks = [...userKeptPicks, ...receivePicks];
  cpu.ownedPicks  = [...cpuKeptPicks, ...sendPicks];

  // Log trade.
  const tradeId = `TR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  user.tradeHistory = user.tradeHistory || [];
  user.tradeHistory.push({
    tradeId,
    executedAt: new Date(),
    partnerTeam: cpu.name,
    sentPlayers: sendPlayers.map(playerSnapshot),
    sentPicks: sendPicks.map(pickSnapshot),
    receivedPlayers: receivePlayers.map(playerSnapshot),
    receivedPicks: receivePicks.map(pickSnapshot),
    initiatedBy,
  });

  user.markModified('team');
  user.markModified('cpuTeams');
  user.markModified('ownedPicks');
  user.markModified('tradeHistory');
  refreshUserFinance(user);
  return tradeId;
}

// ----------------------------------------------------------- cpu-initiated

/**
 * Generate 1-2 trade proposals from random CPU teams targeting one of the
 * user's mid-to-low-tier players. Called periodically from the season tick.
 * Skipped if a deadline is past or the user already has 5+ pending offers.
 */
function generateCpuProposals(user, rng = Math.random) {
  ensureA4Fields(user);
  if (isPastTradeDeadline(user)) return 0;
  if ((user.cpuTradeProposals || []).length >= 5) return 0;

  const cpus = user.cpuTeams || [];
  if (cpus.length === 0) return 0;

  // Shuffle and take 1-2 candidates that haven't recently proposed.
  const shuffled = cpus.slice().sort(() => rng() - 0.5);
  let made = 0;
  for (const cpu of shuffled) {
    if (made >= 2) break;
    if (rng() > 0.35) continue; // most don't reach out

    // CPU wants a user player rated 70-85 (not their star, not bench scrub).
    const target = (user.team.players || [])
      .filter(p => p.rating >= 70 && p.rating <= 85 && !p.contract?.noTradeClause)
      .sort(() => rng() - 0.5)[0];
    if (!target) continue;

    // CPU offers: one of their own players (similar salary, ±3 rating below).
    const targetSalary = target.contract?.salary || 5;
    const candidate = (cpu.players || [])
      .filter(p => Math.abs((p.contract?.salary || 0) - targetSalary) <= 4 && p.rating >= target.rating - 6 && p.rating <= target.rating - 1)
      .sort(() => rng() - 0.5)[0];

    let receivePlayers = candidate ? [playerSnapshot(candidate)] : [];
    let receivePicks = [];

    // Sweetener: if rebuild CPU and target rating > 78, throw in a 2nd-round pick.
    if (!candidate || (cpu.direction === 'rebuild' && target.rating > 78)) {
      const pick = (cpu.ownedPicks || []).find(p => p.round === 2);
      if (pick) receivePicks.push(pickSnapshot(pick));
    }

    if (!receivePlayers.length && !receivePicks.length) continue;

    const proposalId = `PR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    user.cpuTradeProposals.push({
      proposalId,
      createdAt: new Date(),
      partnerTeam: cpu.name,
      sendPlayerIds: [target.playerId],
      sendPickIds: [],
      receivePlayers,
      receivePicks,
      message: `${cpu.name} are interested in ${target.firstName} ${target.lastName}.`,
    });
    user.markModified('cpuTradeProposals');
    made++;
  }
  return made;
}

module.exports = {
  ensureA4Fields,
  validateSalaryMatch,
  enforceNoTradeClause,
  validateRosterSizes,
  cpuAcceptanceScore,
  executeTrade,
  generateCpuProposals,
  isPastTradeDeadline,
  TRADE_DEADLINE_GAMES,
  playerSnapshot,
  pickSnapshot,
};
