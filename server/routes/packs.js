// Card-pack player acquisition. Replaces the old fantasy draft flow:
// users buy 5-card packs (basic 20 / premium 30 / ultimate 40 tokens)
// until their 15-player roster is full. League-wide uniqueness still
// applies — a player drawn for the user (or any CPU team) is removed
// from the pool everywhere else.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const {
  isValidConferenceDivision,
  tierForCity,
  generateCpuTeams,
} = require('../services/fantasyGM');
const {
  PACK_TIERS,
  PACK_SIZE,
  ROSTER_SIZE,
  openPack,
  fillCpuTeamsRandomly,
  toRosterEntry,
} = require('../services/cardPacks');
const { buildPlayerPool, claimedIdsFromUser } = require('../services/playerPool');

const router = express.Router();

const STARTING_TOKENS = 100;

// POST /api/packs/setup — create the user's team (no draft, just setup).
// Saves city/coach/division/team-name, awards starting tokens once, and
// generates the 29 CPU franchises so the league exists. CPU rosters stay
// empty until the user opens their first pack (we lazy-fill then).
router.post('/setup', auth, async (req, res) => {
  try {
    const { conference, division, league, city, coach, teamName } = req.body;
    if (!conference || !league) {
      return res.status(400).json({ error: 'Conference and league are required' });
    }
    if (!division) return res.status(400).json({ error: 'Division is required' });
    if (!isValidConferenceDivision(conference, division)) {
      return res.status(400).json({ error: `Division "${division}" does not belong to ${conference}ern Conference` });
    }
    if (!teamName || !String(teamName).trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }
    if (!coach || !String(coach).trim()) {
      return res.status(400).json({ error: 'Coach is required' });
    }
    if (!city || !tierForCity(city)) {
      return res.status(400).json({ error: 'A valid US city is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.conference = conference;
    user.league = league;
    user.team.city = String(city).slice(0, 50);
    user.team.marketTier = tierForCity(city);
    user.team.coach = String(coach).slice(0, 60);
    user.team.division = String(division).slice(0, 30);
    user.team.name = String(teamName).slice(0, 50);
    user.draftType = 'packs';
    user.gameMode = 'fantasy';

    // First-time setup: award starting tokens + generate CPU league.
    if (!user.draftStarted) {
      user.tokens = (user.tokens || 0) + STARTING_TOKENS;
      user.draftStarted = true;
      user.cpuTeams = generateCpuTeams({
        userTeam: {
          name: user.team.name,
          city: user.team.city,
          coach: user.team.coach,
          conference: user.conference,
          division: user.team.division,
        },
      });
    }

    await user.save();
    res.json({
      message: 'Team created — open packs to fill your roster',
      tokens: user.tokens,
      cpuTeamCount: user.cpuTeams.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/packs/tiers — pack catalog (cost + label) for the storefront.
router.get('/tiers', auth, async (_req, res) => {
  res.json({
    tiers: PACK_TIERS,
    packSize: PACK_SIZE,
    rosterSize: ROSTER_SIZE,
  });
});

// POST /api/packs/buy { tier } — open one pack.
//   1. Validate tier + token balance + roster space.
//   2. Build the league-wide pool, exclude every claimed id.
//   3. If CPU teams haven't been filled yet (first purchase), randomly
//      seed all 29 of them from the pool so the league has rosters.
//   4. Draw 5 unique players from the user-tier window, append to the
//      user's roster, deduct tokens, persist.
router.post('/buy', auth, async (req, res) => {
  try {
    const { tier } = req.body || {};
    if (!PACK_TIERS[tier]) {
      return res.status(400).json({ error: `Unknown tier "${tier}"` });
    }
    const cost = PACK_TIERS[tier].cost;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftStarted) return res.status(403).json({ error: 'Run /api/packs/setup first' });
    if ((user.tokens || 0) < cost) {
      return res.status(402).json({ error: `Need ${cost} tokens (have ${user.tokens || 0})` });
    }
    if ((user.team.players || []).length >= ROSTER_SIZE) {
      return res.status(400).json({ error: `Roster full (${ROSTER_SIZE} players)` });
    }

    const pool = await buildPlayerPool(user);

    // First pack purchase ever: also fill all CPU rosters from the same
    // pool so the rest of the league has players to play with. After
    // this, claimedIds includes everyone the CPUs grabbed too.
    const claimed = claimedIdsFromUser(user);
    const cpusEmpty = (user.cpuTeams || []).every(t => !t.players || t.players.length === 0);
    if (cpusEmpty && (user.cpuTeams || []).length > 0) {
      fillCpuTeamsRandomly({ cpuTeams: user.cpuTeams, pool, claimedIds: claimed });
      user.markModified('cpuTeams');
    }

    const drawn = openPack({ pool, tier, claimedIds: claimed });
    if (drawn.length === 0) {
      return res.status(409).json({ error: 'Pool exhausted — try a different tier' });
    }

    // Roster cap: don't let one pack push the user past 15 (e.g. they're
    // at 13 and buy a 5-pack — keep the first 2, refund the rest? We
    // simply hard-cap at 15, the extras are discarded with a partial
    // refund so the user isn't penalized for the spillover.
    const space = ROSTER_SIZE - user.team.players.length;
    const kept = drawn.slice(0, space);
    const discarded = drawn.length - kept.length;
    user.team.players.push(...kept.map(toRosterEntry));
    user.markModified('team');

    // Charge for the pack. If we discarded cards (roster overflow), refund
    // a proportional share of the cost so the user isn't ripped off.
    const refund = discarded > 0 ? Math.round((discarded / PACK_SIZE) * cost) : 0;
    user.tokens = (user.tokens || 0) - cost + refund;

    await user.save();

    res.json({
      message: `Opened ${PACK_TIERS[tier].label} (${kept.length} card${kept.length === 1 ? '' : 's'} kept)`,
      tier,
      cost,
      refund,
      tokens: user.tokens,
      cards: kept.map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        rating: p.rating,
        team: p.team,
        league: p.league,
      })),
      rosterSize: user.team.players.length,
      rosterFull: user.team.players.length >= ROSTER_SIZE,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/packs/complete — once roster is full, mark the user as
// "draftCompleted" so the rest of the app (Game Day, season schedule,
// playoffs, etc.) unlocks. Idempotent.
router.post('/complete', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if ((user.team.players || []).length < ROSTER_SIZE) {
      return res.status(400).json({
        error: `Need ${ROSTER_SIZE} players to start the season (have ${user.team.players.length})`,
      });
    }
    user.draftCompleted = true;
    await user.save();
    res.json({ message: 'Roster locked — head to Game Day', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
