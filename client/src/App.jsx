import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DraftPage from './pages/DraftPage';
import GamePage from './pages/GamePage';

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>Loading...</div>;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function DraftGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>Loading...</div>;
  if (!user?.draftCompleted) return <Navigate to="/draft" replace />;
  return children;
}

function AppRoutes() {
  const { token, user, loading, logout } = useAuth();

  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>Loading...</div>;

  return (
    <>
      {token && (
        <nav style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', background: '#0f172a' }}>
          <span style={{ color: '#94a3b8', marginRight: 'auto', fontWeight: 600 }}>
            Basketball Simulator — {user?.username}
            {user?.draftCompleted ? ` | ${user.wins}W-${user.losses}L` : ''}
          </span>
          {user?.draftCompleted && (
            <a href="/game" style={{ color: '#60a5fa', marginRight: 16, textDecoration: 'none' }}>Game</a>
          )}
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 600 }}>
            Logout
          </button>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={token ? <Navigate to={user?.draftCompleted ? '/game' : '/draft'} replace /> : <LoginPage />} />
        <Route path="/draft" element={<ProtectedRoute><DraftPage /></ProtectedRoute>} />
        <Route path="/game" element={<ProtectedRoute><DraftGate><GamePage /></DraftGate></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={token ? (user?.draftCompleted ? '/game' : '/draft') : '/login'} replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

