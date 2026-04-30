// Sprint A3 — Free Agency engine.
//
// Player-interest model: every offer (from the user OR from a CPU team)
// is scored 0-100. The winning bid is the highest-scoring offer above
// the player's "decline threshold". If no offer scores high enough the
// player rejects everyone and stays in the pool (rare for low-rated
// guys, common for stars who aren't being paid enough).

const {
  assignContract,
  MID_LEVEL_EXCEPTION,
  MAX_SALARY,
} = require('./contracts');

// Score a single offer for a free agent. Higher = more attractive.
//   - salary fit (vs asking)            +50 max
//   - years fit (length security)       +15 max
//   - team success (recent wins)        +15 max
//   - market tier                       +10 max
//   - role guarantee (future feature)   +10
function scoreOffer({ player, offer, team, teamWinsLastSeason = 0, marketTier = 'III' }) {
  const asking = player.askingSalary || 5;
  const askingYears = player.askingYears || 2;

  // Salary score: 1.0 = matches ask, >1 = overpay (caps at 1.4x), <1 = lowball
  const ratio = offer.salary / asking;
  let salaryScore;
  if (ratio >= 1) salaryScore = 50 * Math.min(ratio, 1.4) / 1.4;        // up to 50
  else            salaryScore = 50 * Math.max(0, ratio * ratio);         // squared falloff

  // Years score: matching the player's preferred length is best; very
  // short deals from stars-in-their-prime get penalized.
  const yearsDelta = offer.years - askingYears;
  let yearsScore;
  if (yearsDelta >= 0) yearsScore = 15;
  else if (yearsDelta === -1) yearsScore = 8;
  else                         yearsScore = 0;

  // Wins: 50+ wins last season = full points, 0 wins = 0.
  const winsScore = Math.min(15, (teamWinsLastSeason / 50) * 15);

  // Market: I (big city) > II > III.
  const tierScore = marketTier === 'I' ? 10 : marketTier === 'II' ? 6 : 3;

  // Tiny RNG so identical offers don't always tie.
  const noise = Math.random() * 4;

  return Math.round(salaryScore + yearsScore + winsScore + tierScore + noise);
}

// Players reject offers below this score (varies by rating — stars are
// pickier).
function declineThreshold(rating) {
  if (rating >= 90) return 65;
  if (rating >= 85) return 55;
  if (rating >= 80) return 45;
  if (rating >= 75) return 38;
  return 30;
}

// Generate 0-3 CPU competing offers on a free agent. Each CPU team must
// have cap room (or be willing to use MLE) for its own offer. Skips
// teams already at the roster cap.
function generateCpuOffers(player, cpuTeams, { rng = Math.random } = {}) {
  const offers = [];
  const numCompetitors = Math.floor(rng() * 4); // 0..3
  if (numCompetitors === 0) return offers;

  // Random subset of CPU teams that have cap room or roster space.
  const candidates = (cpuTeams || []).slice().sort(() => rng() - 0.5);
  for (const team of candidates) {
    if (offers.length >= numCompetitors) break;
    if ((team.players || []).length >= 15) continue;

    const payroll = (team.players || []).reduce((s, p) => s + ((p.contract && p.contract.salary) || 0), 0);
    // CPU is willing to spend up to 165M (just under tax line).
    const headroom = 165 - payroll;
    if (headroom < (player.askingSalary || 1)) continue;

    // CPU offers between 80% and 120% of ask (capped to headroom + max).
    const mult = 0.8 + rng() * 0.4;
    const salary = Math.min(
      MAX_SALARY,
      headroom,
      Math.round((player.askingSalary || 5) * mult * 10) / 10
    );
    if (salary < 1) continue;

    const years = Math.max(1, (player.askingYears || 2) + Math.floor(rng() * 3) - 1);

    offers.push({
      teamName: team.name,
      teamCity: team.city,
      salary,
      years,
      isUser: false,
      teamWinsLastSeason: 30 + Math.floor(rng() * 30),
      marketTier: team.marketTier || 'III',
    });
  }
  return offers;
}

// Resolve a single FA's offers. Returns `{ winner, allScores, declined }`.
// `winner` is the offer object that won, or `null` if the player declined
// everyone (no offer beat the decline threshold).
function resolveFreeAgent(player, offers) {
  const scored = offers.map(o => ({
    offer: o,
    score: scoreOffer({
      player,
      offer: o,
      teamWinsLastSeason: o.teamWinsLastSeason,
      marketTier: o.marketTier,
    }),
  }));
  scored.sort((a, b) => b.score - a.score);

  const threshold = declineThreshold(player.rating || 70);
  if (!scored.length || scored[0].score < threshold) {
    return { winner: null, scored, declined: true, threshold };
  }
  return { winner: scored[0], scored, declined: false, threshold };
}

// Build a roster entry for a CPU win — used when the user's offer is
// outbid and the FA goes to a CPU team.
function rosterEntryFromOffer(player, offer) {
  return {
    playerId: player.playerId,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    rating: player.rating,
    stats: player.stats,
    contract: {
      salary: offer.salary,
      yearsRemaining: offer.years,
      years: offer.years,
      contractType: player.rating >= 85 ? 'max' : player.rating >= 75 ? 'standard' : player.rating >= 68 ? 'standard' : 'minimum',
      teamOption: false,
      playerOption: false,
      noTradeClause: false,
      signedAt: new Date(),
    },
  };
}

module.exports = {
  scoreOffer,
  declineThreshold,
  generateCpuOffers,
  resolveFreeAgent,
  rosterEntryFromOffer,
};
