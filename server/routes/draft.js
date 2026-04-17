const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { calculateRating, calculateRatingFromProfile } = require('../services/playerRating');
const router = express.Router();

const API_BASE = 'https://api.balldontlie.io/v1';
function apiHeaders() {
  return { Authorization: process.env.BALLDONTLIE_API_KEY };
}

// POST /api/draft/setup — save conference & league selection
router.post('/setup', auth, async (req, res) => {
  try {
    const { conference, league } = req.body;
    if (!conference || !league) {
      return res.status(400).json({ error: 'Conference and league are required' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.conference = conference;
    user.league = league;
    await user.save();
    res.json({ message: 'Setup saved', conference, league });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/draft/pool?season=2024 — get draft-eligible players
router.get('/pool', auth, async (req, res) => {
  try {
    const season = req.query.season || 2024;
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

    // Fetch a large set of players
    const { data: playersData } = await axios.get(`${API_BASE}/players`, {
      headers: apiHeaders(),
      params: { per_page: 100 },
    });
    const players = playersData.data;

    // Try to get season averages (works on paid tiers only)
    let statsMap = {};
    try {
      const qs = players.map(p => `player_ids[]=${p.id}`).join('&');
      const { data: statsData } = await axios.get(
        `${API_BASE}/season_averages?season=${Number(season)}&${qs}`,
        { headers: apiHeaders() }
      );
      for (const sa of statsData.data) {
        statsMap[sa.player_id] = sa;
      }
    } catch {
      // Free tier — season_averages not available, use profile-based ratings
    }

    const pool = players
      .filter(p => p.team && teamIds.has(p.team.id)) // only players on teams in selected conference
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
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.team.players.length < 5) {
      return res.status(400).json({ error: 'Need at least 5 players to complete draft' });
    }

    user.draftCompleted = true;
    await user.save();
    res.json({ message: 'Draft completed', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
