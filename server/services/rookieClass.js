// Rookie class generator. Called when a season + playoffs end so the next
// year's draft pool contains 60 incoming prospects (NBA = 60 picks across
// two rounds). Each rookie is a stable synthetic player with NBA-realistic
// physicals, school/country, and a rating curve weighted toward the top of
// the lottery (so picks 1-5 are stars, picks 50-60 are project players).
//
// We seed the name pools from current active player surnames so generated
// rookies feel grounded ("Jaylen Brown Jr.", "K. Doncic", etc. style) without
// hitting any external API at season-end.

const FIRST_NAMES = [
  'Jalen', 'Jaylen', 'Jaden', 'Tyrese', 'Cason', 'Reed', 'Cooper', 'Dylan',
  'Trey', 'Trayce', 'Tre', 'Bronny', 'Bryce', 'Brice', 'Cade', 'Caden',
  'Devin', 'Dereck', 'Donovan', 'Dyson', 'Emoni', 'Evan', 'Garrison',
  'Hunter', 'Isaiah', 'Izaiah', 'Jared', 'Justin', 'Khaman', 'Kel\'el',
  'Keyontae', 'Kyle', 'Kobe', 'Kira', 'Lamont', 'Marcus', 'Maxwell',
  'Mikael', 'Nique', 'Omari', 'Quincy', 'Ron', 'Scoot', 'Seth', 'Tariq',
  'Terrence', 'Trayvon', 'Yves', 'Zach', 'Zion', 'Aleksej', 'Ariel',
  'Bilal', 'Damir', 'Egor', 'Filip', 'Hugo', 'Ousmane', 'Theo', 'Victor',
  'Yuki', 'Carlos', 'Diego', 'Joaquim', 'Mateus',
];

const LAST_NAMES = [
  'Anderson', 'Banks', 'Booker', 'Brown', 'Carter', 'Clark', 'Davis',
  'Edwards', 'Foster', 'Garcia', 'Greene', 'Hall', 'Harris', 'Hayes',
  'Henderson', 'Holloway', 'Howard', 'Ingram', 'Jackson', 'James', 'Johnson',
  'Jones', 'Kirby', 'Knight', 'Lopez', 'Mathurin', 'Mitchell', 'Morgan',
  'Murray', 'Nguyen', 'Okafor', 'Owens', 'Patel', 'Powell', 'Quinn',
  'Reeves', 'Roberts', 'Rodriguez', 'Sanders', 'Scott', 'Sharpe', 'Smith',
  'Stewart', 'Thomas', 'Thompson', 'Turner', 'Vega', 'Walker', 'Wallace',
  'Washington', 'Watson', 'White', 'Williams', 'Wilson', 'Wright',
  'Antetokounmpo', 'Doncic', 'Jokic', 'Sabonis', 'Sengun', 'Wembanyama',
];

// Top-tier US college basketball programs that consistently produce NBA picks.
const SCHOOLS = [
  'Duke', 'North Carolina', 'Kentucky', 'Kansas', 'UCLA', 'Arizona',
  'Gonzaga', 'Michigan', 'Michigan State', 'Florida', 'Texas', 'Baylor',
  'Houston', 'Tennessee', 'Auburn', 'Alabama', 'LSU', 'Purdue',
  'Villanova', 'Connecticut', 'Marquette', 'Indiana', 'Illinois',
  'Georgetown', 'Syracuse', 'Memphis', 'Oklahoma', 'Oklahoma State',
  'Colorado', 'Iowa State', 'Creighton', 'Wisconsin', 'Maryland',
  'Stanford', 'Oregon', 'Washington', 'Virginia', 'NC State',
  'Wake Forest', 'Florida State', 'Miami', 'Saint Joseph\'s',
  // International routes — these slot into the "School" field as the
  // pre-NBA team for non-US prospects.
  'Real Madrid (ESP)', 'Barcelona (ESP)', 'Olimpia Milano (ITA)',
  'Partizan (SRB)', 'Mega Basket (SRB)', 'Maccabi Tel Aviv (ISR)',
  'ASVEL (FRA)', 'Metropolitans 92 (FRA)', 'NBL Adelaide (AUS)',
  'NBL Illawarra (AUS)', 'G League Ignite', 'Overtime Elite',
];

// Country pool — weighted toward USA. International names map to non-US
// countries when possible (very rough, just for flavour on the Bio card).
const COUNTRIES_USA_HEAVY = [
  'USA', 'USA', 'USA', 'USA', 'USA', 'USA', 'USA', 'USA',
  'France', 'Spain', 'Serbia', 'Slovenia', 'Greece', 'Lithuania',
  'Australia', 'Canada', 'Germany', 'Nigeria', 'Cameroon',
  'Brazil', 'Argentina', 'Japan', 'New Zealand', 'Turkey', 'Senegal',
];

const POSITIONS_BY_TIER = {
  // Lottery: a balanced mix
  lottery: ['G', 'G', 'G-F', 'F', 'F', 'F-C', 'C'],
  // Mid-1st: more wings & guards
  mid:     ['G', 'G', 'G-F', 'G-F', 'F', 'F', 'C'],
  // Late-2nd: specialists, stretch bigs, project guards
  late:    ['G', 'G-F', 'F', 'F-C', 'C'],
};

// Mulberry32 seeded RNG so the same year always produces the same class
// (deterministic across re-renders and re-saves of the same season).
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// NBA-realistic height/weight ranges per position. Returns inches + lb.
function physicalsFor(position, rand) {
  // Bell-curve via 2-roll average so freaks at the edges are rare.
  const r = (rand() + rand()) / 2;
  let minH, maxH, minW, maxW;
  switch (position) {
    case 'G':       minH = 72; maxH = 78; minW = 175; maxW = 215; break; // 6'0"-6'6"
    case 'G-F':     minH = 76; maxH = 81; minW = 195; maxW = 230; break; // 6'4"-6'9"
    case 'F':       minH = 78; maxH = 83; minW = 210; maxW = 250; break; // 6'6"-6'11"
    case 'F-C':     minH = 80; maxH = 84; minW = 225; maxW = 265; break;
    case 'C':       minH = 81; maxH = 87; minW = 240; maxW = 285; break; // 6'9"-7'3"
    default:        minH = 76; maxH = 82; minW = 200; maxW = 240;
  }
  return {
    heightIn: Math.round(minH + r * (maxH - minH)),
    weightLb: Math.round(minW + r * (maxW - minW)),
  };
}

function ratingForPick(slot, rand) {
  // Slot 1-60. Top-3 picks: 78-85, lottery 73-82, mid-1st 68-78,
  // 2nd round 60-72. Add a small noise term for variation.
  let base;
  if (slot <= 3)        base = 80;
  else if (slot <= 14)  base = 76;
  else if (slot <= 30)  base = 71;
  else if (slot <= 45)  base = 66;
  else                  base = 62;
  const noise = Math.round((rand() - 0.5) * 8);
  return Math.max(58, Math.min(85, base + noise));
}

function tierForSlot(slot) {
  if (slot <= 14) return 'lottery';
  if (slot <= 30) return 'mid';
  return 'late';
}

/**
 * Generate a 60-player rookie class for the given draft year.
 * @param {number} draftYear  Year of the draft (e.g. 2026).
 * @param {number} [yearOffset] Used as RNG seed offset so re-runs of the
 *   same draftYear produce the same class but different years differ.
 */
function generateRookieClass(draftYear, yearOffset = 0) {
  const rand = rng((draftYear * 7919 + yearOffset * 31) >>> 0);
  const used = new Set();
  const out = [];
  for (let slot = 1; slot <= 60; slot++) {
    const tier = tierForSlot(slot);
    const position = pick(rand, POSITIONS_BY_TIER[tier]);
    let firstName, lastName, key;
    let attempts = 0;
    do {
      firstName = pick(rand, FIRST_NAMES);
      lastName = pick(rand, LAST_NAMES);
      key = `${firstName} ${lastName}`.toLowerCase();
      attempts++;
    } while (used.has(key) && attempts < 12);
    used.add(key);

    const { heightIn, weightLb } = physicalsFor(position, rand);
    const country = pick(rand, COUNTRIES_USA_HEAVY);
    const school = pick(rand, SCHOOLS);
    const rating = ratingForPick(slot, rand);

    out.push({
      // 20_000_000 keeps rookie ids well above NBA api ids (typically <100k)
      // and above synthetic D-League ids (10_000_000+). Per-year offset so
      // 2026 rookies don't collide with 2027 rookies in saved drafts.
      playerId: 20_000_000 + draftYear * 100 + slot,
      firstName,
      lastName,
      position,
      school,
      country,
      heightIn,
      weightLb,
      rating,
      draftYear,
    });
  }
  return out;
}

/**
 * Convenience helper used by season-end logic. Sets user.rookieClass for
 * the upcoming draft year if not already populated, idempotent so callers
 * can invoke it on every advance without risk.
 */
function ensureRookieClassFor(user, draftYear) {
  if (user.rookieClassYear === draftYear && (user.rookieClass || []).length === 60) {
    return user.rookieClass;
  }
  user.rookieClass = generateRookieClass(draftYear);
  user.rookieClassYear = draftYear;
  return user.rookieClass;
}

module.exports = { generateRookieClass, ensureRookieClassFor };
