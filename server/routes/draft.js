const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { calculateRating, calculateRatingFromProfile } = require('../services/playerRating');
const { fetchSeasonAverages, CURRENT_SEASON } = require('./nba');
const router = express.Router();

const API_BASE = 'https://api.balldontlie.io/v1';
function apiHeaders() {
  return { Authorization: process.env.BALLDONTLIE_API_KEY };
}

// POST /api/draft/setup — save conference, league, city, coach, draft type
router.post('/setup', auth, async (req, res) => {
  try {
    const { conference, league, city, coach, draftType } = req.body;
    if (!conference || !league) {
      return res.status(400).json({ error: 'Conference and league are required' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.conference = conference;
    user.league = league;
    if (city) user.team.city = String(city).slice(0, 50);
    if (coach) user.team.coach = String(coach).slice(0, 60);
    if (draftType) user.draftType = draftType;
    user.gameMode = draftType === 'season' ? 'season' : 'fantasy';
    await user.save();
    res.json({ message: 'Setup saved', conference, league });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/draft/pool?season=2025 — get draft-eligible players
router.get('/pool', auth, async (req, res) => {
  try {
    const season = Number(req.query.season) || CURRENT_SEASON;
    const conference = req.query.conference || '';

    // Fetch all teams to know conference membership
    const { data: teamsData } = await axios.get(`${API_BASE}/teams`, {
      headers: apiHeaders(),
    });
    let teams = teamsData.data;
    if (conference) {
      teams = teams.filter(t => t.conference === conference);
    }
    const teamIds = new Set(teams.map(t => t.id));

    // Paid tier: paginate through active players to build a comprehensive pool.
    const players = [];
    let cursor;
    const MAX_PAGES = 10; // up to ~1000 active players, plenty for a draft pool
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = { per_page: 100 };
      if (cursor) params.cursor = cursor;
      let playersData;
      try {
        ({ data: playersData } = await axios.get(`${API_BASE}/players/active`, {
          headers: apiHeaders(),
          params,
        }));
      } catch {
        // Fallback to /players if /players/active is not enabled on this plan.
        ({ data: playersData } = await axios.get(`${API_BASE}/players`, {
          headers: apiHeaders(),
          params,
        }));
      }
      players.push(...(playersData.data || []));
      cursor = playersData.meta?.next_cursor;
      if (!cursor) break;
    }

    // Paid tier: fetch season averages for the full pool (chunked).
    const statsMap = await fetchSeasonAverages(players.map(p => p.id), season);

    const pool = players
      .filter(p => p.team && teamIds.has(p.team.id))
      .map(p => {
        const sa = statsMap[p.id] || null;
        return {
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          position: p.position || 'N/A',
          team: p.team ? p.team.full_name : 'Free Agent',
          rating: sa ? calculateRating(sa) : calculateRatingFromProfile(p),
          stats: sa,
        };
      })
      .sort((a, b) => b.rating - a.rating);

    res.json(pool);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch draft pool', details: err.message });
  }
});

// POST /api/draft/pick — user drafts a player
router.post('/pick', auth, async (req, res) => {
  try {
    const { playerId, firstName, lastName, position, rating, stats } = req.body;
    if (!playerId || !firstName || !lastName) {
      return res.status(400).json({ error: 'Player info required' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.draftCompleted) {
      return res.status(400).json({ error: 'Draft already completed' });
    }

    if (user.team.players.length >= 12) {
      return res.status(400).json({ error: 'Roster full (12 players max)' });
    }

    // Prevent duplicate picks
    const alreadyDrafted = user.team.players.some(p => p.playerId === playerId);
    if (alreadyDrafted) {
      return res.status(400).json({ error: 'Player already on your roster' });
    }

    user.team.players.push({ playerId, firstName, lastName, position, rating, stats });

    // Auto-complete draft when roster is full
    if (user.team.players.length >= 12) {
      user.draftCompleted = true;
    }

    await user.save();
    res.json({ message: 'Player drafted', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/draft/complete — manually complete draft early
router.post('/complete', auth, async (req, res) => {
  try {
    const { teamName } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.team.players.length < 5) {
      return res.status(400).json({ error: 'Need at least 5 players to complete draft' });
    }

    if (teamName) user.team.name = String(teamName).slice(0, 50);
    user.draftCompleted = true;
    await user.save();
    res.json({ message: 'Draft completed', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
