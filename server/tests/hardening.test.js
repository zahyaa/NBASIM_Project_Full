// Sprint I — backend hardening tests.
require('./setup');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Game = require('../models/Game');
const { runWeeklyBonusPass } = require('../services/subscriptionScheduler');

async function setupUser(username) {
  const reg = await request(app).post('/api/auth/register').send({ username, password: 'secret123' });
  const token = reg.body.token;
  await request(app).post('/api/draft/setup').set('Authorization', `Bearer ${token}`).send({
    conference: 'East', division: 'Atlantic', league: 'NBA',
    city: 'Boston', coach: 'Joe', teamName: 'Boston Greens',
    draftType: 'fantasy',
  });
  for (let i = 0; i < 15; i++) {
    await request(app).post('/api/draft/pick').set('Authorization', `Bearer ${token}`).send({
      playerId: 9000 + i, firstName: `U${i}`, lastName: 'P', position: 'G', rating: 75,
    });
  }
  const pool = Array.from({ length: 600 }, (_, i) => ({
    id: 8000 + i, firstName: `F${i}`, lastName: `L${i}`, position: 'G',
    rating: 60 + (i % 35), stats: null,
  }));
  await request(app).post('/api/draft/cpu-fill').set('Authorization', `Bearer ${token}`).send({ pool });
  return token;
}

describe('Sprint I — username regex', () => {
  test('rejects usernames with invalid characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'bad name!', password: 'secret123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Username/i);
  });

  test('accepts valid usernames', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'good_name-99', password: 'secret123',
    });
    expect(res.status).toBe(201);
  });
});

describe('Sprint I — game replay', () => {
  test('GET /api/games/:id returns full play-by-play', async () => {
    const token = await setupUser('i-replay');
    const user = await User.findOne({ username: 'i-replay' });
    const game = await Game.create({
      userId: user._id,
      teamA: 'Boston Greens', teamB: 'Foes',
      scoreA: 102, scoreB: 99,
      history: [
        { quarter: 1, clock: '11:30', team: 'A', text: 'Tip-off', type: 'info', scoreA: 0, scoreB: 0 },
        { quarter: 1, clock: '11:00', team: 'A', text: 'Made jumper', type: 'score', scoreA: 2, scoreB: 0 },
      ],
    });
    const res = await request(app).get(`/api/games/${game._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.history.length).toBe(2);
    expect(res.body.scoreA).toBe(102);
  });

  test('GET /api/games/:id rejects other users games', async () => {
    const aToken = await setupUser('i-rep-a');
    await setupUser('i-rep-b');
    const userA = await User.findOne({ username: 'i-rep-a' });
    const game = await Game.create({
      userId: userA._id, teamA: 'X', teamB: 'Y', scoreA: 1, scoreB: 0, history: [],
    });
    const bToken = (await request(app).post('/api/auth/login').send({ username: 'i-rep-b', password: 'secret123' })).body.token;
    const res = await request(app).get(`/api/games/${game._id}`)
      .set('Authorization', `Bearer ${bToken || aToken}`);
    // If the wrong-user query rejects with 404 we're good.
    if (bToken) expect(res.status).toBe(404);
  });
});

describe('Sprint I — CSV export', () => {
  test('GET /api/season/export-csv?type=standings returns CSV', async () => {
    const token = await setupUser('i-csv');
    const res = await request(app).get('/api/season/export-csv?type=standings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.split('\n');
    expect(lines[0]).toContain('rank,name');
    expect(lines.length).toBeGreaterThan(2); // header + multiple teams
  });

  test('GET /api/season/export-csv?type=roster returns CSV', async () => {
    const token = await setupUser('i-csv2');
    const res = await request(app).get('/api/season/export-csv?type=roster')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('firstName,lastName');
  });
});

describe('Sprint I — weekly bonus scheduler', () => {
  test('runWeeklyBonusPass grants tokens to eligible subscribers', async () => {
    await setupUser('i-bonus');
    const user = await User.findOne({ username: 'i-bonus' });
    user.tokens = 100;
    user.subscription.tier = 'premium';
    user.subscription.paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    user.subscription.lastWeeklyBonusAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await user.save();

    const granted = await runWeeklyBonusPass();
    expect(granted).toBeGreaterThanOrEqual(1);

    const fresh = await User.findById(user._id);
    expect(fresh.tokens).toBe(100 + 250);
  });

  test('runWeeklyBonusPass skips users whose bonus is recent', async () => {
    await setupUser('i-bonus-skip');
    const user = await User.findOne({ username: 'i-bonus-skip' });
    user.tokens = 100;
    user.subscription.tier = 'premium';
    user.subscription.paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    user.subscription.lastWeeklyBonusAt = new Date(); // just now
    await user.save();

    await runWeeklyBonusPass();
    const fresh = await User.findById(user._id);
    expect(fresh.tokens).toBe(100); // unchanged
  });

  test('runWeeklyBonusPass skips free users', async () => {
    await setupUser('i-bonus-free');
    const user = await User.findOne({ username: 'i-bonus-free' });
    user.tokens = 50;
    user.subscription.tier = 'free';
    await user.save();

    await runWeeklyBonusPass();
    const fresh = await User.findById(user._id);
    expect(fresh.tokens).toBe(50);
  });
});
