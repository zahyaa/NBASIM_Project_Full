const express = require('express');
const router = express.Router();
const Game = require('../models/Game');

router.post('/save', async (req, res) => {
  try {
    const game = new Game(req.body);
    await game.save();
    res.status(201).json({ message: 'Game saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const games = await Game.find().sort({ timestamp: -1 });
  res.json(games);
});

module.exports = router;
