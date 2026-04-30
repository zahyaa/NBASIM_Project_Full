// Sprint A4 — Trade Machine.
// Pick a CPU partner team, drag players/picks into Send and Receive
// columns, submit, see CPU acceptance score + result.
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const PAGE = { background: '#0f172a', minHeight: '100vh', color: '#e2e8f0', padding: 20 };
const CARD = { background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 16 };
const TABLE = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const TH = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #334155', color: '#94a3b8' };
const TD = { padding: '6px 8px', borderBottom: '1px solid #1e293b' };
const BTN = { padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const BTN_S = { ...BTN, padding: '4px 10px', fontSize: 12 };
const PILL = { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, marginLeft: 6 };

export default function TradeMachinePage() {
  const { token } = useAuth();
  const [state, setState] = useState(null);
  const [partner, setPartner] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [send, setSend] = useState({ players: [], picks: [] });
  const [receive, setReceive] = useState({ players: [], picks: [] });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('machine');

  const loadState = useCallback(async () => {
    const r = await fetch('/api/trades/state', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setState(await r.json());
  }, [token]);

  const loadPartner = useCallback(async (name) => {
    const r = await fetch(`/api/trades/team/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) setPartnerData(await r.json());
  }, [token]);

  useEffect(() => { loadState(); }, [loadState]);
  useEffect(() => { if (partner) loadPartner(partner); }, [partner, loadPartner]);

  function toggle(arr, item, key) {
    const exists = arr.find(x => x[key] === item[key]);
    return exists ? arr.filter(x => x[key] !== item[key]) : [...arr, item];
  }

  async function propose() {
    if (!partner) return;
    setBusy(true); setResult(null);
    try {
      const body = {
        cpuTeam: partner,
        sendPlayerIds: send.players.map(p => p.playerId),
        sendPickIds: send.picks.map(p => p.pickId),
        receivePlayerIds: receive.players.map(p => p.playerId),
        receivePickIds: receive.picks.map(p => p.pickId),
      };
      const r = await fetch('/api/trades/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) {
        setResult({ ok: true, ...data });
        if (data.accepted) {
          setSend({ players: [], picks: [] });
          setReceive({ players: [], picks: [] });
          await loadState();
          await loadPartner(partner);
        }
      } else {
        setResult({ ok: false, error: data.error });
      }
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally { setBusy(false); }
  }

  async function respond(proposalId, accept) {
    setBusy(true);
    try {
      const r = await fetch('/api/trades/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ proposalId, accept }),
      });
      const data = await r.json();
      setResult({ ok: r.ok, ...data });
      await loadState();
    } finally { setBusy(false); }
  }

  if (!state) return <div style={PAGE}>Loading trade desk...</div>;

  const userPlayers = []; // hydrated below from state via separate request? Not needed — we'll fetch via finance call.
  const deadline = state.tradeDeadline || {};

  return (
    <div style={PAGE}>
      <h1 style={{ marginTop: 0 }}>Trade Machine</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('machine')} style={{ ...BTN, background: tab === 'machine' ? '#2563eb' : '#334155' }}>Trade Machine</button>
        <button onClick={() => setTab('proposals')} style={{ ...BTN, background: tab === 'proposals' ? '#2563eb' : '#334155' }}>
          Incoming ({(state.cpuTradeProposals || []).length})
        </button>
        <button onClick={() => setTab('history')} style={{ ...BTN, background: tab === 'history' ? '#2563eb' : '#334155' }}>History</button>
      </div>

      <div style={{ ...CARD, background: deadline.locked ? '#7f1d1d' : '#1e293b' }}>
        <strong>Trade Deadline:</strong> {deadline.gamesPlayed}/{deadline.deadlineGames} games played —{' '}
        {deadline.locked ? 'LOCKED' : 'Open'}
      </div>

      {tab === 'machine' && (
        <Machine
          state={state}
          partner={partner}
          setPartner={setPartner}
          partnerData={partnerData}
          send={send} setSend={setSend}
          receive={receive} setReceive={setReceive}
          propose={propose}
          busy={busy}
          result={result}
          token={token}
          toggle={toggle}
        />
      )}

      {tab === 'proposals' && (
        <Proposals proposals={state.cpuTradeProposals || []} respond={respond} busy={busy} />
      )}

      {tab === 'history' && (
        <History history={state.tradeHistory || []} />
      )}
    </div>
  );
}

function Machine({ state, partner, setPartner, partnerData, send, setSend, receive, setReceive, propose, busy, result, token, toggle }) {
  const [myRoster, setMyRoster] = useState(null);

  useEffect(() => {
    fetch('/api/frontoffice/finance', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setMyRoster(d.contracts || []));
  }, [token]);

  return (
    <>
      <div style={CARD}>
        <h3 style={{ marginTop: 0 }}>1. Pick a Partner Team</h3>
        <select value={partner || ''} onChange={e => setPartner(e.target.value)} style={{ padding: 8, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4 }}>
          <option value="">— Select team —</option>
          {(state.cpuTeams || []).map(t => (
            <option key={t.name} value={t.name}>{t.city} {t.name} — {t.direction}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Side
          title={`You Send → ${partner || 'partner'}`}
          players={myRoster || []}
          picks={state.ownedPicks || []}
          selected={send}
          onTogglePlayer={p => setSend(s => ({ ...s, players: toggle(s.players, p, 'playerId') }))}
          onTogglePick={p => setSend(s => ({ ...s, picks: toggle(s.picks, p, 'pickId') }))}
        />
        <Side
          title={partnerData ? `${partnerData.name} Sends to You` : 'Receive'}
          players={partnerData?.players || []}
          picks={partnerData?.picks || []}
          selected={receive}
          onTogglePlayer={p => setReceive(r => ({ ...r, players: toggle(r.players, p, 'playerId') }))}
          onTogglePick={p => setReceive(r => ({ ...r, picks: toggle(r.picks, p, 'pickId') }))}
        />
      </div>

      <div style={{ ...CARD, marginTop: 16 }}>
        <SummaryBar send={send} receive={receive} />
        <button onClick={propose} disabled={busy || !partner} style={{ ...BTN, marginTop: 12, opacity: busy || !partner ? 0.5 : 1 }}>
          {busy ? 'Submitting...' : 'Submit Trade Proposal'}
        </button>
        {result && (
          <div style={{ marginTop: 12, padding: 12, background: result.ok && result.accepted ? '#065f46' : result.ok && !result.accepted ? '#7c2d12' : '#7f1d1d', borderRadius: 6 }}>
            {result.error || result.message}
            {typeof result.score === 'number' && <span style={{ marginLeft: 12, opacity: 0.7 }}>(score {result.score})</span>}
          </div>
        )}
      </div>
    </>
  );
}

function Side({ title, players, picks, selected, onTogglePlayer, onTogglePick }) {
  return (
    <div style={CARD}>
      <h4 style={{ marginTop: 0 }}>{title}</h4>
      <div style={{ marginBottom: 12 }}>
        <strong>Players</strong>
        <table style={TABLE}>
          <thead>
            <tr><th style={TH}></th><th style={TH}>Name</th><th style={TH}>Pos</th><th style={TH}>OVR</th><th style={TH}>Salary</th><th style={TH}>Yrs</th></tr>
          </thead>
          <tbody>
            {players.map(p => {
              const isSel = selected.players.find(x => x.playerId === p.playerId);
              return (
                <tr key={p.playerId} style={{ background: isSel ? '#1e40af' : 'transparent', cursor: 'pointer' }} onClick={() => onTogglePlayer(p)}>
                  <td style={TD}>{isSel ? '✔' : ''}</td>
                  <td style={TD}>{p.firstName} {p.lastName} {p.noTradeClause && <span style={{ ...PILL, background: '#7f1d1d' }}>NTC</span>}</td>
                  <td style={TD}>{p.position}</td>
                  <td style={TD}>{p.rating}</td>
                  <td style={TD}>${(p.salary || 0).toFixed(1)}M</td>
                  <td style={TD}>{p.yearsRemaining}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <strong>Picks</strong>
        <table style={TABLE}>
          <thead>
            <tr><th style={TH}></th><th style={TH}>Pick</th><th style={TH}>Year</th><th style={TH}>Round</th><th style={TH}>Value</th></tr>
          </thead>
          <tbody>
            {picks.map(p => {
              const isSel = selected.picks.find(x => x.pickId === p.pickId);
              return (
                <tr key={p.pickId} style={{ background: isSel ? '#1e40af' : 'transparent', cursor: 'pointer' }} onClick={() => onTogglePick(p)}>
                  <td style={TD}>{isSel ? '✔' : ''}</td>
                  <td style={TD}>{p.pickId}</td>
                  <td style={TD}>{p.year}</td>
                  <td style={TD}>R{p.round}</td>
                  <td style={TD}>{p.estimatedValue}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryBar({ send, receive }) {
  const sendSal = send.players.reduce((s, p) => s + (p.salary || 0), 0);
  const recvSal = receive.players.reduce((s, p) => s + (p.salary || 0), 0);
  return (
    <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
      <div>Sending: {send.players.length} players + {send.picks.length} picks (${sendSal.toFixed(1)}M)</div>
      <div>Receiving: {receive.players.length} players + {receive.picks.length} picks (${recvSal.toFixed(1)}M)</div>
    </div>
  );
}

function Proposals({ proposals, respond, busy }) {
  if (!proposals.length) return <div style={CARD}>No incoming proposals.</div>;
  return proposals.map(p => (
    <div key={p.proposalId} style={CARD}>
      <h4 style={{ marginTop: 0 }}>{p.partnerTeam}</h4>
      <p>{p.message}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <strong>You give up:</strong>
          <ul>
            {(p.sendPlayerIds || []).map(id => <li key={id}>Player #{id}</li>)}
            {(p.sendPickIds || []).map(id => <li key={id}>Pick {id}</li>)}
          </ul>
        </div>
        <div>
          <strong>You receive:</strong>
          <ul>
            {(p.receivePlayers || []).map(rp => <li key={rp.playerId}>{rp.firstName} {rp.lastName} ({rp.rating} OVR, ${(rp.salary || 0).toFixed(1)}M)</li>)}
            {(p.receivePicks || []).map(rp => <li key={rp.pickId}>Pick {rp.pickId}</li>)}
          </ul>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => respond(p.proposalId, true)} disabled={busy} style={{ ...BTN_S, background: '#16a34a' }}>Accept</button>
        <button onClick={() => respond(p.proposalId, false)} disabled={busy} style={{ ...BTN_S, background: '#dc2626' }}>Reject</button>
      </div>
    </div>
  ));
}

function History({ history }) {
  if (!history.length) return <div style={CARD}>No trades yet.</div>;
  return (
    <div style={CARD}>
      <table style={TABLE}>
        <thead>
          <tr><th style={TH}>Date</th><th style={TH}>Partner</th><th style={TH}>Sent</th><th style={TH}>Received</th><th style={TH}>By</th></tr>
        </thead>
        <tbody>
          {history.slice().reverse().map(t => (
            <tr key={t.tradeId}>
              <td style={TD}>{new Date(t.executedAt).toLocaleDateString()}</td>
              <td style={TD}>{t.partnerTeam}</td>
              <td style={TD}>
                {(t.sentPlayers || []).map(p => `${p.firstName} ${p.lastName}`).join(', ')}
                {(t.sentPicks || []).length > 0 && ` + ${t.sentPicks.length} picks`}
              </td>
              <td style={TD}>
                {(t.receivedPlayers || []).map(p => `${p.firstName} ${p.lastName}`).join(', ')}
                {(t.receivedPicks || []).length > 0 && ` + ${t.receivedPicks.length} picks`}
              </td>
              <td style={TD}>{t.initiatedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
