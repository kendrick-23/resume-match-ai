import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { useStreak } from '../context/StreakContext';
import { getActivity, listBadges, listApplications, listAnalyses, getProfile } from '../services/api';
import { FileText, Search, Clock } from 'lucide-react';
import JourneyMap from '../components/ui/JourneyMap';
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
  // Single batched state for everything the JourneyMap + stat cards depend on.
  // We never set this until ALL three upstream calls have settled, so the map
  // renders exactly once in its final state and animates from there.
  const [journey, setJourney] = useState({
    ready: false,
    error: false,
    applications: [],
    completed: { resume: false, profile: false, applied: false, interview: false, offer: false },
  });

  useEffect(() => {
    Promise.all([loadActivity(), loadBadges(), loadJourney()]);
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

  async function loadJourney() {
    // Wait for ALL three sources before flipping `ready`. This is the
    // single setState that drives both the journey map and the stat cards
    // — anything earlier would race the entrance animation.
    const [appsRes, analysesRes, profileRes] = await Promise.allSettled([
      listApplications(),
      listAnalyses(),
      getProfile(),
    ]);

    const applications =
      appsRes.status === 'fulfilled' && Array.isArray(appsRes.value) ? appsRes.value : [];
    const analyses =
      analysesRes.status === 'fulfilled' && Array.isArray(analysesRes.value) ? analysesRes.value : [];
    const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;

    const APPLIED_STATUSES = new Set(['Applied', 'Responded', 'Interview', 'Offer']);
    const INTERVIEW_STATUSES = new Set(['Interview', 'Offer']);
    const appliedCount = applications.filter((a) => APPLIED_STATUSES.has(a.status)).length;
    const interviewCount = applications.filter((a) => INTERVIEW_STATUSES.has(a.status)).length;
    const offerCount = applications.filter((a) => a.status === 'Offer').length;

    const profileComplete = !!(
      profile &&
      profile.target_roles &&
      profile.target_salary_min &&
      profile.location
    );

    setJourney({
      ready: true,
      // Treat applications failing as a stat-card error; analyses/profile
      // failures degrade the journey to "locked" without blocking render.
      error: appsRes.status === 'rejected',
      applications,
      completed: {
        resume: analyses.length >= 1,
        profile: profileComplete,
        applied: appliedCount >= 1,
        interview: interviewCount >= 1,
        offer: offerCount >= 1,
      },
    });
  }

  // Stat card counts derived from the same single state — guaranteed to
  // match whatever the journey map is showing in the same render.
  const APPLIED_STATUSES = new Set(['Applied', 'Responded', 'Interview', 'Offer']);
  const INTERVIEW_STATUSES = new Set(['Interview', 'Offer']);
  const appliedCount = journey.applications.filter((a) => APPLIED_STATUSES.has(a.status)).length;
  const interviewCount = journey.applications.filter((a) => INTERVIEW_STATUSES.has(a.status)).length;

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
      <div className="dashboard-world">
      {/* Greeting card — river bank scene background */}
      <div className="dashboard-greeting">
        {/* Water ripple rings behind Ott */}
        <div className="dashboard-ripples" aria-hidden="true">
          <div className="dashboard-ripple" />
          <div className="dashboard-ripple" />
          <div className="dashboard-ripple" />
        </div>
        <div className="dashboard-greeting__content">
          <Ott state={ottState} size={120} />
          <h2 style={{ marginTop: 'var(--space-3)' }}>
            {greeting}
          </h2>
        </div>
      </div>

      {/* Streak card with kelp wrap accent */}
      <Card className="streak-card" style={{
        textAlign: 'center',
        marginBottom: 'var(--space-4)',
        background: `
          radial-gradient(circle at 30% 50%, rgba(43,181,192,0.12) 0%, transparent 50%),
          radial-gradient(circle at 70% 30%, rgba(43,181,192,0.10) 0%, transparent 40%),
          radial-gradient(circle at 50% 80%, rgba(43,181,192,0.08) 0%, transparent 35%),
          white
        `,
      }}>
        {/* Watermark streak icon — ambient texture, top-right */}
        <img
          src={streak >= 1 ? '/ott/streak-active.png' : '/ott/streak-inactive.png'}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '24px',
            height: '24px',
            objectFit: 'contain',
            opacity: 0.15,
            pointerEvents: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
          <img
            src={streak >= 1 ? '/ott/streak-active.png' : '/ott/streak-inactive.png'}
            alt={streak >= 1 ? 'streak' : 'no streak'}
            style={{ width: '28px', height: '28px', objectFit: 'contain' }}
          />
          <p style={{
            fontWeight: 800,
            fontSize: '24px',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
          }}>
            {streakLabel}
          </p>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
          {streakHint}
        </p>
        {/* Kelp wrap — loyalty/connection ambient texture */}
        <img
          src="/ott/ott-kelp-wrap.png"
          alt=""
          aria-hidden="true"
          className="streak-card__kelp"
        />
      </Card>

      {/* Pipeline summary — meaningful job-search counts */}
      {journey.error ? (
        <Card style={{ textAlign: 'center', marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
          <Ott state="coaching" size={56} />
          <p style={{ fontWeight: 600, fontSize: '14px', marginTop: 'var(--space-2)' }}>
            Couldn't load your stats
          </p>
          <Button variant="ghost" onClick={loadJourney} style={{ marginTop: 'var(--space-2)' }}>
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

      {/* Job search journey map */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Your job search</h3>
      <JourneyMap completed={journey.completed} ready={journey.ready} />

      {/* Paw print section divider */}
      <div className="paw-divider" aria-hidden="true">
        <img src="/ott/ott-paw-print.png" alt="" className="paw-divider__print" />
        <img src="/ott/ott-paw-print.png" alt="" className="paw-divider__print" />
        <img src="/ott/ott-paw-print.png" alt="" className="paw-divider__print" />
      </div>

      {/* Quick actions — trimmed to two; the journey map drives "what's next" */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Quick actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <Card interactive onClick={() => navigate('/jobs')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Search size={20} style={{ color: 'var(--color-accent)' }} />
            <div>
              <p style={{ fontWeight: 700 }}>Find jobs</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Discover roles that match your skills
              </p>
            </div>
          </div>
        </Card>
        <Card interactive onClick={() => navigate('/upload')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <FileText size={20} style={{ color: 'var(--color-accent)' }} />
            <div>
              <p style={{ fontWeight: 700 }}>Upload resume</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Match your resume to a job description
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
            <img
              src="/ott/ott-in-holt.png"
              alt="Ott peeking from his holt"
              style={{ width: 100, height: 'auto', display: 'block', margin: '0 auto' }}
            />
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              marginTop: 'var(--space-3)',
              marginBottom: 'var(--space-2)',
            }}>
              <div style={{ width: '60%', height: '12px', borderRadius: 'var(--radius-full)', background: 'rgba(43,181,192,0.08)' }} />
              <div style={{ width: '80%', height: '12px', borderRadius: 'var(--radius-full)', background: 'rgba(43,181,192,0.08)' }} />
              <div style={{ width: '45%', height: '12px', borderRadius: 'var(--radius-full)', background: 'rgba(43,181,192,0.08)' }} />
            </div>
            <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)', fontSize: '14px' }}>
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

      {/* Corner vegetation framing */}
      <img
        src="/ott/ott-corner-left.png"
        alt=""
        aria-hidden="true"
        className="dashboard-world__corner dashboard-world__corner--left"
      />
      <img
        src="/ott/ott-corner-right.png"
        alt=""
        aria-hidden="true"
        className="dashboard-world__corner dashboard-world__corner--right"
      />
      </div>{/* end dashboard-world */}
    </ScreenWrapper>
  );
}
