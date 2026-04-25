const express = require('express');
const axios = require('axios');
const { calculateRating, calculateRatingFromProfile, getPlayerEra } = require('../services/playerRating');
const { getTeamLogoUrl, getTeamLogoEspn } = require('../services/nbaImages');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

const API_BASE = 'https://api.balldontlie.io/v1';

// Current NBA regular season (the season *starting* in this calendar year).
// balldontlie uses the start year, e.g. season=2025 means the 2025-26 season.
const CURRENT_SEASON = Number(process.env.BALLDONTLIE_SEASON) ||
  (new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1);

function apiHeaders() {
  return { Authorization: process.env.BALLDONTLIE_API_KEY };
}

// Paid-tier helper: fetch season averages for a batch of player ids,
// chunking to respect per-request id limits, and return a {playerId: stats} map.
async function fetchSeasonAverages(playerIds, season = CURRENT_SEASON) {
  const map = {};
  if (!playerIds || !playerIds.length) return map;
  const CHUNK = 25;
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK);
    const qs = chunk.map(id => `player_ids[]=${id}`).join('&');
    try {
      const { data } = await axios.get(
        `${API_BASE}/season_averages?season=${Number(season)}&${qs}`,
        { headers: apiHeaders() }
      );
      for (const sa of data.data || []) map[sa.player_id] = sa;
    } catch (err) {
      console.warn('[nba] season_averages chunk failed:', err.response?.status || err.message);
    }
  }
  return map;
}

// GET /api/nba/teams — all NBA teams
router.get('/teams', async (req, res) => {
  try {
    const { data } = await axios.get(`${API_BASE}/teams`, { headers: apiHeaders() });
    const teams = data.data.map(t => ({
      ...t,
      logo: getTeamLogoUrl(t.id),
      logoEspn: getTeamLogoEspn(t.id),
    }));
    res.json(teams);
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

    // Paid tier: enrich search results with current-season averages.
    const statsMap = await fetchSeasonAverages(data.data.map(p => p.id));

    const players = data.data.map(p => {
      const sa = statsMap[p.id] || null;
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        position: p.position || 'N/A',
        team: p.team ? p.team.full_name : 'Free Agent',
        teamId: p.team ? p.team.id : null,
        teamLogo: p.team ? getTeamLogoEspn(p.team.id) : null,
        rating: sa ? calculateRating(sa) : calculateRatingFromProfile(p),
        stats: sa,
        height: p.height,
        weight: p.weight,
        jersey: p.jersey_number,
        country: p.country,
        draftYear: p.draft_year,
        draftRound: p.draft_round,
        draftNumber: p.draft_number,
        era: getPlayerEra(p.draft_year),
      };
    });
    res.json({ data: players, meta: data.meta });
  } catch (err) {
    res.status(502).json({ error: 'Failed to search players', details: err.message });
  }
});

// GET /api/nba/players/:id/bio — full player profile + career stats
router.get('/players/:id/bio', async (req, res) => {
  try {
    const season = Number(req.query.season) || CURRENT_SEASON;
    const { data: playerData } = await axios.get(`${API_BASE}/players/${req.params.id}`, {
      headers: apiHeaders(),
    });
    const player = playerData.data;

    // Paid tier: pull current-season averages directly.
    let seasonAvg = null;
    try {
      const { data: statsData } = await axios.get(
        `${API_BASE}/season_averages?season=${season}&player_ids[]=${player.id}`,
        { headers: apiHeaders() }
      );
      seasonAvg = statsData.data[0] || null;
    } catch (err) {
      console.warn('[nba] bio season_averages failed:', err.response?.status || err.message);
    }

    res.json({
      id: player.id,
      firstName: player.first_name,
      lastName: player.last_name,
      position: player.position || 'N/A',
      team: player.team ? player.team.full_name : 'Free Agent',
      teamId: player.team ? player.team.id : null,
      teamLogo: player.team ? getTeamLogoEspn(player.team.id) : null,
      conference: player.team ? player.team.conference : '',
      height: player.height,
      weight: player.weight,
      jersey: player.jersey_number,
      country: player.country,
      draftYear: player.draft_year,
      draftRound: player.draft_round,
      draftNumber: player.draft_number,
      rating: seasonAvg ? calculateRating(seasonAvg) : calculateRatingFromProfile(player),
      era: getPlayerEra(player.draft_year),
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
    const params = { per_page: Math.min(100, Number(per_page)) };
    if (team_id) params['team_ids[]'] = Number(team_id);
    if (cursor) params.cursor = Number(cursor);

    const { data } = await axios.get(`${API_BASE}/players`, { headers: apiHeaders(), params });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch players', details: err.message });
  }
});

// GET /api/nba/players/:id/stats?season=2025 — season averages for one player
router.get('/players/:id/stats', async (req, res) => {
  try {
    const season = Number(req.query.season) || CURRENT_SEASON;
    const { data } = await axios.get(
      `${API_BASE}/season_averages?season=${season}&player_ids[]=${Number(req.params.id)}`,
      { headers: apiHeaders() }
    );

    const avg = data.data[0];
    const rating = avg ? calculateRating(avg) : 50;
    res.json({ seasonAverage: avg || null, rating });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch player stats', details: err.message });
  }
});

// GET /api/nba/roster?team_id=1&season=2025 — full roster with ratings
router.get('/roster', async (req, res) => {
  try {
    const { team_id } = req.query;
    const season = Number(req.query.season) || CURRENT_SEASON;
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });

    const { data: playersData } = await axios.get(`${API_BASE}/players`, {
      headers: apiHeaders(),
      params: { 'team_ids[]': Number(team_id), per_page: 100 },
    });
    const players = playersData.data;

    // Paid tier: pull season averages for the whole roster.
    const statsMap = await fetchSeasonAverages(players.map(p => p.id), season);

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
module.exports.fetchSeasonAverages = fetchSeasonAverages;
module.exports.CURRENT_SEASON = CURRENT_SEASON;
