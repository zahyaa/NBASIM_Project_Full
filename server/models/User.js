const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  password: { type: String, required: true, minlength: 6 },
  // The user's drafted team
  team: {
    name: { type: String, default: '' },
    players: [
      {
        playerId: Number,
        firstName: String,
        lastName: String,
        position: String,
        rating: Number,
        stats: Object,
      },
    ],
  },
  // Conference & league selection
  conference: { type: String, default: '' },  // 'East' or 'West'
  league: { type: String, default: '' },      // e.g. 'NBA', 'G-League', 'Euro'
  // Draft state
  draftCompleted: { type: Boolean, default: false },
  // Season / save state
  season: { type: Number, default: 2025 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  gamesPlayed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
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
