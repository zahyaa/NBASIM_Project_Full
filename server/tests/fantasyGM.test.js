require('./setup');
const request = require('supertest');
const app = require('../server');
const {
  generateCpuTeams,
  distributePlayersToCpuTeams,
  isValidConferenceDivision,
  tierForCity,
} = require('../services/fantasyGM');

// ----------------------------------------------------------------------------
// Pure helper tests — no HTTP / DB needed.
// ----------------------------------------------------------------------------
describe('fantasyGM helpers', () => {
  test('isValidConferenceDivision pairs match NBA structure', () => {
    expect(isValidConferenceDivision('East', 'Atlantic')).toBe(true);
    expect(isValidConferenceDivision('West', 'Pacific')).toBe(true);
    expect(isValidConferenceDivision('East', 'Pacific')).toBe(false);
    expect(isValidConferenceDivision('West', 'Atlantic')).toBe(false);
    expect(isValidConferenceDivision('Bogus', 'Atlantic')).toBe(false);
  });

  test('tierForCity classifies major / mid / small markets', () => {
    expect(tierForCity('New York')).toBe('I');
    expect(tierForCity('Cleveland')).toBe('II');
    expect(tierForCity('Oklahoma City')).toBe('III');
    expect(tierForCity('Atlantis')).toBe('');
  });

  test('generateCpuTeams produces 29 unique teams (user takes one slot)', () => {
    const userTeam = {
      name: 'Miami Sharks', city: 'Miami', coach: 'Erik Spoelstra',
      conference: 'East', division: 'Southeast',
    };
    const cpus = generateCpuTeams({ userTeam });
    expect(cpus).toHaveLength(29);
    // No duplicate cities, coaches, or names.
    const cities = cpus.map(t => t.city);
    const coaches = cpus.map(t => t.coach);
    const names = cpus.map(t => t.name);
    expect(new Set(cities).size).toBe(cities.length);
    expect(new Set(coaches).size).toBe(coaches.length);
    expect(new Set(names).size).toBe(names.length);
    // None reuse the user's city / coach / name.
    expect(cities).not.toContain(userTeam.city);
    expect(coaches).not.toContain(userTeam.coach);
    expect(names).not.toContain(userTeam.name);
    // Each team has a valid conference/division pair.
    cpus.forEach(t => expect(isValidConferenceDivision(t.conference, t.division)).toBe(true));
  });

  test('distributePlayersToCpuTeams gives every CPU team 15 league-wide-unique players', () => {
    const userTeam = {
      name: 'NY Royals', city: 'New York', coach: 'Tom Thibodeau',
      conference: 'East', division: 'Atlantic',
    };
    const cpus = generateCpuTeams({ userTeam });
    // 29 CPU teams × 15 picks = 435 needed. Provide 500-player pool.
    const pool = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      firstName: `First${i}`,
      lastName: `Last${i}`,
      position: 'G',
      rating: 60 + (i % 30),
      stats: null,
    }));
    distributePlayersToCpuTeams({ cpuTeams: cpus, pool });

    const allClaimed = new Set();
    cpus.forEach(team => {
      expect(team.players).toHaveLength(15);
      team.players.forEach(p => {
        // League-wide uniqueness — NO duplicates across any CPU teams.
        expect(allClaimed.has(p.playerId)).toBe(false);
        allClaimed.add(p.playerId);
      });
    });
  });
});

// ----------------------------------------------------------------------------
// Integration tests for the HTTP endpoints.
// ----------------------------------------------------------------------------
async function registerAndLogin(username = 'gm1') {
  const reg = await request(app).post('/api/auth/register').send({ username, password: 'secret123' });
  return reg.body.token;
}

async function setupDraft(token, overrides = {}) {
  return request(app)
    .post('/api/draft/setup')
    .set('Authorization', `Bearer ${token}`)
    .send({
      conference: 'East',
      division: 'Southeast',
      league: 'NBA',
      city: 'Miami',
      coach: 'Erik Spoelstra',
      teamName: 'Miami Sharks',
      draftType: 'fantasy',
      ...overrides,
    });
}

describe('POST /api/draft/setup (fantasy GM)', () => {
  test('awards 500 tokens and unlocks draftStarted', async () => {
    const token = await registerAndLogin('gm-tokens');
    const res = await setupDraft(token);
    expect(res.status).toBe(200);
    expect(res.body.tokens).toBe(500);
    expect(res.body.cpuTeamCount).toBe(29);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.draftStarted).toBe(true);
    expect(me.body.tokens).toBe(500);
    expect(me.body.team.division).toBe('Southeast');
    expect(me.body.team.marketTier).toBe('I');
    expect(me.body.cpuTeams).toHaveLength(29);
  });

  test('rejects mismatched conference + division', async () => {
    const token = await registerAndLogin('gm-bad-div');
    const res = await setupDraft(token, { conference: 'East', division: 'Pacific' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pacific/);
  });

  test('requires team name, city, coach', async () => {
    const token = await registerAndLogin('gm-required');
    let res = await setupDraft(token, { teamName: '' });
    expect(res.status).toBe(400);
    res = await setupDraft(token, { city: '' });
    expect(res.status).toBe(400);
    res = await setupDraft(token, { coach: '' });
    expect(res.status).toBe(400);
  });

  test('does not double-award tokens on repeated setup', async () => {
    const token = await registerAndLogin('gm-once');
    await setupDraft(token);
    await setupDraft(token, { city: 'Boston' }); // same user re-saves
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.tokens).toBe(500);
  });
});

describe('Store + Team locked until draft started', () => {
  test('Store is 403 without draft start', async () => {
    const token = await registerAndLogin('locked-store');
    const res = await request(app).get('/api/store').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('Team is 403 without draft start', async () => {
    const token = await registerAndLogin('locked-team');
    const res = await request(app).get('/api/team').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('both unlock once /api/draft/setup runs', async () => {
    const token = await registerAndLogin('unlocked');
    await setupDraft(token);
    const store = await request(app).get('/api/store').set('Authorization', `Bearer ${token}`);
    expect(store.status).toBe(200);
    expect(store.body.tokens).toBe(500);
    expect(Array.isArray(store.body.items)).toBe(true);

    const team = await request(app).get('/api/team').set('Authorization', `Bearer ${token}`);
    expect(team.status).toBe(200);
    expect(team.body.cpuTeams.length).toBe(29);
  });
});

describe('Store purchase flow', () => {
  async function setupWithPlayer(username) {
    const token = await registerAndLogin(username);
    await setupDraft(token);
    // Draft a single player so we have a target.
    await request(app).post('/api/draft/pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 101, firstName: 'Test', lastName: 'Player', position: 'G', rating: 75 });
    return token;
  }

  test('buying a boost item deducts tokens and lifts rating', async () => {
    const token = await setupWithPlayer('store-buy');
    const res = await request(app).post('/api/store/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId: 'shooting-coach', playerId: 101 });
    expect(res.status).toBe(200);
    // 500 starting - 80 cost + 40 first-purchase achievement bonus = 460.
    expect(res.body.tokens).toBe(500 - 80 + 40);
    expect(res.body.player.boost.offense).toBe(3);
    expect(res.body.player.rating).toBeGreaterThan(75);
  });

  test('rejects unknown item', async () => {
    const token = await setupWithPlayer('store-unknown');
    const res = await request(app).post('/api/store/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId: 'nope', playerId: 101 });
    expect(res.status).toBe(400);
  });

  test('rejects when player not on roster', async () => {
    const token = await setupWithPlayer('store-no-target');
    const res = await request(app).post('/api/store/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId: 'shooting-coach', playerId: 9999 });
    expect(res.status).toBe(400);
  });
});

describe('Draft pick + cpu-fill league-wide uniqueness', () => {
  test('cpu-fill distributes 15 league-wide-unique players per CPU', async () => {
    const token = await registerAndLogin('no-dups');
    await setupDraft(token);
    // User drafts player 5.
    await request(app).post('/api/draft/pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 5, firstName: 'A', lastName: 'B', position: 'G', rating: 80 });

    // 29 CPU teams × 15 picks + user's 1 = 436 needed. Provide 500.
    const pool = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1, firstName: `F${i}`, lastName: `L${i}`, position: 'G', rating: 60 + (i % 30), stats: null,
    }));
    const fill = await request(app).post('/api/draft/cpu-fill')
      .set('Authorization', `Bearer ${token}`)
      .send({ pool });
    expect(fill.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const allClaimed = new Set([5]); // user owns id 5
    me.body.cpuTeams.forEach(t => {
      expect(t.players).toHaveLength(15);
      t.players.forEach(p => {
        // League-wide uniqueness — no player on more than one roster, and
        // none can match the user's pick (id 5).
        expect(allClaimed.has(p.playerId)).toBe(false);
        allClaimed.add(p.playerId);
      });
    });
  });

  test('user CANNOT draft a player a CPU already owns (league-wide uniqueness)', async () => {
    const token = await registerAndLogin('dup-pick');
    await setupDraft(token);
    const pool = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1, firstName: `F${i}`, lastName: `L${i}`, position: 'G', rating: 60 + (i % 30), stats: null,
    }));
    await request(app).post('/api/draft/cpu-fill')
      .set('Authorization', `Bearer ${token}`)
      .send({ pool });

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const cpuOwnedId = me.body.cpuTeams[0].players[0].playerId;
    const res = await request(app).post('/api/draft/pick')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: cpuOwnedId, firstName: 'X', lastName: 'Y', position: 'G', rating: 80 });
    // Server rejects with 409 Conflict so the client can refetch /pool.
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Already drafted by/);
  });
});

describe('Team management actions', () => {
  async function bootstrap(username, picks = 3) {
    const token = await registerAndLogin(username);
    await setupDraft(token);
    for (let i = 1; i <= picks; i++) {
      await request(app).post('/api/draft/pick')
        .set('Authorization', `Bearer ${token}`)
        .send({ playerId: 1000 + i, firstName: `P${i}`, lastName: 'X', position: 'G', rating: 70 + i });
    }
    return token;
  }

  test('lineup endpoint sets inLineup and limits to 5', async () => {
    const token = await bootstrap('lineup-user');
    const res = await request(app).post('/api/team/lineup')
      .set('Authorization', `Bearer ${token}`)
      .send({ starterIds: [1001, 1002] });
    expect(res.status).toBe(200);
    const inLineup = res.body.team.players.filter(p => p.inLineup).map(p => p.playerId).sort();
    expect(inLineup).toEqual([1001, 1002]);

    const tooMany = await request(app).post('/api/team/lineup')
      .set('Authorization', `Bearer ${token}`)
      .send({ starterIds: [1, 2, 3, 4, 5, 6] });
    expect(tooMany.status).toBe(400);
  });

  test('release removes a player; sign rejects duplicates', async () => {
    const token = await bootstrap('release-user');
    const rel = await request(app).post('/api/team/release')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 1001 });
    expect(rel.status).toBe(200);
    expect(rel.body.team.players.find(p => p.playerId === 1001)).toBeUndefined();

    // Sign a brand-new free agent.
    const sign = await request(app).post('/api/team/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ player: { playerId: 5555, firstName: 'New', lastName: 'Guy', position: 'F', rating: 78 } });
    expect(sign.status).toBe(200);

    // Re-signing the same id should fail (already on roster).
    const dup = await request(app).post('/api/team/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ player: { playerId: 5555, firstName: 'New', lastName: 'Guy', position: 'F', rating: 78 } });
    expect(dup.status).toBe(400);
  });

  test('contract endpoint clamps years and salary', async () => {
    const token = await bootstrap('contract-user');
    const res = await request(app).post('/api/team/contract')
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: 1001, years: 99, salary: 99999 });
    expect(res.status).toBe(200);
    expect(res.body.player.contract.years).toBe(5);
    expect(res.body.player.contract.salary).toBe(60);
  });

  test('trade is rejected when offer is significantly weaker', async () => {
    const token = await bootstrap('trade-user');
    // Populate CPU teams with a known high-rated pool so the trade target exists.
    const pool = Array.from({ length: 400 }, (_, i) => ({
      id: 2000 + i, firstName: `F${i}`, lastName: `L${i}`, position: 'G',
      rating: 60 + (i % 35), stats: null,
    }));
    await request(app).post('/api/draft/cpu-fill')
      .set('Authorization', `Bearer ${token}`)
      .send({ pool });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    // Find a CPU player rated much higher than our weakest pick (rating 71..73).
    let target = null;
    for (const t of me.body.cpuTeams) {
      const high = t.players.find(p => p.rating >= 90);
      if (high) { target = { team: t.name, player: high }; break; }
    }
    if (!target) {
      // If no CPU is that high (random), settle for anyone > 80.
      for (const t of me.body.cpuTeams) {
        const high = t.players.find(p => p.rating >= 80);
        if (high) { target = { team: t.name, player: high }; break; }
      }
    }
    expect(target).not.toBeNull();

    // Offer our weakest player (rating 71) for a much stronger CPU player.
    const res = await request(app).post('/api/team/trade')
      .set('Authorization', `Bearer ${token}`)
      .send({
        offerPlayerId: 1001,
        targetCpuTeamName: target.team,
        targetPlayerId: target.player.playerId,
      });
    // Either rejected (preferred) or accepted if luck of the draw landed
    // a CPU player only ~3 points above our offer — accept both as valid.
    if ((target.player.rating || 0) - 71 > 3) {
      expect(res.status).toBe(409);
      expect(res.body.accepted).toBe(false);
    } else {
      expect(res.status).toBe(200);
    }
  });
});
