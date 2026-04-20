import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const { token, user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState(user?.difficulty || 'pro');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (user?.difficulty) setDifficulty(user.difficulty);
  }, [user?.difficulty]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ difficulty }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
      setMessage('Settings saved!');
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!window.confirm('Reset your draft and all game data? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch('/api/settings/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to reset');
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
      setMessage('Game data reset. Redirecting to menu...');
      setTimeout(() => navigate('/menu'), 1500);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('DELETE your account? This is permanent and cannot be undone.')) return;
    if (!window.confirm('Are you absolutely sure?')) return;
    try {
      const res = await fetch('/api/settings/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete account');
      logout();
    } catch (err) {
      setError(err.message);
    }
  };

  const difficulties = [
    { key: 'easy', label: 'Easy', desc: 'Relaxed gameplay, boosted stats', color: '#22c55e' },
    { key: 'hard', label: 'Hard', desc: 'Tighter margins, smarter CPU', color: '#f97316' },
    { key: 'pro', label: 'Pro', desc: 'Balanced and competitive', color: '#3b82f6' },
    { key: 'allstar', label: 'All-Star', desc: 'Elite difficulty, no mercy', color: '#a855f7' },
    { key: 'legacy', label: 'Legacy', desc: 'Maximum challenge, legend mode', color: '#ef4444' },
  ];

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch('/api/upload/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      setUser(await meRes.json());
      setMessage('Logo uploaded!');
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  };

  return (
    <div style={s.container}>
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <h1 style={s.title}>Settings</h1>
      {error && <div style={s.error}>{error}</div>}
      {message && <div style={s.success}>{message}</div>}

      <div style={s.card}>
        <h2 style={s.sectionTitle}>Difficulty</h2>
        <div style={s.diffGrid}>
          {difficulties.map(d => (
            <button key={d.key} onClick={() => setDifficulty(d.key)}
              style={difficulty === d.key
                ? { ...s.diffBtn, border: `2px solid ${d.color}`, color: d.color, background: `${d.color}15` }
                : s.diffBtn}>
              <span style={s.diffLabel}>{d.label}</span>
              <span style={s.diffDesc}>{d.desc}</span>
            </button>
          ))}
        </div>
        <button onClick={handleSave} disabled={saving} style={s.saveBtn}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div style={s.card}>
        <h2 style={s.sectionTitle}>Account</h2>
        <p style={s.accountInfo}>Logged in as <strong>{user?.username}</strong></p>
        <p style={s.accountInfo}>
          Record: {user?.wins || 0}W - {user?.losses || 0}L
          {user?.team?.name ? ` | Team: ${user.team.name}` : ''}
        </p>
      </div>

      <div style={s.card}>
        <h2 style={s.sectionTitle}>Team Logo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {user?.team?.logo ? (
            <img src={`/api/upload/file/${user.team.logo.split('/').pop()}`} alt="Team Logo"
              style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8, border: '1px solid #334155' }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 8, background: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11 }}>No Logo</div>
          )}
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={handleLogoUpload} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#a855f7', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              {uploading ? 'Uploading...' : user?.team?.logo ? 'Change Logo' : 'Upload Logo'}
            </button>
            <p style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>PNG, JPG, or SVG. Max 2MB.</p>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <h2 style={{ ...s.sectionTitle, color: '#f97316' }}>Danger Zone</h2>
        <div style={s.dangerRow}>
          <div>
            <p style={s.dangerLabel}>Reset Game Data</p>
            <p style={s.dangerDesc}>Clear your draft, team, and W/L record</p>
          </div>
          <button onClick={handleReset} style={s.resetBtn}>Reset</button>
        </div>
        <div style={s.dangerRow}>
          <div>
            <p style={s.dangerLabel}>Delete Account</p>
            <p style={s.dangerDesc}>Permanently delete your account and all data</p>
          </div>
          <button onClick={handleDeleteAccount} style={s.deleteBtn}>Delete</button>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={logout} style={s.logoutBtn}>Log Out</button>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24, maxWidth: 600, margin: '0 auto' },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' },
  title: { color: '#94a3b8', fontSize: 32, textAlign: 'center', margin: '0 0 24px', fontWeight: 800 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, textAlign: 'center', fontSize: 13, marginBottom: 12 },
  success: { background: '#14532d', color: '#86efac', padding: '8px 12px', borderRadius: 8, textAlign: 'center', fontSize: 13, marginBottom: 12 },
  card: { background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 16 },
  sectionTitle: { color: '#e2e8f0', fontSize: 18, margin: '0 0 12px', fontWeight: 700 },
  diffGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  diffBtn: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 8, border: '2px solid #334155', background: '#0f172a', color: '#94a3b8', cursor: 'pointer', textAlign: 'left' },
  diffLabel: { fontWeight: 700, fontSize: 15 },
  diffDesc: { fontSize: 12, opacity: 0.7 },
  saveBtn: { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 16 },
  accountInfo: { color: '#94a3b8', margin: '4px 0', fontSize: 14 },
  dangerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #334155' },
  dangerLabel: { color: '#e2e8f0', fontWeight: 600, fontSize: 14, margin: 0 },
  dangerDesc: { color: '#64748b', fontSize: 12, margin: '2px 0 0' },
  resetBtn: { padding: '8px 20px', borderRadius: 6, border: 'none', background: '#f97316', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  deleteBtn: { padding: '8px 20px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  logoutBtn: { padding: '12px 32px', borderRadius: 8, border: '2px solid #334155', background: 'transparent', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 15 },
};
