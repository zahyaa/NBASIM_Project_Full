// Season routes — 82-game schedule, simulate next game, standings,
// advance to the next season (5-year career arc), and reward hooks.
//
// Strategy: The user's "league" is fully self-contained on the user record
// (cpuTeams + cpuRecords + schedule). When the user plays a game, we run
// the full simulation against the chosen / scheduled CPU opponent. Other
// CPU vs CPU games for that "day" are resolved with the lightweight
// quickSimRecord() so standings keep moving.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const { simulateGame } = require('../services/simulation');
const {
  generateSchedule,
  quickSimRecord,
  awardRewards,
  shuffle,
  cpuFrontOfficeTick,
  applyLineup,
} = require('../services/fantasyGM');

// Mid-game play-call helpers (item 2). The user can pass a {offensive,
// defensive} pair via the play-next request body. CPU coach picks random
// named schemes so both sides always run a play.
const CPU_OFF = ['Horns Set', 'Pick & Roll', 'Spain Action', 'Princeton Offense', 'Triangle', 'Motion Strong', 'Iso Heavy', 'Hammer Action'];
const CPU_DEF = ['Man-to-Man', 'Switch 1-5', '2-3 Zone', '3-2 Zone', 'Drop Coverage', 'Half-Court Trap', 'Full-Court Press', 'Pack the Paint'];
function sanitizePlayCall(pc) {
  if (!pc || typeof pc !== 'object') return {};
  const trim = (s) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 60) : null);
  return { offensive: trim(pc.offensive), defensive: trim(pc.defensive) };
}
function randomCpuPlayCall() {
  return {
    offensive: CPU_OFF[Math.floor(Math.random() * CPU_OFF.length)],
    defensive: CPU_DEF[Math.floor(Math.random() * CPU_DEF.length)],
  };
}
const {
  gameRecap,
  generateTradeRumors,
  pushNews,
} = require('../services/news');

const router = express.Router();

const SEASON_GAMES = 82;
const MAX_CAREER_YEARS = 5;

// Find/create a CPU record entry by team name (cpuRecords is an array of
// { name, wins, losses } subdocs because Mongoose Map keys can't have ".").
function getCpuRecord(user, name) {
  let rec = user.cpuRecords.find(r => r.name === name);
  if (!rec) {
    rec = { name, wins: 0, losses: 0 };
    user.cpuRecords.push(rec);
    rec = user.cpuRecords[user.cpuRecords.length - 1];
  }
  return rec;
}

// Top up every CPU team's record to exactly SEASON_GAMES by simulating
// extra CPU-vs-CPU games. Without this, CPU teams play far fewer than 82
// games (the user's per-tick CPU batch only reaches a subset each game),
// which lets the user finish 4th at 20-62 — the standings looked broken
// because the rest of the league literally hadn't played 82 games.
function topUpCpuRecordsTo82(user) {
  const teams = user.cpuTeams;
  if (!teams.length) return;
  // Build a quick lookup by name for finding opponents.
  const byName = new Map(teams.map(t => [t.name, t]));
  // Sanity loop \u2014 cap iterations to avoid runaway in pathological data.
  let safety = teams.length * SEASON_GAMES * 4;
  let progress = true;
  while (progress && safety-- > 0) {
    progress = false;
    // Find teams still under 82 games.
    const under = teams
      .map(t => ({ t, rec: getCpuRecord(user, t.name) }))
      .filter(x => x.rec.wins + x.rec.losses < SEASON_GAMES);
    if (!under.length) break;
    // Shuffle so opponents vary; pair the most-behind team with another
    // under-82 team (or any team if none).
    const shuffled = shuffle(under);
    for (const { t: a, rec: ra } of shuffled) {
      if (ra.wins + ra.losses >= SEASON_GAMES) continue;
      // Prefer another under-82 team as opponent so we don't push anyone over.
      let opp = shuffled.find(x => x.t.name !== a.name && x.rec.wins + x.rec.losses < SEASON_GAMES);
      if (!opp) {
        // Fall back to any other team \u2014 still increments only `a`'s record
        // when the opponent is already at 82 to keep totals exact.
        const otherName = teams.find(tt => tt.name !== a.name)?.name;
        if (!otherName) break;
        opp = { t: byName.get(otherName), rec: getCpuRecord(user, otherName) };
      }
      const r = quickSimRecord(a, opp.t);
      const oppAtCap = opp.rec.wins + opp.rec.losses >= SEASON_GAMES;
      if (r.winner === 'A') {
        ra.wins += 1;
        if (!oppAtCap) opp.rec.losses += 1;
      } else {
        ra.losses += 1;
        if (!oppAtCap) opp.rec.wins += 1;
      }
      progress = true;
    }
  }
  user.markModified('cpuRecords');
}

function requireDraftCompleted(user, res) {
  if (!user.draftStarted) {
    res.status(403).json({ error: 'Locked — start a fantasy draft first' });
    return false;
  }
  if (!user.draftCompleted) {
    res.status(400).json({ error: 'Complete your 15-player draft before starting a season' });
    return false;
  }
  if ((user.cpuTeams || []).length === 0) {
    res.status(400).json({ error: 'No CPU teams found — restart the draft' });
    return false;
  }
  return true;
}

// Defensive top-up: ensure every CPU team has at least `minPlayers` players
// so `simulateGame` (which slices the first 5 and reads .playerId) can never
// crash on a partially-populated league. The live-draft ticker only fills
// 2-3 CPU rosters per user pick, and /api/draft/cpu-fill depends on a real
// draft pool that may have come back small. We patch any gaps here with
// auto-generated bench players unique to that franchise.
function ensureCpuRosters(user, minPlayers = 15) {
  const taken = new Set(
    (user.team?.players || []).map(p => p.playerId).filter(Boolean)
  );
  for (const t of user.cpuTeams) {
    for (const p of (t.players || [])) {
      if (p.playerId) taken.add(p.playerId);
    }
  }
  let nextId = 900000;
  const newId = () => {
    while (taken.has(nextId)) nextId += 1;
    taken.add(nextId);
    return nextId++;
  };
  let modified = false;
  for (const t of user.cpuTeams) {
    if (!Array.isArray(t.players)) t.players = [];
    // Backfill coachRating for legacy users whose CPU teams predate the
    // coach-playbook system. Random 7\u201310 with most at 8\u20139.
    if (t.coachRating == null) {
      const r = Math.random();
      t.coachRating = r < 0.15 ? 10 : r < 0.55 ? 9 : r < 0.9 ? 8 : 7;
      modified = true;
    }
    while (t.players.length < minPlayers) {
      const i = t.players.length + 1;
      t.players.push({
        playerId: newId(),
        firstName: t.name.split(' ')[0] || 'Bench',
        lastName: `Player ${i}`,
        position: ['G', 'F', 'C'][i % 3],
        rating: 60 + Math.floor(Math.random() * 20),
        contract: { years: 1, salary: 35 },
      });
      modified = true;
    }
  }
  if (modified) user.markModified('cpuTeams');
  return modified;
}

// POST /api/season/start — generate the 82-game schedule.
router.post('/start', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftCompleted(user, res)) return;

    ensureCpuRosters(user);
    user.schedule = generateSchedule({
      cpuTeams: user.cpuTeams,
      userTeam: { conference: user.conference, division: user.team?.division },
      games: SEASON_GAMES,
    });
    user.seasonWins = 0;
    user.seasonLosses = 0;
    // Reset CPU records for the new season.
    user.cpuRecords = user.cpuTeams.map(t => ({ name: t.name, wins: 0, losses: 0 }));
    await user.save();
    res.json({
      message: 'Season started',
      games: user.schedule.length,
      seasonNumber: user.seasonNumber,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/season/play-next — simulate the user's next scheduled game.
// Also auto-resolves a small batch of CPU vs CPU matchups so standings move.
router.post('/play-next', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftCompleted(user, res)) return;

    const game = user.schedule.find(g => !g.played);
    if (!game) return res.status(400).json({ error: 'Season complete — advance to next year' });

    ensureCpuRosters(user);

    const cpu = user.cpuTeams.find(t => t.name === game.opponent);
    if (!cpu) return res.status(500).json({ error: `Scheduled opponent "${game.opponent}" not found` });

    // Real simulation with full play-by-play / stats / shots / leaders.
    // applyLineup() puts the user's chosen starting 5 at the front so they
    // are the active unit in the simulation.
    const userPlayCall = sanitizePlayCall(req.body && req.body.playCall);
    const cpuPlayCall = randomCpuPlayCall();
    const result = simulateGame(
      applyLineup({ name: user.team.name, players: user.team.players, coachRating: 7 }),
      { name: cpu.name, players: cpu.players, coachRating: cpu.coachRating },
      {
        difficulty: user.difficulty,
        userSide: 'A',
        playCallA: userPlayCall,
        playCallB: cpuPlayCall,
      }
    );

    const userWon = result.winner === user.team.name;
    game.played = true;
    game.win = userWon;
    game.scoreUser = userWon ? result.scoreA : result.scoreB;
    game.scoreOpp = userWon ? result.scoreB : result.scoreA;
    user.markModified('schedule');

    if (userWon) { user.wins += 1; user.seasonWins += 1; }
    else { user.losses += 1; user.seasonLosses += 1; }

    // Update CPU record for this opponent (the loss/win they took here).
    const cpuRec = getCpuRecord(user, cpu.name);
    if (userWon) cpuRec.losses += 1; else cpuRec.wins += 1;

    // Resolve a few CPU-vs-CPU matchups so the rest of the league progresses.
    // Pick 6 random pairs that don't include the user's opponent again.
    const pool = shuffle(user.cpuTeams.filter(t => t.name !== cpu.name));
    for (let i = 0; i + 1 < Math.min(pool.length, 12); i += 2) {
      const a = pool[i], b = pool[i + 1];
      const r = quickSimRecord(a, b);
      const ra = getCpuRecord(user, a.name);
      const rb = getCpuRecord(user, b.name);
      if (r.winner === 'A') { ra.wins += 1; rb.losses += 1; }
      else { rb.wins += 1; ra.losses += 1; }
    }

    // Persist the box-score for this game (used by GamePage replay).
    const gameDoc = new Game({
      userId: req.userId,
      teamA: result.teamA,
      teamB: result.teamB,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      history: result.plays,
    });
    await gameDoc.save();
    user.gamesPlayed.push(gameDoc._id);

    // Push an AI-style headline summarizing this game.
    pushNews(user, gameRecap({ result, userTeam: user.team.name, seasonNumber: user.seasonNumber }));

    // Around the trade deadline (~game 50) drop a few rumor headlines once.
    if (game.gameNumber >= 50 && user.lastTradeRumorSeason !== user.seasonNumber) {
      generateTradeRumors(user, 4).forEach(n => pushNews(user, n));
      user.lastTradeRumorSeason = user.seasonNumber;
    }

    // Token + achievement rewards.
    const rewards = awardRewards(user);

    // CPU front office develops their rosters — makes the league harder
    // as the season progresses.
    cpuFrontOfficeTick(user);

    // If this was the user's 82nd (final) game, top up every CPU team to
    // 82 games so the final standings reflect a complete league season.
    const seasonFinished = user.schedule.length && user.schedule.every(g => g.played);
    if (seasonFinished) {
      topUpCpuRecordsTo82(user);
    }

    await user.save();
    res.json({
      ...result,
      gameNumber: game.gameNumber,
      seasonRecord: { wins: user.seasonWins, losses: user.seasonLosses },
      careerRecord: { wins: user.wins, losses: user.losses },
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
      tokens: user.tokens,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/season/standings — combined standings: user team + cpuTeams.
router.get('/standings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftCompleted(user, res)) return;

    // If the user has finished their 82 games but the CPU records don't all
    // sum to 82 (legacy data from before the top-up was wired in), fix it
    // now so the standings actually make sense.
    const userDone = user.schedule.length && user.schedule.every(g => g.played);
    if (userDone) {
      const allFull = user.cpuTeams.every(t => {
        const r = (user.cpuRecords || []).find(rr => rr.name === t.name);
        return r && (r.wins + r.losses) >= SEASON_GAMES;
      });
      if (!allFull) {
        topUpCpuRecordsTo82(user);
        await user.save();
      }
    }

    const rows = [{
      name: user.team.name || 'My Team',
      city: user.team.city,
      conference: user.conference,
      division: user.team.division,
      wins: user.seasonWins,
      losses: user.seasonLosses,
      isUser: true,
    }];
    for (const t of user.cpuTeams) {
      const rec = user.cpuRecords.find(r => r.name === t.name) || { wins: 0, losses: 0 };
      rows.push({
        name: t.name, city: t.city, conference: t.conference, division: t.division,
        wins: rec.wins, losses: rec.losses, isUser: false,
      });
    }
    rows.sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses));
    res.json({
      seasonNumber: user.seasonNumber,
      gamesPlayed: user.schedule.filter(g => g.played).length,
      gamesTotal: user.schedule.length,
      standings: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/season/simulate-rest — fast-forward through every remaining
// game in the season using quickSimRecord. Used by the "Sim Season" button
// in Fantasy GM. Returns the final standings + how many games were played.
router.post('/simulate-rest', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftCompleted(user, res)) return;

    ensureCpuRosters(user);

    const remaining = user.schedule.filter(g => !g.played);
    if (!remaining.length) return res.status(400).json({ error: 'Season already complete' });

    let played = 0;
    for (const game of remaining) {
      const cpu = user.cpuTeams.find(t => t.name === game.opponent);
      if (!cpu) continue;
      const r = quickSimRecord(user.team, cpu, undefined, { difficulty: user.difficulty, userSide: 'A' });
      const userWon = r.winner === 'A';
      game.played = true;
      game.win = userWon;
      game.scoreUser = userWon ? r.scoreA : r.scoreB;
      game.scoreOpp  = userWon ? r.scoreB : r.scoreA;
      if (userWon) { user.wins += 1; user.seasonWins += 1; }
      else { user.losses += 1; user.seasonLosses += 1; }
      const rec = getCpuRecord(user, cpu.name);
      if (userWon) rec.losses += 1; else rec.wins += 1;

      // Resolve a small CPU-vs-CPU batch each tick so league standings move.
      const pool = shuffle(user.cpuTeams.filter(t => t.name !== cpu.name)).slice(0, 8);
      for (let i = 0; i + 1 < pool.length; i += 2) {
        const a = pool[i], b = pool[i + 1];
        const rr = quickSimRecord(a, b);
        const ra = getCpuRecord(user, a.name), rb = getCpuRecord(user, b.name);
        if (rr.winner === 'A') { ra.wins += 1; rb.losses += 1; } else { rb.wins += 1; ra.losses += 1; }
      }

      // Add a one-line news entry every ~10 games to keep the feed alive.
      if (played % 10 === 0) {
        pushNews(user, {
          id: `sim_${Date.now()}_${played}`, kind: 'game',
          headline: `${user.team.name} ${userWon ? 'beat' : 'lose to'} ${cpu.name} ${game.scoreUser}-${game.scoreOpp}`,
          body: `Season simulation continues — record now ${user.seasonWins}-${user.seasonLosses}.`,
          seasonNumber: user.seasonNumber,
        });
      }
      played += 1;
      // CPU front office tick every few games during a season sim so
      // weaker teams gradually improve and the user faces stiffer
      // competition late in the year.
      if (played % 5 === 0) cpuFrontOfficeTick(user);
    }
    user.markModified('schedule');

    // Top up every CPU team to exactly 82 games so the standings actually
    // make sense (everyone played a full season, just like the real NBA).
    topUpCpuRecordsTo82(user);

    // Drop trade rumors once mid-season if not already.
    if (user.lastTradeRumorSeason !== user.seasonNumber) {
      generateTradeRumors(user, 4).forEach(n => pushNews(user, n));
      user.lastTradeRumorSeason = user.seasonNumber;
    }

    const rewards = awardRewards(user);
    await user.save();
    res.json({
      message: `Simulated ${played} games`,
      played,
      seasonRecord: { wins: user.seasonWins, losses: user.seasonLosses },
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
      tokens: user.tokens,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/season/schedule — raw schedule.
router.get('/schedule', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftCompleted(user, res)) return;
    res.json({
      seasonNumber: user.seasonNumber,
      schedule: user.schedule,
      seasonWins: user.seasonWins,
      seasonLosses: user.seasonLosses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/season/advance — finish the current season, archive it, and
// roll into the next year (up to MAX_CAREER_YEARS).
router.post('/advance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftCompleted(user, res)) return;

    if (user.schedule.length && user.schedule.some(g => !g.played)) {
      return res.status(400).json({
        error: 'Season is not finished',
        remaining: user.schedule.filter(g => !g.played).length,
      });
    }

    // Playoffs gate: once the regular season ends the user must run the
    // playoffs (or skip explicitly with ?skipPlayoffs=1). This is what
    // unlocks the "After season complete, enter playoff" flow from the
    // product spec.
    const skipPlayoffs = req.query.skipPlayoffs === '1' || req.body?.skipPlayoffs === true;
    if (!skipPlayoffs && user.playoffs?.started && !user.playoffs?.completed) {
      return res.status(400).json({ error: 'Finish the playoffs before advancing' });
    }

    // Compute user's playoff result for the career book.
    let playoffResult = '';
    if (user.playoffs?.completed) {
      const finals = user.playoffs.rounds?.[3]?.series?.[0];
      if (finals?.winner === user.team.name) playoffResult = 'champion';
      else if (finals && (finals.teamA?.name === user.team.name || finals.teamB?.name === user.team.name)) playoffResult = 'finalist';
      else if ((user.playoffs.rounds?.[2]?.series || []).some(s => s.teamA?.name === user.team.name || s.teamB?.name === user.team.name)) playoffResult = 'conf-finals';
      else if ((user.playoffs.rounds?.[1]?.series || []).some(s => s.teamA?.name === user.team.name || s.teamB?.name === user.team.name)) playoffResult = 'semis';
      else if ((user.playoffs.rounds?.[0]?.series || []).some(s => s.teamA?.name === user.team.name || s.teamB?.name === user.team.name)) playoffResult = 'first-round';
      else playoffResult = 'missed';
    } else if (user.playoffs?.started) {
      playoffResult = 'first-round';
    } else {
      playoffResult = 'missed';
    }

    // Champion = user has the most wins of all teams.
    let bestWins = user.seasonWins;
    user.cpuTeams.forEach(t => {
      const rec = user.cpuRecords.find(r => r.name === t.name) || { wins: 0 };
      if (rec.wins > bestWins) bestWins = rec.wins;
    });
    const champion = user.seasonWins >= bestWins;

    user.career.push({
      seasonNumber: user.seasonNumber,
      wins: user.seasonWins,
      losses: user.seasonLosses,
      champion,
      year: user.season,
      playoffResult,
    });

    // Reset playoffs + all-star + trade rumor flag for the new season.
    user.playoffs = { started: false, completed: false, seasonNumber: 0, rounds: [], champion: '', runnerUp: '' };
    user.allStar  = { seasonNumber: 0, voted: false, eastRoster: [], westRoster: [], threePointWinner: '', dunkWinner: '', skillsWinner: '', gameMVP: '', eastScore: 0, westScore: 0 };

    if (user.seasonNumber >= MAX_CAREER_YEARS) {
      // Career complete — give a final reward check + don't auto-restart.
      const rewards = awardRewards(user);
      await user.save();
      return res.json({
        message: '5-year career complete',
        career: user.career,
        tokensAwarded: rewards.tokensAwarded,
        newAchievements: rewards.newAchievements,
      });
    }

    user.seasonNumber += 1;
    user.season += 1;
    user.seasonWins = 0;
    user.seasonLosses = 0;
    user.schedule = generateSchedule({
      cpuTeams: user.cpuTeams,
      userTeam: { conference: user.conference, division: user.team?.division },
    });
    user.cpuRecords = user.cpuTeams.map(t => ({ name: t.name, wins: 0, losses: 0 }));

    const rewards = awardRewards(user);
    await user.save();
    res.json({
      message: `Advanced to season ${user.seasonNumber}`,
      seasonNumber: user.seasonNumber,
      championLastSeason: champion,
      career: user.career,
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/season/career — career history + achievements.
router.get('/career', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!requireDraftCompleted(user, res)) return;
    res.json({
      seasonNumber: user.seasonNumber,
      maxSeasons: MAX_CAREER_YEARS,
      career: user.career,
      achievements: user.achievements,
      tokens: user.tokens,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
