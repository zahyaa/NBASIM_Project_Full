// Multiplayer routes — head-to-head between real users.
// Locked until the user has completed their fantasy draft AND has an
// active premium subscription. Three modes:
//   • public   — auto-match with any waiting subscriber
//   • private  — share a 6-char code to play a friend
//   • playoff  — 8-user bracket, best-of-7 series, "play for the ring"
//
// Implementation note: matches are stored in-memory (Map) keyed by id.
// This is fine for a single-server deploy and resets on restart, which
// matches our other live state (draft order, news cache). For multi-node
// scale-out we'd swap this for Redis or Mongo subdocs.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { simulateGame } = require('../services/simulation');
const { applyLineup } = require('../services/fantasyGM');

const router = express.Router();

// ----- match store -----
// match = {
//   id, type: 'public'|'private'|'playoff', code?, status,
//   players: [{ userId, username, teamName, ready, seed? }],
//   capacity, maxGames (for series), games: [...resolved games],
//   bracket?: { rounds: [...] }, createdAt, updatedAt
// }
const matches = new Map();
const publicQueue = []; // user IDs waiting for a public match
const userToMatch = new Map(); // userId -> matchId

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function isSubscribed(user) {
  if (!user?.subscription) return false;
  if (user.subscription.tier === 'free') return false;
  if (!user.subscription.paidUntil) return false;
  return new Date(user.subscription.paidUntil) > new Date();
}

function gateMultiplayer(user, res) {
  if (!user.draftCompleted) {
    res.status(403).json({ error: 'Locked — complete your fantasy draft first' });
    return false;
  }
  if (!isSubscribed(user)) {
    res.status(403).json({ error: 'Locked — premium subscription required to play multiplayer', code: 'NEED_SUB' });
    return false;
  }
  return true;
}

function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function genId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function teamPayload(user) {
  return applyLineup({
    name: user.team?.name || `${user.username}'s Team`,
    players: user.team?.players || [],
    coachRating: 7,
  });
}

function publicView(match) {
  if (!match) return null;
  return {
    id: match.id,
    type: match.type,
    code: match.code || null,
    status: match.status,
    capacity: match.capacity,
    maxGames: match.maxGames,
    players: match.players.map(p => ({
      userId: p.userId, username: p.username, teamName: p.teamName,
      ready: p.ready, seed: p.seed || null, wins: p.wins || 0,
    })),
    games: match.games || [],
    bracket: match.bracket || null,
    winner: match.winner || null,
    champion: match.champion || null,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
}

function leaveMatch(userId) {
  const matchId = userToMatch.get(userId);
  if (!matchId) return;
  const match = matches.get(matchId);
  userToMatch.delete(userId);
  if (!match) return;
  if (match.status === 'waiting') {
    match.players = match.players.filter(p => p.userId !== userId);
    if (match.players.length === 0) matches.delete(matchId);
  } else if (match.status === 'live') {
    // Forfeit: opponent wins remaining series.
    const forfeiter = match.players.find(p => p.userId === userId);
    if (forfeiter) forfeiter.forfeited = true;
    match.status = 'completed';
    const opp = match.players.find(p => p.userId !== userId);
    if (opp) match.champion = opp.username;
  }
  match.updatedAt = new Date();
}

// ============================================================
// Routes
// ============================================================

// GET /api/multiplayer/status — gate check + active match (if any).
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const subscribed = isSubscribed(user);
    const ready = !!user.draftCompleted && subscribed;
    const matchId = userToMatch.get(String(req.userId));
    const activeMatch = matchId ? publicView(matches.get(matchId)) : null;
    res.json({
      draftCompleted: !!user.draftCompleted,
      subscribed,
      ready,
      tier: user.subscription?.tier || 'free',
      paidUntil: user.subscription?.paidUntil || null,
      activeMatch,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/multiplayer/online — list other users currently online + ready
// (draft completed + subscribed). Excludes self.
router.get('/online', auth, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
    const users = await User.find({
      _id: { $ne: req.userId },
      lastSeenAt: { $gte: cutoff },
      draftCompleted: true,
      'subscription.tier': { $ne: 'free' },
      'subscription.paidUntil': { $gt: new Date() },
    }).select('username team.name lastSeenAt seasonWins seasonLosses');
    res.json({
      online: users.map(u => ({
        userId: String(u._id),
        username: u.username,
        teamName: u.team?.name || '',
        lastSeenAt: u.lastSeenAt,
        record: { wins: u.seasonWins || 0, losses: u.seasonLosses || 0 },
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/multiplayer/public — find or create a public match (best-of-7).
router.post('/public', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!gateMultiplayer(user, res)) return;

    // Already in a match?
    const existing = userToMatch.get(String(req.userId));
    if (existing && matches.get(existing)) {
      return res.json({ match: publicView(matches.get(existing)) });
    }

    // Try to pop a waiting opponent.
    let opponent = null;
    while (publicQueue.length) {
      const candidateId = publicQueue.shift();
      if (candidateId === String(req.userId)) continue;
      // Validate they're still online + don't already have a match.
      if (userToMatch.get(candidateId)) continue;
      opponent = await User.findById(candidateId);
      if (opponent && isSubscribed(opponent) && opponent.draftCompleted) break;
      opponent = null;
    }

    if (opponent) {
      const match = {
        id: genId(),
        type: 'public',
        status: 'live',
        capacity: 2,
        maxGames: 7,
        players: [
          { userId: String(opponent._id), username: opponent.username, teamName: opponent.team?.name || opponent.username, ready: true, wins: 0 },
          { userId: String(req.userId),    username: user.username,     teamName: user.team?.name || user.username,         ready: true, wins: 0 },
        ],
        games: [],
        createdAt: new Date(), updatedAt: new Date(),
      };
      matches.set(match.id, match);
      userToMatch.set(String(opponent._id), match.id);
      userToMatch.set(String(req.userId),    match.id);
      return res.json({ match: publicView(match), matched: true });
    }

    // No opponent — create a waiting room and queue this user.
    const match = {
      id: genId(),
      type: 'public',
      status: 'waiting',
      capacity: 2,
      maxGames: 7,
      players: [{ userId: String(req.userId), username: user.username, teamName: user.team?.name || user.username, ready: true, wins: 0 }],
      games: [],
      createdAt: new Date(), updatedAt: new Date(),
    };
    matches.set(match.id, match);
    userToMatch.set(String(req.userId), match.id);
    publicQueue.push(String(req.userId));
    res.json({ match: publicView(match), matched: false, message: 'Waiting for opponent…' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/multiplayer/private/create — generate a code another user can use to join.
router.post('/private/create', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!gateMultiplayer(user, res)) return;

    leaveMatch(String(req.userId));
    const code = genCode();
    const match = {
      id: genId(),
      type: 'private',
      code,
      status: 'waiting',
      capacity: 2,
      maxGames: 7,
      players: [{ userId: String(req.userId), username: user.username, teamName: user.team?.name || user.username, ready: true, wins: 0 }],
      games: [],
      createdAt: new Date(), updatedAt: new Date(),
    };
    matches.set(match.id, match);
    userToMatch.set(String(req.userId), match.id);
    res.json({ match: publicView(match), code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/multiplayer/private/join — body: { code }
router.post('/private/join', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!gateMultiplayer(user, res)) return;

    const code = String(req.body?.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ error: 'code required' });

    const match = [...matches.values()].find(m => m.code === code && m.status === 'waiting' && m.type === 'private');
    if (!match) return res.status(404).json({ error: 'Match not found or already started' });
    if (match.players.length >= match.capacity) return res.status(400).json({ error: 'Match is full' });
    if (match.players.some(p => p.userId === String(req.userId))) {
      return res.json({ match: publicView(match) });
    }

    leaveMatch(String(req.userId));
    match.players.push({ userId: String(req.userId), username: user.username, teamName: user.team?.name || user.username, ready: true, wins: 0 });
    match.status = 'live';
    match.updatedAt = new Date();
    matches.set(match.id, match);
    userToMatch.set(String(req.userId), match.id);
    res.json({ match: publicView(match) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/multiplayer/playoff/create — start an 8-user playoff bracket.
// First user creates with a code; 7 more join, then it auto-seeds and starts.
router.post('/playoff/create', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!gateMultiplayer(user, res)) return;

    leaveMatch(String(req.userId));
    const code = genCode();
    const match = {
      id: genId(),
      type: 'playoff',
      code,
      status: 'waiting',
      capacity: 8,
      maxGames: 4, // best-of-7 -> first to 4 wins
      players: [{ userId: String(req.userId), username: user.username, teamName: user.team?.name || user.username, ready: true, wins: 0 }],
      bracket: null,
      games: [],
      createdAt: new Date(), updatedAt: new Date(),
    };
    matches.set(match.id, match);
    userToMatch.set(String(req.userId), match.id);
    res.json({ match: publicView(match), code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/multiplayer/playoff/join — body: { code }
router.post('/playoff/join', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!gateMultiplayer(user, res)) return;

    const code = String(req.body?.code || '').toUpperCase().trim();
    const match = [...matches.values()].find(m => m.code === code && m.status === 'waiting' && m.type === 'playoff');
    if (!match) return res.status(404).json({ error: 'Playoff lobby not found or already started' });
    if (match.players.length >= match.capacity) return res.status(400).json({ error: 'Lobby is full' });
    if (match.players.some(p => p.userId === String(req.userId))) {
      return res.json({ match: publicView(match) });
    }

    leaveMatch(String(req.userId));
    match.players.push({ userId: String(req.userId), username: user.username, teamName: user.team?.name || user.username, ready: true, wins: 0 });
    match.updatedAt = new Date();
    userToMatch.set(String(req.userId), match.id);

    // 8 players? Build the bracket and start.
    if (match.players.length === match.capacity) {
      // Random seed 1..8.
      const shuffled = [...match.players].sort(() => Math.random() - 0.5);
      shuffled.forEach((p, i) => { p.seed = i + 1; });
      match.bracket = {
        round: 0, // 0 = QF, 1 = SF, 2 = Finals
        rounds: [
          {
            name: 'Quarterfinals',
            series: [
              { teamA: shuffled[0], teamB: shuffled[7], winsA: 0, winsB: 0, winner: '', games: [] },
              { teamA: shuffled[3], teamB: shuffled[4], winsA: 0, winsB: 0, winner: '', games: [] },
              { teamA: shuffled[1], teamB: shuffled[6], winsA: 0, winsB: 0, winner: '', games: [] },
              { teamA: shuffled[2], teamB: shuffled[5], winsA: 0, winsB: 0, winner: '', games: [] },
            ],
          },
          { name: 'Semifinals', series: [] },
          { name: 'Finals',     series: [] },
        ],
      };
      match.status = 'live';
    }
    res.json({ match: publicView(match) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/multiplayer/state/:id — poll a match.
router.get('/state/:id', auth, async (req, res) => {
  const match = matches.get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!match.players.some(p => p.userId === String(req.userId))) {
    return res.status(403).json({ error: 'Not your match' });
  }
  res.json({ match: publicView(match) });
});

// POST /api/multiplayer/play/:id — sim the next game in this match.
// For 1v1 best-of-7, plays one game and updates the series.
// For playoff bracket, plays the next user-involved series step.
router.post('/play/:id', auth, async (req, res) => {
  try {
    const match = matches.get(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!match.players.some(p => p.userId === String(req.userId))) {
      return res.status(403).json({ error: 'Not your match' });
    }
    if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' });

    if (match.type === 'public' || match.type === 'private') {
      const [pA, pB] = match.players;
      const userA = await User.findById(pA.userId);
      const userB = await User.findById(pB.userId);
      const teamA = teamPayload(userA);
      const teamB = teamPayload(userB);
      const result = simulateGame(teamA, teamB);
      const winnerSide = result.scoreA > result.scoreB ? 'A' : 'B';
      if (winnerSide === 'A') pA.wins = (pA.wins || 0) + 1;
      else pB.wins = (pB.wins || 0) + 1;
      match.games.push({
        gameNumber: match.games.length + 1,
        scoreA: result.scoreA, scoreB: result.scoreB,
        winner: winnerSide === 'A' ? pA.username : pB.username,
        leaders: result.leaders,
      });
      const target = Math.ceil(match.maxGames / 2); // first to 4
      if (pA.wins >= target || pB.wins >= target) {
        match.status = 'completed';
        match.champion = pA.wins >= target ? pA.username : pB.username;
      }
      match.updatedAt = new Date();
      return res.json({ match: publicView(match), lastGame: match.games[match.games.length - 1] });
    }

    if (match.type === 'playoff') {
      const br = match.bracket;
      const round = br.rounds[br.round];
      // Find the next un-finished series in the current round.
      const series = round.series.find(s => !s.winner);
      if (!series) return res.status(400).json({ error: 'Round complete — call /advance' });

      const userA = await User.findById(series.teamA.userId);
      const userB = await User.findById(series.teamB.userId);
      const result = simulateGame(teamPayload(userA), teamPayload(userB));
      const winnerSide = result.scoreA > result.scoreB ? 'A' : 'B';
      if (winnerSide === 'A') series.winsA += 1; else series.winsB += 1;
      series.games.push({
        gameNumber: series.games.length + 1,
        scoreA: result.scoreA, scoreB: result.scoreB,
        winner: winnerSide === 'A' ? series.teamA.username : series.teamB.username,
      });
      const target = Math.ceil(match.maxGames * 2 / 2); // 4
      if (series.winsA >= 4 || series.winsB >= 4) {
        series.winner = series.winsA >= 4 ? series.teamA.username : series.teamB.username;
      }

      // Auto-advance bracket if round complete.
      if (round.series.every(s => s.winner)) {
        if (br.round === 0) {
          br.rounds[1].series = [
            { teamA: round.series[0].winner === round.series[0].teamA.username ? round.series[0].teamA : round.series[0].teamB,
              teamB: round.series[1].winner === round.series[1].teamA.username ? round.series[1].teamA : round.series[1].teamB,
              winsA: 0, winsB: 0, winner: '', games: [] },
            { teamA: round.series[2].winner === round.series[2].teamA.username ? round.series[2].teamA : round.series[2].teamB,
              teamB: round.series[3].winner === round.series[3].teamA.username ? round.series[3].teamA : round.series[3].teamB,
              winsA: 0, winsB: 0, winner: '', games: [] },
          ];
          br.round = 1;
        } else if (br.round === 1) {
          const r1 = br.rounds[1].series;
          br.rounds[2].series = [{
            teamA: r1[0].winner === r1[0].teamA.username ? r1[0].teamA : r1[0].teamB,
            teamB: r1[1].winner === r1[1].teamA.username ? r1[1].teamA : r1[1].teamB,
            winsA: 0, winsB: 0, winner: '', games: [],
          }];
          br.round = 2;
        } else if (br.round === 2) {
          const finals = br.rounds[2].series[0];
          match.status = 'completed';
          match.champion = finals.winner;
        }
      }
      match.updatedAt = new Date();
      return res.json({ match: publicView(match) });
    }

    res.status(400).json({ error: 'Unknown match type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/multiplayer/leave/:id
router.post('/leave/:id', auth, async (req, res) => {
  leaveMatch(String(req.userId));
  res.json({ ok: true });
});

module.exports = router;
