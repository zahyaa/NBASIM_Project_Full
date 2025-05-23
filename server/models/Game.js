const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  teamA: String,
  teamB: String,
  scoreA: Number,
  scoreB: Number,
  history: [Object],
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', gameSchema);
