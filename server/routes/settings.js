const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

const VALID_DIFFICULTIES = ['easy', 'hard', 'pro', 'allstar', 'legacy'];

// GET /api/settings — current user settings
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      difficulty: user.difficulty,
      season: user.season,
      gameMode: user.gameMode,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings — update settings
router.patch('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { difficulty, season } = req.body;
    if (difficulty) {
      if (!VALID_DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({ error: `Invalid difficulty. Must be: ${VALID_DIFFICULTIES.join(', ')}` });
      }
      user.difficulty = difficulty;
    }
    if (season) user.season = Number(season);

    await user.save();
    res.json({ message: 'Settings updated', difficulty: user.difficulty, season: user.season });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/reset — reset draft and start over
router.post('/reset', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.team.players = [];
    user.team.name = '';
    user.team.city = '';
    user.team.coach = '';
    user.conference = '';
    user.league = '';
    user.draftCompleted = false;
    user.draftType = '';
    user.gameMode = '';
    user.wins = 0;
    user.losses = 0;
    user.gamesPlayed = [];
    await user.save();
    res.json({ message: 'Game reset' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/account — delete user account
router.delete('/account', auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.userId);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
