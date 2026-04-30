// Sprint E1 + E2 — CPU front-office and league structure tests.
require('./setup');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const cpuFO = require('../services/cpuFrontOffice');
const playoffs = require('../services/playoffs');

async function setupUser(username) {
  const reg = await request(app).post('/api/auth/register').send({ username, password: 'secret123' });
  const token = reg.body.token;
  await request(app).post('/api/draft/setup').set('Authorization', `Bearer ${token}`).send({
    conference: 'East', division: 'Atlantic', league: 'NBA',
    city: 'Boston', coach: 'Joe', teamName: 'Boston Greens',
    draftType: 'fantasy',
  });
  for (let i = 0; i < 13; i++) {
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

describe('Sprint E1 — CPU front office', () => {
  test('updateCpuDirections classifies winners as contender, bottom as rebuild/tank', async () => {
    const token = await setupUser('e1-dir');
    const user = await User.findOne({ username: 'e1-dir' });
    // Force a record split: half the CPUs at 60-22, half at 22-60.
    user.cpuRecords = user.cpuTeams.map((t, i) => ({
      name: t.name,
      wins: i < user.cpuTeams.length / 2 ? 60 : 22,
      losses: i < user.cpuTeams.length / 2 ? 22 : 60,
    }));
    cpuFO.updateCpuDirections(user);
    const dirs = user.cpuTeams.map(t => t.direction);
    expect(dirs).toContain('contender');
    expect(dirs.some(d => d === 'rebuild' || d === 'tank' || d === 'middling')).toBe(true);
  });

  test('cpuReSignStars keeps expiring stars on contender teams', async () => {
    const token = await setupUser('e1-resign');
    const user = await User.findOne({ username: 'e1-resign' });
    const cpu = user.cpuTeams[0];
    cpu.direction = 'contender';
    // Inject one expiring star.
    cpu.players.push({
      playerId: 99001, firstName: 'Star', lastName: 'Player', position: 'F', rating: 88,
      contract: { salary: 30, years: 1, yearsRemaining: 1, contractType: 'max' },
    });
    user.markModified('cpuTeams');
    const events = cpuFO.cpuReSignStars(user);
    expect(events.length).toBeGreaterThan(0);
    const refreshed = cpu.players.find(p => p.playerId === 99001);
    expect(refreshed.contract.yearsRemaining).toBeGreaterThan(1);
  });

  test('cpuReactToInjuries signs FA when star is down 20+ games', async () => {
    const token = await setupUser('e1-inj');
    const user = await User.findOne({ username: 'e1-inj' });
    const cpu = user.cpuTeams[0];
    // Force a roster opening + injured star + cap room.
    cpu.players = cpu.players.slice(0, 10).map(p => ({
      ...(p.toObject?.() || p),
      contract: { salary: 5, years: 2, yearsRemaining: 2 },
    }));
    cpu.players.push({
      playerId: 99002, firstName: 'Hurt', lastName: 'Star', position: 'C', rating: 85,
      injury: { isInjured: true, gamesRemaining: 30, type: 'ACL', severity: 'major' },
      contract: { salary: 20, years: 3, yearsRemaining: 3 },
    });
    cpu._lastInjurySignSeason = -1;
    user.seasonNumber = user.seasonNumber || 1;
    user.freeAgents = [{
      playerId: 77001, firstName: 'Available', lastName: 'Vet', position: 'C', rating: 78,
      askingSalary: 5, askingYears: 1, previousTeam: 'X',
    }];
    user.markModified('cpuTeams');
    user.markModified('freeAgents');
    const events = cpuFO.cpuReactToInjuries(user);
    expect(events.length).toBeGreaterThan(0);
    expect(cpu.players.some(p => p.playerId === 77001)).toBe(true);
    expect(user.freeAgents.length).toBe(0);
  });

  test('cpuFreeAgentTick removes some FAs over time', async () => {
    const token = await setupUser('e1-fa');
    const user = await User.findOne({ username: 'e1-fa' });
    // Make sure at least one CPU has roster opening + cap room.
    for (const cpu of user.cpuTeams.slice(0, 5)) {
      cpu.players = cpu.players.slice(0, 8).map(p => ({
        ...(p.toObject?.() || p),
        contract: { salary: 5, years: 2, yearsRemaining: 2 },
      }));
    }
    user.markModified('cpuTeams');
    user.freeAgents = Array.from({ length: 20 }, (_, i) => ({
      playerId: 60000 + i, firstName: `FA${i}`, lastName: 'Vet', position: 'G', rating: 72,
      askingSalary: 3, askingYears: 1, previousTeam: 'X',
    }));
    user.markModified('freeAgents');
    const ev = cpuFO.cpuFreeAgentTick(user, { rate: 1.0 });
    expect(ev.length).toBeGreaterThan(0);
    expect(user.freeAgents.length).toBeLessThan(20);
  });

  test('computePowerRankings ranks 30 teams', async () => {
    const token = await setupUser('e1-pr');
    const user = await User.findOne({ username: 'e1-pr' });
    const rankings = cpuFO.computePowerRankings(user);
    expect(rankings.length).toBe(30);
    expect(rankings[0].rank).toBe(1);
    expect(rankings[29].rank).toBe(30);
  });
});

describe('Sprint E2 — League structure', () => {
  test('GET /api/league/power-rankings returns 30-team list', async () => {
    const token = await setupUser('e2-pr');
    const res = await request(app).get('/api/league/power-rankings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.rankings.length).toBe(30);
    expect(res.body.rankings[0]).toHaveProperty('score');
  });

  test('GET /api/league/overview groups CPU teams by direction', async () => {
    const token = await setupUser('e2-ov');
    const res = await request(app).get('/api/league/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalTeams).toBe(30);
    expect(res.body.buckets).toHaveProperty('contender');
    expect(res.body.buckets).toHaveProperty('rebuild');
  });

  test('runPlayIn produces seed7/seed8 for each conference', async () => {
    const token = await setupUser('e2-pi');
    const user = await User.findOne({ username: 'e2-pi' });
    // Fake records so we have 10 ranked teams per conf.
    user.cpuRecords = user.cpuTeams.map((t, i) => ({ name: t.name, wins: 50 - (i % 50), losses: 32 + (i % 50) }));
    user.seasonWins = 45; user.seasonLosses = 37;
    const results = playoffs.runPlayIn(user);
    expect(results.east.seed7).toBeTruthy();
    expect(results.east.seed8).toBeTruthy();
    expect(results.west.seed7).toBeTruthy();
    expect(results.west.seed8).toBeTruthy();
    expect(results.east.games.length).toBe(3);
  });
});
