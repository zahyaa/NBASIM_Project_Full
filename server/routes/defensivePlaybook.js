// Defensive Playbook routes — mirror of /api/playbook for NBA defensive sets.
// Locked until the user has started a fantasy draft. Plays are persisted on
// user.defensivePlays and surfaced in Team Management → Defense tab and the
// in-game play-call dropdown during live simulation.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Standard NBA defensive schemes the engine knows how to evaluate.
const SCHEMES = [
  'Man',                // pure man-to-man
  '2-3 Zone',           // classic Syracuse-style perimeter zone
  '3-2 Zone',           // perimeter-heavy zone, gives up paint
  '1-3-1 Zone',         // trapping zone, vulnerable to corner 3
  'Box-and-1',          // 4 in a box, 1 on opponent's star
  'Triangle-and-2',     // 3 in a triangle, 2 on stars
  'Full-Court Press',   // pressure inbounder + ball-handler
  'Half-Court Trap',    // double-team at the timeline
  'Switch-Everything',  // 1-5 switching scheme
  'Drop',               // big drops on PnR coverage
];

// Where the defense applies pressure.
const PRESSURE = ['Half-Court', 'Three-Quarter', 'Full-Court'];

const MAX_PLAYS = 25;

function requireDraftStarted(user, res) {
  if (!user.draftStarted) {
    res.status(403).json({ error: 'Locked — start a fantasy draft to unlock the Defensive Playbook' });
    return false;
  }
  return true;
}

function sanitize(input) {
  return {
    id: String(input.id || `dplay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).slice(0, 60),
    name: String(input.name || 'Untitled Defense').slice(0, 60),
    scheme: SCHEMES.includes(input.scheme) ? input.scheme : 'Man',
    pressure: PRESSURE.includes(input.pressure) ? input.pressure : 'Half-Court',
    stopper: String(input.stopper || '').slice(0, 30),
    helper: String(input.helper || '').slice(0, 30),
    rebounder: String(input.rebounder || '').slice(0, 30),
    description: String(input.description || '').slice(0, 400),
  };
}

// GET /api/defensive-playbook
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    res.json({
      plays: user.defensivePlays || [],
      roster: user.team?.players || [],
      teamName: user.team?.name || '',
      coach: user.team?.coach || '',
      schemes: SCHEMES,
      pressure: PRESSURE,
      max: MAX_PLAYS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/defensive-playbook — create a new defensive play.
router.post('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    if ((user.defensivePlays || []).length >= MAX_PLAYS) {
      return res.status(400).json({ error: `Defensive playbook full — ${MAX_PLAYS} plays max. Delete one first.` });
    }
    const play = sanitize(req.body || {});
    user.defensivePlays.push(play);
    await user.save();
    res.json({ message: 'Defensive play saved', play, plays: user.defensivePlays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/defensive-playbook/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    const idx = (user.defensivePlays || []).findIndex(p => p.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Play not found' });
    const updated = sanitize({ ...req.body, id: req.params.id });
    user.defensivePlays[idx] = { ...user.defensivePlays[idx], ...updated };
    user.markModified('defensivePlays');
    await user.save();
    res.json({ message: 'Defensive play updated', play: user.defensivePlays[idx], plays: user.defensivePlays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/defensive-playbook/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    const before = (user.defensivePlays || []).length;
    user.defensivePlays = (user.defensivePlays || []).filter(p => p.id !== req.params.id);
    if (user.defensivePlays.length === before) return res.status(404).json({ error: 'Play not found' });
    await user.save();
    res.json({ message: 'Defensive play deleted', plays: user.defensivePlays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Library of preset NBA defensive sets the user can drop into their playbook
// in one click. Returned as a static reference list — not persisted.
router.get('/library', auth, async (_req, res) => {
  res.json({
    presets: [
      { name: 'Pack the Paint',       scheme: 'Drop',                pressure: 'Half-Court',    description: 'Big drops on screens, force mid-range; rebound by committee.' },
      { name: 'Switch 1–5',           scheme: 'Switch-Everything',   pressure: 'Half-Court',    description: 'Switch every screen with versatile defenders; no rotations needed.' },
      { name: 'Syracuse 2-3',         scheme: '2-3 Zone',            pressure: 'Half-Court',    description: 'Long wings on the wings, anchor at the rim, give up corner 3s.' },
      { name: 'Bennett 1-3-1',        scheme: '1-3-1 Zone',          pressure: 'Three-Quarter', description: 'Trap the wings, force baseline; rotate hard back to the corner.' },
      { name: 'Junk D — Box-and-1',   scheme: 'Box-and-1',           pressure: 'Half-Court',    description: '4 in a box, 1 chases the opposing star face-guard style.' },
      { name: 'Run-and-Jump Press',   scheme: 'Full-Court Press',    pressure: 'Full-Court',    description: 'Trap the inbounder, rotate to the ball-handler, force live-ball turnovers.' },
      { name: 'Soft Half-Court Trap', scheme: 'Half-Court Trap',     pressure: 'Half-Court',    description: 'Trap as the ball crosses half; recover to shooters.' },
      { name: 'Tom Thibs Man',        scheme: 'Man',                 pressure: 'Half-Court',    description: 'Hard-hedge PnR, stunt-and-recover; physical at the rim.' },
    ],
  });
});

module.exports = router;
