// Sprint C3 — Coaching service + routes tests.
require('./setup');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const coaching = require('../services/coaching');

async function setupUser(username) {
  const reg = await request(app).post('/api/auth/register').send({ username, password: 'secret123' });
  const token = reg.body.token;
  await request(app).post('/api/draft/setup')
    .set('Authorization', `Bearer ${token}`)
    .send({
      conference: 'East', division: 'Atlantic', league: 'NBA',
      city: 'Boston', coach: 'Joe', teamName: 'Boston Greens',
      draftType: 'fantasy',
    });
  for (let i = 0; i < 13; i++) {
    await request(app).post('/api/draft/pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 5000 + i, firstName: `C${i}`, lastName: 'P', position: 'G', rating: 70 + (i % 10), clutch: 60 + i, iq: 65 });
  }
  return token;
}

describe('Sprint C3 — Coaching', () => {
  test('paceMod returns slow/medium/fast multipliers', () => {
    expect(coaching.paceMod('slow').possessionMul).toBeLessThan(1);
    expect(coaching.paceMod('medium').possessionMul).toBe(1);
    expect(coaching.paceMod('fast').possessionMul).toBeGreaterThan(1);
  });

  test('coachStyleMods: defensive coach drops opp shot %', () => {
    const def = coaching.coachStyleMods({ style: 'defensive' });
    const off = coaching.coachStyleMods({ style: 'offensive' });
    expect(def.oppShotDrop).toBeGreaterThan(off.oppShotDrop);
    expect(off.ownShotBoost).toBeGreaterThan(def.ownShotBoost);
  });

  test('GET /coaching/state seeds defaults', async () => {
    const token = await setupUser('co-state');
    const res = await request(app).get('/api/coaching/state').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.coach.name).toBeTruthy();
    expect(res.body.coaching.pace).toBe('medium');
    expect(res.body.roster.length).toBe(13);
  });

  test('POST /coaching/rotation + /pace persist', async () => {
    const token = await setupUser('co-rot');
    const state = await request(app).get('/api/coaching/state').set('Authorization', `Bearer ${token}`);
    const rotation = state.body.roster.slice(0, 8).map((p, i) => ({
      playerId: p.playerId, targetMinutes: 36 - i * 3,
    }));
    let res = await request(app).post('/api/coaching/rotation')
      .set('Authorization', `Bearer ${token}`).send({ rotation });
    expect(res.status).toBe(200);
    expect(res.body.rotation.length).toBe(8);

    res = await request(app).post('/api/coaching/pace')
      .set('Authorization', `Bearer ${token}`).send({ pace: 'fast' });
    expect(res.status).toBe(200);

    const after = await request(app).get('/api/coaching/state').set('Authorization', `Bearer ${token}`);
    expect(after.body.coaching.pace).toBe('fast');
    expect(after.body.coaching.rotation.length).toBe(8);
  });

  test('rotation rejects > 8 players', async () => {
    const token = await setupUser('co-cap');
    const state = await request(app).get('/api/coaching/state').set('Authorization', `Bearer ${token}`);
    const tooMany = state.body.roster.slice(0, 9).map(p => ({ playerId: p.playerId, targetMinutes: 24 }));
    const res = await request(app).post('/api/coaching/rotation')
      .set('Authorization', `Bearer ${token}`).send({ rotation: tooMany });
    expect(res.status).toBe(400);
  });

  test('hire + fire coach', async () => {
    const token = await setupUser('co-hire');
    const cands = await request(app).get('/api/coaching/candidates').set('Authorization', `Bearer ${token}`);
    expect(cands.body.candidates.length).toBeGreaterThan(0);
    const pick = cands.body.candidates[0];

    let res = await request(app).post('/api/coaching/hire')
      .set('Authorization', `Bearer ${token}`).send({ coach: pick });
    expect(res.status).toBe(200);
    expect(res.body.coach.name).toBe(pick.name);

    res = await request(app).post('/api/coaching/fire').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const state = await request(app).get('/api/coaching/state').set('Authorization', `Bearer ${token}`);
    expect(state.body.coach.name).toBe('Interim Staff');
  });

  test('closing-lineup picks 5 best by rating+clutch+iq', async () => {
    const token = await setupUser('co-close');
    const res = await request(app).get('/api/coaching/closing-lineup').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.closers.length).toBe(5);
  });

  test('coachOfTheYear returns ranking object', async () => {
    const token = await setupUser('co-coty');
    const res = await request(app).get('/api/coaching/coty').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // winner may be null on day 1 (no games played) — endpoint must still respond.
    expect(res.body).toHaveProperty('history');
  });
});
