const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    // Username: 3-20 chars, alphanumeric + underscore + hyphen only.
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters and contain only letters, numbers, underscore, or hyphen' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const user = new User({ username, password });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user (protected)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Heartbeat — mark this user as online for the multiplayer lobby.
    user.lastSeenAt = new Date();
    user.save().catch(() => {});
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/favorites — list the user's favorited NBA players
router.get('/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('favoritePlayers');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ favorites: user.favoritePlayers || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/favorites — add or update a favorite. Body: { player: {...} }
router.post('/favorites', auth, async (req, res) => {
  try {
    const p = req.body.player || {};
    const playerId = Number(p.playerId ?? p.id);
    if (!playerId) return res.status(400).json({ error: 'player.playerId is required' });

    const entry = {
      playerId,
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      position: p.position || '',
      team: p.team || '',
      teamLogo: p.teamLogo || '',
      rating: typeof p.rating === 'number' ? p.rating : null,
      addedAt: new Date(),
    };

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Cap favorites at 50 to prevent unbounded growth.
    const existing = user.favoritePlayers || [];
    const idx = existing.findIndex(f => f.playerId === playerId);
    if (idx >= 0) {
      existing[idx] = entry; // refresh snapshot
    } else {
      if (existing.length >= 50) {
        return res.status(400).json({ error: 'Favorites limit (50) reached' });
      }
      existing.unshift(entry);
    }
    user.favoritePlayers = existing;
    await user.save();
    res.json({ favorites: user.favoritePlayers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/favorites/:playerId — remove a favorite
router.delete('/favorites/:playerId', auth, async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.favoritePlayers = (user.favoritePlayers || []).filter(f => f.playerId !== playerId);
    await user.save();
    res.json({ favorites: user.favoritePlayers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
