// AI-flavored news headline generator.
//
// We don't call out to a real LLM — generating slop headlines locally is
// fast, free, deterministic-enough to test, and keeps tokens for actual
// gameplay. Each generator returns { id, kind, headline, body }.

const crypto = require('crypto');

function rid(prefix = 'n') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

// Game recap headline + body. `result` is the simulateGame() output;
// `userTeam` is the user's team name.
function gameRecap({ result, userTeam, seasonNumber }) {
  const userWon = result.winner === userTeam;
  const winnerName = userWon ? userTeam : (result.teamA === userTeam ? result.teamB : result.teamA);
  const winScore = Math.max(result.scoreA, result.scoreB);
  const lossScore = Math.min(result.scoreA, result.scoreB);
  const margin = winScore - lossScore;

  const winHeadlines = [
    `${userTeam} run wild over ${otherTeam(result, userTeam)}, ${winScore}-${lossScore}`,
    `${userTeam} cruise past ${otherTeam(result, userTeam)} ${winScore}-${lossScore}`,
    `${userTeam} dominate down the stretch in ${winScore}-${lossScore} win`,
    `${userTeam} hold off ${otherTeam(result, userTeam)} for ${winScore}-${lossScore} victory`,
  ];
  const lossHeadlines = [
    `${userTeam} fall to ${winnerName}, ${lossScore}-${winScore}`,
    `${winnerName} hand ${userTeam} a ${winScore}-${lossScore} loss`,
    `${userTeam} can't keep up in ${lossScore}-${winScore} setback`,
    `Late surge dooms ${userTeam} in ${lossScore}-${winScore} defeat to ${winnerName}`,
  ];
  const closeHeadlines = [
    `Buzzer-beater chaos: ${winnerName} edge ${userWon ? otherTeam(result, userTeam) : userTeam} ${winScore}-${lossScore}`,
    `${winnerName} survive a ${margin}-point thriller, ${winScore}-${lossScore}`,
  ];
  const blowoutHeadlines = [
    `${winnerName} blow the doors off in ${winScore}-${lossScore} statement game`,
    `Rout watch: ${winnerName} bury opponents ${winScore}-${lossScore}`,
  ];

  let headline;
  if (margin <= 4) headline = pick(closeHeadlines);
  else if (margin >= 20) headline = pick(blowoutHeadlines);
  else headline = pick(userWon ? winHeadlines : lossHeadlines);

  const leaderName = result.leaders?.points
    ? `${result.leaders.points.firstName} ${result.leaders.points.lastName} (${result.leaders.points.points} pts)`
    : null;
  const body = leaderName
    ? `${leaderName} led all scorers in a ${result.scoreA}-${result.scoreB} battle. ` +
      (userWon ? `It's another notch in the ${userTeam} win column.` : `${winnerName} steal another one and head home happy.`)
    : `${winnerName} take the W in a ${winScore}-${lossScore} contest.`;

  return { id: rid('game'), kind: 'game', headline, body, seasonNumber };
}

function otherTeam(result, mineName) {
  return result.teamA === mineName ? result.teamB : result.teamA;
}

// Generate trade-deadline rumor headlines about random CPU teams.
function generateTradeRumors(user, count = 3) {
  if (!user.cpuTeams?.length) return [];
  const rumors = [];
  const cpus = [...user.cpuTeams].sort(() => Math.random() - 0.5).slice(0, count);
  for (const t of cpus) {
    if (!t.players?.length) continue;
    const p = pick(t.players);
    const partners = user.cpuTeams.filter(o => o.name !== t.name);
    if (!partners.length) continue;
    const partner = pick(partners);
    const headlines = [
      `RUMOR: ${t.name} shopping ${p.firstName} ${p.lastName} ahead of deadline`,
      `Sources: ${partner.name} have called ${t.name} about ${p.firstName} ${p.lastName}`,
      `${p.firstName} ${p.lastName} on the move? ${t.name} reportedly listening to offers`,
      `${partner.name} eyeing ${p.firstName} ${p.lastName} as a deadline target`,
    ];
    const bodies = [
      `League sources say ${t.name} are open to moving ${p.firstName} ${p.lastName} (${p.position}, ${p.rating} OVR) for the right package.`,
      `Front offices around the league are pinging ${t.name} about ${p.firstName} ${p.lastName}'s availability.`,
      `${partner.name} are believed to view ${p.firstName} ${p.lastName} as a final piece for a deep playoff run.`,
    ];
    rumors.push({
      id: rid('trade'),
      kind: 'trade',
      headline: pick(headlines),
      body: pick(bodies),
      seasonNumber: user.seasonNumber,
    });
  }
  return rumors;
}

// Headline-style note for an unlocked achievement.
function achievementHeadline(achievement, user) {
  return {
    id: rid('ach'),
    kind: 'achievement',
    headline: `🏆 ${user.team?.name || 'You'} unlock "${achievement.name}"`,
    body: `Reward: +${achievement.tokens} tokens. Keep building the dynasty.`,
    seasonNumber: user.seasonNumber,
  };
}

// All-Star ballot release headline.
function allStarHeadline(user) {
  return {
    id: rid('as'),
    kind: 'allstar',
    headline: `🌟 All-Star ballots are in — pick your starters`,
    body: `Voting is OPEN. Performance and popularity both count. Your votes shape the East vs. West showdown.`,
    seasonNumber: user.seasonNumber,
  };
}

// Push a news entry onto the user's feed (newest first), capped at 200.
function pushNews(user, entry) {
  if (!entry) return;
  user.news = user.news || [];
  user.news.unshift(entry);
  if (user.news.length > 200) user.news.length = 200;
}

module.exports = {
  gameRecap,
  generateTradeRumors,
  achievementHeadline,
  allStarHeadline,
  pushNews,
};
