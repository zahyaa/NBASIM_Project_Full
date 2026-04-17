const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const { simulateGame } = require('../services/simulation');
const router = express.Router();

// POST /api/simulate — run a game between user's team and a computer opponent
router.post('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftCompleted) {
      return res.status(400).json({ error: 'Complete your draft first' });
    }
    if (user.team.players.length < 5) {
      return res.status(400).json({ error: 'Need at least 5 players' });
    }

    const { opponentName, opponentPlayers } = req.body;
    if (!opponentName || !opponentPlayers || opponentPlayers.length < 5) {
      return res.status(400).json({ error: 'Opponent team data required (name + at least 5 players)' });
    }

    const teamA = {
      name: user.team.name || `${user.username}'s Team`,
      players: user.team.players,
    };
    const teamB = {
      name: opponentName,
      players: opponentPlayers,
    };

    const result = simulateGame(teamA, teamB);

    // Save game
    const game = new Game({
      teamA: result.teamA,
      teamB: result.teamB,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      history: result.plays,
    });
    await game.save();

    // Update user record
    user.gamesPlayed.push(game._id);
    if (result.winner === teamA.name) {
      user.wins += 1;
    } else {
      user.losses += 1;
    }
    await user.save();

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
