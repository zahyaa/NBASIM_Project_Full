const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { calculateRating, calculateRatingFromProfile } = require('../services/playerRating');
const { fetchSeasonAverages, CURRENT_SEASON } = require('./nba');
const {
  isValidConferenceDivision,
  tierForCity,
  generateCpuTeams,
  distributePlayersToCpuTeams,
  shuffle,
  awardRewards,
} = require('../services/fantasyGM');
const router = express.Router();

const STARTING_TOKENS = 500;

const API_BASE = 'https://api.balldontlie.io/v1';
function apiHeaders() {
  return { Authorization: process.env.BALLDONTLIE_API_KEY };
}

// Synthetic active D-League (G League) player pool. balldontlie.io's free
// tier doesn't expose D-League rosters, so we supplement the API pool with
// a stable 80-player generator so a 30-team × 15-round draft (450 picks)
// always has enough talent to draw from. IDs start at 10_000_000 so they
// never collide with real NBA player ids.
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
      id: 10_000_000 + i,                     // never collides with real NBA ids
      firstName: first,
      lastName: `${last}${i < DLEAGUE_FIRST_NAMES.length ? '' : ' Jr.'}`,
      position: positions[i % positions.length],
      team: DLEAGUE_TEAMS[i % DLEAGUE_TEAMS.length],
      league: 'D-League',
      // Ratings range 58-78 — D-League tier sits below NBA active stars.
      rating: 58 + (i * 3) % 21,
      stats: null,
    });
  }
  return out;
}

// POST /api/draft/setup — save conference, division, league, city, coach, draft type.
// Awards starting tokens (once) and generates the rest of the CPU league so
// Store + Team Management can unlock immediately.
router.post('/setup', auth, async (req, res) => {
  try {
    const { conference, division, league, city, coach, teamName, draftType } = req.body;
    if (!conference || !league) {
      return res.status(400).json({ error: 'Conference and league are required' });
    }
    // Fantasy mode requires a valid conference/division pair (NBA-style).
    if (draftType === 'fantasy' || !draftType) {
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
        return res.status(400).json({ error: 'A valid US city (Tier I, II, or III) is required' });
      }
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.conference = conference;
    user.league = league;
    if (city) {
      user.team.city = String(city).slice(0, 50);
      user.team.marketTier = tierForCity(city);
    }
    if (coach) user.team.coach = String(coach).slice(0, 60);
    if (division) user.team.division = String(division).slice(0, 30);
    if (teamName) user.team.name = String(teamName).slice(0, 50);
    if (draftType) user.draftType = draftType;
    user.gameMode = draftType === 'season' ? 'season' : 'fantasy';

    // First-time fantasy setup: award starting tokens + generate CPU league.
    if ((draftType === 'fantasy' || !draftType) && !user.draftStarted) {
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
      message: 'Setup saved',
      conference,
      division,
      league,
      tokens: user.tokens,
      cpuTeamCount: user.cpuTeams.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/draft/pool?season=2025 — get draft-eligible players.
// Returns NBA active + synthetic D-League active players, league-wide
// (no conference filter; the user can draft anyone).
router.get('/pool', auth, async (req, res) => {
  try {
    const season = Number(req.query.season) || CURRENT_SEASON;

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

    const pool = [...nbaPool, ...generateDLeaguePool()]
      .sort((a, b) => b.rating - a.rating);

    res.json(pool);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch draft pool', details: err.message });
  }
});

// POST /api/draft/pick — user drafts a player.
// Teams may now draft the SAME player as another team — the differentiator
// is what each team buys at the Store. We only block duplicates within the
// user's own 15-player roster.
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

    if (user.team.players.length >= 15) {
      return res.status(400).json({ error: 'Roster full (15 players max)' });
    }

    // Per-team uniqueness only — the user can't draft the same player twice
    // onto their own roster, but other teams may also have that player.
    const owned = new Set(user.team.players.map(p => p.playerId));
    if (owned.has(playerId)) {
      return res.status(400).json({ error: 'Already on your roster' });
    }

    user.team.players.push({ playerId, firstName, lastName, position, rating, stats });

    // Auto-complete when the user roster is full (15 players).
    if (user.team.players.length >= 15) {
      user.draftCompleted = true;
    }

    // Achievement hook (e.g. "Star on the Roster", "Deep Roster").
    const rewards = awardRewards(user);
    await user.save();
    res.json({
      message: 'Player drafted',
      team: user.team,
      tokens: user.tokens,
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/draft/cpu-pick — "on the clock" single CPU pick.
// Body: { teamName, pool: [...] }
// Picks the best-rated remaining player not already drafted by anyone, and
// assigns them to the named CPU team. Returns the picked player.
router.post('/cpu-pick', auth, async (req, res) => {
  try {
    const { teamName, pool } = req.body || {};
    if (!teamName) return res.status(400).json({ error: 'teamName required' });
    if (!Array.isArray(pool)) return res.status(400).json({ error: 'pool[] required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cpu = user.cpuTeams.find(t => t.name === teamName);
    if (!cpu) return res.status(404).json({ error: 'CPU team not found' });
    if (cpu.players.length >= 15) return res.status(400).json({ error: 'CPU roster already full' });

    // Per-team uniqueness only: the same player CAN appear on multiple teams.
    const owned = new Set(cpu.players.map(p => p.playerId));

    // CPU prefers higher-rated available players, with mild noise so the
    // top of the pool isn't picked perfectly in order every time.
    const available = pool.filter(p => !owned.has(p.id));
    if (!available.length) return res.status(400).json({ error: 'Pool exhausted' });
    const top = available
      .slice()
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 5); // top 5 candidates
    const pick = top[Math.floor(Math.random() * top.length)];

    cpu.players.push({
      playerId: pick.id,
      firstName: pick.firstName,
      lastName: pick.lastName,
      position: pick.position,
      rating: pick.rating,
      stats: pick.stats,
      contract: { years: 1 + Math.floor(Math.random() * 4), salary: Math.round((pick.rating || 70) * 0.5) },
    });
    user.markModified('cpuTeams');
    await user.save();
    res.json({ message: 'CPU picked', pick, teamName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// CPU teams so every franchise has 12 players and nothing collides with the
// user's roster. Called by the client right after the user finishes drafting.
// Also accepted standalone so tests can populate the CPU league.
router.post('/cpu-fill', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.cpuTeams || user.cpuTeams.length === 0) {
      return res.status(400).json({ error: 'CPU teams not generated yet — complete /api/draft/setup first' });
    }
    const pool = Array.isArray(req.body?.pool) ? req.body.pool : [];
    if (pool.length === 0) return res.status(400).json({ error: 'pool[] is required' });

    // Each CPU team draws independently — duplicates across teams are now allowed.
    distributePlayersToCpuTeams({
      cpuTeams: user.cpuTeams,
      pool,
    });
    user.markModified('cpuTeams');
    await user.save();
    res.json({ message: 'CPU teams populated', cpuTeamCount: user.cpuTeams.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/draft/sim-all — assistant GM fills the user's 15-player roster
// with best-available picks and runs cpu-fill in one shot, then marks the
// draft complete. Lets the user skip the entire on-the-clock experience.
router.post('/sim-all', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftStarted) return res.status(403).json({ error: 'Run /api/draft/setup first' });
    if (user.draftCompleted) return res.json({ message: 'Already complete', team: user.team });
    if (!user.cpuTeams || user.cpuTeams.length === 0) {
      return res.status(400).json({ error: 'CPU teams missing — complete /api/draft/setup first' });
    }
    const pool = Array.isArray(req.body?.pool) ? req.body.pool : [];
    if (pool.length === 0) return res.status(400).json({ error: 'pool[] is required' });

    // Fill the user's roster best-available, skipping anything already on
    // their roster (cross-team duplicates are allowed elsewhere).
    const ownedByUser = new Set((user.team.players || []).map(p => p.playerId));
    const sorted = pool.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    for (const p of sorted) {
      if (user.team.players.length >= 15) break;
      if (ownedByUser.has(p.id)) continue;
      ownedByUser.add(p.id);
      user.team.players.push({
        playerId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        rating: p.rating,
        stats: p.stats,
      });
    }

    // Fill every CPU roster from the same pool (per-team uniqueness only).
    distributePlayersToCpuTeams({ cpuTeams: user.cpuTeams, pool });
    user.markModified('cpuTeams');

    user.draftCompleted = true;
    const rewards = awardRewards(user);
    await user.save();
    res.json({
      message: 'Draft simulated',
      team: user.team,
      tokens: user.tokens,
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/draft/complete — manually complete draft.
router.post('/complete', auth, async (req, res) => {
  try {
    const { teamName } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const requiredCount = (user.draftType === 'fantasy' || !user.draftType) ? 15 : 5;
    if (user.team.players.length < requiredCount) {
      return res.status(400).json({ error: `Need ${requiredCount} players to complete the draft (have ${user.team.players.length})` });
    }

    if (teamName) user.team.name = String(teamName).slice(0, 50);
    user.draftCompleted = true;
    await user.save();
    res.json({ message: 'Draft completed', team: user.team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/draft/meta — static reference data the client uses to drive the
// setup wizard (cities by tier, divisions per conference, coach list).
router.get('/meta', auth, async (req, res) => {
  const { CITY_TIERS, DIVISIONS, NBA_COACHES, STORE_ITEMS } = require('../services/fantasyGM');
  res.json({ cityTiers: CITY_TIERS, divisions: DIVISIONS, coaches: NBA_COACHES, storeItems: STORE_ITEMS });
});

// GET /api/draft/order — snake-order draft for the live "on the clock"
// experience. 30 teams × 15 rounds = 450 picks. Round 1 goes 1..30, round 2
// reverses 30..1, and so on. The user is randomly slotted somewhere in the
// first round so they aren't always picking first.
router.get('/order', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftStarted) return res.status(403).json({ error: 'Run /api/draft/setup first' });
    if (!user.cpuTeams.length) return res.status(400).json({ error: 'No CPU teams' });

    const userTeamName = user.team.name || 'My Team';
    // Pre-draft lottery slot drives the user's position. If they haven't
    // run /api/draft/lottery yet, default to the back of the line so the
    // order endpoint never hard-fails.
    const userSlot = (user.lotteryPosition && user.lotteryPosition >= 1)
      ? user.lotteryPosition - 1
      : 29;

    const teamsRound1 = [];
    let inserted = false;
    for (let i = 0; i < 30; i++) {
      if (i === userSlot) { teamsRound1.push(userTeamName); inserted = true; }
      else {
        const cpuIdx = inserted ? i - 1 : i;
        teamsRound1.push(user.cpuTeams[cpuIdx]?.name);
      }
    }

    const order = [];
    const ROUNDS = 15;
    for (let r = 0; r < ROUNDS; r++) {
      const seq = r % 2 === 0 ? teamsRound1 : [...teamsRound1].reverse();
      seq.forEach((teamName, j) => {
        order.push({
          pickNumber: r * 30 + j + 1,
          round: r + 1,
          slot: j + 1,
          teamName,
          isUser: teamName === userTeamName,
        });
      });
    }

    res.json({ userTeamName, userSlot: userSlot + 1, totalPicks: order.length, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/draft/lottery — randomize the user's draft slot (1..30).
// Awards token bonuses and may unlock the "Lottery Winner" / "Top-5" achievements.
// Idempotent: if the user has already drawn a slot, return the existing one.
router.post('/lottery', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.draftStarted) return res.status(403).json({ error: 'Run /api/draft/setup first' });
    if (user.draftCompleted) return res.status(400).json({ error: 'Draft already completed' });

    if (user.lotteryPosition && user.lotteryPosition >= 1) {
      return res.json({
        message: 'Lottery already drawn',
        lotteryPosition: user.lotteryPosition,
        tokens: user.tokens,
        tokensAwarded: 0,
        newAchievements: [],
      });
    }

    user.lotteryPosition = 1 + Math.floor(Math.random() * 30);
    // Run reward hook so "Lottery Winner" / "Top-5" achievements + tokens fire.
    const rewards = awardRewards(user);
    await user.save();
    res.json({
      message: 'Lottery complete',
      lotteryPosition: user.lotteryPosition,
      tokens: user.tokens,
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/draft/headshot?first=&last= — best-effort player headshot URL.
// Lazily resolves via ESPN search (cached for 24h in-process). Returns
// `{ url: null }` on any failure so the client can fall back to initials.
const { getPlayerPhotoUrl } = require('../services/playerPhoto');
router.get('/headshot', auth, async (req, res) => {
  try {
    const first = String(req.query.first || '').trim();
    const last = String(req.query.last || '').trim();
    if (!first || !last) return res.status(400).json({ error: 'first & last required' });
    const url = await getPlayerPhotoUrl(first, last);
    res.json({ url: url || null });
  } catch (_err) {
    res.json({ url: null });
  }
});

module.exports = router;
