// Store routes — buy items with tokens earned from starting a fantasy draft.
// Items either (a) raise an attribute boost on a specific roster player, or
// (b) heal an injury. Costs and effects come from STORE_ITEMS in fantasyGM.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { STORE_ITEMS, awardRewards } = require('../services/fantasyGM');

const router = express.Router();

function findItem(id) {
  return STORE_ITEMS.find(i => i.itemId === id);
}

// All store endpoints require the user to have started a fantasy draft.
function requireDraftStarted(user, res) {
  if (!user.draftStarted) {
    res.status(403).json({ error: 'Locked — start a fantasy draft to unlock the Store' });
    return false;
  }
  return true;
}

// GET /api/store — list catalogue + current balance.
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;
    res.json({ tokens: user.tokens, items: STORE_ITEMS, inventory: user.inventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/store/purchase — body: { itemId, playerId? }
// playerId is required for boost / heal items so the effect lands on a roster
// player. The item is deducted from tokens and recorded in inventory.
router.post('/purchase', auth, async (req, res) => {
  try {
    const { itemId, playerId } = req.body || {};
    const item = findItem(itemId);
    if (!item) return res.status(400).json({ error: 'Unknown item' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftStarted(user, res)) return;

    if ((user.tokens || 0) < item.cost) {
      return res.status(400).json({ error: 'Not enough tokens' });
    }

    // Team-wide items spread the boost across every roster player and don't
    // need a target playerId. Player-targeted items still require one.
    if (item.applyToTeam) {
      if (!user.team.players.length) {
        return res.status(400).json({ error: 'Roster is empty — draft players first' });
      }
      for (const p of user.team.players) {
        p.boost = p.boost || { offense: 0, defense: 0, athleticism: 0 };
        if (item.boost) {
          p.boost.offense     += item.boost.offense     || 0;
          p.boost.defense     += item.boost.defense     || 0;
          p.boost.athleticism += item.boost.athleticism || 0;
          const total = (item.boost.offense || 0) + (item.boost.defense || 0) + (item.boost.athleticism || 0);
          p.rating = Math.min(99, (p.rating || 70) + Math.max(1, Math.floor(total / 3)));
        }
      }
      user.tokens -= item.cost;
      user.inventory.push({ itemId: item.itemId, name: item.name, appliedToPlayerId: null });
      user.markModified('team');
      const rewards = awardRewards(user);
      await user.save();
      return res.json({
        message: 'Purchased (team-wide)',
        tokens: user.tokens,
        tokensAwarded: rewards.tokensAwarded,
        newAchievements: rewards.newAchievements,
      });
    }

    // Item must target a roster player (boost or heal).
    const player = user.team.players.find(p => p.playerId === Number(playerId));
    if (!player) return res.status(400).json({ error: 'Target player not on your roster' });

    if (item.boost) {
      player.boost = player.boost || { offense: 0, defense: 0, athleticism: 0 };
      player.boost.offense     += item.boost.offense     || 0;
      player.boost.defense     += item.boost.defense     || 0;
      player.boost.athleticism += item.boost.athleticism || 0;
      // Reflect into the visible rating too (cap at 99).
      const total = (item.boost.offense || 0) + (item.boost.defense || 0) + (item.boost.athleticism || 0);
      player.rating = Math.min(99, (player.rating || 70) + Math.ceil(total / 3));
    }
    if (item.healInjury) {
      player.injured = false;
      player.injuryDaysRemaining = 0;
    }

    user.tokens -= item.cost;
    user.inventory.push({ itemId: item.itemId, name: item.name, appliedToPlayerId: player.playerId });
    user.markModified('team');
    const rewards = awardRewards(user);
    await user.save();
    res.json({
      message: 'Purchased',
      tokens: user.tokens,
      player,
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
