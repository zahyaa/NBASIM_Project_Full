const express = require('express');
const axios = require('axios');
const { calculateRating, calculateRatingFromProfile } = require('../services/playerRating');
const router = express.Router();

const API_BASE = 'https://api.balldontlie.io/v1';

function apiHeaders() {
  return { Authorization: process.env.BALLDONTLIE_API_KEY };
}

// GET /api/nba/teams — all NBA teams
router.get('/teams', async (req, res) => {
  try {
    const { data } = await axios.get(`${API_BASE}/teams`, { headers: apiHeaders() });
    res.json(data.data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch teams from NBA API', details: err.message });
  }
});

// GET /api/nba/players?team_id=1&per_page=25 — players on a team
router.get('/players', async (req, res) => {
  try {
    const { team_id, per_page = 25, cursor } = req.query;
    const params = { per_page: Number(per_page) };
    if (team_id) params.team_ids = [Number(team_id)];
    if (cursor) params.cursor = Number(cursor);

    const { data } = await axios.get(`${API_BASE}/players`, { headers: apiHeaders(), params });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch players', details: err.message });
  }
});

// GET /api/nba/players/:id/stats?season=2024 — season averages for one player
router.get('/players/:id/stats', async (req, res) => {
  try {
    const season = req.query.season || 2024;
    const { data } = await axios.get(
      `${API_BASE}/season_averages?season=${Number(season)}&player_ids[]=${Number(req.params.id)}`,
      { headers: apiHeaders() }
    );

    const avg = data.data[0];
    const rating = avg ? calculateRating(avg) : 50;
    res.json({ seasonAverage: avg || null, rating });
  } catch (err) {
    // Free tier fallback — fetch player profile and rate from draft data
    try {
      const { data: playerData } = await axios.get(`${API_BASE}/players/${req.params.id}`, {
        headers: apiHeaders(),
      });
      const player = playerData.data;
      res.json({ seasonAverage: null, rating: calculateRatingFromProfile(player) });
    } catch (innerErr) {
      res.status(502).json({ error: 'Failed to fetch player stats', details: err.message });
    }
  }
});

// GET /api/nba/roster?team_id=1&season=2024 — full roster with ratings
router.get('/roster', async (req, res) => {
  try {
    const { team_id, season = 2024 } = req.query;
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });

    // Fetch players on team (free tier)
    const { data: playersData } = await axios.get(`${API_BASE}/players`, {
      headers: apiHeaders(),
      params: { 'team_ids[]': Number(team_id), per_page: 25 },
    });
    const players = playersData.data;

    // Try season averages (paid tier), fall back to profile ratings
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
      // Free tier — season_averages not available
    }

    const roster = players.map(p => {
      const sa = statsMap[p.id] || null;
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        position: p.position || 'N/A',
        rating: sa ? calculateRating(sa) : calculateRatingFromProfile(p),
        stats: sa,
      };
    });

    roster.sort((a, b) => b.rating - a.rating);
    res.json(roster);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch roster', details: err.message });
  }
});

module.exports = router;
