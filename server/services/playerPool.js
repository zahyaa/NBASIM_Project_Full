// Shared player-pool builder. Originally this lived inline inside the
// /api/draft/pool route — extracted so the new card-pack flow can reuse
// the same NBA + synthetic D-League + rookie data without duplicating
// the balldontlie pagination logic.

const axios = require('axios');
const { calculateRating, calculateRatingFromProfile } = require('./playerRating');
const { fetchSeasonAverages, CURRENT_SEASON } = require('../routes/nba');

const API_BASE = 'https://api.balldontlie.io/v1';
function apiHeaders() {
  return { Authorization: process.env.BALLDONTLIE_API_KEY };
}

const DLEAGUE_FIRST_NAMES = [
  'Marcus', 'Tyler', 'Jordan', 'Bryce', 'Kameron', 'Devonte', 'Trevon',
  'Quincy', 'Isaiah', 'Cameron', 'Khalil', 'Jalen', 'Jaden', 'Trey',
  'Damion', 'Brandon', 'Anthony', 'Justin', 'Caleb', 'Dakota', 'Mason',
  'Tre', 'Demarcus', 'Reggie', 'Tariq', 'Omari', 'Xavier', 'Donovan',
  'Lamar', 'Antoine',
];
const DLEAGUE_LAST_NAMES = [
  'Washington', 'Hill', 'Thompson', 'Scott', 'Reed', 'Banks', 'Carter',
  'Mitchell', 'Bell', 'Hayes', 'Walker', 'Wright', 'Ellis', 'Bryant',
  'Robinson', 'Knight', 'Powell', 'Jenkins', 'Hampton', 'Castle',
  'Rivera', 'Beasley', 'Russell', 'Foster', 'McGee', 'Quinn', 'Boyd',
  'Davies', 'Childs', 'Holman',
];
const DLEAGUE_TEAMS = [
  'Sioux Falls Skyforce', 'Maine Celtics', 'Long Island Nets',
  'Westchester Knicks', 'Delaware Blue Coats', 'Capital City Go-Go',
  'Greensboro Swarm', 'College Park Skyhawks', 'Birmingham Squadron',
  'Raptors 905', 'Wisconsin Herd', 'Memphis Hustle', 'Iowa Wolves',
  'Oklahoma City Blue', 'Texas Legends', 'Austin Spurs',
  'South Bay Lakers', 'Stockton Kings', 'Santa Cruz Warriors',
  'Salt Lake City Stars', 'Rip City Remix', 'Valley Suns',
];

function generateDLeaguePool(count = 80) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const first = DLEAGUE_FIRST_NAMES[i % DLEAGUE_FIRST_NAMES.length];
    const last = DLEAGUE_LAST_NAMES[(i * 7) % DLEAGUE_LAST_NAMES.length];
    const positions = ['G', 'G-F', 'F', 'F-C', 'C'];
    out.push({
      id: 10_000_000 + i,
      firstName: first,
      lastName: `${last}${i < DLEAGUE_FIRST_NAMES.length ? '' : ' Jr.'}`,
      position: positions[i % positions.length],
      team: DLEAGUE_TEAMS[i % DLEAGUE_TEAMS.length],
      league: 'D-League',
      rating: 58 + (i * 3) % 21,
      stats: null,
    });
  }
  return out;
}

// Build the master player pool: NBA active + season averages, synthetic
// D-League, and the user's pending rookie class. The caller is
// responsible for filtering out already-claimed ids.
async function buildPlayerPool(user, { season = CURRENT_SEASON } = {}) {
  const players = [];
  let cursor;
  const MAX_PAGES = 10;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { per_page: 100 };
    if (cursor) params.cursor = cursor;
    let playersData;
    try {
      ({ data: playersData } = await axios.get(`${API_BASE}/players/active`, {
        headers: apiHeaders(), params,
      }));
    } catch {
      ({ data: playersData } = await axios.get(`${API_BASE}/players`, {
        headers: apiHeaders(), params,
      }));
    }
    players.push(...(playersData.data || []));
    cursor = playersData.meta?.next_cursor;
    if (!cursor) break;
  }

  const statsMap = await fetchSeasonAverages(players.map(p => p.id), season);

  const nbaPool = players
    .filter(p => p.team)
    .map(p => {
      const sa = statsMap[p.id] || null;
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        position: p.position || 'N/A',
        team: p.team ? p.team.full_name : 'Free Agent',
        league: 'NBA',
        rating: sa ? calculateRating(sa) : calculateRatingFromProfile(p),
        stats: sa,
      };
    });

  const rookiePool = (user?.rookieClass || []).map(r => ({
    id: r.playerId,
    firstName: r.firstName,
    lastName: r.lastName,
    position: r.position,
    team: `${r.school} (R)`,
    league: 'Rookie',
    rating: r.rating,
    stats: null,
    isRookie: true,
  }));

  return [...nbaPool, ...generateDLeaguePool(), ...rookiePool];
}

// Set of player ids already on the user's team OR any CPU team. Used to
// enforce league-wide one-player-one-team uniqueness everywhere.
function claimedIdsFromUser(user) {
  const s = new Set();
  if (!user) return s;
  (user.team?.players || []).forEach(p => s.add(p.playerId));
  (user.cpuTeams || []).forEach(t => (t.players || []).forEach(p => s.add(p.playerId)));
  return s;
}

module.exports = { buildPlayerPool, generateDLeaguePool, claimedIdsFromUser };
