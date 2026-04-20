const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const { simulateGame, simulate1v1, simulateBlacktop } = require('../services/simulation');
const router = express.Router();

// POST /api/simulate — run a game between user's team and a computer opponent
router.post('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftCompleted) {
      return res.status(400).json({ error: 'Complete your draft first' });
    }
    if (user.team.players.length < 5) {
      return res.status(400).json({ error: 'Need at least 5 players' });
    }

    const { opponentName, opponentPlayers } = req.body;
    if (!opponentName || !Array.isArray(opponentPlayers) || opponentPlayers.length < 5) {
      return res.status(400).json({ error: 'Opponent team data required (name + at least 5 players)' });
    }

    const sanitizedOpponents = opponentPlayers.slice(0, 15).map(p => ({
      playerId: Number(p.playerId),
      firstName: String(p.firstName || '').slice(0, 50),
      lastName: String(p.lastName || '').slice(0, 50),
      position: String(p.position || '').slice(0, 5),
      rating: Math.min(99, Math.max(1, Number(p.rating) || 50)),
    }));

    const teamA = {
      name: user.team.name || `${user.username}'s Team`,
      players: user.team.players,
    };
    const teamB = {
      name: String(opponentName).slice(0, 100),
      players: sanitizedOpponents,
    };

    const result = simulateGame(teamA, teamB);

    // Save game
    const game = new Game({
      teamA: result.teamA,
      teamB: result.teamB,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      history: result.plays,
    });
    await game.save();

    // Update user record
    user.gamesPlayed.push(game._id);
    if (result.winner === teamA.name) {
      user.wins += 1;
    } else {
      user.losses += 1;
    }
    await user.save();

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simulate/1v1 — one on one pickup game
router.post('/1v1', auth, async (req, res) => {
  try {
    const { playerA, playerB, targetScore } = req.body;
    if (!playerA || !playerB) {
      return res.status(400).json({ error: 'Both playerA and playerB are required' });
    }

    const sanitize = (p) => ({
      playerId: Number(p.playerId || p.id),
      firstName: String(p.firstName || '').slice(0, 50),
      lastName: String(p.lastName || '').slice(0, 50),
      position: String(p.position || '').slice(0, 5),
      rating: Math.min(99, Math.max(1, Number(p.rating) || 50)),
    });

    const score = Math.min(21, Math.max(5, Number(targetScore) || 21));
    const result = simulate1v1(sanitize(playerA), sanitize(playerB), score);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simulate/blacktop — 3v3 or 5v5 half-court game
router.post('/blacktop', auth, async (req, res) => {
  try {
    const { teamA, teamB, targetScore } = req.body;
    if (!teamA || !teamB || !Array.isArray(teamA.players) || !Array.isArray(teamB.players)) {
      return res.status(400).json({ error: 'Both teams with players arrays required' });
    }
    if (teamA.players.length < 1 || teamA.players.length > 5) {
      return res.status(400).json({ error: 'Team A must have 1-5 players' });
    }
    if (teamB.players.length < 1 || teamB.players.length > 5) {
      return res.status(400).json({ error: 'Team B must have 1-5 players' });
    }

    const sanitizePlayers = (players) => players.slice(0, 5).map(p => ({
      playerId: Number(p.playerId || p.id),
      firstName: String(p.firstName || '').slice(0, 50),
      lastName: String(p.lastName || '').slice(0, 50),
      position: String(p.position || '').slice(0, 5),
      rating: Math.min(99, Math.max(1, Number(p.rating) || 50)),
    }));

    const score = Math.min(21, Math.max(5, Number(targetScore) || 21));
    const result = simulateBlacktop(
      { name: String(teamA.name || 'Team A').slice(0, 100), players: sanitizePlayers(teamA.players) },
      { name: String(teamB.name || 'Team B').slice(0, 100), players: sanitizePlayers(teamB.players) },
      score,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
