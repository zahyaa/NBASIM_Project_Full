// Phase 2 tests — season schedule, play-next, standings, advance, achievements,
// live CPU draft pick, and the 120-tokens-per-10-wins reward.
require('./setup');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const {
  generateSchedule,
  quickSimRecord,
  awardRewards,
  ACHIEVEMENTS,
} = require('../services/fantasyGM');

async function registerAndLogin(username) {
  const reg = await request(app).post('/api/auth/register').send({ username, password: 'secret123' });
  return reg.body.token;
}

async function setupAndFillDraft(token) {
  await request(app).post('/api/draft/setup')
    .set('Authorization', `Bearer ${token}`)
    .send({
      conference: 'East', division: 'Southeast', league: 'NBA',
      city: 'Miami', coach: 'Erik Spoelstra', teamName: 'Miami Sharks',
      draftType: 'fantasy',
    });
  // 15 user picks.
  for (let i = 0; i < 15; i++) {
    await request(app).post('/api/draft/pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 1000 + i, firstName: `User${i}`, lastName: 'P', position: 'G', rating: 75 });
  }
  // Fill CPU rosters from a synthetic pool.
  const pool = Array.from({ length: 500 }, (_, i) => ({
    id: 2000 + i, firstName: `F${i}`, lastName: `L${i}`, position: 'G',
    rating: 60 + (i % 35), stats: null,
  }));
  await request(app).post('/api/draft/cpu-fill')
    .set('Authorization', `Bearer ${token}`)
    .send({ pool });
}

describe('generateSchedule helper', () => {
  test('produces 82 games rotating through cpu opponents', () => {
    const cpuTeams = Array.from({ length: 29 }, (_, i) => ({ name: `Team ${i}` }));
    const sched = generateSchedule({ cpuTeams });
    expect(sched).toHaveLength(82);
    const opponents = new Set(sched.map(g => g.opponent));
    expect(opponents.size).toBe(29); // every CPU is faced at least once
    sched.forEach((g, i) => {
      expect(g.gameNumber).toBe(i + 1);
      expect(g.played).toBe(false);
    });
  });

  test('returns empty when no CPU teams', () => {
    expect(generateSchedule({ cpuTeams: [] })).toEqual([]);
  });
});

describe('awardRewards helper (achievements + 120-per-10-wins)', () => {
  test('120 token bucket per 10 wins, paid only on new buckets', () => {
    const user = {
      tokens: 0, wins: 25, winsAwarded: 0, seasonWins: 0, seasonNumber: 1,
      achievements: [], career: [], team: { players: [] },
    };
    const r1 = awardRewards(user);
    // Crossed 10 and 20 wins ⇒ 2 buckets * 120 = 240, plus first-win + ten-win-club
    expect(user.winsAwarded).toBe(20);
    const expectedAch = 50 + 100; // first-win + ten-win-club
    expect(r1.tokensAwarded).toBe(240 + expectedAch);
    expect(user.tokens).toBe(240 + expectedAch);

    // Calling again with no new wins yields nothing.
    const r2 = awardRewards(user);
    expect(r2.tokensAwarded).toBe(0);

    // Cross to 30 ⇒ one more bucket.
    user.wins = 32;
    const r3 = awardRewards(user);
    expect(r3.tokensAwarded).toBe(120);
    expect(user.winsAwarded).toBe(30);
  });

  test('champion + dynasty achievements unlock as career grows', () => {
    const user = {
      tokens: 0, wins: 0, winsAwarded: 0, seasonWins: 0, seasonNumber: 5,
      achievements: [], team: { players: [] },
      career: [
        { seasonNumber: 1, champion: true },
        { seasonNumber: 2, champion: false },
        { seasonNumber: 3, champion: true },
        { seasonNumber: 4, champion: true },
      ],
    };
    const r = awardRewards(user);
    const ids = user.achievements.map(a => a.id);
    expect(ids).toContain('champion');
    expect(ids).toContain('dynasty');
    expect(r.tokensAwarded).toBeGreaterThanOrEqual(500 + 1000);
  });

  test('catalogue is non-empty and unique', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
    const ids = ACHIEVEMENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('quickSimRecord', () => {
  test('always returns a winner with non-tied scores', () => {
    const a = { players: [{ rating: 90 }, { rating: 88 }] };
    const b = { players: [{ rating: 70 }, { rating: 65 }] };
    for (let i = 0; i < 25; i++) {
      const r = quickSimRecord(a, b);
      expect(['A', 'B']).toContain(r.winner);
      expect(r.scoreA).not.toBe(r.scoreB);
    }
  });
});

describe('Season HTTP flow', () => {
  test('endpoints are 403 until draft is started', async () => {
    const token = await registerAndLogin('season-locked');
    const res = await request(app).post('/api/season/start')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('start → play-next → standings → advance', async () => {
    const token = await registerAndLogin('season-flow');
    await setupAndFillDraft(token);

    const start = await request(app).post('/api/season/start')
      .set('Authorization', `Bearer ${token}`);
    expect(start.status).toBe(200);
    expect(start.body.games).toBe(82);

    // Play a single game.
    const play = await request(app).post('/api/season/play-next')
      .set('Authorization', `Bearer ${token}`);
    expect(play.status).toBe(200);
    expect(play.body.gameNumber).toBe(1);
    expect(typeof play.body.winner).toBe('string');
    // seasonRecord wins+losses must equal 1.
    expect(play.body.seasonRecord.wins + play.body.seasonRecord.losses).toBe(1);

    // Standings include the user team and 29 CPU teams.
    const stand = await request(app).get('/api/season/standings')
      .set('Authorization', `Bearer ${token}`);
    expect(stand.status).toBe(200);
    expect(stand.body.standings).toHaveLength(30);
    expect(stand.body.standings.some(r => r.isUser)).toBe(true);
    expect(stand.body.gamesPlayed).toBe(1);

    // Cannot advance with games remaining.
    const advBad = await request(app).post('/api/season/advance')
      .set('Authorization', `Bearer ${token}`);
    expect(advBad.status).toBe(400);

    // Force-finish the season directly in the DB (simulating having played
    // all 82) so we can test the advance flow without burning 81 sim runs.
    const user = await User.findOne({ username: 'season-flow' });
    user.schedule.forEach(g => { g.played = true; });
    user.markModified('schedule');
    await user.save();

    const adv = await request(app).post('/api/season/advance')
      .set('Authorization', `Bearer ${token}`);
    expect(adv.status).toBe(200);
    expect(adv.body.seasonNumber).toBe(2);
    expect(Array.isArray(adv.body.career)).toBe(true);
    expect(adv.body.career).toHaveLength(1);
  }, 30000);

  test('advance caps at 5 seasons (career complete)', async () => {
    const token = await registerAndLogin('season-cap');
    await setupAndFillDraft(token);
    await request(app).post('/api/season/start').set('Authorization', `Bearer ${token}`);

    // Jump straight to season 5 with a finished schedule.
    const user = await User.findOne({ username: 'season-cap' });
    user.seasonNumber = 5;
    user.schedule.forEach(g => { g.played = true; });
    user.markModified('schedule');
    await user.save();

    const adv = await request(app).post('/api/season/advance')
      .set('Authorization', `Bearer ${token}`);
    expect(adv.status).toBe(200);
    expect(adv.body.message).toMatch(/career complete/i);
  });

  test('career endpoint exposes achievements + history', async () => {
    const token = await registerAndLogin('season-career');
    await setupAndFillDraft(token);
    await request(app).post('/api/season/start').set('Authorization', `Bearer ${token}`);
    const career = await request(app).get('/api/season/career')
      .set('Authorization', `Bearer ${token}`);
    expect(career.status).toBe(200);
    expect(career.body.maxSeasons).toBe(5);
    expect(Array.isArray(career.body.achievements)).toBe(true);
  });
});

describe('Live "on the clock" CPU draft pick', () => {
  test('cpu-pick assigns one player to the named CPU team', async () => {
    const token = await registerAndLogin('live-draft');
    await request(app).post('/api/draft/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conference: 'East', division: 'Atlantic', league: 'NBA',
        city: 'New York', coach: 'Tom Thibodeau', teamName: 'NY Royals',
        draftType: 'fantasy',
      });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const cpuName = me.body.cpuTeams[0].name;

    const pool = Array.from({ length: 50 }, (_, i) => ({
      id: 7000 + i, firstName: `F${i}`, lastName: `L${i}`, position: 'G',
      rating: 95 - i, stats: null,
    }));
    const res = await request(app).post('/api/draft/cpu-pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamName: cpuName, pool });
    expect(res.status).toBe(200);
    expect(res.body.pick).toBeTruthy();

    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const cpu = after.body.cpuTeams.find(t => t.name === cpuName);
    expect(cpu.players).toHaveLength(1);
    expect(cpu.players[0].playerId).toBe(res.body.pick.id);
  });

  test('cpu-pick MAY pick the same player as the user (cross-team duplicates allowed)', async () => {
    const token = await registerAndLogin('live-draft-nodup');
    await request(app).post('/api/draft/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conference: 'West', division: 'Pacific', league: 'NBA',
        city: 'Los Angeles', coach: 'Doc Rivers', teamName: 'LA Eagles',
        draftType: 'fantasy',
      });
    await request(app).post('/api/draft/pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 8001, firstName: 'Mine', lastName: 'Mine', position: 'G', rating: 99 });

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const cpuName = me.body.cpuTeams[0].name;
    // Pool offers exactly one player. The CPU should pick it even though
    // the user already owns the same player (duplicates across teams are
    // intentional under the new rules — differentiation comes from the Store).
    const pool = [
      { id: 8001, firstName: 'Mine', lastName: 'Mine', position: 'G', rating: 99 },
    ];
    const res = await request(app).post('/api/draft/cpu-pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamName: cpuName, pool });
    expect(res.status).toBe(200);
    expect(res.body.pick.id).toBe(8001);
  });
});
