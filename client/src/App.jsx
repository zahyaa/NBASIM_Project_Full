import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import MainMenu from './pages/MainMenu';
import DraftPage from './pages/DraftPage';
import PacksPage from './pages/PacksPage';
import GamePage from './pages/GamePage';
import OneOnOnePage from './pages/OneOnOnePage';
import BlacktopPage from './pages/BlacktopPage';
import PlayerBioPage from './pages/PlayerBioPage';
import SettingsPage from './pages/SettingsPage';
import MultiplayerPage from './pages/MultiplayerPage';
import StorePage from './pages/StorePage';
import TeamManagementPage from './pages/TeamManagementPage';
import StandingsPage from './pages/StandingsPage';
import PlayoffsPage from './pages/PlayoffsPage';
import PlaybookPage from './pages/PlaybookPage';
import DefensivePlaybookPage from './pages/DefensivePlaybookPage';
import HowToPlayPage from './pages/HowToPlayPage';
import HomeLogo from './components/HomeLogo';
import NewsPage from './pages/NewsPage';
import AllStarPage from './pages/AllStarPage';
import SubscribePage from './pages/SubscribePage';
import FrontOfficePage from './pages/FrontOfficePage';
import InjuryReportPage from './pages/InjuryReportPage';
import FreeAgencyPage from './pages/FreeAgencyPage';
import TradeMachinePage from './pages/TradeMachinePage';
import CoachingPage from './pages/CoachingPage';
import PowerRankingsPage from './pages/PowerRankingsPage';
import PlayInPage from './pages/PlayInPage';
import GameReplayPage from './pages/GameReplayPage';
import AwardsPage from './pages/AwardsPage';
import RecordsPage from './pages/RecordsPage';

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>Loading...</div>;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function DraftGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>Loading...</div>;
  if (!user?.draftCompleted) return <Navigate to="/packs" replace />;
  return children;
}

// Pages locked until the user starts a fantasy draft (Store, Team Management).
function DraftStartedGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>Loading...</div>;
  if (!user?.draftStarted) return <Navigate to="/packs" replace />;
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
          {user?.draftStarted && (
            <>
              <Link to="/store" style={{ color: '#eab308', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Store ({user.tokens || 0})</Link>
              <Link to="/team" style={{ color: '#10b981', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Team</Link>
              <Link to="/front-office" style={{ color: '#fbbf24', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Front Office</Link>
              <Link to="/free-agency" style={{ color: '#fb923c', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Free Agency</Link>
              <Link to="/playbook" style={{ color: '#f472b6', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Playbook</Link>
            </>
          )}
          {user?.draftCompleted && (
            <>
              <Link to="/game" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Game</Link>
              <Link to="/standings" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Standings</Link>
              <Link to="/playoffs" style={{ color: '#f59e0b', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Playoffs</Link>
              <Link to="/power-rankings" style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Power</Link>
              <Link to="/replays" style={{ color: '#94a3b8', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Replays</Link>
              <Link to="/allstar" style={{ color: '#facc15', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>All-Star</Link>
              <Link to="/awards" style={{ color: '#fbbf24', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>🏆 Awards</Link>
              <Link to="/records" style={{ color: '#fb923c', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Records</Link>
              <Link to="/news" style={{ color: '#fb7185', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>News</Link>
              <Link to="/injuries" style={{ color: '#f87171', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>Injuries</Link>
            </>
          )}
          <Link to="/subscribe" style={{ color: '#0070ba', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>💳 Tokens</Link>
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
        <Route path="/packs" element={<ProtectedRoute><PacksPage /></ProtectedRoute>} />
        <Route path="/store" element={<ProtectedRoute><DraftStartedGate><StorePage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/team" element={<ProtectedRoute><DraftStartedGate><TeamManagementPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/front-office" element={<ProtectedRoute><DraftStartedGate><FrontOfficePage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/injuries" element={<ProtectedRoute><DraftStartedGate><InjuryReportPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/free-agency" element={<ProtectedRoute><DraftStartedGate><FreeAgencyPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/trades" element={<ProtectedRoute><DraftStartedGate><TradeMachinePage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/coaching" element={<ProtectedRoute><DraftStartedGate><CoachingPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/playbook" element={<ProtectedRoute><DraftStartedGate><PlaybookPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/defensive-playbook" element={<ProtectedRoute><DraftStartedGate><DefensivePlaybookPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/game" element={<ProtectedRoute><DraftGate><GamePage /></DraftGate></ProtectedRoute>} />
        <Route path="/standings" element={<ProtectedRoute><DraftGate><StandingsPage /></DraftGate></ProtectedRoute>} />
        <Route path="/playoffs" element={<ProtectedRoute><DraftGate><PlayoffsPage /></DraftGate></ProtectedRoute>} />
        <Route path="/play-in" element={<ProtectedRoute><DraftGate><PlayInPage /></DraftGate></ProtectedRoute>} />
        <Route path="/power-rankings" element={<ProtectedRoute><DraftGate><PowerRankingsPage /></DraftGate></ProtectedRoute>} />
        <Route path="/replays" element={<ProtectedRoute><DraftGate><GameReplayPage /></DraftGate></ProtectedRoute>} />
        <Route path="/allstar" element={<ProtectedRoute><DraftGate><AllStarPage /></DraftGate></ProtectedRoute>} />
        <Route path="/news" element={<ProtectedRoute><DraftGate><NewsPage /></DraftGate></ProtectedRoute>} />
        <Route path="/awards" element={<ProtectedRoute><DraftStartedGate><AwardsPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/records" element={<ProtectedRoute><DraftStartedGate><RecordsPage /></DraftStartedGate></ProtectedRoute>} />
        <Route path="/subscribe" element={<ProtectedRoute><SubscribePage /></ProtectedRoute>} />
        <Route path="/1v1" element={<ProtectedRoute><OneOnOnePage /></ProtectedRoute>} />
        <Route path="/blacktop" element={<ProtectedRoute><BlacktopPage /></ProtectedRoute>} />
        <Route path="/players" element={<ProtectedRoute><PlayerBioPage /></ProtectedRoute>} />
        <Route path="/multiplayer" element={<ProtectedRoute><MultiplayerPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/how-to-play" element={<ProtectedRoute><HowToPlayPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={token ? '/menu' : '/login'} replace />} />
      </Routes>
      {token && <HomeLogo />}
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

