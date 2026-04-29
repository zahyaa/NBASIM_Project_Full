// Playoff bracket endpoints. The bracket is locked until the regular
// season is complete. From there the user can either play series one
// at a time (each call sims the next active series) or skip ahead with
// /simulate-all to fast-forward to a champion.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const {
  buildBracket,
  playSeries,
  advanceBracket,
  simulateAll,
  userPlayoffResult,
  ROUND_NAMES,
} = require('../services/playoffs');
const { pushNews } = require('../services/news');
const { awardRewards } = require('../services/fantasyGM');

const router = express.Router();

function ensureSeasonComplete(user, res) {
  if (!user.draftCompleted) { res.status(403).json({ error: 'Locked — finish the draft first' }); return false; }
  if (!user.schedule?.length) { res.status(403).json({ error: 'Start a season first' }); return false; }
  if (user.schedule.some(g => !g.played)) {
    res.status(403).json({ error: 'Season is not complete', remaining: user.schedule.filter(g => !g.played).length });
    return false;
  }
  return true;
}

// GET /api/playoffs/state — return the current bracket (or empty if locked).
router.get('/state', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const seasonComplete = !!user.schedule?.length && user.schedule.every(g => g.played);

    // Build the "Did Not Qualify" list \u2014 teams ranked 9th or worse in their
    // conference are cut from the bracket. Mirror the sort buildBracket()
    // uses so this stays consistent with who actually plays.
    const allTeams = [
      { name: user.team?.name || 'My Team', conference: user.conference, wins: user.seasonWins, losses: user.seasonLosses, isUser: true },
      ...user.cpuTeams.map(t => {
        const rec = (user.cpuRecords || []).find(r => r.name === t.name) || { wins: 0, losses: 0 };
        return { name: t.name, conference: t.conference, wins: rec.wins, losses: rec.losses, isUser: false };
      }),
    ];
    const sortFn = (a, b) => (b.wins - a.wins) || (a.losses - b.losses);
    const eliminated = ['East', 'West'].flatMap(conf =>
      allTeams.filter(t => t.conference === conf).sort(sortFn).slice(8)
        .map((t, i) => ({ ...t, confRank: i + 9 }))
    );

    res.json({
      locked: !seasonComplete,
      started: !!user.playoffs?.started,
      completed: !!user.playoffs?.completed,
      seasonNumber: user.playoffs?.seasonNumber || 0,
      rounds: user.playoffs?.rounds || [],
      champion: user.playoffs?.champion || '',
      runnerUp: user.playoffs?.runnerUp || '',
      eliminated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playoffs/start — build the first-round bracket from the top
// 8 of each conference. Idempotent: returns the existing bracket if
// playoffs were already started this season.
router.post('/start', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!ensureSeasonComplete(user, res)) return;
    if (user.playoffs?.started && user.playoffs.seasonNumber === user.seasonNumber) {
      return res.json({ message: 'Playoffs already in progress', rounds: user.playoffs.rounds });
    }
    const rounds = buildBracket(user);
    user.playoffs = {
      started: true,
      completed: false,
      seasonNumber: user.seasonNumber,
      rounds,
      champion: '',
      runnerUp: '',
    };
    user.markModified('playoffs');

    pushNews(user, {
      id: `po_start_${Date.now()}`, kind: 'system',
      headline: '🏀 Playoffs are here — bracket is set',
      body: 'Top 8 from each conference are in. First-round matchups: 1v8, 2v7, 3v6, 4v5.',
      seasonNumber: user.seasonNumber,
    });

    const rewards = awardRewards(user);
    await user.save();
    res.json({ message: 'Playoffs started', rounds, tokensAwarded: rewards.tokensAwarded, newAchievements: rewards.newAchievements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playoffs/play-next — sim the next unfinished series. If the
// current round is fully decided, advances to the next round first.
router.post('/play-next', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.playoffs?.started) return res.status(400).json({ error: 'Start the playoffs first' });
    if (user.playoffs.completed) return res.status(400).json({ error: 'Playoffs already finished' });

    advanceBracket(user.playoffs.rounds, user);
    let next = null, roundIdx = -1;
    for (let r = 0; r < user.playoffs.rounds.length; r++) {
      const s = (user.playoffs.rounds[r].series || []).find(x => !x.winner);
      if (s) { next = s; roundIdx = r; break; }
    }
    if (!next) return res.status(400).json({ error: 'No more series to play' });

    // If the user's team is in this series, run full play-by-play so the
    // player can re-watch every game on the GameCast component.
    const userInSeries = next.teamA?.name === user.team.name || next.teamB?.name === user.team.name;
    const { games: pbpGames } = playSeries(next, user, Math.random, { fullPlayByPlay: userInSeries });
    advanceBracket(user.playoffs.rounds, user);

    pushNews(user, {
      id: `po_${Date.now()}`, kind: 'system',
      headline: `${next.winner} win series ${Math.max(next.winsA, next.winsB)}-${Math.min(next.winsA, next.winsB)}`,
      body: `${next.teamA.name} vs ${next.teamB.name} — ${ROUND_NAMES[roundIdx]} (${next.conference}).`,
      seasonNumber: user.seasonNumber,
    });

    // Check if Finals are decided.
    const finals = user.playoffs.rounds[3]?.series?.[0];
    if (finals?.winner) {
      user.playoffs.completed = true;
      user.playoffs.champion = finals.winner;
      user.playoffs.runnerUp = finals.winner === finals.teamA.name ? finals.teamB.name : finals.teamA.name;
      pushNews(user, {
        id: `po_champ_${Date.now()}`, kind: 'system',
        headline: `🏆 ${finals.winner} are NBA Champions!`,
        body: `${finals.winner} defeat ${user.playoffs.runnerUp} ${finals.winsA > finals.winsB ? finals.winsA : finals.winsB}-${Math.min(finals.winsA, finals.winsB)} in the Finals.`,
        seasonNumber: user.seasonNumber,
      });
    }
    user.markModified('playoffs');

    const rewards = awardRewards(user);
    await user.save();
    res.json({
      series: next,
      round: ROUND_NAMES[roundIdx],
      rounds: user.playoffs.rounds,
      completed: user.playoffs.completed,
      champion: user.playoffs.champion,
      runnerUp: user.playoffs.runnerUp,
      // When the user's team played, this is an array of full simulateGame
      // outputs (one per game) so the client can render GameCast playback.
      playByPlay: userInSeries ? pbpGames : [],
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playoffs/simulate-all — run every remaining series at once.
router.post('/simulate-all', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.playoffs?.started) return res.status(400).json({ error: 'Start the playoffs first' });
    if (user.playoffs.completed) return res.status(400).json({ error: 'Playoffs already finished' });

    simulateAll(user.playoffs.rounds, user);
    const finals = user.playoffs.rounds[3]?.series?.[0];
    if (finals?.winner) {
      user.playoffs.completed = true;
      user.playoffs.champion = finals.winner;
      user.playoffs.runnerUp = finals.winner === finals.teamA.name ? finals.teamB.name : finals.teamA.name;
      pushNews(user, {
        id: `po_champ_${Date.now()}`, kind: 'system',
        headline: `🏆 ${finals.winner} are NBA Champions!`,
        body: `${finals.winner} cap a championship run, defeating ${user.playoffs.runnerUp}.`,
        seasonNumber: user.seasonNumber,
      });
    }
    user.markModified('playoffs');
    const rewards = awardRewards(user);
    await user.save();
    res.json({
      rounds: user.playoffs.rounds,
      completed: user.playoffs.completed,
      champion: user.playoffs.champion,
      runnerUp: user.playoffs.runnerUp,
      userResult: userPlayoffResult(user.playoffs.rounds, user.team.name),
      tokensAwarded: rewards.tokensAwarded,
      newAchievements: rewards.newAchievements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
