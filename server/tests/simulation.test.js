const { simulate1v1, simulateBlacktop, simulateGame } = require('../services/simulation');

function makePlayer(id, first, last, rating = 75) {
  return {
    playerId: id,
    firstName: first,
    lastName: last,
    position: 'G',
    rating,
  };
}

function makeFullTeam(name, baseId = 1) {
  return {
    name,
    players: Array.from({ length: 5 }, (_, i) =>
      makePlayer(baseId + i, name.replace(/\s/g, ''), `P${i}`, 70 + i)
    ),
  };
}

describe('simulate1v1', () => {
  test('returns a winner and play log', () => {
    const a = makePlayer(1, 'Alice', 'A', 80);
    const b = makePlayer(2, 'Bob', 'B', 80);
    const result = simulate1v1(a, b, 11);
    expect(typeof result.winner).toBe('string');
    expect(result.scoreA).toBeGreaterThanOrEqual(0);
    expect(result.scoreB).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.plays)).toBe(true);
    expect(result.plays.length).toBeGreaterThan(0);
  });

  test('every play has an outcome flag', () => {
    const a = makePlayer(1, 'Alice', 'A');
    const b = makePlayer(2, 'Bob', 'B');
    const result = simulate1v1(a, b, 11);
    const allowed = new Set(['score', 'miss', 'block', 'turnover']);
    for (const p of result.plays) {
      expect(allowed.has(p.outcome)).toBe(true);
    }
  });

  test('winner name corresponds to higher score', () => {
    const a = makePlayer(1, 'Alice', 'A', 80);
    const b = makePlayer(2, 'Bob', 'B', 80);
    const result = simulate1v1(a, b, 11);
    if (result.scoreA > result.scoreB) expect(result.winner).toBe('Alice A');
    else if (result.scoreB > result.scoreA) expect(result.winner).toBe('Bob B');
  });

  test('higher-rated player wins more often than chance', () => {
    const strong = makePlayer(1, 'Strong', 'X', 99);
    const weak = makePlayer(2, 'Weak', 'Y', 40);
    let strongWins = 0;
    const N = 30;
    for (let i = 0; i < N; i++) {
      const r = simulate1v1(strong, weak, 11);
      if (r.winner.includes('Strong')) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(N * 0.7);
  });
});

describe('simulateBlacktop', () => {
  test('produces a winner and consistent box scores', () => {
    const teamA = { name: 'Reds', players: [makePlayer(1, 'A', 'One'), makePlayer(2, 'A', 'Two'), makePlayer(3, 'A', 'Three')] };
    const teamB = { name: 'Blues', players: [makePlayer(4, 'B', 'One'), makePlayer(5, 'B', 'Two'), makePlayer(6, 'B', 'Three')] };
    const result = simulateBlacktop(teamA, teamB, 15);
    expect(result.winner).toMatch(/Reds|Blues/);
    const sumA = Object.values(result.boxScoreA).reduce((s, p) => s + p.pts, 0);
    const sumB = Object.values(result.boxScoreB).reduce((s, p) => s + p.pts, 0);
    expect(sumA).toBe(result.scoreA);
    expect(sumB).toBe(result.scoreB);
  });

  test('does not produce "X finds X" with a single-player team', () => {
    const solo = { name: 'Solo', players: [makePlayer(1, 'Lone', 'Wolf', 90)] };
    const teamB = { name: 'Pack', players: [makePlayer(2, 'B', 'One'), makePlayer(3, 'B', 'Two')] };
    const result = simulateBlacktop(solo, teamB, 11);
    for (const play of result.plays) {
      expect(play.text).not.toMatch(/Lone Wolf finds Lone Wolf/);
    }
  });
});

describe('simulateGame', () => {
  test('produces a winner and quarter scores', () => {
    const teamA = makeFullTeam('Hawks', 1);
    const teamB = makeFullTeam('Bulls', 100);
    const result = simulateGame(teamA, teamB);
    expect([result.teamA, result.teamB]).toContain(result.winner);
    expect(result.teamStatsA.quarterScores.length).toBeGreaterThanOrEqual(4);
    expect(result.teamStatsB.quarterScores.length).toBeGreaterThanOrEqual(4);
    expect(result.scoreA).toBeGreaterThan(0);
    expect(result.scoreB).toBeGreaterThan(0);
  });
});
