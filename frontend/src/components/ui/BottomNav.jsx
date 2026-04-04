import { Home, Upload, BarChart3, Kanban, Search } from 'lucide-react';
import './BottomNav.css';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'results', label: 'Results', icon: BarChart3 },
  { id: 'tracker', label: 'Tracker', icon: Kanban },
  { id: 'jobs', label: 'Jobs', icon: Search },
];

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={`bottom-nav__tab${activeTab === id ? ' bottom-nav__tab--active' : ''}`}
          onClick={() => onTabChange(id)}
          aria-current={activeTab === id ? 'page' : undefined}
        >
          <Icon className="bottom-nav__icon" size={24} strokeWidth={activeTab === id ? 2.5 : 2} />
          <span className="bottom-nav__label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
