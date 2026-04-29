// All-Star Weekend — voting + simulated event in 2000s style.
//
// The user opens the ballot mid-season, votes for up to 12 East and 12
// West players (rosters are seeded from highest-rated user + CPU players).
// Each player has both a `rating` and a hidden `popularity` score; the
// final selection score = (votes * 3) + popularity + rating.
//
// Saturday Night: 3-Point Contest, Slam Dunk Contest, Skills Challenge.
// Sunday: East vs West game, MVP awarded.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { quickSimRecord } = require('../services/fantasyGM');
const { pushNews, allStarHeadline } = require('../services/news');

const router = express.Router();

function allRosterPlayers(user) {
  const out = [];
  (user.team?.players || []).forEach(p => out.push({ ...(p.toObject ? p.toObject() : p), teamName: user.team.name, conference: user.conference, isUser: true }));
  for (const t of user.cpuTeams || []) {
    (t.players || []).forEach(p => out.push({ ...(p.toObject ? p.toObject() : p), teamName: t.name, conference: t.conference, isUser: false }));
  }
  return out;
}

function buildBallot(user) {
  const players = allRosterPlayers(user);
  // Stable popularity score per player so multiple ballot fetches agree.
  // Hash playerId so it doesn't drift between requests.
  for (const p of players) {
    const seed = ((p.playerId || 0) * 2654435761) >>> 0;
    p.popularity = 50 + (seed % 51); // 50..100
  }
  const east = players.filter(p => p.conference === 'East').sort((a, b) => (b.rating + b.popularity) - (a.rating + a.popularity)).slice(0, 30);
  const west = players.filter(p => p.conference === 'West').sort((a, b) => (b.rating + b.popularity) - (a.rating + a.popularity)).slice(0, 30);
  return { east, west };
}

// GET /api/allstar/ballot — list candidates (top 30 each conf).
router.get('/ballot', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftCompleted) return res.status(403).json({ error: 'Locked — finish the draft first' });

    const ballot = buildBallot(user);
    res.json({
      seasonNumber: user.seasonNumber,
      voted: user.allStar?.voted && user.allStar?.seasonNumber === user.seasonNumber,
      east: ballot.east.map(p => ({ playerId: p.playerId, firstName: p.firstName, lastName: p.lastName, position: p.position, rating: p.rating, teamName: p.teamName, popularity: p.popularity })),
      west: ballot.west.map(p => ({ playerId: p.playerId, firstName: p.firstName, lastName: p.lastName, position: p.position, rating: p.rating, teamName: p.teamName, popularity: p.popularity })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/allstar/vote — body: { eastIds: [..], westIds: [..] }
// Up to 12 picks per conference. Premium subs get extra weight.
router.post('/vote', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { eastIds = [], westIds = [] } = req.body || {};
    const eIds = (eastIds || []).slice(0, 12);
    const wIds = (westIds || []).slice(0, 12);

    const ballot = buildBallot(user);
    const tier = user.subscription?.tier || 'free';
    const weight = tier === 'gm-elite' ? 3 : tier === 'premium' ? 2 : 1;

    function buildRoster(candidates, votedIds) {
      // Score = popularity + rating + (votes * 5 * weight) for voted players.
      const scored = candidates.map(p => ({
        ...p,
        votes: votedIds.includes(p.playerId) ? weight : 0,
        score: p.popularity + p.rating + (votedIds.includes(p.playerId) ? 5 * weight : 0),
      })).sort((a, b) => b.score - a.score).slice(0, 12);
      return scored.map(p => ({
        playerId: p.playerId, firstName: p.firstName, lastName: p.lastName,
        position: p.position, rating: p.rating, votes: p.votes,
      }));
    }

    user.allStar = {
      seasonNumber: user.seasonNumber,
      voted: true,
      eastRoster: buildRoster(ballot.east, eIds),
      westRoster: buildRoster(ballot.west, wIds),
      threePointWinner: '',
      dunkWinner: '',
      skillsWinner: '',
      gameMVP: '',
      eastScore: 0,
      westScore: 0,
    };

    pushNews(user, allStarHeadline(user));
    await user.save();
    res.json({
      message: 'Vote submitted',
      east: user.allStar.eastRoster,
      west: user.allStar.westRoster,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/allstar/run-event — sim Saturday + Sunday.
router.post('/run-event', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.allStar?.voted || user.allStar?.seasonNumber !== user.seasonNumber) {
      return res.status(400).json({ error: 'Vote first' });
    }
    if (user.allStar.gameMVP) return res.status(400).json({ error: 'Event already ran this season' });

    const east = user.allStar.eastRoster;
    const west = user.allStar.westRoster;
    if (!east.length || !west.length) return res.status(400).json({ error: 'No rosters' });

    // 3-Point: pick 5 random players (mix of conferences), winner weighted by rating.
    const pool = [...east, ...west];
    function spotlight(label, count = 5) {
      const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
      const totalScore = picks.reduce((s, p) => s + p.rating, 0);
      let r = Math.random() * totalScore;
      for (const p of picks) { r -= p.rating; if (r <= 0) return `${p.firstName} ${p.lastName}`; }
      return `${picks[0].firstName} ${picks[0].lastName}`;
    }
    user.allStar.threePointWinner = spotlight('3PT');
    user.allStar.dunkWinner = spotlight('Dunk');
    user.allStar.skillsWinner = spotlight('Skills');

    // Sunday game: each conference team is fed into quickSimRecord.
    const eastTeam = { name: 'East All-Stars', players: east };
    const westTeam = { name: 'West All-Stars', players: west };
    const r = quickSimRecord(eastTeam, westTeam);
    user.allStar.eastScore = r.scoreA;
    user.allStar.westScore = r.scoreB;
    const winningRoster = r.winner === 'A' ? east : west;
    const mvp = [...winningRoster].sort((a, b) => b.rating - a.rating)[0];
    user.allStar.gameMVP = `${mvp.firstName} ${mvp.lastName}`;

    user.markModified('allStar');

    pushNews(user, {
      id: `as_event_${Date.now()}`, kind: 'allstar',
      headline: `${r.winner === 'A' ? 'East' : 'West'} take the All-Star Game ${Math.max(r.scoreA, r.scoreB)}-${Math.min(r.scoreA, r.scoreB)} — ${user.allStar.gameMVP} named MVP`,
      body: `Saturday Night: ${user.allStar.threePointWinner} wins the 3-Point Contest, ${user.allStar.dunkWinner} takes the Slam Dunk crown, ${user.allStar.skillsWinner} wins the Skills Challenge.`,
      seasonNumber: user.seasonNumber,
    });

    await user.save();
    res.json({ allStar: user.allStar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/allstar/state — current event state.
router.get('/state', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ allStar: user.allStar || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
