// Sprint D — awards + records unit tests.
require('./setup');

const { computeSeasonAwards, _internal } = require('../services/awards');
const {
  computeFranchiseRecords,
  computeAllTimeLeaders,
  computeBanners,
  evaluateHallOfFame,
  playerCareerStats,
} = require('../services/records');

function mkPlayer(id, opts = {}) {
  return {
    playerId: id,
    firstName: opts.firstName || 'Player',
    lastName: opts.lastName || `#${id}`,
    position: opts.position || 'G',
    rating: opts.rating || 75,
    age: opts.age || 26,
    iq: opts.iq || 75,
    clutch: opts.clutch || 50,
    boost: opts.boost || { offense: 0, defense: 0, athleticism: 0 },
    injury: { gamesRemaining: 0 },
  };
}

function mkUser({ userPlayers, cpuTeams, seasonWins = 50, seasonNumber = 1 }) {
  const cpuRecords = (cpuTeams || []).map(t => ({ name: t.name, wins: t.wins, losses: 82 - t.wins }));
  return {
    seasonNumber,
    seasonWins,
    seasonLosses: 82 - seasonWins,
    team: { name: 'My Team', players: userPlayers },
    cpuTeams: (cpuTeams || []).map(t => ({ name: t.name, players: t.players })),
    cpuRecords,
    career: [],
    careerAwards: [],
    lastDevelopmentReport: null,
  };
}

describe('Awards — MVP / DPOY / ROY', () => {
  test('MVP goes to a high-rated, high-volume scorer on a winning team', () => {
    const star = mkPlayer(1, { firstName: 'Lebron', lastName: 'James', position: 'SF', rating: 96, iq: 95, clutch: 95 });
    const filler = (id) => mkPlayer(id, { rating: 70 });
    const userPlayers = [star, filler(2), filler(3), filler(4), filler(5), filler(6)];
    const cpu = {
      name: 'Bulls', wins: 30,
      players: Array.from({ length: 8 }, (_, i) => mkPlayer(100 + i, { rating: 72 })),
    };
    const user = mkUser({ userPlayers, cpuTeams: [cpu], seasonWins: 65 });

    const awards = computeSeasonAwards(user);
    expect(awards).toBeTruthy();
    expect(awards.mvp).toBeTruthy();
    expect(awards.mvp.playerId).toBe(1);
    expect(awards.mvp.name).toMatch(/Lebron/);
  });

  test('DPOY favors high-defense centers / wings', () => {
    const dStar = mkPlayer(7, {
      firstName: 'Rudy', lastName: 'Gobert', position: 'C', rating: 88,
      boost: { offense: 0, defense: 12, athleticism: 4 },
    });
    const userPlayers = [dStar, ...Array.from({ length: 7 }, (_, i) => mkPlayer(20 + i, { rating: 72 }))];
    const cpu = {
      name: 'Heat', wins: 35,
      players: Array.from({ length: 8 }, (_, i) => mkPlayer(200 + i, { rating: 70 })),
    };
    const user = mkUser({ userPlayers, cpuTeams: [cpu], seasonWins: 55 });
    const awards = computeSeasonAwards(user);
    expect(awards.dpoy).toBeTruthy();
    expect(awards.dpoy.playerId).toBe(7);
  });

  test('ROY only considers rookies (synthetic ids >= 20_000_000)', () => {
    const veteranSuperstar = mkPlayer(1, { rating: 96 });
    const rookie = mkPlayer(20000001, { firstName: 'Victor', lastName: 'Wembanyama', position: 'C', rating: 84, age: 20 });
    const otherRookie = mkPlayer(20000002, { firstName: 'Scoot', lastName: 'Henderson', position: 'PG', rating: 78, age: 19 });
    const userPlayers = [veteranSuperstar, rookie, otherRookie, ...Array.from({ length: 5 }, (_, i) => mkPlayer(40 + i, { rating: 72 }))];
    const cpu = {
      name: 'Bulls', wins: 30,
      players: Array.from({ length: 8 }, (_, i) => mkPlayer(300 + i, { rating: 70 })),
    };
    const user = mkUser({ userPlayers, cpuTeams: [cpu], seasonWins: 55 });
    const awards = computeSeasonAwards(user);
    expect(awards.roy).toBeTruthy();
    expect([20000001, 20000002]).toContain(awards.roy.playerId);
    expect(awards.roy.playerId).not.toBe(1);
  });

  test('Sixth Man goes to the best bench player (not a starter)', () => {
    // Top 5 by rating = starters. The 6th rated is the 6MOY candidate.
    const players = [
      mkPlayer(1, { rating: 92 }),
      mkPlayer(2, { rating: 90 }),
      mkPlayer(3, { rating: 88 }),
      mkPlayer(4, { rating: 86 }),
      mkPlayer(5, { rating: 84 }),
      mkPlayer(6, { rating: 83, firstName: 'Sixth', lastName: 'Man' }), // top bench
      mkPlayer(7, { rating: 70 }),
    ];
    const cpu = {
      name: 'Suns', wins: 35,
      players: Array.from({ length: 8 }, (_, i) => mkPlayer(400 + i, { rating: 72 })),
    };
    const user = mkUser({ userPlayers: players, cpuTeams: [cpu] });
    const awards = computeSeasonAwards(user);
    expect(awards.sixthMan).toBeTruthy();
    expect(awards.sixthMan.playerId).toBe(6);
  });

  test('All-NBA returns 3 tiers each with 5 players (no duplicates across tiers)', () => {
    const userPlayers = Array.from({ length: 10 }, (_, i) => mkPlayer(i + 1, {
      position: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5],
      rating: 90 - i,
    }));
    const cpu = {
      name: 'Bulls', wins: 35,
      players: Array.from({ length: 12 }, (_, i) => mkPlayer(500 + i, {
        position: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5],
        rating: 80 - i,
      })),
    };
    const user = mkUser({ userPlayers, cpuTeams: [cpu] });
    const awards = computeSeasonAwards(user);
    expect(awards.allNBA).toHaveLength(3);
    expect(awards.allNBA[0].players).toHaveLength(5);
    const allIds = awards.allNBA.flatMap(t => t.players.map(p => p.playerId));
    expect(new Set(allIds).size).toBe(allIds.length); // no duplicates
  });

  test('MIP pulls from lastDevelopmentReport.biggestRisers when present', () => {
    const userPlayers = [
      mkPlayer(1, { rating: 80 }),
      mkPlayer(2, { rating: 78 }),
      mkPlayer(3, { rating: 76 }),
      mkPlayer(4, { rating: 74 }),
      mkPlayer(5, { rating: 72, firstName: 'Most', lastName: 'Improved' }),
    ];
    const cpu = { name: 'Bulls', wins: 35, players: [mkPlayer(99, { rating: 70 })] };
    const user = mkUser({ userPlayers, cpuTeams: [cpu] });
    user.lastDevelopmentReport = {
      biggestRisers: [{ playerId: 5, delta: 6 }],
    };
    const awards = computeSeasonAwards(user);
    expect(awards.mip).toBeTruthy();
    expect(awards.mip.playerId).toBe(5);
    expect(awards.mip.ratingDelta).toBe(6);
  });

  test('returns null with empty rosters', () => {
    const user = mkUser({ userPlayers: [], cpuTeams: [] });
    expect(computeSeasonAwards(user)).toBeNull();
  });
});

describe('Records — franchise / leaders / banners / HOF', () => {
  test('franchise records aggregate seasons + best/worst', () => {
    const user = {
      team: { name: 'My Team' },
      career: [
        { seasonNumber: 1, year: 2026, wins: 50, losses: 32, champion: false, playoffResult: 'first-round' },
        { seasonNumber: 2, year: 2027, wins: 62, losses: 20, champion: true, playoffResult: 'champion' },
        { seasonNumber: 3, year: 2028, wins: 28, losses: 54, champion: false, playoffResult: 'missed' },
      ],
    };
    const games = [
      { _id: 'g1', teamA: { name: 'My Team' }, teamB: { name: 'Bulls' }, scoreA: 130, scoreB: 95 },
      { _id: 'g2', teamA: { name: 'Lakers' }, teamB: { name: 'My Team' }, scoreA: 98,  scoreB: 110 },
    ];
    const r = computeFranchiseRecords(user, games);
    expect(r.seasonsPlayed).toBe(3);
    expect(r.totalWins).toBe(140);
    expect(r.totalLosses).toBe(106);
    expect(r.championships).toBe(1);
    expect(r.bestSeason.seasonNumber).toBe(2);
    expect(r.worstSeason.seasonNumber).toBe(3);
    expect(r.mostPointsInGame.points).toBe(130);
    expect(r.biggestWin.margin).toBe(35);
  });

  test('all-time leaders sum stat lines across seasons', () => {
    const careerAwards = [
      { seasonNumber: 1, statLines: [
        { playerId: 1, name: 'A', position: 'G', teamName: 'My Team', gp: 80, ppg: 28, rpg: 5, apg: 7, spg: 1.5, bpg: 0.5 },
        { playerId: 2, name: 'B', position: 'C', teamName: 'My Team', gp: 70, ppg: 18, rpg: 12, apg: 2, spg: 0.5, bpg: 2.5 },
      ] },
      { seasonNumber: 2, statLines: [
        { playerId: 1, name: 'A', position: 'G', teamName: 'My Team', gp: 80, ppg: 30, rpg: 6, apg: 8, spg: 1.6, bpg: 0.4 },
      ] },
    ];
    const leaders = computeAllTimeLeaders(careerAwards);
    expect(leaders.points[0].playerId).toBe(1);
    // Career points totals: round((28*80) + (30*80)) = 4640
    expect(leaders.points[0].points).toBe(28 * 80 + 30 * 80);
    expect(leaders.points[0].seasons).toBe(2);
  });

  test('banners come from championship seasons', () => {
    const user = {
      team: { name: 'My Team' },
      career: [
        { seasonNumber: 1, year: 2026, wins: 50, losses: 32, champion: false },
        { seasonNumber: 2, year: 2027, wins: 62, losses: 20, champion: true },
        { seasonNumber: 3, year: 2028, wins: 60, losses: 22, champion: true },
      ],
    };
    const banners = computeBanners(user);
    expect(banners).toHaveLength(2);
    expect(banners[0].seasonNumber).toBe(2);
    expect(banners[1].seasonNumber).toBe(3);
  });

  test('Hall of Fame inducts retired players hitting milestones', () => {
    // legend was MVP twice, played 4 seasons, then retired (not on any roster).
    const careerAwards = [
      { seasonNumber: 1, mvp: { playerId: 7 }, allNBA: [{ players: [{ playerId: 7 }] }],
        statLines: [{ playerId: 7, name: 'Legend', position: 'SF', teamName: 'My Team', isUserTeam: true, gp: 82, ppg: 30, rpg: 8, apg: 7, spg: 1.6, bpg: 0.6, rating: 95 }] },
      { seasonNumber: 2, mvp: { playerId: 7 }, allNBA: [{ players: [{ playerId: 7 }] }],
        statLines: [{ playerId: 7, name: 'Legend', position: 'SF', teamName: 'My Team', isUserTeam: true, gp: 82, ppg: 32, rpg: 8, apg: 8, spg: 1.7, bpg: 0.5, rating: 96 }] },
    ];
    const user = {
      team: { name: 'My Team', players: [] }, // legend not on roster anymore = retired
      cpuTeams: [{ name: 'Bulls', players: [] }],
      career: [
        { seasonNumber: 1, champion: false },
        { seasonNumber: 2, champion: true },
      ],
    };
    const inducted = evaluateHallOfFame(user, careerAwards);
    expect(inducted).toHaveLength(1);
    expect(inducted[0].playerId).toBe(7);
    expect(inducted[0].awards.mvps).toBe(2);
    expect(inducted[0].peakRating).toBe(96);
  });

  test('player career stats aggregate per-season lines', () => {
    const careerAwards = [
      { seasonNumber: 1, statLines: [{ playerId: 5, name: 'Star', position: 'G', teamName: 'My Team', gp: 80, ppg: 25, rpg: 5, apg: 6, spg: 1.5, bpg: 0.4 }] },
      { seasonNumber: 2, statLines: [{ playerId: 5, name: 'Star', position: 'G', teamName: 'My Team', gp: 75, ppg: 27, rpg: 5, apg: 7, spg: 1.5, bpg: 0.4 }] },
    ];
    const c = playerCareerStats(careerAwards, 5);
    expect(c).toBeTruthy();
    expect(c.seasons).toHaveLength(2);
    expect(c.careerTotals.points).toBe(25 * 80 + 27 * 75);
    expect(c.careerAverages.ppg).toBeGreaterThan(24);
  });
});
