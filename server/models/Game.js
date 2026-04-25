const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teamA: String,
  teamB: String,
  scoreA: Number,
  scoreB: Number,
  history: [Object],
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', gameSchema);
