import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

// Standings + Career page (Phase 2).
// Lets the user start an 82-game season, see live standings, and advance
// to the next year up to a 5-year career arc. Now includes per-conference
// and per-division views so the user can see exactly where their fantasy
// franchise stands.
export default function StandingsPage() {
  const { token, user, setUser } = useAuth();
  const [standings, setStandings] = useState(null);
  const [career, setCareer] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [advanceMessage, setAdvanceMessage] = useState('');
  const [view, setView] = useState('league'); // 'league' | 'conference' | 'division'

  const refreshUser = useCallback(async () => {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUser(await res.json());
  }, [token, setUser]);

  const loadAll = useCallback(async () => {
    try {
      const [stRes, carRes] = await Promise.all([
        fetch('/api/season/standings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/season/career', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (stRes.ok) setStandings(await stRes.json());
      if (carRes.ok) setCareer(await carRes.json());
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const startSeason = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/season/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshUser();
      await loadAll();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const advanceSeason = async () => {
    setBusy(true); setError(''); setAdvanceMessage('');
    try {
      const res = await fetch('/api/season/advance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAdvanceMessage(data.message + (data.tokensAwarded ? ` (+${data.tokensAwarded} tokens)` : ''));
      await refreshUser();
      await loadAll();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const seasonStarted = (standings?.gamesTotal || 0) > 0;
  const seasonComplete = standings && standings.gamesPlayed >= standings.gamesTotal && standings.gamesTotal > 0;

  // Compute the user's rank in League, Conference, and Division based on
  // wins (with losses as a tiebreak), so the "where do I stand" card is
  // always derived from the same sort order as the league table below.
  const ranks = useMemo(() => {
    if (!standings || !standings.standings.length) return null;
    const sortFn = (a, b) => (b.wins - a.wins) || (a.losses - b.losses);
    const userRow = standings.standings.find(r => r.isUser);
    if (!userRow) return null;

    const league = [...standings.standings].sort(sortFn);
    const conf = league.filter(r => r.conference === userRow.conference);
    const div = league.filter(r => r.division === userRow.division && r.conference === userRow.conference);

    const idxOf = (arr) => arr.findIndex(r => r.isUser) + 1;
    return {
      user: userRow,
      league:     { rank: idxOf(league),     of: league.length     },
      conference: { rank: idxOf(conf),       of: conf.length       },
      division:   { rank: idxOf(div),        of: div.length        },
    };
  }, [standings]);

  const filteredStandings = useMemo(() => {
    if (!standings) return [];
    const userRow = standings.standings.find(r => r.isUser);
    if (view === 'conference' && userRow) {
      return standings.standings.filter(r => r.conference === userRow.conference);
    }
    if (view === 'division' && userRow) {
      return standings.standings.filter(
        r => r.conference === userRow.conference && r.division === userRow.division
      );
    }
    return standings.standings;
  }, [standings, view]);

  if (!user?.draftStarted || !user?.draftCompleted) {
    return (
      <div style={styles.container} data-testid="standings-page-locked">
        <h1 style={styles.title}>Standings</h1>
        <p style={{ color: '#fbbf24', textAlign: 'center', marginTop: 40 }}>
          Locked — complete your fantasy draft first.
        </p>
      </div>
    );
  }

  const ordinal = n => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div style={styles.container} data-testid="standings-page">
      <h1 style={styles.title}>Standings & Career</h1>
      <p style={styles.sub}>
        {ranks?.user?.name || user?.team?.name}
        {' · '}Season {user?.seasonNumber || 1} of 5
        {standings && ` · ${standings.gamesPlayed} of ${standings.gamesTotal} games played`}
      </p>

      {error && <div style={styles.error}>{error}</div>}
      {advanceMessage && <div style={styles.toast} data-testid="advance-toast">{advanceMessage}</div>}

      {/* "Where do I stand" card — the headline answer for the user. */}
      {ranks && (
        <div style={styles.rankCard} data-testid="rank-card">
          <div style={styles.rankCardTitle}>Where Your Team Stands</div>
          <div style={styles.rankRow}>
            <div style={styles.rankPill} data-testid="rank-league">
              <div style={styles.rankNum}>{ordinal(ranks.league.rank)}</div>
              <div style={styles.rankLbl}>in League ({ranks.league.of} teams)</div>
            </div>
            <div style={styles.rankPill} data-testid="rank-conference">
              <div style={styles.rankNum}>{ordinal(ranks.conference.rank)}</div>
              <div style={styles.rankLbl}>in {ranks.user.conference}ern Conf ({ranks.conference.of})</div>
            </div>
            <div style={styles.rankPill} data-testid="rank-division">
              <div style={styles.rankNum}>{ordinal(ranks.division.rank)}</div>
              <div style={styles.rankLbl}>in {ranks.user.division} Div ({ranks.division.of})</div>
            </div>
            <div style={styles.rankPill} data-testid="rank-record">
              <div style={styles.rankNum}>{ranks.user.wins}-{ranks.user.losses}</div>
              <div style={styles.rankLbl}>Season Record</div>
            </div>
          </div>
        </div>
      )}

      <div style={styles.actionRow}>
        {!seasonStarted && (
          <button data-testid="start-season-btn" onClick={startSeason} disabled={busy} style={styles.primaryBtn}>
            {busy ? 'Starting...' : 'Start Season (82 Games)'}
          </button>
        )}
        {seasonComplete && (
          <button data-testid="advance-season-btn" onClick={advanceSeason} disabled={busy} style={styles.primaryBtn}>
            {busy ? 'Advancing...' : 'Advance to Next Year'}
          </button>
        )}
      </div>

      {/* View tabs — League / Conference / Division. */}
      {standings && standings.standings.length > 0 && (
        <div style={styles.viewTabs}>
          {[
            { k: 'league',     label: 'Full League' },
            { k: 'conference', label: ranks ? `${ranks.user.conference}ern Conf` : 'Conference' },
            { k: 'division',   label: ranks ? `${ranks.user.division} Div` : 'Division' },
          ].map(t => (
            <button key={t.k}
              data-testid={`view-${t.k}`}
              onClick={() => setView(t.k)}
              style={{
                ...styles.viewBtn,
                background: view === t.k ? '#f97316' : '#334155',
              }}>{t.label}</button>
          ))}
        </div>
      )}

      {standings && standings.standings.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            {view === 'league' && 'League Standings'}
            {view === 'conference' && ranks && `${ranks.user.conference}ern Conference Standings`}
            {view === 'division' && ranks && `${ranks.user.division} Division Standings`}
          </h2>
          <table style={styles.table} data-testid="standings-table">
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Team</th>
                <th style={styles.th}>Conf</th>
                <th style={styles.th}>Div</th>
                <th style={styles.th}>W</th>
                <th style={styles.th}>L</th>
                <th style={styles.th}>PCT</th>
                <th style={styles.th}>GB</th>
              </tr>
            </thead>
            <tbody>
              {filteredStandings.map((row, i) => {
                const games = row.wins + row.losses;
                const pct = games ? (row.wins / games).toFixed(3).replace(/^0/, '') : '.000';
                const leader = filteredStandings[0];
                const gb = i === 0 ? '—'
                  : (((leader.wins - row.wins) + (row.losses - leader.losses)) / 2).toFixed(1);
                return (
                  <tr key={row.name}
                      data-testid={row.isUser ? 'standings-user-row' : `standings-row-${row.name}`}
                      style={row.isUser ? styles.userRow : (i % 2 ? styles.altRow : null)}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={styles.td}>
                      {row.isUser && <span style={styles.youBadge}>YOU</span>}
                      {row.name}
                    </td>
                    <td style={styles.td}>{row.conference}</td>
                    <td style={styles.td}>{row.division}</td>
                    <td style={styles.td}>{row.wins}</td>
                    <td style={styles.td}>{row.losses}</td>
                    <td style={styles.td}>{pct}</td>
                    <td style={styles.td}>{gb}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {career && career.career.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Career History</h2>
          <table style={styles.table} data-testid="career-table">
            <thead>
              <tr>
                <th style={styles.th}>Year</th>
                <th style={styles.th}>Season #</th>
                <th style={styles.th}>W</th>
                <th style={styles.th}>L</th>
                <th style={styles.th}>Champion?</th>
              </tr>
            </thead>
            <tbody>
              {career.career.map(c => (
                <tr key={c.seasonNumber} data-testid={`career-row-${c.seasonNumber}`}>
                  <td style={styles.td}>{c.year}</td>
                  <td style={styles.td}>{c.seasonNumber}</td>
                  <td style={styles.td}>{c.wins}</td>
                  <td style={styles.td}>{c.losses}</td>
                  <td style={styles.td}>{c.champion ? '🏆' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {career && career.achievements.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Achievements ({career.achievements.length})</h2>
          <ul data-testid="achievements-list">
            {career.achievements.map(a => (
              <li key={a.id} style={{ marginBottom: 4 }}>
                <strong>{a.id}</strong> · season {a.seasonNumber} · +{a.tokensAwarded} tokens
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#e2e8f0', padding: 24 },
  title: { color: '#f97316', textAlign: 'center', fontSize: 32, margin: '0 0 4px', fontWeight: 800 },
  sub: { color: '#94a3b8', textAlign: 'center', margin: '0 0 16px', fontSize: 14 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px',
    borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontSize: 13 },
  toast: { background: '#14532d', color: '#bbf7d0', padding: '10px 14px',
    borderRadius: 8, margin: '0 auto 12px', maxWidth: 600, textAlign: 'center', fontWeight: 700 },
  actionRow: { display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 },
  primaryBtn: { padding: '12px 24px', borderRadius: 8, border: 'none',
    background: '#f97316', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  rankCard: {
    background: 'linear-gradient(135deg, #1e293b 0%, #1e3a8a 100%)',
    borderRadius: 12, padding: 20, maxWidth: 900,
    margin: '0 auto 16px', border: '2px solid #f97316',
  },
  rankCardTitle: {
    color: '#f97316', fontSize: 14, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 12, textAlign: 'center',
  },
  rankRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12,
  },
  rankPill: {
    background: '#0f172a', borderRadius: 10, padding: '12px 8px', textAlign: 'center',
  },
  rankNum: { color: '#fbbf24', fontSize: 28, fontWeight: 800, lineHeight: 1 },
  rankLbl: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  viewTabs: {
    display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap',
  },
  viewBtn: {
    color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px',
    fontWeight: 700, cursor: 'pointer', fontSize: 13,
  },
  section: { background: '#1e293b', borderRadius: 12, padding: 20, maxWidth: 900,
    margin: '0 auto 16px' },
  sectionTitle: { color: '#f97316', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 6px', color: '#94a3b8', borderBottom: '1px solid #334155' },
  td: { padding: '8px 6px', borderBottom: '1px solid #1e293b' },
  altRow: { background: '#172033' },
  userRow: { background: '#1e3a8a', color: '#fff', fontWeight: 700 },
  youBadge: { background: '#f97316', color: '#fff', borderRadius: 4,
    padding: '2px 6px', fontSize: 10, marginRight: 6 },
};
