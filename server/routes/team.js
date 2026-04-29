// Team Management routes — lineup, sign players, trade with CPU,
// view injuries, and generate contracts. Locked until the user has
// started a fantasy draft.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

function requireDraftStarted(user, res) {
  if (!user.draftStarted) {
    res.status(403).json({ error: 'Locked — start a fantasy draft to unlock Team Management' });
    return false;
  }
  return true;
}

// GET /api/team — overview: roster, lineup, injuries, contracts, cpu teams.
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    res.json({
      team: user.team,
      tokens: user.tokens,
      cpuTeams: user.cpuTeams,
      injuries: user.team.players.filter(p => p.injured),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team/lineup — body: { starterIds: [playerId, ...] } (max 5)
router.post('/lineup', auth, async (req, res) => {
  try {
    const { starterIds } = req.body || {};
    if (!Array.isArray(starterIds)) return res.status(400).json({ error: 'starterIds[] required' });
    if (starterIds.length > 5) return res.status(400).json({ error: 'Lineup limited to 5 starters' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;

    const starters = new Set(starterIds.map(Number));
    user.team.players.forEach(p => { p.inLineup = starters.has(p.playerId); });
    user.markModified('team');
    await user.save();
    res.json({ message: 'Lineup updated', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team/sign — body: { player } sign a free agent into the user roster.
router.post('/sign', auth, async (req, res) => {
  try {
    const { player } = req.body || {};
    if (!player?.playerId) return res.status(400).json({ error: 'player required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;

    if (user.team.players.length >= 15) {
      return res.status(400).json({ error: 'Roster cap of 15 reached — release someone first' });
    }
    // No duplicate signings (anywhere in league).
    const taken = new Set(user.team.players.map(p => p.playerId));
    for (const ct of user.cpuTeams) for (const cp of ct.players) taken.add(cp.playerId);
    if (taken.has(Number(player.playerId))) {
      return res.status(400).json({ error: 'Player is not a free agent' });
    }

    user.team.players.push({
      playerId: Number(player.playerId),
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      rating: player.rating,
      stats: player.stats,
      contract: player.contract || { years: 1, salary: Math.round((player.rating || 70) * 0.4) },
    });
    user.markModified('team');
    await user.save();
    res.json({ message: 'Player signed', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team/release — body: { playerId } — drop a player to free agency.
router.post('/release', auth, async (req, res) => {
  try {
    const { playerId } = req.body || {};
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;

    const before = user.team.players.length;
    user.team.players = user.team.players.filter(p => p.playerId !== Number(playerId));
    if (user.team.players.length === before) {
      return res.status(404).json({ error: 'Player not on roster' });
    }
    user.markModified('team');
    await user.save();
    res.json({ message: 'Player released', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team/trade — body: { offerPlayerId, targetCpuTeamName, targetPlayerId }
// The CPU accepts the trade if the incoming rating is >= outgoing rating - 3.
router.post('/trade', auth, async (req, res) => {
  try {
    const { offerPlayerId, targetCpuTeamName, targetPlayerId } = req.body || {};
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;

    const myIdx = user.team.players.findIndex(p => p.playerId === Number(offerPlayerId));
    if (myIdx < 0) return res.status(400).json({ error: 'Offered player not on your roster' });

    const cpuTeam = user.cpuTeams.find(t => t.name === targetCpuTeamName);
    if (!cpuTeam) return res.status(404).json({ error: 'CPU team not found' });

    const cpuIdx = cpuTeam.players.findIndex(p => p.playerId === Number(targetPlayerId));
    if (cpuIdx < 0) return res.status(404).json({ error: 'Target player not on that team' });

    const myPlayer = user.team.players[myIdx];
    const cpuPlayer = cpuTeam.players[cpuIdx];

    // CPU acceptance heuristic — the AI won't downgrade by more than 3 rating.
    if ((myPlayer.rating || 0) + 3 < (cpuPlayer.rating || 0)) {
      return res.status(409).json({
        accepted: false,
        reason: 'CPU rejected the trade — your offer is too weak',
      });
    }

    // Swap.
    user.team.players[myIdx] = { ...cpuPlayer.toObject?.() ?? cpuPlayer };
    cpuTeam.players[cpuIdx] = { ...myPlayer.toObject?.() ?? myPlayer };
    user.markModified('team');
    user.markModified('cpuTeams');
    await user.save();
    res.json({ accepted: true, message: 'Trade complete', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team/contract — body: { playerId, years, salary } — generate / set
// a contract for a roster player.
router.post('/contract', auth, async (req, res) => {
  try {
    const { playerId, years, salary } = req.body || {};
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;

    const player = user.team.players.find(p => p.playerId === Number(playerId));
    if (!player) return res.status(404).json({ error: 'Player not on roster' });

    const yrs = Math.max(1, Math.min(5, Number(years) || 1));
    const sal = Math.max(1, Math.min(60, Number(salary) || Math.round((player.rating || 70) * 0.4)));
    player.contract = { years: yrs, salary: sal };
    user.markModified('team');
    await user.save();
    res.json({ message: 'Contract saved', player });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
