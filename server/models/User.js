const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const playerSlotSchema = new mongoose.Schema({
  playerId: Number,
  firstName: String,
  lastName: String,
  position: String,
  rating: Number,
  stats: Object,
  // Team Management additions
  inLineup: { type: Boolean, default: false }, // starter flag
  injured: { type: Boolean, default: false },
  injuryDaysRemaining: { type: Number, default: 0 },
  contract: {
    years: { type: Number, default: 0 },
    salary: { type: Number, default: 0 }, // in millions
  },
  // Cumulative boosts applied via Store items
  boost: {
    offense: { type: Number, default: 0 },
    defense: { type: Number, default: 0 },
    athleticism: { type: Number, default: 0 },
  },
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
      method: String,          // 'paypal' | 'credit-card'
      paypalOrderId: String,
      cardLast4: String,       // last 4 only — NEVER full PAN
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
