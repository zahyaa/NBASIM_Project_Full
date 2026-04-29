// Playbook Page — design and save custom plays. Locked until the user has
// started a fantasy draft. Saved plays show up here AND in
// Team Management → Coach's Playbook tab.
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const EMPTY = {
  name: '',
  type: 'Set',
  formation: '1-4 High',
  primary: '',
  secondary: '',
  screener: '',
  description: '',
};

export default function PlaybookPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!user?.draftStarted) {
    return (
      <div style={s.container} data-testid="playbook-locked">
        <button onClick={() => navigate('/menu')} style={s.backBtn}>← Main Menu</button>
        <h1 style={s.title}>📋 Playbook</h1>
        <div style={s.locked}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>
            🔒 Locked — start a fantasy draft to design custom plays for your team.
          </p>
          <button onClick={() => navigate('/draft')} style={s.primaryBtn}>Go to Fantasy Draft</button>
        </div>
      </div>
    );
  }

  const playerOptions = (data?.roster || [])
    .slice()
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const submit = async () => {
    setBusy(true); setError(''); setToast('');
    try {
      if (!draft.name.trim()) throw new Error('Play name is required');
      const url = editingId ? `/api/playbook/${editingId}` : '/api/playbook';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setToast(editingId ? 'Play updated' : 'Play saved to Team Management');
      setDraft(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const editPlay = (p) => {
    setEditingId(p.id);
    setDraft({
      name: p.name, type: p.type, formation: p.formation,
      primary: p.primary || '', secondary: p.secondary || '', screener: p.screener || '',
      description: p.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deletePlay = async (id) => {
    if (!window.confirm('Delete this play?')) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/playbook/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setToast('Play deleted');
      if (editingId === id) { setEditingId(null); setDraft(EMPTY); }
      await load();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const playerName = (id) => {
    if (!id) return '—';
    const p = (data?.roster || []).find(x => String(x.playerId) === String(id));
    return p ? `${p.firstName} ${p.lastName}` : '—';
  };

  return (
    <div style={s.container} data-testid="playbook-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>← Main Menu</button>
      <h1 style={s.title}>📋 Coach's Playbook</h1>
      <p style={s.sub}>
        {data?.teamName || 'My Team'} · Coach {data?.coach || '—'}
        {' · '}{data?.plays?.length || 0} / {data?.max || 25} plays
      </p>

      {error && <div style={s.error} data-testid="pb-error">{error}</div>}
      {toast && <div style={s.toast} data-testid="pb-toast">{toast}</div>}

      <div style={s.editor} data-testid="pb-editor">
        <h2 style={s.sectionTitle}>{editingId ? 'Edit Play' : 'Design a New Play'}</h2>
        <div style={s.row}>
          <label style={s.label}>
            Play Name
            <input
              data-testid="pb-name"
              style={s.input}
              value={draft.name}
              maxLength={60}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Hammer, Iverson Cut, 32 Fist"
            />
          </label>
          <label style={s.label}>
            Type
            <select data-testid="pb-type" style={s.input}
              value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
              {(data?.types || []).map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label style={s.label}>
            Formation
            <select data-testid="pb-formation" style={s.input}
              value={draft.formation} onChange={e => setDraft({ ...draft, formation: e.target.value })}>
              {(data?.formations || []).map(f => <option key={f}>{f}</option>)}
            </select>
          </label>
        </div>

        <div style={s.row}>
          <label style={s.label}>
            Primary Scorer
            <select data-testid="pb-primary" style={s.input}
              value={draft.primary} onChange={e => setDraft({ ...draft, primary: e.target.value })}>
              <option value="">— select —</option>
              {playerOptions.map(p => (
                <option key={p.playerId} value={p.playerId}>
                  {p.firstName} {p.lastName} ({p.position} · {p.rating})
                </option>
              ))}
            </select>
          </label>
          <label style={s.label}>
            Secondary Option
            <select data-testid="pb-secondary" style={s.input}
              value={draft.secondary} onChange={e => setDraft({ ...draft, secondary: e.target.value })}>
              <option value="">— select —</option>
              {playerOptions.map(p => (
                <option key={p.playerId} value={p.playerId}>
                  {p.firstName} {p.lastName} ({p.position} · {p.rating})
                </option>
              ))}
            </select>
          </label>
          <label style={s.label}>
            Screener
            <select data-testid="pb-screener" style={s.input}
              value={draft.screener} onChange={e => setDraft({ ...draft, screener: e.target.value })}>
              <option value="">— select —</option>
              {playerOptions.map(p => (
                <option key={p.playerId} value={p.playerId}>
                  {p.firstName} {p.lastName} ({p.position} · {p.rating})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ ...s.label, width: '100%' }}>
          Description / Read
          <textarea
            data-testid="pb-description"
            style={{ ...s.input, minHeight: 80, fontFamily: 'inherit' }}
            value={draft.description}
            maxLength={400}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            placeholder="e.g. Primary comes off a stagger from the screener. If denied, secondary curls baseline."
          />
        </label>

        <div style={s.actions}>
          <button data-testid="pb-save" onClick={submit} disabled={busy} style={s.primaryBtn}>
            {busy ? 'Saving…' : editingId ? 'Update Play' : 'Save Play'}
          </button>
          {editingId && (
            <button onClick={() => { setEditingId(null); setDraft(EMPTY); }}
                    style={s.secondaryBtn}>Cancel</button>
          )}
        </div>
      </div>

      <h2 style={s.sectionTitle}>Saved Plays</h2>
      {!data?.plays?.length && (
        <p style={s.help}>No plays yet. Design your first play above — it will be saved to Team Management.</p>
      )}
      <div style={s.grid}>
        {(data?.plays || []).map((p, i) => (
          <div key={p.id} style={s.card} data-testid={`pb-play-${i}`}>
            <div style={s.cardHead}>
              <div>
                <div style={s.cardName}>{p.name}</div>
                <div style={s.chips}>
                  <span style={s.chip}>{p.type}</span>
                  <span style={{ ...s.chip, background: '#0c4a6e' }}>{p.formation}</span>
                </div>
              </div>
            </div>
            <div style={s.assignments}>
              <div><span style={s.role}>Primary:</span> {playerName(p.primary)}</div>
              <div><span style={s.role}>Secondary:</span> {playerName(p.secondary)}</div>
              <div><span style={s.role}>Screener:</span> {playerName(p.screener)}</div>
            </div>
            {p.description && <p style={s.desc}>{p.description}</p>}
            <div style={s.cardActions}>
              <button onClick={() => editPlay(p)} style={s.smallBtn}>Edit</button>
              <button onClick={() => deletePlay(p.id)} style={{ ...s.smallBtn, background: '#7f1d1d' }}
                      data-testid={`pb-delete-${i}`}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  container: { padding: 24, color: '#fff', minHeight: '100vh', background: '#0f172a', maxWidth: 1200, margin: '0 auto' },
  backBtn: { background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 12 },
  title: { fontSize: 28, margin: '0 0 4px' },
  sub: { color: '#94a3b8', margin: '0 0 16px', fontSize: 14 },
  locked: { textAlign: 'center', padding: 60, background: '#1e293b', borderRadius: 12, marginTop: 24 },
  error: { padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 12, color: '#fff' },
  toast: { padding: 10, background: '#065f46', borderRadius: 6, marginBottom: 12, color: '#fff' },
  editor: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, marginBottom: 24 },
  sectionTitle: { color: '#fbbf24', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' },
  row: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  label: { display: 'flex', flexDirection: 'column', flex: '1 1 200px', color: '#cbd5e1', fontSize: 12, fontWeight: 600, gap: 4 },
  input: { padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 14 },
  actions: { display: 'flex', gap: 12, marginTop: 12 },
  primaryBtn: { padding: '10px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 },
  secondaryBtn: { padding: '10px 18px', background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  help: { color: '#94a3b8', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16 },
  cardHead: { marginBottom: 10 },
  cardName: { fontSize: 18, fontWeight: 700, color: '#fff' },
  chips: { display: 'flex', gap: 6, marginTop: 6 },
  chip: { background: '#7c2d12', color: '#fed7aa', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 },
  assignments: { fontSize: 13, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 },
  role: { color: '#94a3b8', fontWeight: 600, marginRight: 4 },
  desc: { fontSize: 13, color: '#e2e8f0', margin: '8px 0', lineHeight: 1.4 },
  cardActions: { display: 'flex', gap: 8, marginTop: 8 },
  smallBtn: { padding: '6px 12px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
};
