const express = require('express');
const axios = require('axios');
const { calculateRating, calculateRatingFromProfile } = require('../services/playerRating');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

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

// GET /api/nba/players/search?q=LeBron — search players by name
router.get('/players/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Search query required' });
    const params = { search: q, per_page: 50 };
    if (req.query.cursor) params.cursor = Number(req.query.cursor);
    const { data } = await axios.get(`${API_BASE}/players`, { headers: apiHeaders(), params });

    const players = data.data.map(p => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position || 'N/A',
      team: p.team ? p.team.full_name : 'Free Agent',
      teamId: p.team ? p.team.id : null,
      rating: calculateRatingFromProfile(p),
      height: p.height,
      weight: p.weight,
      jersey: p.jersey_number,
      country: p.country,
      draftYear: p.draft_year,
      draftRound: p.draft_round,
      draftNumber: p.draft_number,
    }));
    res.json({ data: players, meta: data.meta });
  } catch (err) {
    res.status(502).json({ error: 'Failed to search players', details: err.message });
  }
});

// GET /api/nba/players/:id/bio — full player profile + career stats
router.get('/players/:id/bio', async (req, res) => {
  try {
    const { data: playerData } = await axios.get(`${API_BASE}/players/${req.params.id}`, {
      headers: apiHeaders(),
    });
    const player = playerData.data;

    // Try to get current season stats
    let seasonAvg = null;
    try {
      const { data: statsData } = await axios.get(
        `${API_BASE}/season_averages?season=2024&player_ids[]=${player.id}`,
        { headers: apiHeaders() }
      );
      seasonAvg = statsData.data[0] || null;
    } catch { /* free tier fallback */ }

    res.json({
      id: player.id,
      firstName: player.first_name,
      lastName: player.last_name,
      position: player.position || 'N/A',
      team: player.team ? player.team.full_name : 'Free Agent',
      conference: player.team ? player.team.conference : '',
      height: player.height,
      weight: player.weight,
      jersey: player.jersey_number,
      country: player.country,
      draftYear: player.draft_year,
      draftRound: player.draft_round,
      draftNumber: player.draft_number,
      rating: seasonAvg ? calculateRating(seasonAvg) : calculateRatingFromProfile(player),
      seasonAverage: seasonAvg,
    });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch player bio', details: err.message });
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
