/**
 * NBA image URL helpers.
 * Uses NBA.com CDN for player headshots and team logos.
 * Uses ESPN CDN as fallback for team logos.
 */

// Mapping: balldontlie team ID → NBA.com team ID
const TEAM_ID_MAP = {
  1: 1610612737,  // Atlanta Hawks
  2: 1610612738,  // Boston Celtics
  3: 1610612751,  // Brooklyn Nets
  4: 1610612766,  // Charlotte Hornets
  5: 1610612741,  // Chicago Bulls
  6: 1610612739,  // Cleveland Cavaliers
  7: 1610612742,  // Dallas Mavericks
  8: 1610612743,  // Denver Nuggets
  9: 1610612765,  // Detroit Pistons
  10: 1610612744, // Golden State Warriors
  11: 1610612745, // Houston Rockets
  12: 1610612754, // Indiana Pacers
  13: 1610612746, // LA Clippers
  14: 1610612747, // Los Angeles Lakers
  15: 1610612763, // Memphis Grizzlies
  16: 1610612748, // Miami Heat
  17: 1610612749, // Milwaukee Bucks
  18: 1610612750, // Minnesota Timberwolves
  19: 1610612740, // New Orleans Pelicans
  20: 1610612752, // New York Knicks
  21: 1610612760, // Oklahoma City Thunder
  22: 1610612753, // Orlando Magic
  23: 1610612755, // Philadelphia 76ers
  24: 1610612756, // Phoenix Suns
  25: 1610612757, // Portland Trail Blazers
  26: 1610612758, // Sacramento Kings
  27: 1610612759, // San Antonio Spurs
  28: 1610612761, // Toronto Raptors
  29: 1610612762, // Utah Jazz
  30: 1610612764, // Washington Wizards
};

// Mapping: balldontlie team ID → ESPN abbreviation
const TEAM_ABBR_MAP = {
  1: 'atl', 2: 'bos', 3: 'bkn', 4: 'cha', 5: 'chi',
  6: 'cle', 7: 'dal', 8: 'den', 9: 'det', 10: 'gs',
  11: 'hou', 12: 'ind', 13: 'lac', 14: 'lal', 15: 'mem',
  16: 'mia', 17: 'mil', 18: 'min', 19: 'no', 20: 'ny',
  21: 'okc', 22: 'orl', 23: 'phi', 24: 'phx', 25: 'por',
  26: 'sac', 27: 'sa', 28: 'tor', 29: 'utah', 30: 'wsh',
};

// Team full name → balldontlie ID (for reverse lookups)
const TEAM_NAME_MAP = {
  'Atlanta Hawks': 1, 'Boston Celtics': 2, 'Brooklyn Nets': 3,
  'Charlotte Hornets': 4, 'Chicago Bulls': 5, 'Cleveland Cavaliers': 6,
  'Dallas Mavericks': 7, 'Denver Nuggets': 8, 'Detroit Pistons': 9,
  'Golden State Warriors': 10, 'Houston Rockets': 11, 'Indiana Pacers': 12,
  'LA Clippers': 13, 'Los Angeles Lakers': 14, 'Memphis Grizzlies': 15,
  'Miami Heat': 16, 'Milwaukee Bucks': 17, 'Minnesota Timberwolves': 18,
  'New Orleans Pelicans': 19, 'New York Knicks': 20, 'Oklahoma City Thunder': 21,
  'Orlando Magic': 22, 'Philadelphia 76ers': 23, 'Phoenix Suns': 24,
  'Portland Trail Blazers': 25, 'Sacramento Kings': 26, 'San Antonio Spurs': 27,
  'Toronto Raptors': 28, 'Utah Jazz': 29, 'Washington Wizards': 30,
};

/**
 * Get player headshot URL from NBA.com CDN.
 * Falls back to a silhouette placeholder.
 */
function getPlayerImageUrl(nbaComPlayerId) {
  if (!nbaComPlayerId) return null;
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaComPlayerId}.png`;
}

/**
 * Get team logo URL from NBA.com CDN.
 */
function getTeamLogoUrl(bdlTeamId) {
  const nbaId = TEAM_ID_MAP[bdlTeamId];
  if (!nbaId) return null;
  return `https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`;
}

/**
 * Get team logo from ESPN CDN (PNG, good fallback).
 */
function getTeamLogoEspn(bdlTeamId) {
  const abbr = TEAM_ABBR_MAP[bdlTeamId];
  if (!abbr) return null;
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/scoreboard/${abbr}.png&scale=crop&cquality=40&location=origin&w=80&h=80`;
}

/**
 * Get team abbreviation from full name.
 */
function getTeamAbbr(teamFullName) {
  const id = TEAM_NAME_MAP[teamFullName];
  return TEAM_ABBR_MAP[id] || null;
}

function getTeamIdFromName(teamFullName) {
  return TEAM_NAME_MAP[teamFullName] || null;
}

module.exports = {
  TEAM_ID_MAP,
  TEAM_ABBR_MAP,
  TEAM_NAME_MAP,
  getPlayerImageUrl,
  getTeamLogoUrl,
  getTeamLogoEspn,
  getTeamAbbr,
  getTeamIdFromName,
};
