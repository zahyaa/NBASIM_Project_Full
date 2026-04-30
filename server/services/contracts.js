// Sprint A1 — Contracts, Salary Cap, Payroll
//
// Centralizes all contract assignment + finance math so every spot that
// adds a player to a roster (draft, card packs, free-agent signing,
// cpu-fill, season rollover) produces consistent salary/years numbers.
//
// Salary units: millions of USD. Cap line is the league-wide soft cap;
// the luxury-tax line kicks in above it. Mid-level exception lets a
// capped-out team sign one player above the cap up to 12M/year.

const SALARY_CAP = 140;        // soft cap
const LUXURY_TAX_LINE = 170;   // tax kicks in above this
const MAX_SALARY = 50;         // individual hard ceiling
const MID_LEVEL_EXCEPTION = 12;
const MIN_SALARY = 1.5;
const MIN_PAYROLL = 120;       // salary floor (not enforced yet)
const ROSTER_MIN = 12;
const ROSTER_MAX = 15;

// Pick a contract for a non-rookie based on rating bucket. Stars 85+ get
// max deals, 75-84 standard, 68-74 low standard, below 68 minimum.
function assignContract(player, opts = {}) {
  const { isRookie = false, pickNumber = null, rng = Math.random } = opts;
  if (isRookie) return assignRookieContract(player, pickNumber, rng);

  const r = (player && player.rating) || 70;
  let contractType, baseSalary, years;

  if (r >= 85) {
    contractType = 'max';
    baseSalary = 35 + (r - 85) * 1.5;          // 35M @ 85 -> 50M @ 95+
    years = 4 + Math.floor(rng() * 2);          // 4-5
  } else if (r >= 75) {
    contractType = 'standard';
    baseSalary = 15 + (r - 75);                 // 15-25M
    years = 3 + Math.floor(rng() * 2);          // 3-4
  } else if (r >= 68) {
    contractType = 'standard';
    baseSalary = 5 + (r - 68) * 0.7;            // ~5-10M
    years = 2 + Math.floor(rng() * 2);          // 2-3
  } else {
    contractType = 'minimum';
    baseSalary = MIN_SALARY + rng() * 0.5;      // 1.5-2M
    years = 1 + Math.floor(rng() * 2);          // 1-2
  }

  const salary = round1(Math.min(baseSalary, MAX_SALARY));
  return {
    salary,
    yearsRemaining: years,
    years,                                       // legacy field kept in sync
    contractType,
    teamOption: false,
    playerOption: contractType === 'max' && rng() < 0.3,
    noTradeClause: contractType === 'max' && r >= 92,
    signedAt: new Date(),
  };
}

// Rookie scale: 4-year deal scaled by draft slot. 1st overall ~10M,
// late 1st ~3M, 2nd round ~2M. If pickNumber unknown we assume late 1st.
function assignRookieContract(player, pickNumber = null, rng = Math.random) {
  const pick = pickNumber && pickNumber > 0 && pickNumber <= 60 ? pickNumber : 25;
  const salary = round1(Math.max(1.8, 10 - (pick - 1) * 0.28));
  return {
    salary,
    yearsRemaining: 4,
    years: 4,
    contractType: 'rookie',
    teamOption: pick <= 30,
    playerOption: false,
    noTradeClause: false,
    signedAt: new Date(),
  };
}

function calculatePayroll(team) {
  if (!team || !Array.isArray(team.players)) return 0;
  const sum = team.players.reduce((s, p) => s + ((p.contract && p.contract.salary) || 0), 0);
  return round1(sum);
}

function calculateCapSpace(payroll, salaryCap = SALARY_CAP) {
  return round1(salaryCap - payroll);
}

// 1.5x penalty on every dollar above the luxury-tax line.
function calculateTaxAmount(payroll, luxuryTaxLine = LUXURY_TAX_LINE) {
  if (payroll <= luxuryTaxLine) return 0;
  return round1((payroll - luxuryTaxLine) * 1.5);
}

function buildFinanceSummary(team, prevFinance = {}) {
  const salaryCap = prevFinance.salaryCap || SALARY_CAP;
  const luxuryTaxLine = prevFinance.luxuryTaxLine || LUXURY_TAX_LINE;
  const payroll = calculatePayroll(team);
  return {
    salaryCap,
    luxuryTaxLine,
    payroll,
    capSpace: calculateCapSpace(payroll, salaryCap),
    taxAmount: calculateTaxAmount(payroll, luxuryTaxLine),
    midLevelExceptionAvailable: prevFinance.midLevelExceptionAvailable !== false,
  };
}

// Apply a default contract to any roster entry that's missing one.
// Used to backfill contracts for legacy users / CPU rosters created
// before Sprint A1 landed.
function ensureContract(player, opts = {}) {
  if (!player) return null;
  const c = player.contract;
  if (c && c.salary && c.contractType) return c;
  player.contract = assignContract(player, opts);
  return player.contract;
}

// Recalculate user.finance from the current roster. Safe to call as often
// as you like — it's an O(n) sum over <=15 players.
function refreshUserFinance(user) {
  if (!user) return null;
  user.finance = buildFinanceSummary(user.team, user.finance || {});
  return user.finance;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ---- Sprint A2: cap legality + offseason rollover ----

// Yearly cap escalator.
const CAP_INCREASE_PER_SEASON = 3;
const TAX_INCREASE_PER_SEASON = 4;

// Check whether a team can legally absorb a new contract. Returns
// `{ ok, reason, requiresMLE }`. Hard rule: payroll + newSalary may not
// exceed `salaryCap + MID_LEVEL_EXCEPTION` (the MLE is the only soft-cap
// override the user's franchise gets).
function canAbsorbContract({ team, finance, newSalary }) {
  const f = finance || {};
  const cap = f.salaryCap || SALARY_CAP;
  const payroll = calculatePayroll(team);
  const projected = payroll + (newSalary || 0);
  if (projected <= cap) return { ok: true, requiresMLE: false };
  if (projected <= cap + MID_LEVEL_EXCEPTION) {
    if (newSalary > MID_LEVEL_EXCEPTION) {
      return {
        ok: false,
        reason: `Over the cap — single signing capped at the mid-level exception ($${MID_LEVEL_EXCEPTION}M).`,
      };
    }
    if (f.midLevelExceptionAvailable === false) {
      return { ok: false, reason: 'Mid-level exception already used this season.' };
    }
    return { ok: true, requiresMLE: true };
  }
  return {
    ok: false,
    reason: `Signing would push payroll to $${round1(projected)}M, over the hard limit ($${round1(cap + MID_LEVEL_EXCEPTION)}M).`,
  };
}

// Validate roster bounds for a team object (user.team or any cpuTeam).
function validateRosterSize(team) {
  const n = (team?.players || []).length;
  if (n > ROSTER_MAX) return { ok: false, reason: `Roster over ${ROSTER_MAX} players (${n}).` };
  if (n < ROSTER_MIN) return { ok: false, reason: `Roster under ${ROSTER_MIN} player minimum (${n}).` };
  return { ok: true };
}

// Decrement yearsRemaining on every contract in `team.players`. Returns
// the array of expiring entries (yearsRemaining hits 0) so the caller
// can send them to free agency. Player-option / team-option logic:
// for now both options auto-pick up if the player is good (rating>=75)
// and auto-decline if they're bench (<70). We'll expand this in A3.
function rollContractsForTeam(team, { rng = Math.random } = {}) {
  const expiring = [];
  if (!team || !Array.isArray(team.players)) return expiring;
  const kept = [];
  for (const p of team.players) {
    const c = p.contract || {};
    const yr = (c.yearsRemaining || c.years || 1) - 1;
    if (yr <= 0) {
      expiring.push(p);
      continue;
    }
    p.contract = {
      ...c.toObject?.() || c,
      yearsRemaining: yr,
      years: yr,
    };
    kept.push(p);
  }
  team.players = kept;
  return expiring;
}

// Convert a roster entry into a free-agent record (drops the contract;
// player will be re-signed at a new salary by the agent or the user).
function toFreeAgent(player, opts = {}) {
  return {
    playerId: player.playerId,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    rating: player.rating,
    stats: player.stats,
    previousTeam: opts.previousTeam || '',
    askingSalary: suggestAskingSalary(player.rating || 70),
    askingYears: suggestAskingYears(player.rating || 70),
    expiredAt: new Date(),
  };
}

function suggestAskingSalary(rating) {
  if (rating >= 90) return 38;
  if (rating >= 85) return 28;
  if (rating >= 80) return 18;
  if (rating >= 75) return 10;
  if (rating >= 70) return 5;
  if (rating >= 65) return 2.5;
  return MIN_SALARY;
}
function suggestAskingYears(rating) {
  if (rating >= 85) return 4;
  if (rating >= 75) return 3;
  if (rating >= 68) return 2;
  return 1;
}

// Annual escalator: cap and tax line creep up year over year.
function escalateLeagueFinances(user) {
  if (!user.finance) user.finance = {};
  user.finance.salaryCap = (user.finance.salaryCap || SALARY_CAP) + CAP_INCREASE_PER_SEASON;
  user.finance.luxuryTaxLine = (user.finance.luxuryTaxLine || LUXURY_TAX_LINE) + TAX_INCREASE_PER_SEASON;
  user.finance.midLevelExceptionAvailable = true; // refresh annually
  return user.finance;
}

// One-shot offseason rollover. Decrements every contract on the user's
// team + every CPU team, drops expired contracts into a global free-agent
// pool stored on the user record, escalates the cap, and recomputes
// finance.
function rolloverOffseason(user) {
  const freeAgents = [];

  const userExpired = rollContractsForTeam(user.team);
  for (const p of userExpired) {
    freeAgents.push(toFreeAgent(p, { previousTeam: user.team?.name || '' }));
  }

  for (const cpu of user.cpuTeams || []) {
    const expired = rollContractsForTeam(cpu);
    for (const p of expired) {
      freeAgents.push(toFreeAgent(p, { previousTeam: cpu.name }));
    }
  }

  // Merge with any existing FA pool (some agents may not have signed last
  // year). Cap to 200 most-recent so the doc doesn't grow forever.
  const existing = Array.isArray(user.freeAgents) ? user.freeAgents : [];
  const taken = new Set(freeAgents.map(p => p.playerId));
  const carryover = existing.filter(p => !taken.has(p.playerId));
  user.freeAgents = [...freeAgents, ...carryover].slice(0, 200);

  escalateLeagueFinances(user);
  refreshUserFinance(user);
  user.markModified('team');
  user.markModified('cpuTeams');
  user.markModified('freeAgents');

  return {
    expired: freeAgents.length,
    freeAgentCount: user.freeAgents.length,
    finance: user.finance,
  };
}

module.exports = {
  SALARY_CAP,
  LUXURY_TAX_LINE,
  MAX_SALARY,
  MID_LEVEL_EXCEPTION,
  MIN_SALARY,
  MIN_PAYROLL,
  ROSTER_MIN,
  ROSTER_MAX,
  CAP_INCREASE_PER_SEASON,
  TAX_INCREASE_PER_SEASON,
  assignContract,
  assignRookieContract,
  calculatePayroll,
  calculateCapSpace,
  calculateTaxAmount,
  buildFinanceSummary,
  ensureContract,
  refreshUserFinance,
  canAbsorbContract,
  validateRosterSize,
  rollContractsForTeam,
  rolloverOffseason,
  escalateLeagueFinances,
  suggestAskingSalary,
  suggestAskingYears,
  toFreeAgent,
};
