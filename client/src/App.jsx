import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import MainMenu from './pages/MainMenu';
import DraftPage from './pages/DraftPage';
import SeasonDraftPage from './pages/SeasonDraftPage';
import GamePage from './pages/GamePage';
import OneOnOnePage from './pages/OneOnOnePage';
import BlacktopPage from './pages/BlacktopPage';
import PlayerBioPage from './pages/PlayerBioPage';
import SettingsPage from './pages/SettingsPage';
import MultiplayerPage from './pages/MultiplayerPage';

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
        <nav style={{ display: 'flex', alignItems: 'center', padding: '10px 24px', background: '#0f172a', gap: 16 }}>
          <span style={{ color: '#94a3b8', marginRight: 'auto', fontWeight: 600 }}>
            Basketball Simulator — {user?.username}
            {user?.draftCompleted ? ` | ${user.wins}W-${user.losses}L` : ''}
          </span>
          <Link to="/menu" style={{ color: '#f97316', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Menu</Link>
          {user?.draftCompleted && (
            <Link to="/game" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Game</Link>
          )}
          <Link to="/players" style={{ color: '#a855f7', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Players</Link>
          <Link to="/settings" style={{ color: '#94a3b8', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Settings</Link>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            Logout
          </button>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/menu" replace /> : <LoginPage />} />
        <Route path="/menu" element={<ProtectedRoute><MainMenu /></ProtectedRoute>} />
        <Route path="/draft" element={<ProtectedRoute><DraftPage /></ProtectedRoute>} />
        <Route path="/season-draft" element={<ProtectedRoute><SeasonDraftPage /></ProtectedRoute>} />
        <Route path="/game" element={<ProtectedRoute><DraftGate><GamePage /></DraftGate></ProtectedRoute>} />
        <Route path="/1v1" element={<ProtectedRoute><OneOnOnePage /></ProtectedRoute>} />
        <Route path="/blacktop" element={<ProtectedRoute><BlacktopPage /></ProtectedRoute>} />
        <Route path="/players" element={<ProtectedRoute><PlayerBioPage /></ProtectedRoute>} />
        <Route path="/multiplayer" element={<ProtectedRoute><MultiplayerPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={token ? '/menu' : '/login'} replace />} />
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

