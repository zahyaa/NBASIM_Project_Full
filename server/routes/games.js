const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const auth = require('../middleware/auth');

// GET /api/games — list the current user's games
router.get('/', auth, async (req, res) => {
  try {
    const games = await Game.find({ userId: req.userId }).sort({ timestamp: -1 }).limit(100);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
