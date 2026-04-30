// Static reference data + helpers for the Fantasy GM mode.
//
// - Conference / Division mapping mirrors the NBA so we can validate that
//   the user picks a division that lives inside the chosen conference.
// - US cities are partitioned into market tiers (I = major, II = mid,
//   III = small / low-market). Used both for user setup and CPU team
//   generation.
// - generateCpuTeams() spins up the rest of the league (29 CPU franchises)
//   so each division has 5 teams, with no duplicate cities, names, or
//   coaches relative to the user.

const { getDifficultyMods } = require('./simulation');
const { assignContract } = require('./contracts');

const DIVISIONS = {
  East: ['Atlantic', 'Central', 'Southeast'],
  West: ['Northwest', 'Pacific', 'Southwest'],
};

// Market tiers — Tier I = major markets, II = mid, III = small / low-market.
const CITY_TIERS = {
  I: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Dallas',
    'Philadelphia', 'Boston', 'Miami', 'Atlanta', 'Washington D.C.',
    'Phoenix', 'San Francisco',
  ],
  II: [
    'Denver', 'Seattle', 'Minneapolis', 'Detroit', 'Cleveland',
    'Charlotte', 'Portland', 'San Diego', 'Tampa', 'Baltimore',
    'St. Louis', 'Pittsburgh', 'Cincinnati', 'Brooklyn',
  ],
  III: [
    'Oklahoma City', 'Memphis', 'Salt Lake City', 'New Orleans',
    'Sacramento', 'San Antonio', 'Indianapolis', 'Milwaukee',
    'Orlando', 'Louisville', 'Nashville', 'Las Vegas',
    'Albuquerque', 'Tucson', 'Omaha', 'Colorado Springs',
    'Raleigh', 'Honolulu', 'Jacksonville',
  ],
};

const ALL_CITIES = [...CITY_TIERS.I, ...CITY_TIERS.II, ...CITY_TIERS.III];

const NBA_COACHES = [
  'Phil Jackson', 'Gregg Popovich', 'Pat Riley', 'Red Auerbach', 'Steve Kerr',
  'Erik Spoelstra', 'Tyronn Lue', 'Doc Rivers', 'Rick Carlisle', 'Larry Brown',
  'Chuck Daly', 'Lenny Wilkens', 'Don Nelson', 'Jerry Sloan', "Mike D'Antoni",
  'Tom Thibodeau', 'Mike Budenholzer', 'Monty Williams', 'Ime Udoka',
  'Joe Mazzulla', 'Jason Kidd', 'Mark Daigneault', 'Chauncey Billups',
  'Quin Snyder', 'JJ Redick', 'Wes Unseld Jr.', 'Nate McMillan',
  'David Blatt', 'Mike Brown', 'Stan Van Gundy', 'Jeff Van Gundy',
  'Brad Stevens', 'Frank Vogel', 'Mike Malone', 'Taylor Jenkins',
];

const TEAM_MASCOTS = [
  'Wolves', 'Hawks', 'Falcons', 'Eagles', 'Lions', 'Tigers', 'Bears',
  'Sharks', 'Dragons', 'Phoenix', 'Knights', 'Pioneers', 'Rockets',
  'Comets', 'Storm', 'Thunder', 'Lightning', 'Cyclones', 'Blazers',
  'Mustangs', 'Stallions', 'Vipers', 'Cobras', 'Panthers', 'Jaguars',
  'Wizards', 'Sentinels', 'Guardians', 'Titans', 'Vikings', 'Spartans',
  'Royals', 'Kings', 'Monarchs',
];

const STORE_ITEMS = [
  // Player-targeted boosts (require a `playerId`).
  { itemId: 'training-camp',  name: 'Training Camp Pass',  cost:  60, boost: { offense: 1, defense: 1, athleticism: 1 }, category: 'training' },
  { itemId: 'shooting-coach', name: 'Personal Shooting Coach', cost: 80, boost: { offense: 3 }, category: 'training' },
  { itemId: 'defensive-guru', name: 'Defensive Guru',       cost:  80, boost: { defense: 3 }, category: 'training' },
  { itemId: 'strength-coach', name: 'Strength & Conditioning Coach', cost: 70, boost: { athleticism: 3 }, category: 'training' },
  { itemId: 'gold-shoes',     name: 'Signature Gold Shoes', cost: 120, boost: { offense: 2, athleticism: 2 }, category: 'accessory' },
  { itemId: 'recovery-suite', name: 'Recovery Suite',       cost: 100, healInjury: true, category: 'medical' },
  { itemId: 'mvp-package',    name: 'MVP Package',          cost: 200, boost: { offense: 4, defense: 2, athleticism: 2 }, category: 'training' },

  // NEW \u2014 player accessories (cosmetic + small stat bumps).
  { itemId: 'compression-sleeve', name: 'Compression Arm Sleeve', cost: 35, boost: { offense: 1 }, category: 'accessory' },
  { itemId: 'headband',           name: 'Pro Headband',           cost: 25, boost: { defense: 1 }, category: 'accessory' },
  { itemId: 'titanium-mouthguard',name: 'Titanium Mouthguard',    cost: 45, boost: { athleticism: 1, defense: 1 }, category: 'accessory' },
  { itemId: 'custom-jersey',      name: 'Custom Jersey',          cost: 90, boost: { offense: 2 }, category: 'accessory' },

  // NEW — team-wide upgrades. `applyToTeam: true` means the buff is spread
  // across every roster player (no playerId required).
  { itemId: 'home-court',        name: 'Home Court Advantage Package', cost: 250, applyToTeam: true, boost: { offense: 1, defense: 1 }, category: 'facility' },
  { itemId: 'analytics-dept',    name: 'Analytics Department',         cost: 180, applyToTeam: true, boost: { defense: 2 }, category: 'facility' },
  { itemId: 'team-bus',          name: 'Luxury Team Bus',              cost: 140, applyToTeam: true, boost: { athleticism: 1 }, category: 'facility' },
  { itemId: 'mascot-package',    name: 'Mascot & Crowd Package',       cost: 110, applyToTeam: true, boost: { offense: 1 }, category: 'facility' },

  // NEW — branded sneakers (player-targeted; bigger boosts than generic gear).
  // Each major brand contributes a sneaker, an arm sleeve, an arm band, and
  // a headband so the user can outfit a roster with a single brand identity.
  { itemId: 'nike-lebron',         name: 'Nike LeBron Sneakers',        cost: 160, brand: 'Nike',        boost: { offense: 3, athleticism: 2 }, category: 'sneaker' },
  { itemId: 'nike-sleeve',         name: 'Nike Pro Compression Sleeve', cost:  40, brand: 'Nike',        boost: { offense: 1 },                 category: 'accessory' },
  { itemId: 'nike-armband',        name: 'Nike Elite Armband',          cost:  35, brand: 'Nike',        boost: { athleticism: 1 },             category: 'accessory' },
  { itemId: 'nike-headband',       name: 'Nike Swoosh Headband',        cost:  30, brand: 'Nike',        boost: { defense: 1 },                 category: 'accessory' },

  { itemId: 'adidas-dame',         name: 'Adidas Dame Sneakers',        cost: 150, brand: 'Adidas',      boost: { offense: 2, athleticism: 2 }, category: 'sneaker' },
  { itemId: 'adidas-sleeve',       name: 'Adidas Techfit Sleeve',       cost:  38, brand: 'Adidas',      boost: { defense: 1 },                 category: 'accessory' },
  { itemId: 'adidas-armband',      name: 'Adidas Power Armband',        cost:  32, brand: 'Adidas',      boost: { athleticism: 1 },             category: 'accessory' },
  { itemId: 'adidas-headband',     name: 'Adidas Trefoil Headband',     cost:  28, brand: 'Adidas',      boost: { offense: 1 },                 category: 'accessory' },

  { itemId: 'puma-clyde',          name: 'Puma Clyde All-Pro Sneakers', cost: 145, brand: 'Puma',        boost: { athleticism: 3, defense: 1 }, category: 'sneaker' },
  { itemId: 'puma-sleeve',         name: 'Puma Hoops Sleeve',           cost:  36, brand: 'Puma',        boost: { offense: 1 },                 category: 'accessory' },
  { itemId: 'puma-armband',        name: 'Puma Court Armband',          cost:  30, brand: 'Puma',        boost: { defense: 1 },                 category: 'accessory' },
  { itemId: 'puma-headband',       name: 'Puma Cat Headband',           cost:  26, brand: 'Puma',        boost: { athleticism: 1 },             category: 'accessory' },

  { itemId: 'newbalance-twoways',  name: 'New Balance TWO WAYS',        cost: 155, brand: 'New Balance', boost: { defense: 3, athleticism: 1 }, category: 'sneaker' },
  { itemId: 'newbalance-sleeve',   name: 'New Balance Court Sleeve',    cost:  37, brand: 'New Balance', boost: { athleticism: 1 },             category: 'accessory' },
  { itemId: 'newbalance-armband',  name: 'New Balance Pro Armband',     cost:  31, brand: 'New Balance', boost: { offense: 1 },                 category: 'accessory' },
  { itemId: 'newbalance-headband', name: 'New Balance NB Headband',     cost:  27, brand: 'New Balance', boost: { defense: 1 },                 category: 'accessory' },
];

// Token bundles — purchasable with PayPal or credit card.
const TOKEN_BUNDLES = [
  { bundleId: 'starter',  name: 'Starter Pack',   tokens:   500, priceUSD: 1.99 },
  { bundleId: 'standard', name: 'Standard Pack',  tokens:  1500, priceUSD: 4.99 },
  { bundleId: 'pro',      name: 'Pro Pack',       tokens:  4000, priceUSD: 9.99 },
  { bundleId: 'mvp',      name: 'MVP Pack',       tokens: 10000, priceUSD: 19.99 },
  { bundleId: 'champion', name: 'Champion Pack',  tokens: 25000, priceUSD: 39.99 },
];

// Subscription plans — recurring perks (weekly token drop + exclusive items).
const SUBSCRIPTION_PLANS = [
  {
    tier: 'premium',
    name: 'Premium GM',
    priceUSD: 4.99,
    perks: ['+250 tokens / week', '15% Store discount', 'Premium All-Star vote weight'],
    weeklyTokens: 250,
    storeDiscount: 0.15,
  },
  {
    tier: 'gm-elite',
    name: 'GM Elite',
    priceUSD: 9.99,
    perks: ['+750 tokens / week', '25% Store discount', 'Triple All-Star vote weight', 'Trade-deadline insider news'],
    weeklyTokens: 750,
    storeDiscount: 0.25,
  },
];

// Achievement catalogue. Each entry has a `check(user)` predicate that
// returns true if the achievement is earned given the current user state.
// Token rewards are paid once per achievement (tracked via `user.achievements`).
const ACHIEVEMENTS = [
  {
    id: 'first-win',     name: 'First Win',          tokens:  50,
    check: u => u.wins >= 1,
  },
  {
    id: 'ten-win-club',  name: '10-Win Club',        tokens: 100,
    check: u => u.wins >= 10,
  },
  {
    id: 'fifty-wins',    name: '50-Win Season',      tokens: 250,
    check: u => u.seasonWins >= 50,
  },
  {
    id: 'sixty-wins',    name: '60-Win Powerhouse',  tokens: 400,
    check: u => u.seasonWins >= 60,
  },
  {
    id: 'champion',      name: 'League Champion',    tokens: 500,
    check: u => u.career.some(c => c.champion),
  },
  {
    id: 'dynasty',       name: 'Dynasty (3 Titles)', tokens: 1000,
    check: u => u.career.filter(c => c.champion).length >= 3,
  },
  {
    id: 'star-player',   name: 'Star on the Roster (90+ rated)', tokens: 75,
    check: u => (u.team?.players || []).some(p => (p.rating || 0) >= 90),
  },
  {
    id: 'deep-bench',    name: 'Deep Roster (15 players)', tokens: 60,
    check: u => (u.team?.players || []).length >= 15,
  },
  // NEW — draft / lottery / store / season-progression milestones.
  {
    id: 'lottery-winner', name: 'Lottery Winner (Pick #1)', tokens: 150,
    check: u => u.lotteryPosition === 1,
  },
  {
    id: 'top-five-pick',  name: 'Top-5 Lottery Pick',       tokens:  60,
    check: u => u.lotteryPosition >= 1 && u.lotteryPosition <= 5,
  },
  {
    id: 'draft-day',      name: 'Draft Day Complete',       tokens: 100,
    check: u => u.draftCompleted === true,
  },
  {
    id: 'first-purchase', name: 'First Store Purchase',     tokens:  40,
    check: u => (u.inventory || []).length >= 1,
  },
  {
    id: 'big-spender',    name: 'Big Spender (5 items)',    tokens:  90,
    check: u => (u.inventory || []).length >= 5,
  },
  {
    id: 'gm-mogul',       name: 'GM Mogul (10 items)',      tokens: 200,
    check: u => (u.inventory || []).length >= 10,
  },
  {
    id: 'season-vet',     name: 'Season Veteran',           tokens: 150,
    check: u => (u.career || []).length >= 1,
  },
  {
    id: 'half-decade',    name: 'Half-Decade Career',       tokens: 400,
    check: u => (u.career || []).length >= 5,
  },
  {
    id: 'twenty-wins',    name: '20-Win Streak Builder',    tokens: 200,
    check: u => u.seasonWins >= 20,
  },
  {
    id: 'all-star-ros',   name: 'All-Star Roster (95+ rated)', tokens: 200,
    check: u => (u.team?.players || []).some(p => (p.rating || 0) >= 95),
  },
  // NEW — playoffs / All-Star / subscription milestones.
  {
    id: 'playoff-bound',  name: 'Made the Playoffs',           tokens: 200,
    check: u => !!u.playoffs?.started,
  },
  {
    id: 'finals-app',     name: 'Finals Appearance',           tokens: 350,
    check: u => (u.career || []).some(c => ['finalist','champion'].includes(c.playoffResult)),
  },
  {
    id: 'ring',           name: 'Ring (Playoff Champion)',     tokens: 750,
    check: u => (u.career || []).some(c => c.playoffResult === 'champion'),
  },
  {
    id: 'all-star-coach', name: 'All-Star Selector',           tokens: 100,
    check: u => !!u.allStar?.voted,
  },
  {
    id: 'premium-gm',     name: 'Premium GM Subscriber',       tokens: 150,
    check: u => u.subscription?.tier === 'premium' || u.subscription?.tier === 'gm-elite',
  },
  {
    id: 'token-buyer',    name: 'First Token Purchase',        tokens:  50,
    check: u => (u.payments || []).some(p => p.kind === 'tokens'),
  },
];

// Award all newly-earned achievements + the per-10-wins token reward.
// Returns { tokensAwarded, newAchievements: [...] }.
function awardRewards(user) {
  const earnedIds = new Set((user.achievements || []).map(a => a.id));
  const newAchievements = [];
  let tokensAwarded = 0;

  for (const ach of ACHIEVEMENTS) {
    if (earnedIds.has(ach.id)) continue;
    if (!ach.check(user)) continue;
    newAchievements.push({ id: ach.id, name: ach.name, tokens: ach.tokens });
    user.achievements.push({
      id: ach.id,
      seasonNumber: user.seasonNumber,
      tokensAwarded: ach.tokens,
    });
    tokensAwarded += ach.tokens;
  }

  // Per-10-wins reward: 120 tokens for every 10 cumulative wins, paid only
  // for the wins that haven't been awarded yet. `winsAwarded` tracks the
  // last cumulative wins count we paid out for.
  const claimable = Math.floor(user.wins / 10) - Math.floor((user.winsAwarded || 0) / 10);
  if (claimable > 0) {
    const reward = claimable * 120;
    tokensAwarded += reward;
    user.winsAwarded = Math.floor(user.wins / 10) * 10;
  }

  if (tokensAwarded > 0) user.tokens = (user.tokens || 0) + tokensAwarded;
  return { tokensAwarded, newAchievements };
}

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tierForCity(city) {
  if (CITY_TIERS.I.includes(city)) return 'I';
  if (CITY_TIERS.II.includes(city)) return 'II';
  if (CITY_TIERS.III.includes(city)) return 'III';
  return '';
}

function isValidConferenceDivision(conference, division) {
  return !!(DIVISIONS[conference] && DIVISIONS[conference].includes(division));
}

// Generate the rest of the 30-team league (everyone except the user).
// `userTeam` is required to avoid duplicating its city / coach / name.
function generateCpuTeams({ userTeam, rng = Math.random } = {}) {
  const usedCities = new Set([userTeam?.city].filter(Boolean));
  const usedCoaches = new Set([userTeam?.coach].filter(Boolean));
  const usedNames = new Set([userTeam?.name].filter(Boolean));

  const cityPool = shuffle(ALL_CITIES.filter(c => !usedCities.has(c)), rng);
  const coachPool = shuffle(NBA_COACHES.filter(c => !usedCoaches.has(c)), rng);
  const mascotPool = shuffle(TEAM_MASCOTS, rng);

  const teams = [];

  // 5 franchises per division -> 30 league spots; user occupies one of them.
  const userConf = userTeam?.conference;
  const userDiv = userTeam?.division;

  for (const conference of Object.keys(DIVISIONS)) {
    for (const division of DIVISIONS[conference]) {
      const slots = (conference === userConf && division === userDiv) ? 4 : 5;
      for (let i = 0; i < slots; i++) {
        const city = cityPool.shift();
        const coach = coachPool.shift();
        if (!city || !coach) continue; // safety — shouldn't trip with the pools above
        let mascot = mascotPool.shift() || pick(TEAM_MASCOTS, rng);
        let name = `${city} ${mascot}`;
        // de-dup defensively
        while (usedNames.has(name)) {
          mascot = pick(TEAM_MASCOTS, rng);
          name = `${city} ${mascot}`;
        }
        usedNames.add(name);
        // Legacy-difficulty CPU coaches — every CPU runs a real playbook.
        // Rating 7–10 with most coaches at 8–9, a few elite at 10.
        const coachRoll = rng();
        const coachRating = coachRoll < 0.15 ? 10 : coachRoll < 0.55 ? 9 : coachRoll < 0.9 ? 8 : 7;
        teams.push({
          name,
          city,
          coach,
          coachRating,
          conference,
          division,
          marketTier: tierForCity(city),
          players: [],
        });
      }
    }
  }
  return teams;
}

// Distribute drafted players across CPU teams from a pool of available
// players. Returns the populated cpuTeams array (mutated in place too).
//
// Smart CPU draft: each CPU runs a snake-style draft where each pick is
// the best-available rated player that fills a positional need (cap 3 per
// position so rosters look balanced), with a small rating-noise jitter so
// not every CPU ends up identical.
//
// League-wide uniqueness: the same player cannot land on two CPU rosters.
// Pass `excludeIds` (e.g. the user's roster ids) so those players are also
// off-limits. The shared `claimed` set is mutated as picks are made so
// concurrent CPUs in the same call respect each other's picks.
function distributePlayersToCpuTeams({ cpuTeams, pool, picksPerTeam = 15, rng = Math.random, excludeIds = [] }) {
  const POS_CAP = 3;
  const claimed = new Set(excludeIds);
  for (const team of cpuTeams) {
    const posCount = {};
    team.players = [];
    // Each CPU has its own scouting noise (some are sharper than others).
    const scoutNoise = 4 + rng() * 6; // ±2 to ±5 rating swing per pick
    while (team.players.length < picksPerTeam) {
      let best = null;
      let bestScore = -Infinity;
      for (const p of pool) {
        if (claimed.has(p.id)) continue;
        const pos = p.position || 'F';
        if ((posCount[pos] || 0) >= POS_CAP) continue;
        const score = (p.rating || 70) + (rng() - 0.5) * scoutNoise;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (!best) {
        // All position caps full — relax the cap to fill final roster slots.
        for (const p of pool) {
          if (claimed.has(p.id)) continue;
          const score = (p.rating || 70) + (rng() - 0.5) * scoutNoise;
          if (score > bestScore) { bestScore = score; best = p; }
        }
      }
      if (!best) break;
      claimed.add(best.id);
      posCount[best.position || 'F'] = (posCount[best.position || 'F'] || 0) + 1;
      team.players.push({
        playerId: best.id,
        firstName: best.firstName,
        lastName: best.lastName,
        position: best.position,
        rating: best.rating,
        stats: best.stats,
        contract: assignContract(best, { isRookie: !!best.isRookie, rng }),
      });
    }
  }
  return cpuTeams;
}

// CPU front-office tick — runs after each user-played (or simulated) game.
// Lets a few CPU teams "work on their roster" so the league gets harder
// over the course of a season:
//   - 25% of CPU teams develop their lowest-rated bench player (+1-2 rating)
//   - 10% chance a CPU team makes an internal swap, promoting a bench guy
//     who had a small ratings bump (representing a hot streak)
//   - rare (5%) league-wide "new free agent signing" boost to a random
//     starter on a sub-.500 team to keep parity
// Caps individual ratings at 95.
function cpuFrontOfficeTick(user, rng = Math.random) {
  if (!user || !Array.isArray(user.cpuTeams) || !user.cpuTeams.length) return;
  const events = [];
  for (const team of user.cpuTeams) {
    if (!team.players || !team.players.length) continue;
    if (rng() < 0.25) {
      // Develop the lowest-rated player on the roster.
      const sorted = [...team.players].sort((a, b) => (a.rating || 0) - (b.rating || 0));
      const target = sorted[0];
      if (target && (target.rating || 0) < 95) {
        const bump = 1 + Math.floor(rng() * 2);
        target.rating = Math.min(95, (target.rating || 70) + bump);
        events.push(`${team.name}: ${target.firstName} ${target.lastName} +${bump} (development)`);
      }
    }
    if (rng() < 0.10) {
      // Hot streak — random non-starter gets a small bump.
      const bench = team.players.slice(5);
      if (bench.length) {
        const target = bench[Math.floor(rng() * bench.length)];
        if ((target.rating || 0) < 95) {
          target.rating = Math.min(95, (target.rating || 70) + 1);
          events.push(`${team.name}: ${target.firstName} ${target.lastName} +1 (hot streak)`);
        }
      }
    }
  }
  // Parity boost: pick one sub-.500 CPU team and bump a starter.
  if (rng() < 0.05 && Array.isArray(user.cpuRecords)) {
    const losers = user.cpuTeams.filter(t => {
      const rec = user.cpuRecords.find(r => r.name === t.name);
      return rec && (rec.wins + rec.losses > 0) && rec.wins < rec.losses;
    });
    if (losers.length) {
      const team = losers[Math.floor(rng() * losers.length)];
      const starters = (team.players || []).slice(0, 5);
      if (starters.length) {
        const target = starters[Math.floor(rng() * starters.length)];
        if ((target.rating || 0) < 95) {
          target.rating = Math.min(95, (target.rating || 70) + 2);
          events.push(`${team.name}: signed FA boost on ${target.firstName} ${target.lastName} +2`);
        }
      }
    }
  }
  if (events.length) user.markModified('cpuTeams');
  return events;
}

module.exports = {
  DIVISIONS,
  CITY_TIERS,
  ALL_CITIES,
  NBA_COACHES,
  TEAM_MASCOTS,
  STORE_ITEMS,
  TOKEN_BUNDLES,
  SUBSCRIPTION_PLANS,
  ACHIEVEMENTS,
  tierForCity,
  isValidConferenceDivision,
  generateCpuTeams,
  distributePlayersToCpuTeams,
  cpuFrontOfficeTick,
  applyLineup,
  shuffle,
  awardRewards,
  generateSchedule,
  quickSimRecord,
  teamAvgRating,
};

// Reorder a roster so the user's chosen starting 5 (players with
// inLineup === true) sit at index 0–4. simulateGame() takes the first 5
// as the active unit, so this is what makes the user's lineup actually
// affect game outcomes.
//
// If the user hasn't set 5 starters yet (or set fewer), we backfill from
// the highest-rated remaining players so the simulation always has 5.
function applyLineup(team) {
  if (!team || !Array.isArray(team.players) || team.players.length === 0) return team;
  // Sprint B2: injured players never enter the active 5. They keep their
  // roster slot but get pushed to the back so the simulation slice skips them.
  const isInjured = (p) => !!(p.injury && p.injury.isInjured) || p.injured;
  const healthy = team.players.filter(p => !isInjured(p));
  const injured = team.players.filter(isInjured);
  const starters = healthy.filter(p => p.inLineup);
  const bench = healthy.filter(p => !p.inLineup);
  // Backfill from bench (highest-rated first) until we have 5 starters.
  if (starters.length < 5) {
    bench.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    while (starters.length < 5 && bench.length) starters.push(bench.shift());
  }
  return { ...team, players: [...starters.slice(0, 5), ...bench, ...injured] };
}

// Average roster rating — used as the strength signal for the lightweight
// CPU-vs-CPU sim that fills out the standings as the user progresses.
function teamAvgRating(team) {
  const players = team?.players || [];
  if (!players.length) return 70;
  // Starters drive performance: 70% weight on the active 5, 30% on bench.
  // We pick starters from `inLineup` flags when set (the user's chosen
  // lineup), otherwise fall back to the top 5 by rating. This makes the
  // user's Lineup tab choice actually affect quickSim outcomes too \u2014 not
  // just full-simulation games.
  const flagged = players.filter(p => p.inLineup);
  let starters, bench;
  if (flagged.length >= 1) {
    // Backfill from highest-rated bench until we have 5 starters.
    const rest = players.filter(p => !p.inLineup).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    starters = [...flagged];
    while (starters.length < 5 && rest.length) starters.push(rest.shift());
    bench = rest;
  } else {
    const sorted = [...players].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    starters = sorted.slice(0, 5);
    bench = sorted.slice(5);
  }
  const avg = (arr) => arr.length ? arr.reduce((s, p) => s + (p.rating || 70), 0) / arr.length : 70;
  const startAvg = avg(starters);
  const benchAvg = bench.length ? avg(bench) : startAvg;
  return startAvg * 0.7 + benchAvg * 0.3;
}

// Generate an 82-game schedule following NBA scheduling logic:
//   • Same division (4 teams)        — 4 games each = 16
//   • Same conference, other div (10) — ~3.6 each = 36 (8 of them get 4, rest 3)
//   • Other conference (15)            — 2 games each = 30
// Total: 16 + 36 + 30 = 82.
//
// `userTeam` { conference, division } is required to apply the conference
// weighting; if omitted we fall back to the legacy round-robin so existing
// tests keep passing.
//
// Each game also gets a `gameDate` (an NBA-style late-October to mid-April
// window) and an `isHome` flag (alternates per opponent for fairness).
function generateSchedule({ cpuTeams, userTeam, games = 82, rng = Math.random, startDate } = {}) {
  if (!Array.isArray(cpuTeams) || cpuTeams.length === 0) return [];

  // ---- Build a weighted opponent pool that respects NBA logic. ----
  let pool = [];
  if (userTeam?.conference && userTeam?.division) {
    const sameDiv = cpuTeams.filter(t => t.conference === userTeam.conference && t.division === userTeam.division);
    const sameConf = cpuTeams.filter(t => t.conference === userTeam.conference && t.division !== userTeam.division);
    const otherConf = cpuTeams.filter(t => t.conference !== userTeam.conference);
    // Same division → 4 games each.
    for (const t of sameDiv) for (let i = 0; i < 4; i++) pool.push(t.name);
    // Other conference → 2 games each.
    for (const t of otherConf) for (let i = 0; i < 2; i++) pool.push(t.name);
    // Same conference / other div → distribute remaining games.
    // Each gets 3 base + a few teams get +1 to reach 82 total.
    const baseSameConf = 3;
    let used = pool.length + sameConf.length * baseSameConf;
    let bonus = games - used; // teams that get +1 game (3 → 4)
    const shuffledConf = shuffle(sameConf.slice(), rng);
    for (let i = 0; i < shuffledConf.length; i++) {
      const reps = baseSameConf + (i < bonus ? 1 : 0);
      for (let k = 0; k < reps; k++) pool.push(shuffledConf[i].name);
    }
    // Trim or top-up if rounding left us off.
    while (pool.length > games) pool.pop();
    while (pool.length < games) pool.push(cpuTeams[Math.floor(rng() * cpuTeams.length)].name);
  } else {
    // Legacy fallback: round-robin without conference weighting.
    const opps = shuffle(cpuTeams.map(t => t.name), rng);
    for (let i = 0; i < games; i++) pool.push(opps[i % opps.length]);
  }

  // ---- Spread the matchups out so the same opponent doesn't repeat
  // back-to-back. We randomize within buckets of teams that share rep counts.
  const ordered = shuffle(pool, rng);
  // Single pass anti-clump: if two adjacent are equal, swap one forward.
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] === ordered[i - 1]) {
      for (let j = i + 1; j < ordered.length; j++) {
        if (ordered[j] !== ordered[i - 1]) {
          [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
          break;
        }
      }
    }
  }

  // ---- Generate dates: ~5 months, 4 games per week on average. ----
  // NBA regular season runs late Oct to mid-April. We assume 170 days for 82 games.
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 9, 24); // Oct 24
  const REGULAR_SEASON_DAYS = 170;
  const gameDayGap = REGULAR_SEASON_DAYS / games; // ~2.07 days/game

  // ---- Per-opponent home/away alternation for fairness. ----
  const homeFlip = {};
  const schedule = [];
  for (let i = 0; i < ordered.length; i++) {
    const opponent = ordered[i];
    const date = new Date(start);
    date.setDate(start.getDate() + Math.round(i * gameDayGap));
    homeFlip[opponent] = !homeFlip[opponent];
    schedule.push({
      gameNumber: i + 1,
      opponent,
      gameDate: date.toISOString().slice(0, 10),
      isHome: homeFlip[opponent],
      played: false,
      win: false,
      scoreUser: 0,
      scoreOpp: 0,
    });
  }
  return schedule;
}

// Lightweight CPU-vs-CPU result based on average roster ratings, with noise.
// Returns { winner: 'A'|'B', scoreA, scoreB }.
// Tuned: rating advantage matters more (1.6x weight, was 1.2x) and noise is
// tighter (±6, was ±8) so good rosters consistently beat weaker ones.
// Coach playbook rating adds a bonus on top so CPU teams with elite coaches
// punch above their roster (legacy difficulty).
//
// `opts.difficulty` + `opts.userSide` ('A'|'B') tilt the score in the CPU's
// favour at higher difficulty (and the user's favour on easy). When the
// user side isn't passed (CPU vs CPU) the modifier is symmetric and a no-op.
function quickSimRecord(teamA, teamB, rng = Math.random, opts = {}) {
  const a = teamAvgRating(teamA);
  const b = teamAvgRating(teamB);
  // Default user (or any team without coachRating) sits at 7.
  const coachA = (teamA?.coachRating ?? 7);
  const coachB = (teamB?.coachRating ?? 7);
  const mods = getDifficultyMods(opts.difficulty);
  let bonusA = 0, bonusB = 0;
  if (opts.userSide === 'A') { bonusA = mods.userScoreBonus; bonusB = mods.cpuScoreBonus; }
  else if (opts.userSide === 'B') { bonusA = mods.cpuScoreBonus; bonusB = mods.userScoreBonus; }
  const noise = () => (rng() - 0.5) * 12;
  const scoreA = Math.max(70, Math.round(85 + (a - 75) * 1.6 + (coachA - 7) * 1.8 + bonusA + noise()));
  const scoreB = Math.max(70, Math.round(85 + (b - 75) * 1.6 + (coachB - 7) * 1.8 + bonusB + noise()));
  // Tie-break with a coin flip.
  if (scoreA === scoreB) return rng() < 0.5
    ? { winner: 'A', scoreA: scoreA + 1, scoreB }
    : { winner: 'B', scoreA, scoreB: scoreB + 1 };
  return { winner: scoreA > scoreB ? 'A' : 'B', scoreA, scoreB };
}
