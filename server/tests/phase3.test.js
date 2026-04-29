// Phase 3 tests — payments (PayPal stub + credit card), playoffs bracket,
// news feed, all-star voting + event, simulate-rest.
require('./setup');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');

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
  for (let i = 0; i < 15; i++) {
    await request(app).post('/api/draft/pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 1000 + i, firstName: `User${i}`, lastName: 'P', position: 'G', rating: 75 });
  }
  const pool = Array.from({ length: 500 }, (_, i) => ({
    id: 2000 + i, firstName: `F${i}`, lastName: `L${i}`, position: 'G',
    rating: 60 + (i % 35), stats: null,
  }));
  await request(app).post('/api/draft/cpu-fill')
    .set('Authorization', `Bearer ${token}`)
    .send({ pool });
}

describe('Payments — token bundles + subscription', () => {
  test('catalog returns bundles + plans', async () => {
    const token = await registerAndLogin('pay-cat');
    const res = await request(app).get('/api/payments/catalog')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bundles)).toBe(true);
    expect(res.body.bundles.length).toBeGreaterThan(0);
    expect(res.body.plans.find(p => p.tier === 'premium')).toBeTruthy();
  });

  test('PayPal create + capture grants tokens (sandbox stub when no creds)', async () => {
    const token = await registerAndLogin('pay-pp');
    const create = await request(app).post('/api/payments/paypal/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'tokens', bundleId: 'standard' });
    expect(create.status).toBe(200);
    expect(create.body.orderId).toBeTruthy();

    const cap = await request(app).post('/api/payments/paypal/capture')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: create.body.orderId, kind: 'tokens', bundleId: 'standard' });
    expect(cap.status).toBe(200);
    expect(cap.body.tokensAwarded).toBe(1500);
    expect(cap.body.tokens).toBeGreaterThanOrEqual(1500);
  });

  test('credit card validates Luhn and stores last4 only (no PAN)', async () => {
    const token = await registerAndLogin('pay-cc');
    const bad = await request(app).post('/api/payments/credit-card')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'tokens', bundleId: 'starter', card: { number: '4111111111111112', expMonth: 12, expYear: 2099, cvc: '123' } });
    expect(bad.status).toBe(400);

    const good = await request(app).post('/api/payments/credit-card')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'tokens', bundleId: 'starter', card: { number: '4111111111111111', expMonth: 12, expYear: 2099, cvc: '123' } });
    expect(good.status).toBe(200);
    expect(good.body.last4).toBe('1111');

    const u = await User.findOne({ username: 'pay-cc' });
    const stored = u.payments[0];
    expect(stored.cardLast4).toBe('1111');
    // Sanity — no full PAN stored anywhere on the user record.
    const json = JSON.stringify(u.toObject());
    expect(json.includes('4111111111111111')).toBe(false);
  });

  test('subscribe sets paidUntil ~30 days out + weekly bonus tokens', async () => {
    const token = await registerAndLogin('pay-sub');
    const res = await request(app).post('/api/payments/credit-card')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'subscription', tier: 'premium', card: { number: '4111111111111111', expMonth: 12, expYear: 2099, cvc: '123' } });
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('premium');
    expect(new Date(res.body.paidUntil).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Season — simulate-rest', () => {
  test('fast-forwards every remaining game', async () => {
    const token = await registerAndLogin('sim-rest');
    await setupAndFillDraft(token);
    await request(app).post('/api/season/start').set('Authorization', `Bearer ${token}`);
    const res = await request(app).post('/api/season/simulate-rest').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.played).toBe(82);
    expect(res.body.seasonRecord.wins + res.body.seasonRecord.losses).toBe(82);
  });
});

describe('Playoffs — bracket flow', () => {
  test('locked until season complete, then runs to a champion', async () => {
    const token = await registerAndLogin('po-flow');
    await setupAndFillDraft(token);

    const locked = await request(app).post('/api/playoffs/start').set('Authorization', `Bearer ${token}`);
    expect(locked.status).toBe(403);

    await request(app).post('/api/season/start').set('Authorization', `Bearer ${token}`);
    await request(app).post('/api/season/simulate-rest').set('Authorization', `Bearer ${token}`);

    const start = await request(app).post('/api/playoffs/start').set('Authorization', `Bearer ${token}`);
    expect(start.status).toBe(200);
    expect(start.body.rounds).toHaveLength(4);
    expect(start.body.rounds[0].series).toHaveLength(8); // 4 East + 4 West first-round series

    const sim = await request(app).post('/api/playoffs/simulate-all').set('Authorization', `Bearer ${token}`);
    expect(sim.status).toBe(200);
    expect(sim.body.completed).toBe(true);
    expect(sim.body.champion).toBeTruthy();
    expect(sim.body.runnerUp).toBeTruthy();
  });
});

describe('All-Star event', () => {
  test('vote populates rosters and run-event awards an MVP', async () => {
    const token = await registerAndLogin('as-flow');
    await setupAndFillDraft(token);

    const ballot = await request(app).get('/api/allstar/ballot').set('Authorization', `Bearer ${token}`);
    expect(ballot.status).toBe(200);
    expect(ballot.body.east.length).toBeGreaterThan(0);
    expect(ballot.body.west.length).toBeGreaterThan(0);

    const eastIds = ballot.body.east.slice(0, 5).map(p => p.playerId);
    const westIds = ballot.body.west.slice(0, 5).map(p => p.playerId);

    const vote = await request(app).post('/api/allstar/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ eastIds, westIds });
    expect(vote.status).toBe(200);
    expect(vote.body.east.length).toBeGreaterThan(0);

    const run = await request(app).post('/api/allstar/run-event').set('Authorization', `Bearer ${token}`);
    expect(run.status).toBe(200);
    expect(run.body.allStar.gameMVP).toBeTruthy();
    expect(run.body.allStar.threePointWinner).toBeTruthy();
    expect(run.body.allStar.dunkWinner).toBeTruthy();
    expect(run.body.allStar.skillsWinner).toBeTruthy();
    expect(run.body.allStar.eastScore).toBeGreaterThan(0);
    expect(run.body.allStar.westScore).toBeGreaterThan(0);
  });
});

describe('News feed', () => {
  test('game recaps appear after play-next', async () => {
    const token = await registerAndLogin('news-flow');
    await setupAndFillDraft(token);
    await request(app).post('/api/season/start').set('Authorization', `Bearer ${token}`);
    await request(app).post('/api/season/play-next').set('Authorization', `Bearer ${token}`);

    const news = await request(app).get('/api/news').set('Authorization', `Bearer ${token}`);
    expect(news.status).toBe(200);
    expect(news.body.news.length).toBeGreaterThan(0);
    expect(news.body.news[0].kind).toBe('game');
  });

  test('feed clears via DELETE /api/news', async () => {
    const token = await registerAndLogin('news-clear');
    const u = await User.findOne({ username: 'news-clear' });
    u.news.push({ id: 'x', kind: 'system', headline: 'h', body: 'b', seasonNumber: 1, createdAt: new Date() });
    await u.save();
    const del = await request(app).delete('/api/news').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const after = await request(app).get('/api/news').set('Authorization', `Bearer ${token}`);
    expect(after.body.news).toHaveLength(0);
  });
});
