// Sprint B2 — Injury system.
//
// Pre-game: rollInjuries(team) walks each player and rolls a small injury
// chance based on durability (default 70). Returns the list of new injuries
// that occurred this game so the route can push news entries.
//
// Post-game: tickRecovery(team) decrements gamesRemaining for every active
// injury; players whose count hits 0 are marked healthy and start their
// "rust" window (gamesSinceReturn = 0..2 → -3% rating in sim).
//
// Lineup integration: applyLineup() (services/fantasyGM) filters out
// any player with injury.isInjured === true before backfilling starters.
//
// B2B fatigue: detectBackToBack(scheduleEntry, prevDate) — if today's
// game is the calendar day immediately after the prior played game, the
// route flags every player on the squad with `__b2b = true` so the
// simulation routes can apply -3% rating before passing into simulateGame.

const INJURY_TYPES = [
  { type: 'Ankle Sprain',    minGames: 1,  maxGames: 3,  weight: 45, severity: 'minor' },
  { type: 'Hamstring Strain', minGames: 5,  maxGames: 10, weight: 25, severity: 'moderate' },
  { type: 'Wrist Contusion', minGames: 1,  maxGames: 4,  weight: 15, severity: 'minor' },
  { type: 'Knee Sprain',     minGames: 10, maxGames: 20, weight: 10, severity: 'major' },
  { type: 'Torn ACL',        minGames: 60, maxGames: 82, weight: 3,  severity: 'season-ending' },
  { type: 'Achilles Tear',   minGames: 60, maxGames: 82, weight: 2,  severity: 'season-ending' },
];

const TOTAL_WEIGHT = INJURY_TYPES.reduce((s, t) => s + t.weight, 0);

// Per-player injury probability per game. Tuned so that roughly 1-2 players
// on a 12-man roster pick up an injury per game. Higher durability lowers
// the chance.
function injuryChance(p) {
  const dur = p.durability != null ? p.durability : 70;
  // 70 durability → 1.5%, 90 → 0.6%, 50 → 2.4%
  return Math.max(0.002, 0.03 - (dur / 100) * 0.027);
}

function pickInjuryType(rng = Math.random) {
  let r = rng() * TOTAL_WEIGHT;
  for (const t of INJURY_TYPES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return INJURY_TYPES[0];
}

function ensureB2Fields(p) {
  if (p.durability == null) p.durability = 60 + Math.floor(Math.random() * 35); // 60-94
  if (!p.injury) {
    p.injury = { isInjured: false, injuryType: null, gamesRemaining: 0, severity: null };
  }
  if (p.gamesSinceReturn == null) p.gamesSinceReturn = 99; // 99 = no recent return
}

// Roll injuries for everyone in the active roster slice. `activeCount`
// defaults to 8 (starters + main rotation) since deep bench players don't
// see meaningful minutes. Returns array of new injuries.
function rollInjuries(team, opts = {}) {
  const rng = opts.rng || Math.random;
  const activeCount = opts.activeCount || 8;
  const newInjuries = [];
  if (!team || !Array.isArray(team.players)) return newInjuries;
  const active = team.players.slice(0, activeCount);
  for (const p of active) {
    ensureB2Fields(p);
    if (p.injury.isInjured) continue;
    if (rng() < injuryChance(p)) {
      const t = pickInjuryType(rng);
      const games = t.minGames + Math.floor(rng() * (t.maxGames - t.minGames + 1));
      p.injury = {
        isInjured: true,
        injuryType: t.type,
        gamesRemaining: games,
        severity: t.severity,
      };
      p.injured = true; // legacy mirror
      p.injuryDaysRemaining = games * 2;
      p.inLineup = false;
      newInjuries.push({
        playerId: p.playerId,
        name: `${p.firstName} ${p.lastName}`,
        team: team.name,
        type: t.type,
        gamesRemaining: games,
        severity: t.severity,
      });
    }
  }
  return newInjuries;
}

// Tick recovery for every player on the roster after a game. Returns
// list of players who returned to health this game (so route can push news).
function tickRecovery(team) {
  const returned = [];
  if (!team || !Array.isArray(team.players)) return returned;
  for (const p of team.players) {
    ensureB2Fields(p);
    if (p.injury.isInjured) {
      p.injury.gamesRemaining = Math.max(0, p.injury.gamesRemaining - 1);
      if (p.injury.gamesRemaining === 0) {
        p.injury.isInjured = false;
        p.injury.injuryType = null;
        p.injury.severity = null;
        p.injured = false;
        p.injuryDaysRemaining = 0;
        p.gamesSinceReturn = 0;
        returned.push({
          playerId: p.playerId,
          name: `${p.firstName} ${p.lastName}`,
          team: team.name,
        });
      }
    } else if (p.gamesSinceReturn < 99) {
      p.gamesSinceReturn += 1;
      if (p.gamesSinceReturn >= 3) p.gamesSinceReturn = 99; // window over
    }
  }
  return returned;
}

// Build a "rust + B2B" rating-adjusted clone of the team for the
// simulation. Original docs are not mutated. Filters out injured players
// (moves them out of the active 5 by setting inLineup=false).
function buildSimRoster(team, { isBackToBack = false } = {}) {
  if (!team || !Array.isArray(team.players)) return team;
  const adjustedPlayers = team.players
    .filter(p => !(p.injury && p.injury.isInjured))
    .map(p => {
      let rating = p.rating || 70;
      // Rust: -3% for first 3 games back from injury.
      if (p.gamesSinceReturn != null && p.gamesSinceReturn < 3) rating *= 0.97;
      // Back-to-back fatigue: -3% all stats.
      if (isBackToBack) rating *= 0.97;
      return { ...(p.toObject ? p.toObject() : p), rating: Math.round(rating) };
    });
  return { ...team, players: adjustedPlayers };
}

// Returns true if `currDate` falls on the calendar day right after `prevDate`.
// Both arguments are YYYY-MM-DD strings (matches schedule.gameDate).
function detectBackToBack(currDate, prevDate) {
  if (!currDate || !prevDate) return false;
  const a = new Date(prevDate + 'T00:00:00Z');
  const b = new Date(currDate + 'T00:00:00Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  const diffDays = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

function injuryNewsLine(inj) {
  const weeks = Math.max(1, Math.round(inj.gamesRemaining / 3));
  const headline = inj.severity === 'season-ending'
    ? `${inj.name} suffers season-ending ${inj.type}`
    : `${inj.name} out ${weeks}-${weeks + 1} weeks with ${inj.type}`;
  return {
    kind: 'injury',
    headline,
    body: `${inj.team} announced that ${inj.name} will miss approximately ${inj.gamesRemaining} game${inj.gamesRemaining === 1 ? '' : 's'} with a ${inj.type.toLowerCase()}.`,
    createdAt: new Date(),
  };
}

function returnNewsLine(ret) {
  return {
    kind: 'injury-return',
    headline: `${ret.name} cleared to return`,
    body: `${ret.team} medical staff cleared ${ret.name} to rejoin the active roster.`,
    createdAt: new Date(),
  };
}

module.exports = {
  INJURY_TYPES,
  ensureB2Fields,
  rollInjuries,
  tickRecovery,
  buildSimRoster,
  detectBackToBack,
  injuryNewsLine,
  returnNewsLine,
  injuryChance,
};
