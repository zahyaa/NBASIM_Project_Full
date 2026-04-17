const express = require('express');
const router = express.Router();
const Game = require('../models/Game');

router.post('/save', async (req, res) => {
  try {
    const { teamA, teamB, scoreA, scoreB, history } = req.body;
    const game = new Game({ teamA, teamB, scoreA, scoreB, history });
    await game.save();
    res.status(201).json({ message: 'Game saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const games = await Game.find().sort({ timestamp: -1 });
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
