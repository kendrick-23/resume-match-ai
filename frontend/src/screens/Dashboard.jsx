import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Ott from '../components/ott/Ott';
import { useStreak } from '../hooks/useStreak';
import { getActivity } from '../services/api';
import { supabase } from '../services/supabase';
import { FileText, ClipboardList, Search, Settings, Clock } from 'lucide-react';

const BADGE_META = {
  first_dive:   { emoji: '\u{1F30A}', name: 'First Dive' },
  sharp_eye:    { emoji: '\u{1F441}\uFE0F', name: 'Sharp Eye' },
  consistent:   { emoji: '\u{1F525}', name: 'Consistent' },
  dedicated:    { emoji: '\u2B50', name: 'Dedicated' },
  first_wave:   { emoji: '\u{1F4CB}', name: 'First Wave' },
  making_moves: { emoji: '\u{1F4BC}', name: 'Making Moves' },
  momentum:     { emoji: '\u{1F3AF}', name: 'Momentum' },
  upgraded:     { emoji: '\u{1F4C8}', name: 'Upgraded' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { streak } = useStreak();
  const [activity, setActivity] = useState(null);
  const [earnedBadges, setEarnedBadges] = useState([]);

  useEffect(() => {
    loadActivity();
    loadBadges();
  }, []);

  async function loadActivity() {
    try {
      const data = await getActivity();
      setActivity(data);
    } catch {
      // Silently fail
    }
  }

  async function loadBadges() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_URL}/profile/badges`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEarnedBadges(data.map((b) => b.badge_key));
      }
    } catch {
      // Silently fail
    }
  }

  // Ott state based on streak
  const ottState =
    streak >= 7 ? 'celebrating' :
    streak >= 3 ? 'encouraging' :
    streak >= 1 ? 'idle' :
    'waving';

  const streakLabel = streak === 0
    ? 'Start your streak today'
    : streak === 1
      ? '1 day streak'
      : `${streak} day streak`;

  const streakHint = streak === 0
    ? 'Run an analysis or log an application to start'
    : streak < 7
      ? 'Keep it going!'
      : "You're on fire!";

  return (
    <ScreenWrapper>
      {/* Header row with profile link */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 'var(--space-2)',
      }}>
        <button
          onClick={() => navigate('/profile')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            padding: 'var(--space-2)',
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Profile settings"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Ott greeting + streak */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Ott state={ottState} size={100} />
        <h2 style={{ marginTop: 'var(--space-3)' }}>
          {streak >= 7 ? "You're crushing it!" : streak >= 3 ? 'Nice momentum!' : 'Welcome back!'}
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
          Let's keep the momentum going.
        </p>
      </div>

      {/* Streak card */}
      <Card style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontSize: '32px' }}>{streak >= 7 ? '\u{1F525}' : streak >= 1 ? '\u{1F525}' : '\u{1F44B}'}</span>
        <p style={{
          fontWeight: 800,
          fontSize: '24px',
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          marginTop: 'var(--space-1)',
        }}>
          {streakLabel}
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
          {streakHint}
        </p>
      </Card>

      {/* Today's summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-6)',
      }}>
        <Card>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>
            Analyses today
          </p>
          <p style={{ fontWeight: 800, fontSize: '24px' }}>
            {activity?.analyses_today ?? 0}
          </p>
        </Card>
        <Card>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>
            Applications logged
          </p>
          <p style={{ fontWeight: 800, fontSize: '24px' }}>
            {activity?.applications_today ?? 0}
          </p>
        </Card>
      </div>

      {/* Quick action cards */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Quick actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <Card interactive onClick={() => navigate('/upload')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <FileText size={20} style={{ color: 'var(--color-accent)' }} />
            <div>
              <p style={{ fontWeight: 700 }}>Analyze a resume</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Match your resume to a job description
              </p>
            </div>
          </div>
        </Card>
        <Card interactive onClick={() => navigate('/tracker')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <ClipboardList size={20} style={{ color: 'var(--color-accent)' }} />
            <div>
              <p style={{ fontWeight: 700 }}>Log an application</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Track where you've applied
              </p>
            </div>
          </div>
        </Card>
        <Card interactive onClick={() => navigate('/jobs')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Search size={20} style={{ color: 'var(--color-accent)' }} />
            <div>
              <p style={{ fontWeight: 700 }}>Search jobs</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Discover roles that match your skills
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Recent activity</h3>
      {activity?.recent?.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
          {activity.recent.map((item) => (
            <Card key={item.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Clock size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: '14px' }}>{item.label}</p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
            <Ott state="waving" size={80} />
            <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
              No activity yet. Start by analyzing a resume!
            </p>
          </div>
        </Card>
      )}

      {/* Badge shelf */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Milestones</h3>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {Object.entries(BADGE_META).map(([key, meta]) => {
          const earned = earnedBadges.includes(key);
          return (
            <Badge
              key={key}
              variant={earned ? 'success' : 'info'}
              style={earned ? {} : { opacity: 0.5 }}
            >
              {meta.emoji} {meta.name}{earned ? '' : ' — Locked'}
            </Badge>
          );
        })}
      </div>
    </ScreenWrapper>
  );
}
