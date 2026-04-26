const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const playerSlotSchema = new mongoose.Schema({
  playerId: Number,
  firstName: String,
  lastName: String,
  position: String,
  rating: Number,
  stats: Object,
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
    players: [playerSlotSchema],
  },

  // Conference & league selection
  conference: { type: String, default: '' },  // 'East' or 'West'
  league: { type: String, default: '' },      // e.g. 'NBA', 'G-League', 'Euro'

  // Draft state
  draftCompleted: { type: Boolean, default: false },
  draftType: { type: String, default: '' }, // 'fantasy' or 'season'

  // Season / save state
  season: { type: Number, default: 2025 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  gamesPlayed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],

  // Settings
  difficulty: { type: String, default: 'pro', enum: ['easy', 'hard', 'pro', 'allstar', 'legacy'] },

  // Favorited NBA players from the Players Bio page
  favoritePlayers: { type: [favoritePlayerSchema], default: [] },

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
