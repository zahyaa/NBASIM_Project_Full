import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

/**
 * Players Bio — search, browse, and inspect any active NBA player.
 *
 * Features:
 *  - Debounced auto-search (no Enter / button needed once you start typing)
 *  - Live filter (position) and sort (rating / name / PPG)
 *  - Full bio: identity, draft, current-season averages
 *  - Advanced stats computed from the season line: TS%, eFG%, AST/TO
 *  - Career history table (last 5 seasons)
 *  - Recent games log (last 10 regular-season games)
 *
 * APIs:
 *  - GET /api/nba/players/search?q=...
 *  - GET /api/nba/players/:id/bio
 *  - GET /api/nba/players/:id/games?limit=10
 */
export default function PlayerBioPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  // Mode: 'browse' (search + favorites + bio detail) or 'compare' (two-up).
  const [mode, setMode] = useState('browse');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const [position, setPosition] = useState('ALL'); // ALL | G | F | C
  const [sortBy, setSortBy] = useState('rating');  // rating | name | ppg

  const [bio, setBio] = useState(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [games, setGames] = useState([]);

  // Favorites
  const [favorites, setFavorites] = useState([]);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const debounceRef = useRef(null);
  const reqRef = useRef(0);

  // Load favorites once on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/favorites', { headers: authHeaders });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setFavorites(data.favorites || []);
      } catch { /* non-fatal */ }
    })();
    return () => { alive = false; };
  }, [authHeaders]);

  const isFavorited = (id) => favorites.some(f => f.playerId === id);

  const toggleFavorite = async (player) => {
    const id = player.playerId ?? player.id;
    if (!id) return;
    try {
      if (isFavorited(id)) {
        const res = await fetch(`/api/auth/favorites/${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) throw new Error('Could not remove favorite');
        const data = await res.json();
        setFavorites(data.favorites || []);
      } else {
        const res = await fetch('/api/auth/favorites', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player: {
              playerId: id,
              firstName: player.firstName,
              lastName: player.lastName,
              position: player.position,
              team: player.team,
              teamLogo: player.teamLogo,
              rating: player.rating,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not save favorite');
        }
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Debounced search: fires 300ms after the user stops typing.
  useEffect(() => {
    if (bio) return; // pause search when viewing a bio
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const myReq = ++reqRef.current;
      try {
        const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(query)}`, {
          headers: authHeaders,
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (myReq === reqRef.current) {
          setResults(data.data || []);
          setError('');
        }
      } catch (err) {
        if (myReq === reqRef.current) setError(err.message);
      } finally {
        if (myReq === reqRef.current) setSearching(false);
      }
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, bio, authHeaders]);

  const filteredResults = useMemo(() => {
    let list = results.slice();
    if (position !== 'ALL') {
      list = list.filter(p => positionGroup(p.position) === position);
    }
    if (sortBy === 'name') {
      list.sort((a, b) => a.lastName.localeCompare(b.lastName));
    } else if (sortBy === 'ppg') {
      list.sort((a, b) => (b.stats?.pts || 0) - (a.stats?.pts || 0));
    } else {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    return list;
  }, [results, position, sortBy]);

  const handleSelectPlayer = async (player) => {
    setBioLoading(true);
    setError('');
    setBio({ id: player.id, firstName: player.firstName, lastName: player.lastName });
    try {
      const [bioRes, gamesRes] = await Promise.all([
        fetch(`/api/nba/players/${player.id}/bio`, { headers: authHeaders }),
        fetch(`/api/nba/players/${player.id}/games?limit=10`, { headers: authHeaders }),
      ]);
      if (!bioRes.ok) throw new Error('Failed to load player bio');
      const bioData = await bioRes.json();
      setBio(bioData);
      if (gamesRes.ok) {
        const gd = await gamesRes.json();
        setGames(gd.games || []);
      } else {
        setGames([]);
      }
    } catch (err) {
      setError(err.message);
      setBio(null);
    } finally {
      setBioLoading(false);
    }
  };

  const closeBio = () => {
    setBio(null);
    setGames([]);
  };

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>Players Bio</h1>
      <p style={s.subtitle}>Search active NBA players. Stats update live during the season.</p>

      {error && (
        <div style={s.error} onClick={() => setError('')}>{error} <span style={{ opacity: 0.6, marginLeft: 8 }}>(dismiss)</span></div>
      )}

      {!bio && (
        <div style={s.tabsRow}>
          <button onClick={() => setMode('browse')} style={{ ...s.tabBtn, ...(mode === 'browse' ? s.tabBtnActive : {}) }}>Browse</button>
          <button onClick={() => setMode('compare')} style={{ ...s.tabBtn, ...(mode === 'compare' ? s.tabBtnActive : {}) }}>Compare</button>
        </div>
      )}

      {!bio && mode === 'compare' && (
        <ComparePanel authHeaders={authHeaders} onError={setError} />
      )}

      {!bio && mode === 'browse' && (
        <>
          <div style={s.searchBar}>
            <input
              type="text"
              placeholder="Start typing a player name..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={s.searchInput}
              autoFocus
            />
            <span style={s.searchHint}>
              {searching ? 'Searching…' : `${filteredResults.length} result${filteredResults.length === 1 ? '' : 's'}`}
            </span>
          </div>

          <div style={s.filterRow}>
            <Toggle label="Position" value={position} onChange={setPosition}
              options={[['ALL', 'All'], ['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centers']]} />
            <Toggle label="Sort" value={sortBy} onChange={setSortBy}
              options={[['rating', 'Rating'], ['ppg', 'PPG'], ['name', 'Name']]} />
          </div>

          {!query.trim() && favorites.length > 0 && (
            <div style={{ maxWidth: 900, margin: '0 auto 24px' }}>
              <h3 style={s.sectionTitle}>★ Your Favorites ({favorites.length})</h3>
              <div style={s.resultsGrid}>
                {favorites.map(p => (
                  <PlayerTile key={p.playerId} p={{ ...p, id: p.playerId }}
                    onClick={() => handleSelectPlayer({ ...p, id: p.playerId })}
                    isFav={true}
                    onToggleFav={(e) => { e.stopPropagation(); toggleFavorite(p); }}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredResults.length > 0 && (
            <div style={s.resultsGrid}>
              {filteredResults.map(p => (
                <PlayerTile key={p.id} p={p}
                  onClick={() => handleSelectPlayer(p)}
                  isFav={isFavorited(p.id)}
                  onToggleFav={(e) => { e.stopPropagation(); toggleFavorite({ ...p, playerId: p.id }); }}
                />
              ))}
            </div>
          )}

          {!searching && query.trim() && filteredResults.length === 0 && (
            <div style={s.empty}>No players match "{query}"{position !== 'ALL' ? ` at ${position}` : ''}.</div>
          )}
          {!query.trim() && favorites.length === 0 && (
            <div style={s.empty}>Try "LeBron", "Curry", or "Jokic". Star players to pin them here.</div>
          )}
        </>
      )}

      {bio && (
        <BioDetail
          bio={bio}
          games={games}
          loading={bioLoading}
          onBack={closeBio}
          isFav={isFavorited(bio.id)}
          onToggleFav={() => toggleFavorite({ ...bio, playerId: bio.id })}
        />
      )}
    </div>
  );
}

/* ---------------- BioDetail ---------------- */

function BioDetail({ bio, games, loading, onBack, isFav, onToggleFav }) {
  const adv = bio.stats ? computeAdvanced(bio.stats) : null;
  return (
    <div style={s.bioCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={onBack} style={s.bioBack}>&larr; Back to results</button>
        {onToggleFav && (
          <button onClick={onToggleFav} style={{ ...s.starBtn, ...(isFav ? s.starBtnOn : {}) }}>
            {isFav ? '★ Favorited' : '☆ Add to Favorites'}
          </button>
        )}
      </div>

      <div style={s.bioHeader}>
        <Avatar firstName={bio.firstName} lastName={bio.lastName} color={bio.era?.color} photoUrl={bio.photoUrl} />
        <div style={{ flex: 1 }}>
          <h2 style={s.bioName}>{bio.firstName} {bio.lastName}</h2>
          <p style={s.bioTeam}>
            {bio.teamLogo && <img src={bio.teamLogo} alt="" style={s.bioTeamLogo} onError={e => e.target.style.display='none'} />}
            {bio.team || '—'} {bio.jerseyNumber ? `· #${bio.jerseyNumber}` : ''}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {bio.era && <Badge color={bio.era.color}>{bio.era.era} Era</Badge>}
            {bio.position && bio.position !== 'N/A' && <Badge color="#60a5fa">{bio.position}</Badge>}
            {bio.rating != null && <Badge color="#a855f7">Rating {bio.rating}</Badge>}
          </div>
        </div>
      </div>

      {loading && <div style={s.loading}>Loading…</div>}

      <div style={s.infoGrid}>
        <Info label="Height" value={bio.height} />
        <Info label="Weight" value={bio.weight ? `${bio.weight} lbs` : null} />
        <Info label="Country" value={bio.country} />
        <Info label="College" value={bio.college} />
        <Info label="Draft Year" value={bio.draftYear} />
        <Info label="Drafted" value={bio.draftRound && bio.draftNumber ? `R${bio.draftRound}, Pick ${bio.draftNumber}` : 'Undrafted'} />
      </div>

      {bio.stats && (
        <>
          <h3 style={s.sectionTitle}>Season Averages</h3>
          <div style={s.statsGrid}>
            <Stat n={fmt(bio.stats.pts, 1)} l="PPG" />
            <Stat n={fmt(bio.stats.reb, 1)} l="RPG" />
            <Stat n={fmt(bio.stats.ast, 1)} l="APG" />
            <Stat n={fmt(bio.stats.stl, 1)} l="SPG" />
            <Stat n={fmt(bio.stats.blk, 1)} l="BPG" />
            <Stat n={pct(bio.stats.fg_pct)} l="FG%" />
            <Stat n={pct(bio.stats.fg3_pct)} l="3P%" />
            <Stat n={pct(bio.stats.ft_pct)} l="FT%" />
          </div>

          {adv && (
            <>
              <h3 style={{ ...s.sectionTitle, marginTop: 20 }}>Advanced</h3>
              <div style={s.advRow}>
                <Stat n={adv.ts != null ? `${adv.ts.toFixed(1)}%` : '—'} l="TS%" tip="True Shooting %" />
                <Stat n={adv.efg != null ? `${adv.efg.toFixed(1)}%` : '—'} l="eFG%" tip="Effective FG%" />
                <Stat n={adv.astTo != null ? adv.astTo.toFixed(2) : '—'} l="AST/TO" tip="Assist-to-Turnover" />
                <Stat n={fmt(bio.stats.min, 1)} l="MIN" />
                <Stat n={bio.stats.games_played || '—'} l="GP" />
              </div>
            </>
          )}
        </>
      )}

      {bio.careerHistory && bio.careerHistory.length > 1 && (
        <>
          <h3 style={{ ...s.sectionTitle, marginTop: 20 }}>Career History</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Season', 'GP', 'MIN', 'PPG', 'RPG', 'APG', 'FG%', '3P%', 'FT%'].map(h =>
                    <th key={h} style={s.th}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {bio.careerHistory.map(row => (
                  <tr key={row.season}>
                    <td style={s.td}>{row.season}-{String((row.season + 1) % 100).padStart(2, '0')}</td>
                    <td style={s.td}>{row.stats.games_played || '—'}</td>
                    <td style={s.td}>{fmt(row.stats.min, 1)}</td>
                    <td style={s.tdStrong}>{fmt(row.stats.pts, 1)}</td>
                    <td style={s.td}>{fmt(row.stats.reb, 1)}</td>
                    <td style={s.td}>{fmt(row.stats.ast, 1)}</td>
                    <td style={s.td}>{pct(row.stats.fg_pct)}</td>
                    <td style={s.td}>{pct(row.stats.fg3_pct)}</td>
                    <td style={s.td}>{pct(row.stats.ft_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {games && games.length > 0 && (
        <>
          <h3 style={{ ...s.sectionTitle, marginTop: 20 }}>Recent Games</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Date', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG', '3P', 'FT'].map(h =>
                    <th key={h} style={s.th}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {games.map(g => (
                  <tr key={g.gameId}>
                    <td style={s.td}>{shortDate(g.date)}</td>
                    <td style={s.td}>{g.min || '—'}</td>
                    <td style={s.tdStrong}>{g.pts}</td>
                    <td style={s.td}>{g.reb}</td>
                    <td style={s.td}>{g.ast}</td>
                    <td style={s.td}>{g.stl}</td>
                    <td style={s.td}>{g.blk}</td>
                    <td style={s.td}>{g.fgm}/{g.fga}</td>
                    <td style={s.td}>{g.fg3m}/{g.fg3a}</td>
                    <td style={s.td}>{g.ftm}/{g.fta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !bio.stats && !(bio.careerHistory && bio.careerHistory.length) && (
        <div style={s.empty}>No stats available — this player may not have played this season yet.</div>
      )}
    </div>
  );
}

/* ---------------- small components ---------------- */

const PlayerTile = ({ p, onClick, isFav, onToggleFav }) => (
  <div style={s.playerTileWrap}>
    <button onClick={onClick} style={s.playerTile}>
      {p.teamLogo && (
        <img src={p.teamLogo} alt="" style={s.tileLogo} onError={e => e.target.style.display='none'} />
      )}
      <div style={s.tileRating}>{p.rating ?? '—'}</div>
      <div style={s.tileName}>{p.firstName} {p.lastName}</div>
      <div style={s.tileMeta}>{p.position || 'N/A'} | {p.team}</div>
      {p.stats && <div style={s.tilePpg}>{p.stats.pts?.toFixed(1)} PPG</div>}
      {p.era && <div style={{ color: p.era.color, fontSize: 11, fontWeight: 700, marginTop: 4 }}>{p.era.era}</div>}
    </button>
    {onToggleFav && (
      <button onClick={onToggleFav} style={{ ...s.tileStar, ...(isFav ? s.tileStarOn : {}) }} title={isFav ? 'Remove from favorites' : 'Add to favorites'}>
        {isFav ? '★' : '☆'}
      </button>
    )}
  </div>
);

/**
 * ComparePanel — two independent search boxes; selecting players loads
 * their bios side by side with stat winners highlighted in green.
 */
function ComparePanel({ authHeaders, onError }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);

  const loadBio = async (id, setter) => {
    try {
      const res = await fetch(`/api/nba/players/${id}/bio`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load player');
      setter(await res.json());
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div style={s.compareWrap}>
      <div style={s.compareCol}>
        {!a ? (
          <CompareSearch authHeaders={authHeaders} placeholder="Player A" onPick={(p) => loadBio(p.id, setA)} />
        ) : (
          <CompareCard bio={a} other={b} onClear={() => setA(null)} />
        )}
      </div>
      <div style={s.compareVs}>VS</div>
      <div style={s.compareCol}>
        {!b ? (
          <CompareSearch authHeaders={authHeaders} placeholder="Player B" onPick={(p) => loadBio(p.id, setB)} />
        ) : (
          <CompareCard bio={b} other={a} onClear={() => setB(null)} />
        )}
      </div>
    </div>
  );
}

function CompareSearch({ authHeaders, placeholder, onPick }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const tRef = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setList([]); return; }
    if (tRef.current) clearTimeout(tRef.current);
    setLoading(true);
    tRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nba/players/search?q=${encodeURIComponent(q)}`, { headers: authHeaders });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setList((data.data || []).slice(0, 8));
      } catch { setList([]); }
      finally { setLoading(false); }
    }, 300);
    return () => tRef.current && clearTimeout(tRef.current);
  }, [q, authHeaders]);

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} style={s.searchInput} />
      <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>{loading ? 'Searching…' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {list.map(p => (
          <button key={p.id} onClick={() => onPick(p)} style={s.compareSearchItem}>
            <span style={{ fontWeight: 700 }}>{p.firstName} {p.lastName}</span>
            <span style={{ color: '#94a3b8', fontSize: 12 }}> · {p.position} · {p.team} · {p.rating}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const COMPARE_STATS = [
  ['pts', 'PPG', 1, true],
  ['reb', 'RPG', 1, true],
  ['ast', 'APG', 1, true],
  ['stl', 'SPG', 1, true],
  ['blk', 'BPG', 1, true],
  ['fg_pct', 'FG%', 1, true, true],
  ['fg3_pct', '3P%', 1, true, true],
  ['ft_pct', 'FT%', 1, true, true],
  ['turnover', 'TOV', 1, false],
];

function CompareCard({ bio, other, onClear }) {
  const advA = bio.stats ? computeAdvanced(bio.stats) : null;
  return (
    <div style={s.compareCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Avatar firstName={bio.firstName} lastName={bio.lastName} color={bio.era?.color} photoUrl={bio.photoUrl} size={48} />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {bio.firstName} {bio.lastName}
            </h3>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
              {bio.position || '—'} · Rating {bio.rating ?? '—'}
            </div>
          </div>
        </div>
        <button onClick={onClear} style={s.compareClear}>×</button>
      </div>

      <div style={{ marginTop: 14 }}>
        {COMPARE_STATS.map(([key, label, dec, higherBetter, isPct]) => {
          const av = bio.stats?.[key];
          const bv = other?.stats?.[key];
          const hasBoth = av != null && bv != null;
          let win = false;
          if (hasBoth) win = higherBetter ? av > bv : av < bv;
          const text = av == null ? '—' : isPct ? `${(av * 100).toFixed(dec)}%` : Number(av).toFixed(dec);
          return (
            <div key={key} style={s.compareRow}>
              <span style={{ color: '#64748b', fontSize: 12 }}>{label}</span>
              <span style={{
                fontWeight: 700,
                color: win ? '#22c55e' : '#e2e8f0',
              }}>{text}</span>
            </div>
          );
        })}
        {advA && (
          <>
            <div style={s.compareRow}>
              <span style={{ color: '#64748b', fontSize: 12 }}>TS%</span>
              <span style={{ fontWeight: 700, color: compareWin(advA.ts, other?.stats ? computeAdvanced(other.stats).ts : null) ? '#22c55e' : '#e2e8f0' }}>
                {advA.ts != null ? `${advA.ts.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div style={s.compareRow}>
              <span style={{ color: '#64748b', fontSize: 12 }}>eFG%</span>
              <span style={{ fontWeight: 700, color: compareWin(advA.efg, other?.stats ? computeAdvanced(other.stats).efg : null) ? '#22c55e' : '#e2e8f0' }}>
                {advA.efg != null ? `${advA.efg.toFixed(1)}%` : '—'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function compareWin(a, b) {
  return a != null && b != null && a > b;
}

const Toggle = ({ label, value, onChange, options }) => (
  <div style={s.toggleGroup}>
    <span style={s.toggleLabel}>{label}</span>
    {options.map(([val, text]) => (
      <button key={val} onClick={() => onChange(val)}
        style={{ ...s.toggleBtn, ...(value === val ? s.toggleBtnActive : {}) }}>
        {text}
      </button>
    ))}
  </div>
);

const Badge = ({ children, color = '#a855f7' }) => (
  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700, background: color + '22', color, border: `1px solid ${color}55` }}>
    {children}
  </span>
);

const Avatar = ({ firstName = '', lastName = '', color = '#a855f7', photoUrl = null, size = 72 }) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  const [failed, setFailed] = useState(false);
  const showPhoto = photoUrl && !failed;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${color}, ${color}88)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.36, color: '#fff', flexShrink: 0,
      overflow: 'hidden', position: 'relative',
    }}>
      {showPhoto ? (
        <img
          src={photoUrl}
          alt={`${firstName} ${lastName}`}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
        />
      ) : (initials || '?')}
    </div>
  );
};

const Info = ({ label, value }) => (
  <div style={s.statRow}>
    <span style={s.statLabel}>{label}</span>
    <span style={s.statValue}>{value || 'N/A'}</span>
  </div>
);

const Stat = ({ n, l, tip }) => (
  <div style={s.statBox} title={tip || ''}>
    <div style={s.statBoxNum}>{n}</div>
    <div style={s.statBoxLabel}>{l}</div>
  </div>
);

/* ---------------- helpers ---------------- */

function positionGroup(pos) {
  if (!pos) return '';
  const p = pos.toUpperCase()[0];
  if (p === 'G' || p === 'F' || p === 'C') return p;
  return '';
}

function fmt(v, d = 1) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(d);
}

function pct(v) {
  if (v == null || isNaN(v)) return '—';
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function shortDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return iso;
  }
}

// TS% = PTS / (2 * (FGA + 0.44 * FTA))
// eFG% = (FGM + 0.5 * 3PM) / FGA
// AST/TO = AST / TOV
function computeAdvanced(s) {
  const out = { ts: null, efg: null, astTo: null };
  if (s.fga && s.fta != null && s.pts != null) {
    const denom = 2 * (s.fga + 0.44 * s.fta);
    if (denom > 0) out.ts = (s.pts / denom) * 100;
  }
  if (s.fga && s.fgm != null) out.efg = ((s.fgm + 0.5 * (s.fg3m || 0)) / s.fga) * 100;
  if (s.turnover && s.ast != null) out.astTo = s.ast / s.turnover;
  return out;
}

/* ---------------- styles ---------------- */

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  title: { color: '#a855f7', fontSize: 36, textAlign: 'center', margin: '0 0 4px', fontWeight: 800 },
  subtitle: { color: '#94a3b8', textAlign: 'center', margin: '0 0 24px', fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  empty: { textAlign: 'center', color: '#64748b', fontSize: 14, marginTop: 32 },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 12, fontSize: 13 },

  searchBar: { display: 'flex', alignItems: 'center', gap: 12, maxWidth: 600, margin: '0 auto 12px' },
  searchInput: { flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 15 },
  searchHint: { color: '#64748b', fontSize: 12, minWidth: 80, textAlign: 'right' },

  filterRow: { display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 },
  toggleGroup: { display: 'flex', alignItems: 'center', gap: 6, background: '#0f172a', padding: '4px 8px', borderRadius: 8, border: '1px solid #334155' },
  toggleLabel: { color: '#64748b', fontSize: 12, fontWeight: 600, marginRight: 4 },
  toggleBtn: { padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  toggleBtnActive: { background: '#a855f7', color: '#fff' },

  resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, maxWidth: 900, margin: '0 auto' },
  playerTileWrap: { position: 'relative' },
  playerTile: { width: '100%', padding: 14, background: '#1e293b', borderRadius: 10, border: '1px solid #334155', cursor: 'pointer', textAlign: 'center', color: '#e2e8f0' },
  tileLogo: { width: 28, height: 28, objectFit: 'contain', marginBottom: 4 },
  tileRating: { background: '#a855f7', color: '#fff', borderRadius: '50%', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, marginBottom: 8 },
  tileName: { fontWeight: 700, fontSize: 14 },
  tileMeta: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  tilePpg: { color: '#fbbf24', fontSize: 12, marginTop: 4, fontWeight: 700 },
  tileStar: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#0f172a', color: '#64748b', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tileStarOn: { background: '#fbbf24', color: '#0f172a' },

  tabsRow: { display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 16, background: '#0f172a', padding: 4, borderRadius: 10, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' },
  tabBtn: { flex: 1, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  tabBtnActive: { background: '#a855f7', color: '#fff' },

  starBtn: { padding: '6px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  starBtnOn: { background: '#fbbf24', color: '#0f172a', borderColor: '#fbbf24' },

  compareWrap: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start', maxWidth: 900, margin: '0 auto' },
  compareCol: { background: '#1e293b', borderRadius: 10, padding: 16, border: '1px solid #334155' },
  compareVs: { color: '#a855f7', fontSize: 18, fontWeight: 800, padding: '20px 4px' },
  compareSearchItem: { textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', cursor: 'pointer' },
  compareCard: { color: '#e2e8f0' },
  compareClear: { background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 },
  compareRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155' },

  bioCard: { maxWidth: 820, margin: '0 auto', background: '#1e293b', borderRadius: 16, padding: 24 },
  bioBack: { background: 'none', border: 'none', color: '#a855f7', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'block' },
  bioHeader: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  bioName: { margin: 0, fontSize: 26, fontWeight: 800 },
  bioTeam: { color: '#94a3b8', margin: '4px 0 0', fontSize: 14, display: 'flex', alignItems: 'center' },
  bioTeamLogo: { width: 20, height: 20, objectFit: 'contain', marginRight: 6 },

  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 20px', marginBottom: 20 },
  statRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155' },
  statLabel: { color: '#64748b', fontSize: 13 },
  statValue: { fontWeight: 600, fontSize: 13 },

  sectionTitle: { color: '#a855f7', fontSize: 16, margin: '0 0 12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  advRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 },
  statBox: { background: '#0f172a', borderRadius: 8, padding: '12px 8px', textAlign: 'center' },
  statBoxNum: { fontSize: 18, fontWeight: 800, color: '#fff' },
  statBoxLabel: { fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2, textTransform: 'uppercase' },

  tableWrap: { overflowX: 'auto', background: '#0f172a', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '8px 10px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase', fontSize: 11, borderBottom: '1px solid #334155', fontWeight: 700 },
  td: { padding: '8px 10px', borderBottom: '1px solid #1e293b', color: '#cbd5e1' },
  tdStrong: { padding: '8px 10px', borderBottom: '1px solid #1e293b', color: '#fff', fontWeight: 700 },
};
