// Playbook routes — lets the user design and save custom plays.
// Locked until the user has started a fantasy draft (same gate as
// Team Management). The plays are persisted on user.customPlays and
// surfaced in Team Management → Coach's Playbook tab as well.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

const PLAY_TYPES = ['Set', 'ATO', 'Iso', 'PnR', 'Inbound', 'Transition'];
const FORMATIONS = [
  '1-4 High', '1-4 Low', 'Horns', 'Box', '5-Out', 'Stack',
  '1-3-1', '3-Out 2-In', '4-Low', '2-3 High',
];
const MAX_PLAYS = 25;

function requireDraftStarted(user, res) {
  if (!user.draftStarted) {
    res.status(403).json({ error: 'Locked — start a fantasy draft to unlock the Playbook' });
    return false;
  }
  return true;
}

function sanitize(input) {
  return {
    id: String(input.id || `play_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).slice(0, 60),
    name: String(input.name || 'Untitled Play').slice(0, 60),
    type: PLAY_TYPES.includes(input.type) ? input.type : 'Set',
    formation: FORMATIONS.includes(input.formation) ? input.formation : '1-4 High',
    primary: String(input.primary || '').slice(0, 30),
    secondary: String(input.secondary || '').slice(0, 30),
    screener: String(input.screener || '').slice(0, 30),
    description: String(input.description || '').slice(0, 400),
  };
}

// GET /api/playbook — return saved plays + roster + reference enums.
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    res.json({
      plays: user.customPlays || [],
      roster: user.team?.players || [],
      teamName: user.team?.name || '',
      coach: user.team?.coach || '',
      types: PLAY_TYPES,
      formations: FORMATIONS,
      max: MAX_PLAYS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playbook — create a new play. Body: { name, type, formation,
// primary, secondary, screener, description }.
router.post('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    if ((user.customPlays || []).length >= MAX_PLAYS) {
      return res.status(400).json({ error: `Playbook full — ${MAX_PLAYS} plays max. Delete one first.` });
    }
    const play = sanitize(req.body || {});
    user.customPlays.push(play);
    await user.save();
    res.json({ message: 'Play saved', play, plays: user.customPlays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/playbook/:id — update a saved play.
router.put('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    const idx = (user.customPlays || []).findIndex(p => p.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Play not found' });
    const updated = sanitize({ ...req.body, id: req.params.id });
    user.customPlays[idx] = { ...user.customPlays[idx], ...updated };
    user.markModified('customPlays');
    await user.save();
    res.json({ message: 'Play updated', play: user.customPlays[idx], plays: user.customPlays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playbook/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    const before = (user.customPlays || []).length;
    user.customPlays = (user.customPlays || []).filter(p => p.id !== req.params.id);
    if (user.customPlays.length === before) return res.status(404).json({ error: 'Play not found' });
    await user.save();
    res.json({ message: 'Play deleted', plays: user.customPlays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
