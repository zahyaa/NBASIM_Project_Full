// News feed endpoints. The feed is populated by hooks in season /
// playoffs / allstar / payments / awardRewards. This route just exposes
// it (paginated) plus a clear/mark-read endpoint.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// GET /api/news?limit=50&kind=game,trade
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const kinds = req.query.kind ? String(req.query.kind).split(',') : null;
    let feed = user.news || [];
    if (kinds) feed = feed.filter(n => kinds.includes(n.kind));
    res.json({
      seasonNumber: user.seasonNumber,
      total: feed.length,
      news: feed.slice(0, limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/news — clear the feed.
router.delete('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.news = [];
    await user.save();
    res.json({ message: 'News cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
