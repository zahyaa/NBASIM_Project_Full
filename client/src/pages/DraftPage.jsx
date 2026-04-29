import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// In-memory cache for headshot URLs so the same player isn't re-fetched
// across renders. Keyed by lowercase "first last".
const headshotCache = new Map();
const headshotKey = (p) => `${(p.firstName || '').trim()} ${(p.lastName || '').trim()}`.toLowerCase();

// Conference -> divisions, mirroring NBA structure. Used so the user can't
// pair (e.g.) "Atlantic" with the Western Conference.
const DIVISIONS = {
  East: ['Atlantic', 'Central', 'Southeast'],
  West: ['Northwest', 'Pacific', 'Southwest'],
};

// Cities split into market tiers — Tier I major, II mid, III small / low-market.
const CITY_TIERS = {
  I: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Dallas', 'Philadelphia',
    'Boston', 'Miami', 'Atlanta', 'Washington D.C.', 'Phoenix', 'San Francisco',
  ],
  II: [
    'Denver', 'Seattle', 'Minneapolis', 'Detroit', 'Cleveland', 'Charlotte',
    'Portland', 'San Diego', 'Tampa', 'Baltimore', 'St. Louis', 'Pittsburgh',
    'Cincinnati', 'Brooklyn',
  ],
  III: [
    'Oklahoma City', 'Memphis', 'Salt Lake City', 'New Orleans', 'Sacramento',
    'San Antonio', 'Indianapolis', 'Milwaukee', 'Orlando', 'Louisville',
    'Nashville', 'Las Vegas', 'Albuquerque', 'Tucson', 'Omaha',
    'Colorado Springs', 'Raleigh', 'Honolulu', 'Jacksonville',
  ],
};

const NBA_COACHES = [
  'Phil Jackson', 'Gregg Popovich', 'Pat Riley', 'Red Auerbach', 'Steve Kerr',
  'Erik Spoelstra', 'Tyronn Lue', 'Doc Rivers', 'Rick Carlisle', 'Larry Brown',
  'Chuck Daly', 'Lenny Wilkens', 'Don Nelson', 'Jerry Sloan', "Mike D'Antoni",
  'Tom Thibodeau', 'Mike Budenholzer', 'Monty Williams', 'Ime Udoka',
  'Joe Mazzulla', 'Jason Kidd', 'Mark Daigneault', 'Chauncey Billups',
  'Quin Snyder', 'JJ Redick', 'Wes Unseld Jr.',
];

const DREAM_TEAMS = [
  { label: 'Eastern Stars', names: ['Jayson Tatum', 'Joel Embiid', 'Giannis Antetokounmpo', 'Jaylen Brown', 'Donovan Mitchell'] },
  { label: 'Western Stars', names: ['LeBron James', 'Stephen Curry', 'Nikola Jokic', 'Luka Doncic', 'Anthony Davis'] },
  { label: 'Young Guns', names: ['Anthony Edwards', 'Victor Wembanyama', 'Paolo Banchero', 'Chet Holmgren', 'Tyrese Haliburton'] },
  { label: 'Modern Bigs', names: ['Joel Embiid', 'Nikola Jokic', 'Karl-Anthony Towns', 'Bam Adebayo', 'Anthony Davis'] },
];

// Season calendar widget for the pre-draft setup screen. Shows a one-glance
// overview of the year's key milestones so the user knows what to expect
// after the snake draft completes (regular season → All-Star → playoffs).
function SeasonCalendar() {
  const months = [
    { m: 'OCT', label: 'Tip-Off',         desc: 'Opening night · season starts',  color: '#22c55e' },
    { m: 'NOV', label: 'Regular Season',  desc: 'Build chemistry · tune lineups', color: '#94a3b8' },
    { m: 'DEC', label: 'Holiday Slate',   desc: 'Christmas Day showcase games',   color: '#ef4444' },
    { m: 'JAN', label: 'New Year Push',   desc: 'Standings start to shape up',    color: '#94a3b8' },
    { m: 'FEB', label: 'All-Star Weekend',desc: '3PT · Dunk · Skills · East/West', color: '#facc15' },
    { m: 'FEB', label: 'Trade Deadline',  desc: 'Rumors fly · last chance to deal',color: '#f97316' },
    { m: 'MAR', label: 'Stretch Run',     desc: 'Seeding battle heats up',        color: '#94a3b8' },
    { m: 'APR', label: 'Final Week',      desc: 'Lock in your playoff seed',      color: '#94a3b8' },
    { m: 'APR', label: 'Playoffs Begin',  desc: 'Top 8 each conference · 1v8',    color: '#60a5fa' },
    { m: 'MAY', label: 'Conf. Finals',    desc: 'Four teams left',                color: '#a855f7' },
    { m: 'JUN', label: 'NBA Finals',      desc: 'East champ vs West champ',       color: '#fbbf24' },
  ];
  return (
    <div data-testid="season-calendar" style={cal.box}>
      <h3 style={cal.title}>📅 Season Calendar</h3>
      <p style={cal.sub}>Here's what you'll experience after the draft:</p>
      <div style={cal.grid}>
        {months.map((mo, i) => (
          <div key={i} style={{ ...cal.cell, borderLeft: `3px solid ${mo.color}` }}>
            <div style={cal.month}>{mo.m}</div>
            <div style={{ ...cal.label, color: mo.color }}>{mo.label}</div>
            <div style={cal.desc}>{mo.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const cal = {
  box: { marginTop: 20, padding: 14, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 },
  title: { margin: '0 0 4px', color: '#fbbf24', fontSize: 16 },
  sub: { margin: '0 0 10px', color: '#94a3b8', fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 },
  cell: { padding: 8, background: '#1e293b', borderRadius: 4, fontSize: 11 },
  month: { fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1 },
  label: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  desc: { color: '#cbd5e1', fontSize: 11, marginTop: 2 },
};

// Snake-draft order panel — shows the user's slot in the current round and
// the next few rounds, with the on-the-clock pick highlighted.
function DraftOrderPanel({ draftOrder, currentPickIdx, userTeamName }) {
  if (!draftOrder.length) return null;
  const TEAMS = 30;
  const totalRounds = Math.ceil(draftOrder.length / TEAMS);
  const currentRound = Math.floor(currentPickIdx / TEAMS);
  const userSlot = draftOrder.find(p => p.isUser)?.slot;
  // Show the current round + next round (or just the current if last).
  const roundsToShow = [currentRound, currentRound + 1].filter(r => r < totalRounds);
  return (
    <div data-testid="draft-order-panel" style={ord.box}>
      <div style={ord.header}>
        <span style={ord.title}>📋 Draft Order</span>
        <span style={ord.meta}>
          You: <strong style={{ color: '#22c55e' }}>{userTeamName || 'Your Team'}</strong>
          {userSlot != null && (
            <> · Slot <strong style={{ color: '#a78bfa' }}>#{userSlot}</strong> of {TEAMS}</>
          )}
        </span>
      </div>
      {roundsToShow.map(r => {
        const slice = draftOrder.slice(r * TEAMS, (r + 1) * TEAMS);
        return (
          <div key={r} style={ord.roundRow}>
            <div style={ord.roundLabel}>Rd {r + 1}</div>
            <div style={ord.slots}>
              {slice.map(p => {
                const isCurrent = p.pickNumber === currentPickIdx + 1;
                const isPast = p.pickNumber <= currentPickIdx;
                return (
                  <div
                    key={p.pickNumber}
                    title={`#${p.pickNumber} ${p.teamName}`}
                    style={{
                      ...ord.slot,
                      opacity: isPast && !isCurrent ? 0.35 : 1,
                      background: isCurrent
                        ? '#facc15'
                        : p.isUser ? '#22c55e' : '#1e293b',
                      color: isCurrent || p.isUser ? '#0f172a' : '#cbd5e1',
                      borderColor: isCurrent ? '#fbbf24' : p.isUser ? '#16a34a' : '#334155',
                      fontWeight: (isCurrent || p.isUser) ? 800 : 600,
                    }}
                  >
                    <span style={ord.slotNum}>{p.pickNumber}</span>
                    <span style={ord.slotTeam}>
                      {p.teamName?.split(' ').slice(-1)[0] || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div style={ord.legend}>
        <span style={{ ...ord.dot, background: '#facc15' }} /> on the clock
        <span style={{ ...ord.dot, background: '#22c55e', marginLeft: 12 }} /> your pick
        <span style={{ ...ord.dot, background: '#1e293b', border: '1px solid #334155', marginLeft: 12 }} /> CPU
      </div>
    </div>
  );
}

const ord = {
  box: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12, margin: '0 auto 14px', maxWidth: 900 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 },
  title: { color: '#fbbf24', fontWeight: 700 },
  meta: { color: '#94a3b8' },
  roundRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  roundLabel: { width: 42, color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 },
  slots: { display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1 },
  slot: {
    minWidth: 56, padding: '4px 6px', borderRadius: 4, border: '1px solid #334155',
    fontSize: 10, display: 'flex', flexDirection: 'column', alignItems: 'center',
    lineHeight: 1.15,
  },
  slotNum: { fontSize: 9, opacity: 0.75 },
  slotTeam: { fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 },
  legend: { color: '#64748b', fontSize: 10, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 },
  dot: { display: 'inline-block', width: 10, height: 10, borderRadius: 2, verticalAlign: 'middle' },
};

export default function DraftPage() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();
  const [rawPool, setRawPool] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [teamName, setTeamName] = useState(user?.team?.name || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState('');

  const [conference, setConference] = useState(user?.conference || '');
  const [division, setDivision] = useState(user?.team?.division || '');
  const [league, setLeague] = useState(user?.league || '');
  const [marketTier, setMarketTier] = useState(user?.team?.marketTier || '');
  const [city, setCity] = useState(user?.team?.city || '');
  const [coach, setCoach] = useState(user?.team?.coach || '');
  const [cityFilter, setCityFilter] = useState('');
  const [coachFilter, setCoachFilter] = useState('');
  const [setupDone, setSetupDone] = useState(!!(user?.conference && user?.league && user?.team?.division));
  // Live "on-the-clock" snake draft state.
  // - draftOrder: full snake order (450 entries) returned by /api/draft/order
  // - currentPickIdx: pointer into draftOrder
  // - timeLeft: seconds left on the clock for the user's pick
  // - allPicks: every pick so far (user + CPU), newest first, for the ticker
  const [draftOrder, setDraftOrder] = useState([]);
  const [currentPickIdx, setCurrentPickIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [allPicks, setAllPicks] = useState([]);
  // When true, an "Assistant GM" auto-picks the best available player for
  // the user every time they're on the clock. Lets the user fast-forward
  // the rest of the draft without sitting through every pick.
  const [autoSim, setAutoSim] = useState(false);
  const USER_PICK_SECONDS = 120; // 2-minute clock per user pick
  const CPU_PICK_DELAY_MS = 900;  // brief on-the-clock pause for each CPU
  const SIM_PICK_DELAY_MS = 600;  // user auto-pick when "Sim Draft" is on

  const onTheClockEntry = draftOrder[currentPickIdx] || null;
  const onTheClock = onTheClockEntry?.teamName || null;
  const isUserOnClock = !!onTheClockEntry?.isUser;
  const draftFinished =
    draftOrder.length > 0 && currentPickIdx >= draftOrder.length;

  const roster = user?.team?.players || [];
  // The game assigns the user's draft slot automatically on setup.
  const lotteryPosition = user?.lotteryPosition || 0;
  const slotAssigned = lotteryPosition >= 1;

  // Players the USER has already drafted. Other teams may share players —
  // the differentiator is what each team buys at the Store — so we no
  // longer cross-filter against CPU rosters.
  const draftedIds = useMemo(() => {
    const s = new Set();
    roster.forEach(p => s.add(p.playerId));
    return s;
  }, [roster]);

  const pool = useMemo(
    () => rawPool.filter(p => !draftedIds.has(p.id)),
    [rawPool, draftedIds]
  );

  const loadDreamTeam = async (preset) => {
    setLoadingPreset(preset.label);
    setError('');
    try {
      const results = await Promise.all(
        preset.names.map(name =>
          fetch(`/api/nba/players/search?q=${encodeURIComponent(name)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.json())
        )
      );
      const players = results.map(r => r.data?.[0]).filter(Boolean);
      setSearchResults(players);
    } catch (err) {
      setError(err.message);
    }
    setLoadingPreset('');
  };

  const tierCities = marketTier ? CITY_TIERS[marketTier] : [...CITY_TIERS.I, ...CITY_TIERS.II, ...CITY_TIERS.III];
  const filteredCities = cityFilter
    ? tierCities.filter(c => c.toLowerCase().includes(cityFilter.toLowerCase()))
    : tierCities;

  const filteredCoaches = coachFilter
    ? NBA_COACHES.filter(c => c.toLowerCase().includes(coachFilter.toLowerCase()))
    : NBA_COACHES;

  const handleSetup = async () => {
    if (!conference || !division || !league || !city || !coach || !teamName.trim()) {
      setError('Team name, league, conference, division, city, and coach are all required.');
      return;
    }
    setError('');
    try {
      const res = await fetch('/api/draft/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conference, division, league, city, coach,
          teamName: teamName.trim(),
          draftType: 'fantasy',
        }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
      setSetupDone(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError('');
    try {
      const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const draftedIds = new Set(roster.map(p => p.playerId));
      setSearchResults(data.data.filter(p => !draftedIds.has(p.id)));
    } catch (err) {
      setError(err.message);
    }
    setSearching(false);
  };

  const fetchPool = useCallback(async () => {
    if (!setupDone) return;
    setLoading(true);
    try {
      // Pool is league-wide (NBA active + D-League supplemental) so the
      // user can draft any player, not just same-conference picks.
      const res = await fetch('/api/draft/pool', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load draft pool');
      setRawPool(await res.json());
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [token, setupDone]);

  useEffect(() => { if (setupDone) fetchPool(); }, [setupDone, fetchPool]);

  // Load the snake-order draft list once setup is complete. The server
  // builds 30 teams × 15 rounds (450 picks) and slots the user. Resume from
  // however many picks have already been recorded (user roster + every CPU
  // roster) so reloading the page mid-draft doesn't reset the clock.
  useEffect(() => {
    if (!setupDone) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/draft/order', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setDraftOrder(data.order || []);
        const made =
          (user?.team?.players?.length || 0) +
          (user?.cpuTeams || []).reduce(
            (n, t) => n + ((t.players || []).length), 0
          );
        setCurrentPickIdx(Math.min(made, (data.order || []).length));
      } catch (_e) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [setupDone, token]); // intentionally not depending on user (loop sets state)

  useEffect(() => {
    if (user?.draftCompleted) navigate('/game');
  }, [user?.draftCompleted, navigate]);

  // Refresh the user record after a pick so cpuTeams + roster reflect the
  // newly drafted player (and the "drafted" filter on the pool stays right).
  const refreshUser = useCallback(async () => {
    const meRes = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (meRes.ok) {
      // Defensive parse: Safari throws "The string did not match the expected
      // pattern." on res.json() for empty / non-JSON bodies. Use text+parse.
      const raw = await meRes.text();
      if (!raw) return null;
      let me;
      try { me = JSON.parse(raw); }
      catch (_e) { return null; }
      setUser(me);
      return me;
    }
    return null;
  }, [token, setUser]);

  const handlePick = async (player) => {
    if (picking) return;
    if (!isUserOnClock) {
      setError("It's not your turn — wait until you're on the clock.");
      return;
    }
    setPicking(true);
    setError('');
    try {
      const res = await fetch('/api/draft/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          playerId: player.id, firstName: player.firstName, lastName: player.lastName,
          position: player.position, rating: player.rating, stats: player.stats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const entry = onTheClockEntry;
      setAllPicks(prev => [
        {
          pickNumber: entry?.pickNumber, round: entry?.round,
          team: entry?.teamName || (user?.team?.name || 'My Team'),
          player: {
            firstName: player.firstName, lastName: player.lastName,
            position: player.position, rating: player.rating,
          },
          isUser: true,
        },
        ...prev,
      ]);
      // Cross-team duplicates are allowed — only filter the user's own
      // roster (handled by the `pool` memo via draftedIds), so we leave
      // rawPool intact here.
      await refreshUser();
      setCurrentPickIdx(idx => idx + 1);
    } catch (err) {
      setError(err.message);
    }
    setPicking(false);
  };

  // Snake-draft loop: when a CPU team is on the clock, pick the best
  // available player on the server, append to the ticker, advance the index.
  useEffect(() => {
    if (!setupDone || !draftOrder.length) return;
    if (currentPickIdx >= draftOrder.length) return;
    const entry = draftOrder[currentPickIdx];
    if (entry.isUser) {
      setTimeLeft(USER_PICK_SECONDS);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/draft/cpu-pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ teamName: entry.teamName, pool }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.pick) {
          setAllPicks(prev => [
            {
              pickNumber: entry.pickNumber, round: entry.round,
              team: entry.teamName,
              player: data.pick,
              isUser: false,
            },
            ...prev,
          ]);
          // Cross-team duplicates are allowed — keep the player in rawPool
          // so the user (and other CPU teams) can still draft them.
          await refreshUser();
        }
      } catch (_e) { /* ignore individual CPU errors */ }
      if (!cancelled) setCurrentPickIdx(idx => idx + 1);
    }, CPU_PICK_DELAY_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [setupDone, draftOrder, currentPickIdx, pool, token, refreshUser]);

  // 2-minute clock for the user. When it hits 0 we auto-pick the best
  // player still available so the draft never stalls.
  useEffect(() => {
    if (!isUserOnClock) return;
    if (timeLeft <= 0) {
      const best = pool[0];
      if (best) handlePick(best);
      return;
    }
    const id = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserOnClock, timeLeft]);

  // Assistant-GM auto-pick. When `autoSim` is on AND it's the user's turn,
  // wait briefly and submit the best available player. The CPU loop already
  // handles non-user picks, so toggling this once will fast-forward the
  // entire remainder of the draft for the user.
  useEffect(() => {
    if (!autoSim || !isUserOnClock || picking) return;
    if (roster.length >= 15) return;
    const best = pool[0];
    if (!best) return;
    const t = setTimeout(() => { handlePick(best); }, SIM_PICK_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSim, isUserOnClock, picking, pool, roster.length]);

  const handleComplete = async () => {
    try {
      const res = await fetch('/api/draft/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teamName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Hand the rest of the draft pool to the server so CPUs can fill out
      // their rosters (no duplicates with what the user just drafted).
      await fetch('/api/draft/cpu-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pool: rawPool }),
      });
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
    } catch (err) {
      setError(err.message);
    }
  };

  // "Sim All Draft" — assistant GM auto-fills the user's roster best-available
  // and runs cpu-fill in one server round-trip, skipping the entire on-the-clock
  // experience. Bounces to /game when done.
  const [simmingAll, setSimmingAll] = useState(false);
  const handleSimAll = async () => {
    if (simmingAll) return;
    if (!window.confirm('Skip the rest of the draft? The assistant GM will fill your roster and every CPU team in one shot.')) return;
    setSimmingAll(true);
    setError('');
    try {
      const res = await fetch('/api/draft/sim-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pool: rawPool }),
      });
      const raw = await res.text();
      let data = {};
      if (raw) { try { data = JSON.parse(raw); } catch (_e) {} }
      if (!res.ok) throw new Error(data.error || `Sim failed (${res.status})`);
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (meRes.ok) {
        const meRaw = await meRes.text();
        if (meRaw) { try { setUser(JSON.parse(meRaw)); } catch (_e) {} }
      }
    } catch (err) {
      setError(err.message);
    }
    setSimmingAll(false);
  };

  // Once the snake order completes (450 picks) the user roster is full and
  // every CPU team has 15 players — auto-finalize and bounce to /game.
  useEffect(() => {
    if (!draftFinished) return;
    if (user?.draftCompleted) return;
    if (roster.length < 15) return;
    handleComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFinished, user?.draftCompleted, roster.length]);

  const PlayerCard = ({ player }) => (
    <div style={s.playerCard}>
      <HeadshotImage player={player} size={44} />
      {player.teamLogo && <img src={player.teamLogo} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />}
      <div style={s.playerInfo}>
        <span style={s.playerName}>{player.firstName} {player.lastName}</span>
        <span style={s.playerMeta}>
          {player.position} | {player.team}
          {player.league === 'D-League' && (
            <span style={{ marginLeft: 6, color: '#f59e0b', fontWeight: 700, fontSize: 10 }}>G-LEAGUE</span>
          )}
          {player.era && <span style={{ marginLeft: 6, color: player.era.color, fontWeight: 700, fontSize: 11 }}>{player.era.era}</span>}
        </span>
      </div>
      <div style={s.ratingBadge}>{player.rating}</div>
      <button
        onClick={() => handlePick(player)}
        disabled={picking || !isUserOnClock || roster.length >= 15}
        style={{
          ...s.draftBtn,
          opacity: (!isUserOnClock || picking || roster.length >= 15) ? 0.45 : 1,
          cursor: (!isUserOnClock || picking || roster.length >= 15) ? 'not-allowed' : 'pointer',
        }}
      >
        Draft
      </button>
    </div>
  );

  // Lazy headshot loader. Hits /api/draft/headshot once per name and caches
  // the result on a module-level Map. D-League players are skipped (no real
  // photos exist) so we don't hammer the upstream search API for them.
  const HeadshotImage = ({ player, size = 40 }) => {
    const [url, setUrl] = useState(() => headshotCache.get(headshotKey(player)) || null);
    useEffect(() => {
      const key = headshotKey(player);
      if (headshotCache.has(key)) { setUrl(headshotCache.get(key)); return; }
      if (player.league === 'D-League') {
        headshotCache.set(key, null);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch(
            `/api/draft/headshot?first=${encodeURIComponent(player.firstName)}&last=${encodeURIComponent(player.lastName)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await r.json();
          headshotCache.set(key, data.url || null);
          if (!cancelled) setUrl(data.url || null);
        } catch (_e) {
          headshotCache.set(key, null);
        }
      })();
      return () => { cancelled = true; };
    }, [player]);

    const initials = `${(player.firstName || '?')[0] || ''}${(player.lastName || '?')[0] || ''}`.toUpperCase();
    return url ? (
      <img
        src={url}
        alt={`${player.firstName} ${player.lastName}`}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          headshotCache.set(headshotKey(player), null);
        }}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          background: '#1e293b', border: '2px solid #334155',
        }}
      />
    ) : (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #1e3a8a, #6d28d9)',
        color: '#fff', fontWeight: 700, fontSize: size * 0.36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid #334155',
      }}>
        {initials}
      </div>
    );
  };

  if (!setupDone) {
    return (
      <div style={s.container}>
        <div style={s.setupCard}>
          <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
          <h1 style={s.title}>Fantasy Draft</h1>
          <p style={s.subtitle}>You are the GM. Build your franchise. Get 500 tokens for the Store on start.</p>
          {error && <div style={s.error} data-testid="setup-error">{error}</div>}
          <div style={s.setupForm}>
            <label style={s.label}>Team Name</label>
            <input
              type="text"
              data-testid="team-name-input"
              placeholder="e.g. Miami Sharks"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              style={s.filterInput}
              maxLength={50}
            />

            <label style={s.label}>League</label>
            <div style={s.optionGroup}>
              {['NBA', 'G-League', 'EuroLeague'].map(l => (
                <button key={l} onClick={() => setLeague(l)}
                  style={league === l ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}>{l}</button>
              ))}
            </div>

            <label style={s.label}>Conference</label>
            <div style={s.optionGroup}>
              {['East', 'West'].map(c => (
                <button
                  key={c}
                  data-testid={`conference-${c}`}
                  onClick={() => { setConference(c); setDivision(''); }}
                  style={conference === c ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}
                >
                  {c}ern Conference
                </button>
              ))}
            </div>

            <label style={s.label}>Division {conference ? `(${conference}ern)` : ''}</label>
            <div style={s.optionGroup}>
              {(conference ? DIVISIONS[conference] : []).map(d => (
                <button
                  key={d}
                  data-testid={`division-${d}`}
                  onClick={() => setDivision(d)}
                  style={division === d ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}
                >
                  {d}
                </button>
              ))}
              {!conference && <span style={{ color: '#64748b', fontSize: 12 }}>Pick a conference first</span>}
            </div>

            <label style={s.label}>Market Tier</label>
            <div style={s.optionGroup}>
              {[
                { k: 'I', label: 'Tier I — Major' },
                { k: 'II', label: 'Tier II — Mid' },
                { k: 'III', label: 'Tier III — Small' },
              ].map(t => (
                <button
                  key={t.k}
                  data-testid={`tier-${t.k}`}
                  onClick={() => { setMarketTier(t.k); setCity(''); }}
                  style={marketTier === t.k ? { ...s.optionBtn, ...s.optionActive } : s.optionBtn}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label style={s.label}>City (US only)</label>
            <input type="text" placeholder="Filter cities..." value={cityFilter}
              onChange={e => setCityFilter(e.target.value)} style={s.filterInput} />
            <div style={s.scrollBox}>
              {filteredCities.map(c => (
                <button key={c} onClick={() => setCity(c)}
                  style={city === c ? { ...s.listItem, ...s.listItemActive } : s.listItem}>{c}</button>
              ))}
            </div>

            <label style={s.label}>Coach</label>
            <input type="text" placeholder="Filter coaches..." value={coachFilter}
              onChange={e => setCoachFilter(e.target.value)} style={s.filterInput} />
            <div style={s.scrollBox}>
              {filteredCoaches.map(c => (
                <button key={c} onClick={() => setCoach(c)}
                  style={coach === c ? { ...s.listItem, ...s.listItemActive } : s.listItem}>{c}</button>
              ))}
            </div>

            <button
              onClick={handleSetup}
              data-testid="start-draft-btn"
              disabled={!conference || !division || !league || !city || !coach || !teamName.trim()}
              style={(!conference || !division || !league || !city || !coach || !teamName.trim()) ? { ...s.startBtn, opacity: 0.5 } : s.startBtn}
            >
              Start Draft (+500 tokens)
            </button>

            <SeasonCalendar />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>

      <div style={s.header}>
        <h1 style={s.title}>Fantasy Draft</h1>
        <p style={s.subtitle}>
          {user?.team?.name || teamName || 'Your Team'}
          {' — '}{user?.league || league} | {user?.conference || conference}ern · {user?.team?.division || division}
          {user?.team?.city ? ` | ${user.team.city}` : ''}
          {user?.team?.coach ? ` | Coach: ${user.team.coach}` : ''}
          {' | '}({roster.length}/15)
          {slotAssigned && (
            <span data-testid="lottery-slot" style={{ color: '#a78bfa', marginLeft: 8 }}>
              · Pick #{lotteryPosition}
            </span>
          )}
          {user?.tokens != null && <span style={{ color: '#fbbf24', marginLeft: 8 }}>· {user.tokens} tokens</span>}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <input type="text" placeholder="Team Name" value={teamName}
            onChange={e => setTeamName(e.target.value)} style={s.teamInput} />
        </div>
      </div>
      {error && <div style={s.error}>{error}</div>}

      {/* Live "on the clock" ticker — shows the team currently picking,
          a 2-minute countdown for the user, and every pick made so far. */}
      {(onTheClock || allPicks.length > 0) && (
        <div data-testid="live-draft-ticker" style={s.tickerBox}>
          {onTheClock && !draftFinished && (
            <div style={s.tickerClock}>
              <span style={{ color: isUserOnClock ? '#22c55e' : '#fbbf24' }}>
                ⏱ On the Clock: <span data-testid="on-the-clock">{onTheClock}</span>
                {onTheClockEntry && (
                  <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: 8 }}>
                    Pick #{onTheClockEntry.pickNumber} · Rd {onTheClockEntry.round}
                  </span>
                )}
              </span>
              {isUserOnClock && (
                <span data-testid="pick-clock" style={{
                  marginLeft: 12,
                  color: timeLeft < 30 ? '#ef4444' : '#22c55e',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </span>
              )}
              {!draftFinished && (
                <button
                  data-testid="sim-draft-btn"
                  onClick={() => setAutoSim(s => !s)}
                  style={{
                    marginLeft: 'auto',
                    padding: '6px 12px',
                    background: autoSim ? '#7c3aed' : '#1e293b',
                    color: '#fff',
                    border: `1px solid ${autoSim ? '#a78bfa' : '#334155'}`,
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  title="Let the assistant GM draft for you"
                >
                  {autoSim ? '⏸ Stop Sim' : '⏩ Sim Draft (Assistant GM)'}
                </button>
              )}
              {!draftFinished && (
                <button
                  data-testid="sim-all-btn"
                  onClick={handleSimAll}
                  disabled={simmingAll}
                  style={{
                    marginLeft: 8,
                    padding: '6px 12px',
                    background: '#dc2626',
                    color: '#fff',
                    border: '1px solid #ef4444',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: simmingAll ? 'wait' : 'pointer',
                    opacity: simmingAll ? 0.6 : 1,
                  }}
                  title="Skip the entire draft — assistant GM + CPUs fill all rosters instantly"
                >
                  {simmingAll ? '⏳ Simming…' : '⏭ Sim All Draft'}
                </button>
              )}
            </div>
          )}
          {draftFinished && (
            <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              ✅ Draft complete — finalizing your roster…
            </div>
          )}
          {allPicks.length > 0 && (
            <ul data-testid="draft-feed" style={s.tickerList}>
              {allPicks.map((t, i) => (
                <li key={`${t.pickNumber}-${i}`} style={{
                  padding: '4px 0',
                  borderBottom: i < allPicks.length - 1 ? '1px solid #1e293b' : 'none',
                  color: t.isUser ? '#22c55e' : '#e2e8f0',
                  fontWeight: t.isUser ? 700 : 500,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <HeadshotImage player={t.player} size={26} />
                  <span style={{ color: '#94a3b8' }}>
                    #{t.pickNumber} (Rd {t.round})
                  </span>
                  <strong>{t.team}</strong>{' '}
                  selects{' '}
                  <span style={{ color: '#60a5fa' }}>
                    {t.player.firstName} {t.player.lastName}
                  </span>
                  <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>
                    ({t.player.position}, {t.player.rating} OVR)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Draft Order panel — shows the snake order for the current round
          and the user's slot, plus a quick-jump strip for upcoming rounds. */}
      {draftOrder.length > 0 && !draftFinished && (
        <DraftOrderPanel
          draftOrder={draftOrder}
          currentPickIdx={currentPickIdx}
          userTeamName={user?.team?.name || teamName}
        />
      )}

      <div style={s.searchBar}>
        <input type="text" placeholder="Search active NBA players..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()} style={s.searchInput} />
        <button onClick={handleSearch} disabled={searching} style={s.searchBtn}>
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {/* Dream Team Presets */}
      <div style={s.presetsRow}>
        <span style={s.presetsLabel}>Dream Teams:</span>
        {DREAM_TEAMS.map(dt => (
          <button key={dt.label} onClick={() => loadDreamTeam(dt)}
            disabled={!!loadingPreset}
            style={s.presetBtn}>
            {loadingPreset === dt.label ? '...' : dt.label}
          </button>
        ))}
      </div>

      {/* Era Filters removed — paid API only indexes currently active players. */}
      {searchResults.length > 0 && (
        <div style={s.searchPanel}>
          <h3 style={s.panelTitle}>Search Results ({searchResults.length})</h3>
          <div style={s.poolList}>
            {searchResults.map(p => <PlayerCard key={p.id} player={p} />)}
          </div>
        </div>
      )}
      <div style={s.layout}>
        <div style={s.poolPanel}>
          <h2 style={s.panelTitle}>Available Players</h2>
          {loading ? <div style={s.loadingText}>Loading draft pool...</div> : (
            <div style={s.poolList}>{pool.map(p => <PlayerCard key={p.id} player={p} />)}</div>
          )}
        </div>
        <div style={s.rosterPanel}>
          <h2 style={s.panelTitle}>Your Roster</h2>
          {roster.length === 0 ? <p style={s.emptyText}>No players yet. Start drafting!</p> : (
            <div style={s.rosterList}>
              {roster.map(p => (
                <div key={p.playerId} style={s.rosterItem}>
                  <span style={s.rosterName}>{p.firstName} {p.lastName}</span>
                  <span style={s.rosterPos}>{p.position}</span>
                  <span style={s.ratingSmall}>{p.rating}</span>
                </div>
              ))}
            </div>
          )}
          {roster.length >= 15 && (
            <button onClick={handleComplete} data-testid="complete-draft-btn" style={s.completeBtn}>Complete Draft (15/15)</button>
          )}
          {roster.length < 15 && (
            <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 10 }}>
              Draft {15 - roster.length} more to complete the roster.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  setupCard: { maxWidth: 520, margin: '40px auto', background: '#1e293b', borderRadius: 16, padding: '32px 28px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  setupForm: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  optionGroup: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  optionBtn: { padding: '10px 20px', borderRadius: 8, border: '2px solid #334155', background: '#0f172a', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  optionActive: { border: '2px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' },
  filterInput: { padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  scrollBox: { maxHeight: 150, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, background: '#0f172a', borderRadius: 8, padding: 8 },
  listItem: { padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  listItemActive: { border: '1px solid #f97316', color: '#f97316', background: 'rgba(249,115,22,0.1)' },
  startBtn: { padding: '14px 24px', borderRadius: 10, border: 'none', background: '#f97316', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16, marginTop: 8 },
  header: { textAlign: 'center', marginBottom: 16 },
  title: { color: '#f97316', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', margin: 0, fontSize: 14 },
  teamInput: { padding: '8px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, width: 200 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  searchBar: { display: 'flex', gap: 8, maxWidth: 600, margin: '0 auto 16px', justifyContent: 'center' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14 },
  searchBtn: { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  searchPanel: { background: '#1e293b', borderRadius: 12, padding: 16, maxWidth: 1100, margin: '0 auto 16px', border: '1px solid #a855f7' },
  layout: { display: 'flex', gap: 24, maxWidth: 1100, margin: '0 auto' },
  poolPanel: { flex: 2, background: '#1e293b', borderRadius: 12, padding: 20 },
  rosterPanel: { flex: 1, background: '#1e293b', borderRadius: 12, padding: 20 },
  panelTitle: { color: '#f97316', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  loadingText: { color: '#94a3b8', textAlign: 'center', padding: 40 },
  poolList: { maxHeight: '60vh', overflowY: 'auto' },
  playerCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #334155' },
  playerInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  playerName: { fontWeight: 600, fontSize: 14 },
  playerMeta: { color: '#94a3b8', fontSize: 12 },
  ratingBadge: { background: '#f97316', color: '#fff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 },
  draftBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  rosterList: { display: 'flex', flexDirection: 'column', gap: 6 },
  rosterItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#0f172a', borderRadius: 6 },
  rosterName: { flex: 1, fontWeight: 600, fontSize: 13 },
  rosterPos: { color: '#64748b', fontSize: 12 },
  ratingSmall: { background: '#f97316', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700, fontSize: 11 },
  emptyText: { color: '#64748b', textAlign: 'center', padding: 20 },
  completeBtn: { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 12 },
  // Dream Teams & Era Filters
  presetsRow: { display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', maxWidth: 1100, margin: '0 auto 10px' },
  presetsLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  presetBtn: { padding: '6px 14px', borderRadius: 6, border: '1px solid #a855f7', background: 'transparent', color: '#a855f7', fontWeight: 600, cursor: 'pointer', fontSize: 12, transition: 'all 0.2s' },
  // Live snake-draft ticker
  tickerBox: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
    padding: 12, margin: '0 auto 14px', maxWidth: 900,
  },
  tickerClock: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontWeight: 700, fontSize: 14, marginBottom: 8,
    paddingBottom: 8, borderBottom: '1px solid #1e293b',
  },
  tickerList: {
    listStyle: 'none', margin: 0, padding: 0, fontSize: 12,
    maxHeight: 220, overflowY: 'auto',
  },
  // Pre-draft lottery overlay
  lotteryOverlay: {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(2, 6, 23, 0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  lotteryCard: {
    position: 'relative',
    background: '#0f172a', border: '2px solid #6d28d9',
    borderRadius: 12, padding: '32px 38px', maxWidth: 480,
    textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(109, 40, 217, 0.5)',
  },
  lotteryNumber: {
    fontSize: 88, fontWeight: 900, lineHeight: 1,
    color: '#fbbf24', textShadow: '0 0 20px rgba(251, 191, 36, 0.6)',
    fontVariantNumeric: 'tabular-nums',
    padding: '12px 0',
  },
};
