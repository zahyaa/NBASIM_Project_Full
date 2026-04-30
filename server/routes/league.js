// Sprint E2 — League-level endpoints (power rankings, league overview).

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { computePowerRankings } = require('../services/cpuFrontOffice');

const router = express.Router();

// GET /api/league/power-rankings — current rankings for all 30 teams.
// Optional `?snapshot=true` records this week's rankings on the user doc.
router.get('/power-rankings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const rankings = computePowerRankings(user);

    if (req.query.snapshot === 'true') {
      const week = Math.ceil((user.schedule?.filter(g => g.played).length || 0) / 3);
      user.powerRankingsHistory = user.powerRankingsHistory || [];
      user.powerRankingsHistory.push({
        seasonNumber: user.seasonNumber,
        week,
        generatedAt: new Date(),
        rankings: rankings.map(r => ({ rank: r.rank, name: r.name, score: r.score, wins: r.wins, losses: r.losses })),
      });
      // Cap history at 60 snapshots so the doc stays small.
      if (user.powerRankingsHistory.length > 60) {
        user.powerRankingsHistory = user.powerRankingsHistory.slice(-60);
      }
      user.markModified('powerRankingsHistory');
      await user.save();
    }

    res.json({
      seasonNumber: user.seasonNumber,
      generatedAt: new Date(),
      rankings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/league/power-rankings/history — past weekly snapshots.
router.get('/power-rankings/history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ history: user.powerRankingsHistory || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/league/overview — quick CPU-team breakdown by direction.
router.get('/overview', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const teams = user.cpuTeams || [];
    const buckets = { contender: [], middling: [], rebuild: [], tank: [] };
    for (const t of teams) {
      const dir = t.direction || 'middling';
      const rec = (user.cpuRecords || []).find(r => r.name === t.name) || { wins: 0, losses: 0 };
      (buckets[dir] || buckets.middling).push({
        name: t.name, city: t.city, conference: t.conference, division: t.division,
        wins: rec.wins, losses: rec.losses,
        avgRating: Math.round((t.players || []).reduce((s, p) => s + (p.rating || 0), 0) /
          Math.max(1, (t.players || []).length)),
      });
    }
    res.json({ buckets, totalTeams: teams.length + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
