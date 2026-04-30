// Sprint C3 — Coaching & rotation API.
//
// Endpoints:
//   GET  /api/coaching/state        — current coach + rotation + pace + assignments
//   POST /api/coaching/rotation     — set 8-man rotation with target minutes
//   POST /api/coaching/pace         — slow | medium | fast
//   POST /api/coaching/defense      — assign defenders to opp scorers
//   GET  /api/coaching/closing-lineup — suggested 5 closers
//   GET  /api/coaching/candidates   — hireable coaches (free agents)
//   POST /api/coaching/hire         — hire a coach (replaces current)
//   POST /api/coaching/fire         — fire current coach (buyout = remaining salary)
//   GET  /api/coaching/coty         — Coach of the Year leaderboard

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const {
  ensureC3Fields, generateCoach, suggestClosingLineup,
  coachOfTheYear, expectedWinsFromRating,
} = require('../services/coaching');

const router = express.Router();

router.get('/state', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);
    await user.save();

    res.json({
      coach: user.team.coachInfo,
      coaching: user.coaching,
      roster: (user.team.players || []).map(p => ({
        playerId: p.playerId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        rating: p.rating,
      })),
      pacePresets: ['slow', 'medium', 'fast'],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rotation', auth, async (req, res) => {
  try {
    const { rotation } = req.body || {};
    if (!Array.isArray(rotation)) return res.status(400).json({ error: 'rotation array required' });
    if (rotation.length > 8)       return res.status(400).json({ error: 'rotation max 8 players' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);

    // Validate every entry references a roster player.
    const ids = (user.team.players || []).map(p => Number(p.playerId));
    for (const r of rotation) {
      if (!ids.includes(Number(r.playerId))) {
        return res.status(400).json({ error: `Player ${r.playerId} not on your roster` });
      }
    }
    user.coaching.rotation = rotation.map(r => ({
      playerId: Number(r.playerId),
      targetMinutes: Math.max(0, Math.min(40, Number(r.targetMinutes) || 24)),
    }));
    user.markModified('coaching');
    await user.save();
    res.json({ message: 'Rotation saved', rotation: user.coaching.rotation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pace', auth, async (req, res) => {
  try {
    const { pace } = req.body || {};
    if (!['slow', 'medium', 'fast'].includes(pace)) {
      return res.status(400).json({ error: 'pace must be slow|medium|fast' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);
    user.coaching.pace = pace;
    user.markModified('coaching');
    await user.save();
    res.json({ message: 'Pace set', pace });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/defense', auth, async (req, res) => {
  try {
    const { assignments } = req.body || {};
    if (!Array.isArray(assignments)) return res.status(400).json({ error: 'assignments array required' });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);

    user.coaching.defensiveAssignments = assignments.map(a => ({
      defenderId: Number(a.defenderId),
      opponentScorerId: Number(a.opponentScorerId),
    })).slice(0, 5);
    user.markModified('coaching');
    await user.save();
    res.json({ message: 'Assignments saved', assignments: user.coaching.defensiveAssignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/closing-lineup', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);
    const closers = suggestClosingLineup(user.team.players || []);
    res.json({
      closers: closers.map(p => ({
        playerId: p.playerId,
        firstName: p.firstName,
        lastName: p.lastName,
        rating: p.rating,
        clutch: p.clutch || 0,
        iq: p.iq || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/candidates', auth, async (req, res) => {
  try {
    // Generate a fresh slate of 6 free-agent coaches per request.
    const candidates = Array.from({ length: 6 }, () => generateCoach());
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hire', auth, async (req, res) => {
  try {
    const { coach } = req.body || {};
    if (!coach || !coach.name) return res.status(400).json({ error: 'coach object required' });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);

    user.team.coachInfo = {
      name: String(coach.name).slice(0, 60),
      offenseRating: Number(coach.offenseRating) || 70,
      defenseRating: Number(coach.defenseRating) || 70,
      developmentRating: Number(coach.developmentRating) || 70,
      style: ['offensive', 'defensive', 'balanced', 'developmental'].includes(coach.style) ? coach.style : 'balanced',
      salary: Math.max(2, Math.min(15, Number(coach.salary) || 4)),
      yearsRemaining: Math.max(1, Math.min(5, Number(coach.yearsRemaining) || 2)),
      age: Math.max(30, Math.min(75, Number(coach.age) || 50)),
      preferredPace: ['slow', 'medium', 'fast', ''].includes(coach.preferredPace) ? (coach.preferredPace || '') : '',
    };
    user.team.coach = user.team.coachInfo.name;
    user.markModified('team');
    await user.save();
    res.json({ message: `Hired ${user.team.coachInfo.name}`, coach: user.team.coachInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/fire', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);
    const fired = user.team.coachInfo;
    // Interim staff replaces the fired coach until a new hire.
    user.team.coachInfo = {
      name: 'Interim Staff',
      offenseRating: 60, defenseRating: 60, developmentRating: 60,
      style: 'balanced', salary: 1, yearsRemaining: 1, age: 50, preferredPace: '',
    };
    user.team.coach = 'Interim Staff';
    user.markModified('team');
    await user.save();
    res.json({ message: `Fired ${fired?.name || 'coach'}`, buyout: (fired?.salary || 0) * (fired?.yearsRemaining || 1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/coty', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureC3Fields(user);
    const userWins = (user.schedule || []).filter(g => g.played && g.userWon).length;
    const winner = coachOfTheYear({ user, userWins });
    res.json({
      winner,
      history: user.coachOfTheYearHistory || [],
      methodology: 'wins above expected (expected = avgRating-derived)',
      expectedExample: { ovr80: expectedWinsFromRating(80) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
