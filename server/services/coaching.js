// Sprint C3 — Coaching & Rotation service.
//
// Centralises all coach/rotation/pace logic so the simulation engine and
// the season-end Coach of the Year award can share one source of truth.

// Default coach used when a team doesn't have a coachInfo subdoc yet.
const DEFAULT_COACH = {
  name: 'Interim Staff',
  offenseRating: 65,
  defenseRating: 65,
  developmentRating: 65,
  style: 'balanced',         // 'offensive' | 'defensive' | 'balanced' | 'developmental'
  salary: 4,                 // $M / year
  yearsRemaining: 1,
  age: 50,
};

const COACH_FIRST_NAMES = ['Marcus', 'Greg', 'Quin', 'Doc', 'Mike', 'Steve', 'Ty', 'Frank', 'Jason', 'Erik', 'Monty', 'Tom'];
const COACH_LAST_NAMES  = ['Thibodeau', 'Popovich', 'Spoelstra', 'Kerr', 'Vogel', 'Rivers', 'Lue', 'Carlisle', 'Williams', 'Stevens', 'Snyder', 'Atkinson'];

function generateCoach(rng = Math.random) {
  const first = COACH_FIRST_NAMES[Math.floor(rng() * COACH_FIRST_NAMES.length)];
  const last  = COACH_LAST_NAMES[Math.floor(rng()  * COACH_LAST_NAMES.length)];
  const styles = ['offensive', 'defensive', 'balanced', 'developmental'];
  const style = styles[Math.floor(rng() * styles.length)];
  const off = 60 + Math.floor(rng() * 35);
  const def = 60 + Math.floor(rng() * 35);
  const dev = 60 + Math.floor(rng() * 35);
  return {
    name: `${first} ${last}`,
    offenseRating: style === 'offensive' ? Math.max(off, 80) : off,
    defenseRating: style === 'defensive' ? Math.max(def, 80) : def,
    developmentRating: style === 'developmental' ? Math.max(dev, 80) : dev,
    style,
    salary: 3 + Math.floor(rng() * 8),
    yearsRemaining: 1 + Math.floor(rng() * 4),
    age: 38 + Math.floor(rng() * 30),
  };
}

/**
 * Lazy backfill: ensure every team (user + CPUs) has a coachInfo, the
 * user has a coaching prefs object, and CPU teams have a defensive
 * assignment array. Idempotent.
 */
function ensureC3Fields(user) {
  let changed = false;

  if (!user.team) user.team = {};
  if (!user.team.coachInfo || !user.team.coachInfo.name) {
    user.team.coachInfo = generateCoach();
    if (user.team.coach) user.team.coachInfo.name = user.team.coach;
    changed = true;
  }

  if (!user.coaching) {
    user.coaching = { rotation: [], pace: 'medium', defensiveAssignments: [] };
    changed = true;
  }
  if (!Array.isArray(user.coaching.rotation)) user.coaching.rotation = [];
  if (!user.coaching.pace) user.coaching.pace = 'medium';
  if (!Array.isArray(user.coaching.defensiveAssignments)) user.coaching.defensiveAssignments = [];

  for (const cpu of user.cpuTeams || []) {
    if (!cpu.coachInfo || !cpu.coachInfo.name) {
      cpu.coachInfo = generateCoach();
      if (cpu.coach) cpu.coachInfo.name = cpu.coach;
      changed = true;
    }
  }

  if (!Array.isArray(user.coachOfTheYearHistory)) user.coachOfTheYearHistory = [];

  if (changed) {
    user.markModified('team');
    user.markModified('coaching');
    user.markModified('cpuTeams');
  }
  return user;
}

// --------------------------------------------------------------- pace

const PACE_FACTORS = {
  slow:   { possessionMul: 0.85, label: 'Slow' },
  medium: { possessionMul: 1.0,  label: 'Medium' },
  fast:   { possessionMul: 1.15, label: 'Fast' },
};

function paceMod(pace) {
  return PACE_FACTORS[pace] || PACE_FACTORS.medium;
}

// --------------------------------------------------------------- style

/**
 * Coach style modifiers applied to the simulation. Returns multipliers
 * the engine should layer onto its existing shot-chance and opponent
 * shot-chance computations.
 */
function coachStyleMods(coach) {
  if (!coach || !coach.style) return { ownShotBoost: 0, oppShotDrop: 0 };
  switch (coach.style) {
    case 'offensive':     return { ownShotBoost: 0.02, oppShotDrop: -0.01 };
    case 'defensive':     return { ownShotBoost: -0.01, oppShotDrop: 0.02 };
    case 'developmental': return { ownShotBoost: 0.005, oppShotDrop: 0 };
    case 'balanced':
    default:              return { ownShotBoost: 0.01, oppShotDrop: 0.005 };
  }
}

// --------------------------------------------------------------- rotation

/**
 * Apply a user-defined rotation to a roster. The first 8 entries become
 * the active rotation; bench (9+) play only in blowouts. Each entry
 * carries a `targetMinutes` value (0..40) used as a pick-weight multiplier
 * so heavy-minutes players touch more possessions.
 *
 * Returns a NEW players array — does not mutate the input.
 */
function applyRotation(roster, rotationPrefs) {
  if (!Array.isArray(rotationPrefs) || rotationPrefs.length === 0) return roster;
  const idsInOrder = rotationPrefs.map(r => r.playerId);
  const minutesById = Object.fromEntries(rotationPrefs.map(r => [r.playerId, Math.max(0, Math.min(40, r.targetMinutes || 24))]));

  const inRotation = idsInOrder
    .map(id => roster.find(p => Number(p.playerId) === Number(id)))
    .filter(Boolean)
    .slice(0, 8)
    .map(p => ({
      ...(p.toObject ? p.toObject() : p),
      // Weight bump proportional to target minutes / 24 (so 36-min star
      // gets ~1.5x weight, a 12-min role player ~0.5x).
      _rotationWeight: (minutesById[p.playerId] || 24) / 24,
    }));

  const bench = roster.filter(p => !idsInOrder.includes(p.playerId));
  return [...inRotation, ...bench];
}

/**
 * Pick the closing 5 — recommended by the coach for the final 3 minutes
 * of a one-possession game. Sorted by rating + clutch (B3 attribute).
 */
function suggestClosingLineup(roster) {
  return (roster || [])
    .filter(p => !p.injured && !p.injury?.isInjured)
    .map(p => ({
      ...p,
      _clutchScore: (p.rating || 70) + (p.clutch || 0) * 0.5 + (p.iq || 0) * 0.2,
    }))
    .sort((a, b) => b._clutchScore - a._clutchScore)
    .slice(0, 5);
}

// ------------------------------------------------------- defensive assign

/**
 * Build a quick-lookup map: { opponentScorerId => { defenderRating, defenderId } }.
 * The simulation reduces an opposing scorer's effective shot chance when a
 * higher-rated stopper is assigned to them.
 */
function buildAssignmentLookup(assignments, ownRoster) {
  const map = {};
  for (const a of assignments || []) {
    const def = (ownRoster || []).find(p => Number(p.playerId) === Number(a.defenderId));
    if (!def || !a.opponentScorerId) continue;
    map[a.opponentScorerId] = {
      defenderId: def.playerId,
      defenderRating: def.rating || 70,
      defenderName: `${def.firstName} ${def.lastName}`,
    };
  }
  return map;
}

/**
 * Compute the shot-chance penalty when a guarded scorer takes a shot.
 * Stronger defender → bigger drop. Capped at -8%.
 */
function defensivePenalty(scorer, lookup) {
  if (!lookup || !scorer) return 0;
  const entry = lookup[scorer.playerId];
  if (!entry) return 0;
  const delta = (entry.defenderRating - (scorer.rating || 70)) * 0.002;
  return Math.max(-0.08, Math.min(0, -Math.max(0.01, delta)));
}

// ------------------------------------------------------- COTY award

/**
 * Coach of the Year: pick the team that overperformed expected wins by
 * the largest margin. Expected wins are derived from average roster rating.
 *
 * @param {Object} options
 * @param {Object} options.user       The user document.
 * @param {Number} options.userWins   Wins this season for the user.
 * @returns {Object} { coachName, teamName, wins, expectedWins, delta }
 */
function coachOfTheYear({ user, userWins }) {
  const candidates = [];

  // User team.
  const userAvg = roundAvgRating(user.team?.players || []);
  candidates.push({
    coachName: user.team?.coachInfo?.name || user.team?.coach || 'User',
    teamName: `${user.team?.city || ''} ${user.team?.name || ''}`.trim(),
    wins: userWins || 0,
    expectedWins: expectedWinsFromRating(userAvg),
  });

  // CPU teams.
  for (const cpu of user.cpuTeams || []) {
    const rec = (user.cpuRecords || []).find(r => r.name === cpu.name) || { wins: 0 };
    candidates.push({
      coachName: cpu.coachInfo?.name || cpu.coach || cpu.name,
      teamName: `${cpu.city || ''} ${cpu.name || ''}`.trim(),
      wins: rec.wins || 0,
      expectedWins: expectedWinsFromRating(roundAvgRating(cpu.players || [])),
    });
  }

  // Compute deltas.
  const ranked = candidates
    .map(c => ({ ...c, delta: c.wins - c.expectedWins }))
    .sort((a, b) => b.delta - a.delta);
  return ranked[0] || null;
}

function expectedWinsFromRating(avg) {
  // Linear: 70 OVR → ~32 wins; 80 OVR → ~50; 85 OVR → ~58.
  return Math.round(Math.max(15, Math.min(70, (avg - 60) * 2.6)));
}

function roundAvgRating(players) {
  if (!players.length) return 70;
  const sum = players.reduce((s, p) => s + (p.rating || 70), 0);
  return Math.round(sum / players.length);
}

module.exports = {
  DEFAULT_COACH,
  ensureC3Fields,
  generateCoach,
  paceMod,
  coachStyleMods,
  applyRotation,
  suggestClosingLineup,
  buildAssignmentLookup,
  defensivePenalty,
  coachOfTheYear,
  expectedWinsFromRating,
};
