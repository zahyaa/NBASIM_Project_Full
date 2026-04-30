// Sprint D — Awards + Records & Hall of Fame.
//
// Endpoints:
//   GET  /api/awards/season           — most recent computed season awards
//   GET  /api/awards/history          — every season's awards (career)
//   POST /api/awards/recompute        — force a recompute (dev / preview)
//   GET  /api/records/franchise       — best/worst seasons, biggest wins, banners
//   GET  /api/records/leaders         — all-time leaders (career totals)
//   GET  /api/records/banners         — championship banners
//   GET  /api/records/hall-of-fame    — inducted retired players
//   GET  /api/records/player/:id      — career stats for one player

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const { computeSeasonAwards } = require('../services/awards');
const {
  computeFranchiseRecords,
  computeAllTimeLeaders,
  computeBanners,
  evaluateHallOfFame,
  playerCareerStats,
} = require('../services/records');

const router = express.Router();

// --- AWARDS -----------------------------------------------------------------

router.get('/awards/season', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      seasonNumber: user.seasonNumber,
      currentSeasonAwards: user.seasonAwards || null,
      hasCompletedSeasons: (user.careerAwards || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/awards/history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Return a slim version (omit statLines) so the page stays light.
    const slim = (user.careerAwards || []).map(a => ({
      seasonNumber: a.seasonNumber,
      mvp: a.mvp, dpoy: a.dpoy, roy: a.roy, sixthMan: a.sixthMan, mip: a.mip,
      allNBA: a.allNBA, allDefensive: a.allDefensive, allRookie: a.allRookie,
      leagueLeaders: a.leagueLeaders,
    }));
    res.json({ seasons: slim });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/awards/recompute', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftStarted) return res.status(403).json({ error: 'Locked — start a draft first' });
    const awards = computeSeasonAwards(user);
    user.seasonAwards = awards;
    user.markModified('seasonAwards');
    await user.save();
    res.json({ message: 'Awards recomputed', awards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RECORDS ----------------------------------------------------------------

router.get('/records/franchise', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Pull recent game documents to compute the box-score records.
    const recent = await Game.find({ userId: req.userId }).sort({ _id: -1 }).limit(200).lean();
    const records = computeFranchiseRecords(user, recent);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/records/leaders', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const leaders = computeAllTimeLeaders(user.careerAwards || []);
    res.json(leaders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/records/banners', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      banners: computeBanners(user),
      coachOfTheYear: user.coachOfTheYearHistory || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/records/hall-of-fame', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const inducted = evaluateHallOfFame(user, user.careerAwards || []);
    user.hallOfFame = inducted;
    user.markModified('hallOfFame');
    await user.save();
    res.json({ inducted, total: inducted.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/records/player/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const career = playerCareerStats(user.careerAwards || [], req.params.id);
    if (!career) return res.status(404).json({ error: 'No career stats found for this player' });
    res.json(career);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
