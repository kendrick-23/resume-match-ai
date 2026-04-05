import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import BottomNav from './components/ui/BottomNav';
import Dashboard from './screens/Dashboard';
import Upload from './screens/Upload';
import Results from './screens/Results';
import Tracker from './screens/Tracker';
import Jobs from './screens/Jobs';
import Profile from './screens/Profile';
import Login from './screens/Login';
import Signup from './screens/Signup';
import Onboarding from './screens/Onboarding';

const TAB_ROUTES = {
  dashboard: '/',
  upload: '/upload',
  results: '/results',
  tracker: '/tracker',
  jobs: '/jobs',
};

const ROUTE_TABS = Object.fromEntries(
  Object.entries(TAB_ROUTES).map(([tab, path]) => [path, tab])
);

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // Redirect to onboarding if not completed
  const onboarded = localStorage.getItem('holt_onboarded');
  if (!onboarded && window.location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function OnboardingRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // Already onboarded — go to dashboard
  const onboarded = localStorage.getItem('holt_onboarded');
  if (onboarded) return <Navigate to="/" replace />;

  return children;
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const activeTab = ROUTE_TABS[location.pathname] || 'dashboard';

  const handleTabChange = (tab) => {
    navigate(TAB_ROUTES[tab]);
  };

  const hideNav = ['/login', '/signup', '/welcome'].includes(location.pathname);
  const showNav = !loading && user && !hideNav;

  return (
    <>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/welcome" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
        <Route path="/tracker" element={<ProtectedRoute><Tracker /></ProtectedRoute>} />
        <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNav && <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
