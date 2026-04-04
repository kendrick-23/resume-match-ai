import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import BottomNav from './components/ui/BottomNav';
import Dashboard from './screens/Dashboard';
import Upload from './screens/Upload';
import Results from './screens/Results';
import Tracker from './screens/Tracker';
import Jobs from './screens/Jobs';
import Profile from './screens/Profile';

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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = ROUTE_TABS[location.pathname] || 'dashboard';

  const handleTabChange = (tab) => {
    navigate(TAB_ROUTES[tab]);
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/results" element={<Results />} />
        <Route path="/tracker" element={<Tracker />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </>
  );
}
