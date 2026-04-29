// Card-pack player acquisition system. Replaces the old fantasy-draft
// flow: users buy packs of 5 random unique players to fill a 15-man
// roster instead of picking on the clock. NBA rule applies — a player
// can only land on ONE roster across the user's team and all 29 CPU
// teams (league-wide uniqueness).
//
// Tiers:
//   basic    — 20 tokens — pulls from rating range 60-79
//   premium  — 30 tokens — pulls from rating range 70-87
//   ultimate — 40 tokens — pulls from rating range 78-99

const PACK_TIERS = {
  basic:    { cost: 20, min: 60, max: 79, label: 'Basic Pack' },
  premium:  { cost: 30, min: 70, max: 87, label: 'Premium Pack' },
  ultimate: { cost: 40, min: 78, max: 99, label: 'Ultimate Pack' },
};

const PACK_SIZE = 5;
const ROSTER_SIZE = 15;

// Filter the pool to a tier's rating window. If the window doesn't have
// enough players (small pools, edge cases) we widen it gradually so the
// caller always gets back at least PACK_SIZE candidates.
function eligibleForTier(pool, tier, claimedIds) {
  const t = PACK_TIERS[tier];
  if (!t) return [];
  let widen = 0;
  // Widen up to ±20 rating points before giving up.
  while (widen <= 20) {
    const lo = Math.max(40, t.min - widen);
    const hi = Math.min(99, t.max + widen);
    const eligible = pool.filter(p =>
      !claimedIds.has(p.id) &&
      typeof p.rating === 'number' &&
      p.rating >= lo &&
      p.rating <= hi
    );
    if (eligible.length >= PACK_SIZE) return eligible;
    widen += 5;
  }
  // Last resort: any unclaimed player (e.g. the pool is nearly drained).
  return pool.filter(p => !claimedIds.has(p.id));
}

// Open one pack: pick 5 random unique players from the eligible subset,
// weighted slightly toward the top of the tier's rating window so higher
// tiers feel meaningfully better. Mutates `claimedIds` so two packs in
// the same call can never duplicate.
function openPack({ pool, tier, claimedIds, rng = Math.random }) {
  const eligible = eligibleForTier(pool, tier, claimedIds);
  if (eligible.length === 0) return [];

  // Weighted shuffle: each player's draw weight = (rating - tier.min + 1).
  // Higher-rated players inside the band are more likely to surface.
  const t = PACK_TIERS[tier];
  const baseWeight = (p) => {
    const w = (p.rating || t.min) - t.min + 1;
    return Math.max(1, w);
  };
  const remaining = eligible.slice();
  const drawn = [];
  while (drawn.length < PACK_SIZE && remaining.length > 0) {
    const total = remaining.reduce((s, p) => s + baseWeight(p), 0);
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < remaining.length; i++) {
      r -= baseWeight(remaining[i]);
      if (r <= 0) { idx = i; break; }
    }
    const [player] = remaining.splice(idx, 1);
    drawn.push(player);
    claimedIds.add(player.id);
  }
  return drawn;
}

// Convert a pool entry to the lean Mongo subdocument shape used in
// User.team.players / cpuTeams[].players.
function toRosterEntry(p) {
  return {
    playerId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position || 'F',
    rating: p.rating || 65,
    stats: p.stats || null,
  };
}

// Fill every CPU team's roster with 15 random unique players from the
// shared pool. CPUs draw from a tier-mix biased by their coachRating so
// stronger coaches build slightly stronger rosters. Used once on first
// user pack purchase so every franchise has players for league play.
function fillCpuTeamsRandomly({ cpuTeams, pool, claimedIds, rng = Math.random }) {
  for (const team of cpuTeams) {
    const coach = team.coachRating || 7;
    // Coach 7 -> mostly basic+premium. Coach 9-10 -> mix in more ultimate.
    const tierMix = coach >= 9
      ? ['ultimate', 'ultimate', 'premium', 'premium', 'basic']
      : coach >= 8
        ? ['premium', 'premium', 'basic', 'basic', 'basic']
        : ['basic', 'basic', 'basic', 'basic', 'premium'];
    team.players = [];
    while (team.players.length < ROSTER_SIZE) {
      const tier = tierMix[Math.floor(rng() * tierMix.length)];
      const drawn = openPack({ pool, tier, claimedIds, rng });
      if (drawn.length === 0) break;
      for (const p of drawn) {
        if (team.players.length >= ROSTER_SIZE) break;
        team.players.push({
          ...toRosterEntry(p),
          contract: { years: 1 + Math.floor(rng() * 4), salary: Math.round((p.rating || 70) * 0.5) },
        });
      }
    }
  }
  return cpuTeams;
}

module.exports = {
  PACK_TIERS,
  PACK_SIZE,
  ROSTER_SIZE,
  openPack,
  fillCpuTeamsRandomly,
  toRosterEntry,
};
