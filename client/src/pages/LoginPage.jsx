import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }
      login(data.token, data.user);
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Basketball Simulator</h1>
        <p style={styles.subtitle}>
          {isRegister ? 'Create your account' : 'Sign in to your account'}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? '...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>

        <button
          onClick={() => { setIsRegister(!isRegister); setError(''); }}
          style={styles.toggle}
        >
          {isRegister
            ? 'Already have an account? Login'
            : "Don't have an account? Register"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  },
  card: {
    background: '#1e293b',
    borderRadius: 16,
    padding: '40px 32px',
    minWidth: 340,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    textAlign: 'center',
  },
  title: {
    color: '#f97316',
    fontSize: 36,
    margin: '0 0 8px',
    fontWeight: 800,
    letterSpacing: 2,
  },
  subtitle: {
    color: '#94a3b8',
    margin: '0 0 24px',
    fontSize: 14,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    fontSize: 16,
    outline: 'none',
  },
  button: {
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#f97316',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 8,
  },
  toggle: {
    background: 'none',
    border: 'none',
    color: '#60a5fa',
    cursor: 'pointer',
    marginTop: 16,
    fontSize: 13,
  },
  error: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '8px 12px',
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
};
