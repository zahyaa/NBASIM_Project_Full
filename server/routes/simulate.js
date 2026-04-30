const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const { simulateGame, simulate1v1, simulateBlacktop } = require('../services/simulation');
const { applyLineup } = require('../services/fantasyGM');
const router = express.Router();

// Sprint I — rate limit simulation endpoints. Each user can run a bounded
// number of game simulations per minute to keep CPU/memory predictable on
// shared hosting. Loose in dev/test so E2E loops aren't blocked.
const rateLimit = require('express-rate-limit');
const simLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 300,
  message: { error: 'Simulation rate limit reached. Slow down a bit.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip entirely in unit-test mode so the test harness can hammer it.
  skip: () => process.env.NODE_ENV === 'test',
  // Use library default keyGenerator (handles IPv6 safely).
});
router.use(simLimiter);

// Coach play-call helpers (item 2). User-supplied play call is sanitized to
// a flat { offensive, defensive } shape — both fields optional strings of
// up to 60 chars. CPU randomly picks named NBA schemes so both sides run a
// play even when the user defaults to "Free Play".
const CPU_OFFENSIVE_PLAYS = [
  'Horns Set', 'Pick & Roll', 'Spain Action', 'Princeton Offense',
  'Triangle', 'Motion Strong', 'Iso Heavy', 'Hammer Action',
];
const CPU_DEFENSIVE_PLAYS = [
  'Man-to-Man', 'Switch 1-5', '2-3 Zone', '3-2 Zone',
  'Drop Coverage', 'Half-Court Trap', 'Full-Court Press', 'Pack the Paint',
];

function sanitizePlayCall(pc) {
  if (!pc || typeof pc !== 'object') return {};
  const trim = (s) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 60) : null);
  return {
    offensive: trim(pc.offensive),
    defensive: trim(pc.defensive),
  };
}

function randomCpuPlayCall() {
  const o = CPU_OFFENSIVE_PLAYS[Math.floor(Math.random() * CPU_OFFENSIVE_PLAYS.length)];
  const d = CPU_DEFENSIVE_PLAYS[Math.floor(Math.random() * CPU_DEFENSIVE_PLAYS.length)];
  return { offensive: o, defensive: d };
}

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

    const { opponentName, opponentPlayers, playCall } = req.body;
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

    const teamA = applyLineup({
      name: user.team.name || `${user.username}'s Team`,
      players: user.team.players,
    });
    const teamB = {
      name: String(opponentName).slice(0, 100),
      players: sanitizedOpponents,
    };

    // User's pre-game play call (item 2). Defaults to none. CPU coach
    // randomly picks an offensive + defensive scheme so both sides are
    // running plays.
    const userPlayCall = sanitizePlayCall(playCall);
    const cpuPlayCall = randomCpuPlayCall();

    const result = simulateGame(teamA, teamB, {
      difficulty: user.difficulty,
      userSide: 'A',
      playCallA: userPlayCall,
      playCallB: cpuPlayCall,
    });

    // Save game scoped to the user
    const game = new Game({
      userId: req.userId,
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
