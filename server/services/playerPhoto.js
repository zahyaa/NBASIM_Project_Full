/**
 * Player headshot resolver.
 *
 * balldontlie player IDs are not the same as NBA.com or ESPN athlete IDs,
 * so we look players up by name on ESPN's public search API and cache the
 * resolved CDN URL in memory for the lifetime of the process (24h max).
 *
 * If lookup fails (network, no match, rate limit), we return null and the
 * frontend falls back to its initials avatar — no errors bubble up.
 */
const axios = require('axios');

const CACHE = new Map(); // key: lowercase "first last" -> { url, fetchedAt }
const TTL_MS = 24 * 60 * 60 * 1000;

const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/search/v2';
const ESPN_HEADSHOT = (id) => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;

function cacheKey(firstName, lastName) {
  return `${(firstName || '').trim()} ${(lastName || '').trim()}`.toLowerCase();
}

/**
 * Resolve a player headshot URL. Returns null on any failure.
 * @param {string} firstName
 * @param {string} lastName
 * @returns {Promise<string|null>}
 */
async function getPlayerPhotoUrl(firstName, lastName) {
  const key = cacheKey(firstName, lastName);
  if (!key.trim()) return null;

  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.url;
  }

  try {
    const { data } = await axios.get(ESPN_SEARCH, {
      params: {
        query: `${firstName} ${lastName}`,
        type: 'player',
        limit: 5,
      },
      timeout: 4000,
    });

    // Response shape:
    // { results: [{ type:'player', contents: [{ id, displayName, defaultLeagueSlug, sport, image:{default}, ... }] }] }
    const playerBucket = (data?.results || []).find(r => r.type === 'player');
    const items = playerBucket?.contents || [];
    // Prefer NBA basketball matches whose displayName matches the requested name.
    const expected = `${firstName} ${lastName}`.toLowerCase();
    let match = items.find(it =>
      (it.defaultLeagueSlug === 'nba' || (it.sport || '').toLowerCase() === 'basketball') &&
      (it.displayName || '').toLowerCase() === expected
    ) || items.find(it =>
      it.defaultLeagueSlug === 'nba' || (it.sport || '').toLowerCase() === 'basketball'
    );

    let url = null;
    if (match) {
      url = match.image?.default || match.image?.defaultDark || null;
      if (!url) {
        // Fall back to extracting the numeric ESPN ID from uid (e.g. "s:40~l:46~a:3975")
        const m = (match.uid || '').match(/a:(\d+)/);
        if (m) url = ESPN_HEADSHOT(m[1]);
      }
    }

    CACHE.set(key, { url, fetchedAt: Date.now() });
    return url;
  } catch (err) {
    // Negative-cache for ~1h so transient errors don't get pinned for 24h.
    CACHE.set(key, { url: null, fetchedAt: Date.now() - TTL_MS + 60 * 60 * 1000 });
    return null;
  }
}

module.exports = { getPlayerPhotoUrl };
