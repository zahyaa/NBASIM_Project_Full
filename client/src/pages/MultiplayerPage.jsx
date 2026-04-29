// MultiplayerPage — head-to-head between real users.
// Locked until the user has completed their fantasy draft AND has an active
// premium subscription. Three modes: Public, Private (room code), Playoff (8 users).
//
// State is polled every 3s while a match is in a waiting/live state so opponents
// see each other's joins and game results in near-real-time without sockets.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function MultiplayerPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [match, setMatch]   = useState(null);
  const [online, setOnline] = useState([]);
  const [tab, setTab]       = useState('public');
  const [code, setCode]     = useState('');
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);
  const pollRef = useRef(null);

  const api = useCallback(async (path, opts = {}) => {
    const res = await fetch(`/api/multiplayer${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.code });
    return data;
  }, [token]);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await api('/status');
      setStatus(data);
      if (data.activeMatch) setMatch(data.activeMatch);
    } catch (err) { setError(err.message); }
  }, [api]);

  const refreshOnline = useCallback(async () => {
    try {
      const data = await api('/online');
      setOnline(data.online || []);
    } catch (_) { /* ignore */ }
  }, [api]);

  useEffect(() => { refreshStatus(); refreshOnline(); }, [refreshStatus, refreshOnline]);

  // Poll active match for joins / game results.
  useEffect(() => {
    if (!match || match.status === 'completed') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const data = await api(`/state/${match.id}`);
        setMatch(data.match);
      } catch (_) { /* ignore */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [match, api]);

  const handlePublicMatch = async () => {
    setError(''); setBusy(true);
    try {
      const data = await api('/public', { method: 'POST' });
      setMatch(data.match);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const handleCreatePrivate = async () => {
    setError(''); setBusy(true);
    try {
      const data = await api('/private/create', { method: 'POST' });
      setMatch(data.match);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const handleJoinPrivate = async () => {
    setError(''); setBusy(true);
    try {
      const data = await api('/private/join', {
        method: 'POST', body: JSON.stringify({ code: code.toUpperCase() }),
      });
      setMatch(data.match);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const handleCreatePlayoff = async () => {
    setError(''); setBusy(true);
    try {
      const data = await api('/playoff/create', { method: 'POST' });
      setMatch(data.match);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const handleJoinPlayoff = async () => {
    setError(''); setBusy(true);
    try {
      const data = await api('/playoff/join', {
        method: 'POST', body: JSON.stringify({ code: code.toUpperCase() }),
      });
      setMatch(data.match);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const handlePlayNext = async () => {
    setError(''); setBusy(true);
    try {
      const data = await api(`/play/${match.id}`, { method: 'POST' });
      setMatch(data.match);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const handleLeave = async () => {
    setBusy(true);
    try {
      await api(`/leave/${match.id}`, { method: 'POST' });
      setMatch(null);
      await refreshStatus();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  // ---------- Render ----------
  if (!status) {
    return <Shell navigate={navigate}><div style={s.card}><p style={s.subtle}>Loading…</p></div></Shell>;
  }

  if (!status.ready) {
    return (
      <Shell navigate={navigate}>
        <div style={s.lockCard}>
          <div style={s.lockIcon}>🔒</div>
          <h1 style={s.title}>Multiplayer Locked</h1>
          {!status.draftCompleted && (
            <div style={s.lockBlock}>
              <div style={s.lockHeading}>Step 1 — Complete your Fantasy Draft</div>
              <div style={s.subtle}>Draft your roster before you can challenge other GMs.</div>
              <button style={s.primaryBtn} onClick={() => navigate('/draft')}>Go to Fantasy Draft →</button>
            </div>
          )}
          {status.draftCompleted && !status.subscribed && (
            <div style={s.lockBlock}>
              <div style={s.lockHeading}>Step 2 — Subscribe to unlock Multiplayer</div>
              <div style={s.subtle}>Premium subscribers can play public, private and playoff matches against real users.</div>
              <button style={s.primaryBtn} onClick={() => navigate('/subscribe')}>View Plans →</button>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  if (match) {
    return (
      <Shell navigate={navigate}>
        <ActiveMatch
          match={match}
          onPlayNext={handlePlayNext}
          onLeave={handleLeave}
          busy={busy}
          error={error}
        />
      </Shell>
    );
  }

  return (
    <Shell navigate={navigate}>
      <div style={s.tabsRow}>
        <TabBtn active={tab === 'public'}  onClick={() => setTab('public')}>🌐 Public Match</TabBtn>
        <TabBtn active={tab === 'private'} onClick={() => setTab('private')}>🔑 Private Match</TabBtn>
        <TabBtn active={tab === 'playoff'} onClick={() => setTab('playoff')}>🏆 Playoff Mode</TabBtn>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {tab === 'public' && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Public Match — Best of 7</h2>
          <p style={s.subtle}>Auto-pair with another online subscriber. First to 4 wins claims the series.</p>
          <button style={s.primaryBtn} disabled={busy} onClick={handlePublicMatch}>
            {busy ? 'Searching…' : '🎯 Find Match'}
          </button>

          <div style={s.divider} />
          <div style={s.cardTitleSm}>Online Subscribers <span style={s.badgeSm}>{online.length}</span></div>
          {online.length === 0 ? (
            <p style={s.subtle}>No other users online right now.</p>
          ) : (
            <div style={s.onlineGrid}>
              {online.map(u => (
                <div key={u.userId} style={s.onlineRow}>
                  <span style={s.dot} />
                  <span style={{ fontWeight: 700 }}>{u.username}</span>
                  <span style={s.subtle}>· {u.teamName || 'Team'}</span>
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
                    {u.record.wins}–{u.record.losses}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'private' && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Private Match — Best of 7</h2>
          <p style={s.subtle}>Create a room and share the code with a friend, or enter their code to join.</p>
          <div style={s.row}>
            <button style={s.primaryBtn} disabled={busy} onClick={handleCreatePrivate}>
              {busy ? '…' : '➕ Create Room'}
            </button>
          </div>
          <div style={s.divider} />
          <div style={s.cardTitleSm}>Join with a code</div>
          <div style={s.row}>
            <input
              style={s.input}
              placeholder="ABC123"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
            <button style={s.primaryBtn} disabled={busy || code.length < 4} onClick={handleJoinPrivate}>
              Join →
            </button>
          </div>
        </div>
      )}

      {tab === 'playoff' && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>🏆 Playoff Mode — Play for the Ring</h2>
          <p style={s.subtle}>
            8 GMs, NBA-style bracket. Quarterfinals → Semifinals → Finals.
            Every series is best-of-7. Last GM standing is crowned champion.
          </p>
          <div style={s.row}>
            <button style={s.primaryBtn} disabled={busy} onClick={handleCreatePlayoff}>
              {busy ? '…' : '➕ Create Bracket'}
            </button>
          </div>
          <div style={s.divider} />
          <div style={s.cardTitleSm}>Join an existing bracket</div>
          <div style={s.row}>
            <input
              style={s.input}
              placeholder="Bracket code"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
            <button style={s.primaryBtn} disabled={busy || code.length < 4} onClick={handleJoinPlayoff}>
              Join →
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ navigate, children }) {
  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.inner}>
        <h1 style={s.pageTitle}>🌐 Multiplayer</h1>
        {children}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...s.tabBtn,
        ...(active ? s.tabBtnActive : {}),
      }}
    >{children}</button>
  );
}

function ActiveMatch({ match, onPlayNext, onLeave, busy, error }) {
  const isPlayoff = match.type === 'playoff';
  const target = Math.ceil(match.maxGames / 2);

  if (match.status === 'waiting') {
    return (
      <div style={s.card}>
        <h2 style={s.cardTitle}>
          {isPlayoff ? '🏆 Playoff Lobby' : '⏳ Waiting for opponent…'}
        </h2>
        {match.code && (
          <div style={s.codeBox}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, letterSpacing: 1 }}>SHARE CODE</div>
            <div style={s.codeText}>{match.code}</div>
          </div>
        )}
        <div style={s.cardTitleSm}>Players {match.players.length} / {match.capacity}</div>
        <div style={s.onlineGrid}>
          {match.players.map(p => (
            <div key={p.userId} style={s.onlineRow}>
              <span style={s.dot} />
              <span style={{ fontWeight: 700 }}>{p.username}</span>
              <span style={s.subtle}>· {p.teamName}</span>
            </div>
          ))}
        </div>
        {error && <div style={s.error}>{error}</div>}
        <div style={s.row}>
          <button style={s.dangerBtn} onClick={onLeave} disabled={busy}>Cancel</button>
        </div>
      </div>
    );
  }

  if (match.status === 'completed') {
    return (
      <div style={s.card}>
        <div style={{ fontSize: 56, textAlign: 'center' }}>🏆</div>
        <h2 style={{ ...s.cardTitle, textAlign: 'center', color: '#facc15' }}>
          {match.champion} {isPlayoff ? 'is the Champion!' : 'wins the series!'}
        </h2>
        {!isPlayoff && match.players.length === 2 && (
          <div style={{ ...s.subtle, textAlign: 'center' }}>
            Final series record: {match.players[0].username} {match.players[0].wins} —{' '}
            {match.players[1].wins} {match.players[1].username}
          </div>
        )}
        {isPlayoff && match.bracket && <Bracket bracket={match.bracket} />}
        <div style={s.row}>
          <button style={s.primaryBtn} onClick={onLeave}>Back to Lobby</button>
        </div>
      </div>
    );
  }

  if (isPlayoff) {
    return (
      <div style={s.card}>
        <h2 style={s.cardTitle}>🏆 Playoff Bracket — Round {match.bracket.round + 1}</h2>
        <Bracket bracket={match.bracket} />
        {error && <div style={s.error}>{error}</div>}
        <div style={s.row}>
          <button style={s.primaryBtn} disabled={busy} onClick={onPlayNext}>
            {busy ? 'Simulating…' : '▶️ Play Next Game'}
          </button>
          <button style={s.dangerBtn} onClick={onLeave} disabled={busy}>Forfeit</button>
        </div>
      </div>
    );
  }

  const [pA, pB] = match.players;
  return (
    <div style={s.card}>
      <h2 style={s.cardTitle}>{pA.username} vs {pB.username}</h2>
      <div style={s.scoreboard}>
        <div style={s.scoreSide}>
          <div style={s.teamName}>{pA.username}</div>
          <div style={s.bigWins}>{pA.wins}</div>
        </div>
        <div style={s.vs}>vs · First to {target}</div>
        <div style={s.scoreSide}>
          <div style={s.teamName}>{pB.username}</div>
          <div style={s.bigWins}>{pB.wins}</div>
        </div>
      </div>

      {match.games.length > 0 && (
        <>
          <div style={s.cardTitleSm}>Series Games</div>
          <div style={s.gameList}>
            {match.games.map(g => (
              <div key={g.gameNumber} style={s.gameRow}>
                <span style={{ fontWeight: 700, width: 60 }}>Game {g.gameNumber}</span>
                <span>{g.scoreA} — {g.scoreB}</span>
                <span style={{ marginLeft: 'auto', color: '#22c55e', fontWeight: 700 }}>
                  {g.winner} W
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <div style={s.error}>{error}</div>}
      <div style={s.row}>
        <button style={s.primaryBtn} disabled={busy} onClick={onPlayNext}>
          {busy ? 'Simulating…' : `▶️ Play Game ${match.games.length + 1}`}
        </button>
        <button style={s.dangerBtn} onClick={onLeave} disabled={busy}>Forfeit</button>
      </div>
    </div>
  );
}

function Bracket({ bracket }) {
  return (
    <div style={s.bracketWrap}>
      {bracket.rounds.map((round, ri) => (
        <div key={ri} style={s.bracketCol}>
          <div style={s.bracketRoundTitle}>{round.name}</div>
          {round.series.length === 0 ? (
            <div style={s.subtle}>—</div>
          ) : round.series.map((sr, si) => (
            <div key={si} style={s.seriesCard}>
              <div style={s.seriesRow}>
                <span>#{sr.teamA.seed} {sr.teamA.username}</span>
                <span style={{ fontWeight: 700, color: sr.winsA >= 4 ? '#22c55e' : '#e2e8f0' }}>
                  {sr.winsA}
                </span>
              </div>
              <div style={s.seriesRow}>
                <span>#{sr.teamB.seed} {sr.teamB.username}</span>
                <span style={{ fontWeight: 700, color: sr.winsB >= 4 ? '#22c55e' : '#e2e8f0' }}>
                  {sr.winsB}
                </span>
              </div>
              {sr.winner && <div style={s.seriesWinner}>✓ {sr.winner}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  inner: { maxWidth: 920, margin: '0 auto' },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 16 },
  pageTitle: { color: '#06b6d4', fontSize: 32, margin: '0 0 20px', fontWeight: 800 },

  card: { background: '#1e293b', borderRadius: 16, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', marginBottom: 20 },
  lockCard: { background: '#1e293b', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxWidth: 520, margin: '40px auto' },
  lockIcon: { fontSize: 56, marginBottom: 12 },
  title: { color: '#facc15', fontSize: 26, margin: '0 0 16px', fontWeight: 800 },
  lockBlock: { padding: 20, background: 'rgba(15,23,42,0.6)', borderRadius: 12, marginTop: 16, border: '1px solid rgba(148,163,184,0.15)' },
  lockHeading: { color: '#e2e8f0', fontWeight: 700, fontSize: 16, marginBottom: 6 },

  cardTitle: { color: '#06b6d4', fontSize: 22, margin: '0 0 8px', fontWeight: 800 },
  cardTitleSm: { color: '#cbd5e1', fontSize: 14, fontWeight: 700, margin: '12px 0 8px', textTransform: 'uppercase', letterSpacing: 1 },
  subtle: { color: '#94a3b8', fontSize: 14, margin: '4px 0 16px' },
  divider: { height: 1, background: 'rgba(148,163,184,0.15)', margin: '20px 0' },

  tabsRow: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  tabBtn: { background: '#1e293b', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  tabBtnActive: { background: '#06b6d4', color: '#0f172a', border: '1px solid #06b6d4' },

  primaryBtn: { background: '#06b6d4', color: '#0f172a', border: 'none', borderRadius: 10, padding: '12px 22px', fontWeight: 800, cursor: 'pointer', fontSize: 14, marginTop: 8 },
  dangerBtn: { background: 'transparent', color: '#f87171', border: '1px solid #f87171', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14, marginTop: 8 },
  input: { background: '#0f172a', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 10, padding: '12px 14px', fontWeight: 700, fontSize: 16, letterSpacing: 4, textAlign: 'center', flex: 1, marginTop: 8 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },

  error: { background: 'rgba(248,113,113,0.15)', color: '#fca5a5', padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 14 },

  onlineGrid: { display: 'flex', flexDirection: 'column', gap: 6 },
  onlineRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(15,23,42,0.6)', borderRadius: 8, fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, background: '#22c55e', boxShadow: '0 0 6px #22c55e' },
  badgeSm: { background: 'rgba(6,182,212,0.2)', color: '#06b6d4', padding: '2px 8px', borderRadius: 8, fontSize: 12, marginLeft: 6 },

  codeBox: { background: 'rgba(6,182,212,0.1)', border: '2px dashed #06b6d4', borderRadius: 12, padding: 20, textAlign: 'center', margin: '16px 0' },
  codeText: { fontSize: 36, fontWeight: 900, letterSpacing: 8, color: '#06b6d4', fontFamily: 'monospace' },

  scoreboard: { display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: 24, background: 'rgba(15,23,42,0.6)', borderRadius: 12, margin: '12px 0' },
  scoreSide: { textAlign: 'center', flex: 1 },
  teamName: { fontSize: 14, color: '#94a3b8', marginBottom: 8 },
  bigWins: { fontSize: 56, fontWeight: 900, color: '#facc15' },
  vs: { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2 },

  gameList: { display: 'flex', flexDirection: 'column', gap: 4 },
  gameRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(15,23,42,0.6)', borderRadius: 8, fontSize: 14 },

  bracketWrap: { display: 'flex', gap: 16, overflowX: 'auto', padding: '12px 0', alignItems: 'flex-start' },
  bracketCol: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 },
  bracketRoundTitle: { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 },
  seriesCard: { background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, padding: 10, fontSize: 13 },
  seriesRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' },
  seriesWinner: { marginTop: 4, paddingTop: 6, borderTop: '1px dashed rgba(148,163,184,0.2)', color: '#22c55e', fontSize: 12, fontWeight: 700 },
};
