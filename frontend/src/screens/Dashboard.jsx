import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { useStreak } from '../context/StreakContext';
import { getActivity, listBadges, listApplications } from '../services/api';
import { FileText, ClipboardList, Search, Clock } from 'lucide-react';
import EmptyStateDashboard from '../components/ui/EmptyStateDashboard';
import { useToast } from '../context/ToastContext';
import { BADGES } from '../constants/badges';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { streak } = useStreak();
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState(false);
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [badgesError, setBadgesError] = useState(false);
  const [applications, setApplications] = useState([]);
  const [appsError, setAppsError] = useState(false);

  useEffect(() => {
    Promise.all([loadActivity(), loadBadges(), loadApplications()]);
  }, []);

  async function loadActivity() {
    setActivityError(false);
    try {
      const data = await getActivity();
      setActivity(data);
    } catch {
      setActivityError(true);
    }
  }

  async function loadBadges() {
    setBadgesError(false);
    try {
      const data = await listBadges();
      setEarnedBadges(data.map((b) => b.badge_key));
    } catch {
      setBadgesError(true);
    }
  }

  async function loadApplications() {
    setAppsError(false);
    try {
      const data = await listApplications();
      setApplications(Array.isArray(data) ? data : []);
    } catch {
      setAppsError(true);
    }
  }

  // Stat card counts: unique applications, derived from the live tracker.
  const APPLIED_STATUSES = new Set(['Applied', 'Responded', 'Interview', 'Offer']);
  const INTERVIEW_STATUSES = new Set(['Interview', 'Offer']);
  const appliedCount = applications.filter((a) => APPLIED_STATUSES.has(a.status)).length;
  const interviewCount = applications.filter((a) => INTERVIEW_STATUSES.has(a.status)).length;

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

  // Personalized greeting based on most recent activity
  const greeting = (() => {
    const recent = activity?.recent;
    if (!recent || recent.length === 0) {
      return "Hey! Upload your resume and let's get started.";
    }
    const last = recent[0];
    const lastDate = new Date(last.created_at);
    const today = new Date();
    const isToday =
      lastDate.getFullYear() === today.getFullYear() &&
      lastDate.getMonth() === today.getMonth() &&
      lastDate.getDate() === today.getDate();

    if (last.action_type === 'analysis' && isToday) {
      return 'Back already. I like the energy.';
    }
    if (last.action_type === 'status_applied' && isToday) {
      return "You applied again today. That's how it's done.";
    }
    if (last.action_type === 'status_interview' || last.action_type === 'status_offer') {
      return "Progress on your applications — let's keep going.";
    }
    return 'Good to see you. Ready to find your next ottertunity?';
  })();

  return (
    <ScreenWrapper screenName="Dashboard">
      {/* Ott greeting + streak */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Ott state={ottState} size={96} />
        <h2 style={{ marginTop: 'var(--space-3)' }}>
          {greeting}
        </h2>
      </div>

      {/* Streak card */}
      <Card style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
        <img
          src={streak >= 1 ? '/ott/streak-active.png' : '/ott/streak-inactive.png'}
          alt={streak >= 1 ? 'streak' : 'no streak'}
          style={{ width: '40px', height: '40px', objectFit: 'contain' }}
        />
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

      {/* Pipeline summary — meaningful job-search counts */}
      {appsError ? (
        <Card style={{ textAlign: 'center', marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
          <Ott state="coaching" size={48} />
          <p style={{ fontWeight: 600, fontSize: '14px', marginTop: 'var(--space-2)' }}>
            Couldn't load your stats
          </p>
          <Button variant="ghost" onClick={loadApplications} style={{ marginTop: 'var(--space-2)' }}>
            Tap to retry
          </Button>
        </Card>
      ) : (
        <div className="today-summary-grid">
          <Card>
            <p className="today-summary-grid__label">
              Applied
            </p>
            <p className="today-summary-grid__value">
              {appliedCount}
            </p>
            <p className="today-summary-grid__sub">
              jobs submitted
            </p>
          </Card>
          <Card>
            <p className="today-summary-grid__label">
              Interviews
            </p>
            <p className="today-summary-grid__value">
              {interviewCount}
            </p>
            <p className="today-summary-grid__sub">
              in progress
            </p>
          </Card>
        </div>
      )}

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
          <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
            <EmptyStateDashboard size={180} />
            <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-3)', fontSize: '14px' }}>
              Upload your first resume to get started!
            </p>
          </div>
        </Card>
      )}

      {/* Badge shelf */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Milestones</h3>
      {badgesError ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Couldn't load badges</p>
          <Button variant="ghost" onClick={loadBadges} style={{ marginTop: 'var(--space-2)' }}>
            Tap to retry
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {Object.entries(BADGES).map(([key, meta]) => {
            const earned = earnedBadges.includes(key);
            return (
              <div
                key={key}
                title={`${meta.name}${earned ? '' : ' — Locked'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  width: '64px',
                }}
              >
                <img
                  src={meta.image}
                  alt={meta.name}
                  loading="lazy"
                  style={{
                    width: '48px',
                    height: '48px',
                    objectFit: 'contain',
                    filter: earned ? 'none' : 'grayscale(100%) opacity(0.3)',
                  }}
                />
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textAlign: 'center',
                  color: earned ? 'var(--color-text)' : 'var(--color-text-muted)',
                  lineHeight: 1.2,
                }}>
                  {meta.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ScreenWrapper>
  );
}
