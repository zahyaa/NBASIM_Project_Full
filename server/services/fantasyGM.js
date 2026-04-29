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
        teams.push({
          name,
          city,
          coach,
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
// Each team picks INDEPENDENTLY from the full pool — duplicates across
// teams are intentional (the differentiator is items bought at the Store).
// Only per-team uniqueness is enforced so a single CPU never doubles up
// on the same player.
function distributePlayersToCpuTeams({ cpuTeams, pool, picksPerTeam = 15, rng = Math.random }) {
  for (const team of cpuTeams) {
    const owned = new Set();
    const available = shuffle(pool.slice(), rng);
    team.players = [];
    while (team.players.length < picksPerTeam && available.length) {
      const p = available.shift();
      if (owned.has(p.id)) continue;
      owned.add(p.id);
      team.players.push({
        playerId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        rating: p.rating,
        stats: p.stats,
        contract: { years: 1 + Math.floor(rng() * 4), salary: Math.round((p.rating || 70) * 0.5) },
      });
    }
  }
  return cpuTeams;
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
  shuffle,
  awardRewards,
  generateSchedule,
  quickSimRecord,
  teamAvgRating,
};

// Average roster rating — used as the strength signal for the lightweight
// CPU-vs-CPU sim that fills out the standings as the user progresses.
function teamAvgRating(team) {
  const players = team?.players || [];
  if (!players.length) return 70;
  return players.reduce((s, p) => s + (p.rating || 70), 0) / players.length;
}

// Generate an 82-game schedule for the user against their CPU rivals.
// Cycles through CPUs in a random order so each opponent shows up roughly
// the same number of times (matching the real NBA's 82-game cadence).
function generateSchedule({ cpuTeams, games = 82, rng = Math.random }) {
  const opponents = shuffle(cpuTeams.map(t => t.name), rng);
  if (opponents.length === 0) return [];
  const schedule = [];
  for (let i = 0; i < games; i++) {
    schedule.push({
      gameNumber: i + 1,
      opponent: opponents[i % opponents.length],
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
function quickSimRecord(teamA, teamB, rng = Math.random) {
  const a = teamAvgRating(teamA);
  const b = teamAvgRating(teamB);
  const noise = () => (rng() - 0.5) * 16;
  const scoreA = Math.max(70, Math.round(85 + (a - 75) * 1.2 + noise()));
  const scoreB = Math.max(70, Math.round(85 + (b - 75) * 1.2 + noise()));
  // Tie-break with a coin flip.
  if (scoreA === scoreB) return rng() < 0.5
    ? { winner: 'A', scoreA: scoreA + 1, scoreB }
    : { winner: 'B', scoreA, scoreB: scoreB + 1 };
  return { winner: scoreA > scoreB ? 'A' : 'B', scoreA, scoreB };
}
