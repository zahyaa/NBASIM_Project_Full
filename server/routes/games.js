const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const auth = require('../middleware/auth');

// GET /api/games — list the current user's games
router.get('/', auth, async (req, res) => {
  try {
    const games = await Game.find({ userId: req.userId })
      .select('teamA teamB scoreA scoreB timestamp')
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/:id — full game including replay history (Sprint I).
router.get('/:id', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, userId: req.userId });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
