/**
 * Calculate a 0–99 overall rating from season averages.
 * Weights are tuned to approximate 2K-style ratings.
 */
function calculateRating(stats) {
  if (!stats) return 50;

  const pts = stats.pts || 0;
  const reb = stats.reb || 0;
  const ast = stats.ast || 0;
  const stl = stats.stl || 0;
  const blk = stats.blk || 0;
  const fgPct = stats.fg_pct || 0;
  const fg3Pct = stats.fg3_pct || 0;
  const ftPct = stats.ft_pct || 0;
  const turnover = stats.turnover || 0;

  // Scoring component (max ~35)
  const scoring = Math.min(35, pts * 1.2);

  // Efficiency component (max ~20)
  const efficiency = (fgPct * 25) + (fg3Pct * 10) + (ftPct * 5);
  const effCapped = Math.min(20, efficiency / 2);

  // Playmaking (max ~15)
  const playmaking = Math.min(15, ast * 2);

  // Rebounding (max ~10)
  const rebounding = Math.min(10, reb * 0.8);

  // Defense (max ~10)
  const defense = Math.min(10, (stl * 3) + (blk * 3));

  // Turnover penalty (max -5)
  const toPenalty = Math.min(5, turnover * 1.2);

  // Base floor of 40 for any NBA player
  const raw = 40 + scoring + effCapped + playmaking + rebounding + defense - toPenalty;
  return Math.round(Math.min(99, Math.max(40, raw)));
}

/**
 * Given an array of season_averages objects from the API,
 * return an array of { playerId, rating, stats }.
 */
function ratePlayersFromStats(seasonAverages) {
  return seasonAverages.map(sa => ({
    playerId: sa.player_id,
    rating: calculateRating(sa),
    stats: {
      pts: sa.pts,
      reb: sa.reb,
      ast: sa.ast,
      stl: sa.stl,
      blk: sa.blk,
      fg_pct: sa.fg_pct,
      fg3_pct: sa.fg3_pct,
      ft_pct: sa.ft_pct,
      turnover: sa.turnover,
      min: sa.min,
      games_played: sa.games_played,
    },
  }));
}

/**
 * Estimate a rating from player profile data (draft info, position, height).
 * Used when season stats are unavailable (free API tier).
 */
function calculateRatingFromProfile(player) {
  const draftRound = player.draft_round;
  const draftNumber = player.draft_number;
  const draftYear = player.draft_year;

  let base;
  if (!draftRound) {
    // Undrafted — wide range
    base = 55 + Math.floor(Math.random() * 12);
  } else if (draftRound === 1) {
    if (draftNumber <= 3) {
      base = 80 + Math.floor(Math.random() * 8);
    } else if (draftNumber <= 14) {
      base = 72 + Math.floor(Math.random() * 8);
    } else {
      base = 65 + Math.floor(Math.random() * 8);
    }
  } else {
    base = 58 + Math.floor(Math.random() * 10);
  }

  // Veteran bonus — players drafted longer ago gain experience
  if (draftYear) {
    const yearsInLeague = new Date().getFullYear() - draftYear;
    if (yearsInLeague >= 4 && yearsInLeague <= 12) {
      base += Math.min(5, Math.floor(yearsInLeague / 2));
    } else if (yearsInLeague > 14) {
      base -= 2; // slight decline for very old players
    }
  }

  return Math.round(Math.min(99, Math.max(40, base)));
}

module.exports = { calculateRating, ratePlayersFromStats, calculateRatingFromProfile, getPlayerEra };

/**
 * Determine a player's NBA era based on draft year or career years.
 */
function getPlayerEra(draftYear) {
  if (!draftYear) return { era: 'Unknown', decade: null, color: '#64748b' };
  if (draftYear < 1970) return { era: 'Pioneer', decade: '60s', color: '#a78bfa' };
  if (draftYear < 1980) return { era: 'Classic', decade: '70s', color: '#c084fc' };
  if (draftYear < 1990) return { era: 'Showtime', decade: '80s', color: '#f472b6' };
  if (draftYear < 2000) return { era: 'Golden', decade: '90s', color: '#fb923c' };
  if (draftYear < 2010) return { era: 'New School', decade: '00s', color: '#34d399' };
  if (draftYear < 2020) return { era: 'Modern', decade: '10s', color: '#38bdf8' };
  return { era: 'Current', decade: '20s', color: '#22c55e' };
}
