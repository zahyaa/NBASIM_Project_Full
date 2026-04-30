const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const playerSlotSchema = new mongoose.Schema({
  playerId: Number,
  firstName: String,
  lastName: String,
  position: String,
  rating: Number,
  stats: Object,
  // Sprint B1 — age + potential drive offseason progression. Backfilled
  // automatically by services/progression.js#ensureB1Fields when missing.
  age: { type: Number, default: 0 },
  potential: { type: Number, default: 0 },
  workEthic: { type: Number, default: 0 },
  // Sprint B3 — gameplay attributes. Lazily backfilled by
  // services/attributes.js#ensureB3Fields when missing so old saves work.
  clutch: { type: Number, default: 0 },     // late-game shot bump
  iq: { type: Number, default: 0 },         // assists / turnover discipline
  leadership: { type: Number, default: 0 }, // team chemistry modifier
  // Sprint B2 — injury system. `injured` + `injuryDaysRemaining` are
  // legacy mirrors kept in sync by services/injuries.js so old code paths
  // (Store heal item, team/injuries view) keep working.
  durability: { type: Number, default: 0 },
  gamesSinceReturn: { type: Number, default: 99 }, // 99 = no recent return
  injury: {
    isInjured: { type: Boolean, default: false },
    injuryType: { type: String, default: null },
    gamesRemaining: { type: Number, default: 0 },
    severity: { type: String, default: null }, // minor | moderate | major | season-ending
  },
  // Team Management additions
  inLineup: { type: Boolean, default: false }, // starter flag
  injured: { type: Boolean, default: false },
  injuryDaysRemaining: { type: Number, default: 0 },
  // Sprint A1: full contract object. `years` retained for legacy reads;
  // `yearsRemaining` is the authoritative count and decrements at season
  // rollover. Salary is in millions.
  contract: {
    salary: { type: Number, default: 0 },
    yearsRemaining: { type: Number, default: 0 },
    years: { type: Number, default: 0 },                 // legacy mirror
    contractType: { type: String, default: 'minimum' }, // rookie | minimum | standard | max
    teamOption: { type: Boolean, default: false },
    playerOption: { type: Boolean, default: false },
    noTradeClause: { type: Boolean, default: false },
    signedAt: { type: Date, default: Date.now },
  },
  // Cumulative boosts applied via Store items
  boost: {
    offense: { type: Number, default: 0 },
    defense: { type: Number, default: 0 },
    athleticism: { type: Number, default: 0 },
  },
}, { _id: false });

// Sprint A4 — draft pick asset. Owned by either user.team or a cpuTeam.
// `originalTeam` records who the pick originally belonged to so we can
// label conveyed picks ("via Lakers"). `protected` is informational.
const draftPickSchema = new mongoose.Schema({
  pickId: { type: String, required: true },     // e.g. "2026-R1-LAL"
  year: { type: Number, required: true },       // calendar year of draft
  round: { type: Number, required: true },      // 1 or 2
  originalTeam: { type: String, default: '' },  // team city/name that owned it first
  protectedTop: { type: Number, default: 0 },   // 0 = unprotected, 5 = top-5 protected, etc.
  estimatedValue: { type: Number, default: 0 }, // 0..100 — used by CPU acceptance scoring
}, { _id: false });

// Sprint C3 — coach subdocument shared by user.team and cpuTeam.
const coachInfoSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  offenseRating: { type: Number, default: 70 },
  defenseRating: { type: Number, default: 70 },
  developmentRating: { type: Number, default: 70 },
  style: { type: String, default: 'balanced' }, // offensive | defensive | balanced | developmental
  salary: { type: Number, default: 4 },         // $M / year
  yearsRemaining: { type: Number, default: 1 },
  age: { type: Number, default: 50 },
  preferredPace: { type: String, default: '' }, // optional override
}, { _id: false });

// CPU-controlled team generated when the user starts a fantasy draft.
const cpuTeamSchema = new mongoose.Schema({
  name: String,
  city: String,
  coach: String,
  // Coach playbook rating 7–10. Higher = the CPU runs sharper sets and
  // forces tougher matchups in simulation. Legacy difficulty enforced.
  coachRating: { type: Number, default: 8 },
  conference: String,           // 'East' or 'West'
  division: String,             // 'Atlantic', 'Central', etc.
  marketTier: String,           // 'I', 'II', 'III'
  players: [playerSlotSchema],
  // Sprint A4 — picks owned + team strategic direction. `direction`
  // drives CPU trade acceptance scoring (rebuild values youth+picks,
  // contender values veteran wins now).
  ownedPicks: { type: [draftPickSchema], default: [] },
  direction: { type: String, default: 'middling' }, // contender | middling | rebuild | tank
  // Sprint C3 — full coach subdoc.
  coachInfo: { type: coachInfoSchema, default: () => ({}) },
}, { _id: false });

// Store inventory entry (an item the user has purchased and applied).
const inventoryEntrySchema = new mongoose.Schema({
  itemId: String,
  name: String,
  appliedToPlayerId: Number,    // optional — null until applied
  purchasedAt: { type: Date, default: Date.now },
}, { _id: false });

// Favorited NBA player (Players Bio "star" feature). Stored as a snapshot
// so the favorites list still renders names/ratings even if the upstream
// NBA API is briefly unreachable. Refreshed when the user opens the bio.
const favoritePlayerSchema = new mongoose.Schema({
  playerId: { type: Number, required: true },
  firstName: String,
  lastName: String,
  position: String,
  team: String,
  teamLogo: String,
  rating: Number,
  addedAt: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  password: { type: String, required: true, minlength: 6 },

  // Active game mode: 'fantasy', 'season', '1v1', 'blacktop'
  gameMode: { type: String, default: '' },

  // The user's drafted team (fantasy & season modes)
  team: {
    name: { type: String, default: '' },
    city: { type: String, default: '' },
    coach: { type: String, default: '' },
    logo: { type: String, default: '' }, // base64 or URL of custom logo
    marketTier: { type: String, default: '' }, // 'I' | 'II' | 'III'
    division: { type: String, default: '' },   // Atlantic, Central, etc.
    players: [playerSlotSchema],
    // Sprint C3 — full coach subdoc. `coach` (string) is kept for legacy
    // reads; coachInfo.name is authoritative once backfilled.
    coachInfo: { type: coachInfoSchema, default: () => ({}) },
  },

  // Conference & league selection
  conference: { type: String, default: '' },  // 'East' or 'West'
  league: { type: String, default: '' },      // e.g. 'NBA', 'G-League', 'Euro'

  // Draft state
  draftStarted: { type: Boolean, default: false },   // unlocks Store + Team Mgmt
  draftCompleted: { type: Boolean, default: false },
  draftType: { type: String, default: '' }, // 'fantasy' or 'season'
  // Pre-draft lottery slot (1..30). 0 means "not yet rolled". Determines the
  // user's slot in the snake-draft order returned by /api/draft/order.
  lotteryPosition: { type: Number, default: 0 },

  // Fantasy GM state
  tokens: { type: Number, default: 0 },              // store currency
  inventory: { type: [inventoryEntrySchema], default: [] },
  cpuTeams: { type: [cpuTeamSchema], default: [] },

  // Season / save state
  season: { type: Number, default: 2025 },
  // 5-year career arc (1..5). Resets after year 5 if user advances again.
  seasonNumber: { type: Number, default: 1 },
  // Cumulative across the career.
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  // Wins counted against the 120-tokens-per-10-wins reward (so each win is
  // only paid once even if the user keeps refreshing the API).
  winsAwarded: { type: Number, default: 0 },
  // Current-season record + 82-game schedule. Each entry references one of
  // user.cpuTeams by name and stores the result once played.
  seasonWins: { type: Number, default: 0 },
  seasonLosses: { type: Number, default: 0 },
  schedule: {
    type: [{
      gameNumber: Number,
      opponent: String,         // name of cpuTeam
      gameDate: String,         // ISO date string (YYYY-MM-DD)
      isHome: { type: Boolean, default: true },
      played: { type: Boolean, default: false },
      win: { type: Boolean, default: false },
      scoreUser: { type: Number, default: 0 },
      scoreOpp: { type: Number, default: 0 },
    }],
    default: [],
  },
  // CPU-vs-CPU standings — wins/losses tracked per cpuTeam.name as the
  // season progresses. Stored as an array (not a Map) because Mongoose Map
  // keys cannot contain ".", which breaks for cities like "St. Louis".
  cpuRecords: {
    type: [{
      _id: false,
      name: String,
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
    }],
    default: [],
  },
  // Past season summaries (one per completed season).
  career: {
    type: [{
      seasonNumber: Number,
      wins: Number,
      losses: Number,
      champion: Boolean,
      year: Number,
      playoffResult: String, // 'champion', 'finalist', 'conf-finals', 'semis', 'first-round', 'missed', ''
    }],
    default: [],
  },

  // -------------------------- Playoffs --------------------------
  // Bracket built once the regular season is complete. 16 teams (top 8 East
  // + top 8 West), 1v8/2v7/3v6/4v5 in each conference, 7-game series, then
  // the conf champs meet in the Finals.
  playoffs: {
    started: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    seasonNumber: { type: Number, default: 0 },
    // bracket.rounds = [
    //   { name: 'First Round', series: [{ teamA, teamB, winsA, winsB, winner, conference, results: [{scoreA,scoreB,winner}] }, ...] },
    //   { name: 'Conference Semifinals', series: [...] },
    //   { name: 'Conference Finals',     series: [...] },
    //   { name: 'NBA Finals',            series: [...] },
    // ]
    rounds: { type: Array, default: [] },
    champion: { type: String, default: '' },
    runnerUp: { type: String, default: '' },
  },

  // Sprint E2 — Play-In Tournament results (seeds 7-10 per conference).
  // Populated by /api/playoffs/play-in before /start. Cleared each season.
  playInResults: { type: Object, default: null },

  // Sprint E2 — weekly power rankings snapshot history.
  powerRankingsHistory: {
    type: [{
      _id: false,
      seasonNumber: Number,
      week: Number,
      generatedAt: { type: Date, default: Date.now },
      rankings: { type: Array, default: [] },
    }],
    default: [],
  },

  // -------------------------- AI News Feed --------------------------
  // Generated headlines: game recaps, trade rumors, achievement spotlights,
  // All-Star news, etc. Newest first.
  news: {
    type: [{
      _id: false,
      id: String,
      kind: String,            // 'game' | 'trade' | 'achievement' | 'allstar' | 'system'
      headline: String,
      body: String,
      seasonNumber: Number,
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  },
  // Last time we auto-generated trade-deadline rumors so we don't spam
  // the news feed every page refresh.
  lastTradeRumorSeason: { type: Number, default: 0 },

  // -------------------------- All-Star Event --------------------------
  // 2000s-style All-Star weekend: voting (perf + popularity), Saturday
  // skills/3pt/dunk contests, Sunday East-vs-West game.
  allStar: {
    seasonNumber: { type: Number, default: 0 },
    voted: { type: Boolean, default: false },
    eastRoster:  { type: [{ _id: false, playerId: Number, firstName: String, lastName: String, position: String, rating: Number, votes: Number }], default: [] },
    westRoster:  { type: [{ _id: false, playerId: Number, firstName: String, lastName: String, position: String, rating: Number, votes: Number }], default: [] },
    threePointWinner: { type: String, default: '' },
    dunkWinner: { type: String, default: '' },
    skillsWinner: { type: String, default: '' },
    gameMVP: { type: String, default: '' },
    eastScore: { type: Number, default: 0 },
    westScore: { type: Number, default: 0 },
  },

  // -------------------------- Subscription --------------------------
  // Premium subscription unlocks weekly token bonuses + exclusive store items.
  subscription: {
    tier: { type: String, default: 'free', enum: ['free', 'premium', 'gm-elite'] },
    paidUntil: { type: Date, default: null },     // null = no active sub
    method: { type: String, default: '' },        // 'paypal' | 'credit-card' | ''
    lastWeeklyBonusAt: { type: Date, default: null },
  },
  // Audit log of token / subscription purchases (never includes card data;
  // all card numbers are dropped before storage).
  payments: {
    type: [{
      _id: false,
      kind: String,            // 'tokens' | 'subscription'
      bundleId: String,        // bundle/plan identifier
      amountUSD: Number,
      tokensAwarded: { type: Number, default: 0 },
      method: String,          // 'paypal' | 'stripe' | 'credit-card'
      paypalOrderId: String,
      paypalCaptureId: String,
      stripePaymentIntentId: String,
      cardLast4: String,       // last 4 only — NEVER full PAN
      refunded: { type: Boolean, default: false },
      refundedAt: Date,
      refundId: String,
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  },

  // Achievement IDs the user has unlocked + the season they earned each in.
  achievements: {
    type: [{
      id: String,
      unlockedAt: { type: Date, default: Date.now },
      seasonNumber: Number,
      tokensAwarded: Number,
    }],
    default: [],
  },
  gamesPlayed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],

  // Settings
  difficulty: { type: String, default: 'pro', enum: ['easy', 'hard', 'pro', 'allstar', 'legacy'] },

  // Favorited NBA players from the Players Bio page
  favoritePlayers: { type: [favoritePlayerSchema], default: [] },

  // Rookie class generated when the previous season + playoffs end. Added to
  // the next year's draft pool so the user can draft incoming prospects.
  // Cleared once the user's next draft completes.
  rookieClass: {
    type: [{
      _id: false,
      playerId: { type: Number },          // synthetic id, >= 20_000_000
      firstName: String,
      lastName: String,
      position: String,
      school: String,
      country: String,
      heightIn: Number,                    // total inches (e.g. 79 = 6'7")
      weightLb: Number,
      rating: Number,                      // 60-85 range
      draftYear: Number,
    }],
    default: [],
  },
  rookieClassYear: { type: Number, default: 0 },

  // Multiplayer presence — updated by /api/auth/me (every poll). A user
  // is considered "online" if lastSeenAt is within the last 2 minutes.
  lastSeenAt: { type: Date, default: null },

  // User-authored playbook plays (designed in /playbook page).
  // Saved here so they show up in Team Management → Playbook tab too.
  customPlays: {
    type: [{
      _id: false,
      id: String,
      name: { type: String, default: '' },
      type: { type: String, default: 'Set' },     // Set | ATO | Iso | PnR | Inbound | Transition
      formation: { type: String, default: '1-4 High' },
      primary: { type: String, default: '' },     // playerId of primary scorer
      secondary: { type: String, default: '' },   // playerId of secondary
      screener: { type: String, default: '' },    // playerId of screener
      description: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  },

  // User-authored DEFENSIVE plays (designed in /defensive-playbook page).
  // Standard NBA defensive sets — Man-to-Man, 2-3 Zone, 1-3-1, Press, etc.
  defensivePlays: {
    type: [{
      _id: false,
      id: String,
      name: { type: String, default: '' },
      scheme: { type: String, default: 'Man' },   // Man | 2-3 Zone | 3-2 Zone | 1-3-1 | Box-and-1 | Triangle-and-2 | Full-Court Press | Half-Court Trap | Switch-Everything
      pressure: { type: String, default: 'Half-Court' }, // Half-Court | Three-Quarter | Full-Court
      stopper: { type: String, default: '' },     // playerId of primary on-ball defender
      helper: { type: String, default: '' },      // playerId of help defender
      rebounder: { type: String, default: '' },   // playerId who crashes the glass
      description: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  },

  // -------------------------- Front Office (Sprint A1) --------------------------
  // Salary cap / payroll / luxury tax for the user's franchise. Refreshed
  // via refreshUserFinance() any time the roster changes.
  finance: {
    salaryCap: { type: Number, default: 140 },
    luxuryTaxLine: { type: Number, default: 170 },
    payroll: { type: Number, default: 0 },
    capSpace: { type: Number, default: 140 },
    taxAmount: { type: Number, default: 0 },
    midLevelExceptionAvailable: { type: Boolean, default: true },
  },

  // -------------------------- Free Agency (Sprint A2) --------------------------
  // League-wide free-agent pool. Populated at offseason rollover from
  // expiring contracts; users sign from here via /api/frontoffice/sign.
  freeAgents: {
    type: [{
      _id: false,
      playerId: { type: Number },
      firstName: String,
      lastName: String,
      position: String,
      rating: Number,
      stats: Object,
      previousTeam: String,
      askingSalary: Number,    // millions
      askingYears: Number,
      expiredAt: { type: Date, default: Date.now },
    }],
    default: [],
  },

  // Sprint A3 — pending offers per free agent. Each entry tracks all
  // bids on one player (user + 0-3 CPU). Resolved by /resolve route.
  freeAgentOffers: {
    type: [{
      _id: false,
      playerId: Number,
      offers: [{
        _id: false,
        teamName: String,
        teamCity: String,
        salary: Number,
        years: Number,
        isUser: Boolean,
        usesMLE: { type: Boolean, default: false },
        teamWinsLastSeason: { type: Number, default: 30 },
        marketTier: { type: String, default: 'III' },
      }],
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  },

  // Sprint B1 — most recent offseason development report. Stored so the
  // UI can show last season's progressions/regressions until the next
  // rollover overwrites it.
  lastDevelopmentReport: {
    type: {
      seasonNumber: Number,
      generatedAt: { type: Date, default: Date.now },
      breakouts: { type: Array, default: [] },
      busts: { type: Array, default: [] },
      biggestRisers: { type: Array, default: [] },
      biggestFallers: { type: Array, default: [] },
      userReport: { type: Array, default: [] },
      totalPlayers: Number,
    },
    default: null,
  },

  // -------------------------- Trades (Sprint A4) --------------------------
  // Draft picks owned by the user's franchise. Backfilled by
  // services/trades.js#ensureA4Fields when missing.
  ownedPicks: { type: [draftPickSchema], default: [] },
  // Completed trades log (newest last). Each entry stores both sides.
  tradeHistory: {
    type: [{
      _id: false,
      tradeId: String,
      executedAt: { type: Date, default: Date.now },
      partnerTeam: String,                              // CPU team name
      sentPlayers: { type: Array, default: [] },        // [{playerId, firstName, lastName, salary}]
      sentPicks:   { type: Array, default: [] },        // [{pickId,year,round}]
      receivedPlayers: { type: Array, default: [] },
      receivedPicks:   { type: Array, default: [] },
      initiatedBy: { type: String, default: 'user' },   // 'user' | 'cpu'
    }],
    default: [],
  },
  // CPU-initiated trade proposals waiting on the user. Created by the
  // periodic cpuFrontOfficeTick. User accepts/rejects via /trade/respond.
  cpuTradeProposals: {
    type: [{
      _id: false,
      proposalId: String,
      createdAt: { type: Date, default: Date.now },
      partnerTeam: String,
      // From the user's perspective:
      sendPlayerIds: { type: [Number], default: [] },
      sendPickIds:   { type: [String], default: [] },
      receivePlayers: { type: Array, default: [] },     // snapshot of CPU players
      receivePicks:   { type: Array, default: [] },
      message: { type: String, default: '' },
    }],
    default: [],
  },

  // -------------------------- Coaching (Sprint C3) --------------------------
  // User-controlled rotation/pace/defensive-assignments. Backfilled by
  // services/coaching.js#ensureC3Fields the first time it's read.
  coaching: {
    rotation: {
      type: [{ _id: false, playerId: Number, targetMinutes: Number }],
      default: [],
    },
    pace: { type: String, default: 'medium' }, // slow | medium | fast
    defensiveAssignments: {
      type: [{ _id: false, defenderId: Number, opponentScorerId: Number }],
      default: [],
    },
  },
  // Coach-of-the-Year winners across seasons.
  coachOfTheYearHistory: {
    type: [{
      _id: false,
      season: Number,
      coachName: String,
      teamName: String,
      wins: Number,
      expectedWins: Number,
      delta: Number,
    }],
    default: [],
  },

  // -------------------------- Awards & Records (Sprint D) --------------------------
  // Most recently computed season awards (MVP / DPOY / ROY / 6MOY / MIP /
  // All-NBA / All-Defensive / All-Rookie + league leaders + per-player
  // synthetic stat lines). Stored loosely so the awards service can evolve
  // without schema migrations.
  seasonAwards: { type: Object, default: null },

  // Awards from every completed season. Each entry mirrors `seasonAwards`
  // and is appended in /api/season/advance.
  careerAwards: { type: [Object], default: [] },

  // Hall of Fame inductees (computed lazily by /api/records/hall-of-fame).
  // Cached here so the page doesn't recompute every request.
  hallOfFame: { type: [Object], default: [] },

  createdAt: { type: Date, default: Date.now },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Don't return password in JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
