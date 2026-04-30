// Sprint B1 — Player progression / regression engine.
//
// Run once at every offseason rollover (after rolloverOffseason). Iterates
// over every player on the user's team + every CPU team and adjusts each
// player's rating based on age, minutes, potential, and a small RNG.
//
// Curve:
//   age <= 22  → +2..+5 (rookie scale leap)
//   age 23-25  → +1..+3 (development)
//   age 26-28  → -1..+1 (peak window)
//   age 29-31  → -1..-2 (mid decline)
//   age 32-34  → -2..-3 (late decline)
//   age >= 35  → -3..-5 (cliff)
//
// Modifiers:
//   workEthic — multiplier on positive deltas (0.5x–1.5x).
//   minutes  — 30+ min/game speeds development; bench guys progress slower.
//   potential — caps young player growth at their ceiling.
//   breakout — 5% chance for <26 player to jump +5..+8.
//   bust     — 3% chance for highly-rated rookies (rating >=78, age <=21)
//              to lose 4-7 instead.

const BREAKOUT_CHANCE = 0.05;
const BUST_CHANCE = 0.03;

function pickRange(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Default ratings for any player without B1 fields yet.
function ensureB1Fields(p, rng = Math.random) {
  let modified = false;
  if (p.age == null) {
    // Backfill: scale roughly with rating + RNG. Stars older, role players younger.
    const r = p.rating || 70;
    const base = r >= 88 ? 28 : r >= 80 ? 26 : r >= 73 ? 24 : 22;
    p.age = base + Math.floor(rng() * 5) - 2; // ±2
    p.age = clamp(p.age, 19, 39);
    modified = true;
  }
  if (p.potential == null) {
    p.potential = clamp((p.rating || 70) + 2 + Math.floor(rng() * 9), 60, 99);
    modified = true;
  }
  if (p.workEthic == null) {
    p.workEthic = pickRange(40, 95, rng);
    modified = true;
  }
  return modified;
}

function progressOnePlayer(p, { rng = Math.random } = {}) {
  ensureB1Fields(p, rng);

  const age = p.age;
  const rating = p.rating || 70;
  const potential = p.potential || rating + 2;
  const workEthic = p.workEthic || 65;
  const minutes = p.inLineup ? 32 : 18; // starters develop faster

  let delta = 0;
  let event = null;

  // Bust check first (rare, only highly-rated young players).
  if (age <= 21 && rating >= 78 && rng() < BUST_CHANCE) {
    delta = -pickRange(4, 7, rng);
    event = 'bust';
  } else if (age <= 25 && rng() < BREAKOUT_CHANCE) {
    delta = pickRange(5, 8, rng);
    event = 'breakout';
  } else {
    if (age <= 22)       delta = pickRange(2, 5, rng);
    else if (age <= 25)  delta = pickRange(1, 3, rng);
    else if (age <= 28)  delta = pickRange(-1, 1, rng);
    else if (age <= 31)  delta = pickRange(-2, -1, rng);
    else if (age <= 34)  delta = pickRange(-3, -2, rng);
    else                 delta = pickRange(-5, -3, rng);

    // Modifiers (only apply to positive deltas in development phase).
    if (delta > 0) {
      const ethicMult = 0.5 + (workEthic / 100);             // 0.9..1.45
      const minutesMult = minutes >= 28 ? 1.1 : minutes >= 18 ? 0.9 : 0.6;
      delta = Math.round(delta * ethicMult * minutesMult);
      delta = Math.max(0, delta);
    }
  }

  // Cap by potential when growing.
  let newRating = rating + delta;
  if (delta > 0 && newRating > potential) {
    newRating = potential;
    delta = newRating - rating;
  }
  newRating = clamp(newRating, 50, 99);
  delta = newRating - rating;

  p.rating = newRating;
  p.age = age + 1;

  return {
    playerId: p.playerId,
    name: `${p.firstName} ${p.lastName}`,
    before: rating,
    after: newRating,
    delta,
    event,
    age: p.age,
  };
}

function progressTeam(team, ctx) {
  const out = [];
  for (const p of (team?.players || [])) {
    out.push(progressOnePlayer(p, ctx));
  }
  return out;
}

// Run progression on every roster on the user record. Returns a season
// "development report" the UI can show + filter.
function runProgression(user, opts = {}) {
  const ctx = { rng: opts.rng || Math.random };
  const userReport = progressTeam(user.team, ctx);
  const cpuReport = [];
  for (const cpu of (user.cpuTeams || [])) {
    cpuReport.push({ team: cpu.name, players: progressTeam(cpu, ctx) });
  }
  user.markModified('team');
  user.markModified('cpuTeams');

  // Notable players to surface up top: breakouts, busts, biggest jumps.
  const allEvents = [
    ...userReport.map(r => ({ ...r, team: user.team?.name || 'You', isUser: true })),
    ...cpuReport.flatMap(t => t.players.map(r => ({ ...r, team: t.team, isUser: false }))),
  ];
  const breakouts = allEvents.filter(e => e.event === 'breakout').sort((a, b) => b.delta - a.delta);
  const busts = allEvents.filter(e => e.event === 'bust').sort((a, b) => a.delta - b.delta);
  const biggestRisers = allEvents.filter(e => !e.event).sort((a, b) => b.delta - a.delta).slice(0, 5);
  const biggestFallers = allEvents.filter(e => !e.event).sort((a, b) => a.delta - b.delta).slice(0, 5);

  return {
    userReport,
    cpuReport,
    breakouts,
    busts,
    biggestRisers,
    biggestFallers,
    totalPlayers: allEvents.length,
  };
}

module.exports = {
  ensureB1Fields,
  progressOnePlayer,
  progressTeam,
  runProgression,
  BREAKOUT_CHANCE,
  BUST_CHANCE,
};
