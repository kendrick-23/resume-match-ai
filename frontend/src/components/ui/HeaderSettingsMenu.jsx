import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getProfile } from '../../services/api';
import { Settings, LogOut, User } from 'lucide-react';

export default function HeaderSettingsMenu() {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    getProfile()
      .then((data) => setDisplayName(data.full_name || ''))
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate('/login');
  };

  return (
    <div ref={menuRef} className="header-settings">
      <button
        className="header-settings__trigger"
        onClick={() => setOpen(!open)}
        aria-label="Settings menu"
      >
        <Settings size={20} />
      </button>

      {open && (
        <div className="header-settings__dropdown">
          {/* User info */}
          <div className="header-settings__user">
            <div className="header-settings__avatar">
              <User size={16} />
            </div>
            <div className="header-settings__user-info">
              <p className="header-settings__name">
                {displayName || 'Job Seeker'}
              </p>
              <p className="header-settings__email">
                {user?.email}
              </p>
            </div>
          </div>

          <div className="header-settings__divider" />

          {/* All settings link */}
          <button
            className="header-settings__item"
            onClick={() => { setOpen(false); navigate('/profile'); }}
          >
            <Settings size={16} />
            All settings
          </button>

          {/* Log out */}
          <button
            className="header-settings__item header-settings__item--danger"
            onClick={handleSignOut}
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
