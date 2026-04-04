import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Ott from '../components/ott/Ott';
import { FileText, ClipboardList, Search, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <ScreenWrapper>
      {/* Ott greeting + streak */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Ott state="idle" size={100} />
        <h2 style={{ marginTop: 'var(--space-3)' }}>Welcome back!</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
          Let's keep the momentum going.
        </p>
      </div>

      {/* Streak card */}
      <Card style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontSize: '32px' }}>🔥</span>
        <p style={{
          fontWeight: 800,
          fontSize: '24px',
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          marginTop: 'var(--space-1)',
        }}>
          0 day streak
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
          Run an analysis or log an application to start your streak
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
          <p style={{ fontWeight: 800, fontSize: '24px' }}>0</p>
        </Card>
        <Card>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>
            Applications logged
          </p>
          <p style={{ fontWeight: 800, fontSize: '24px' }}>0</p>
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
      <Card>
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <Ott state="waving" size={80} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
            No activity yet. Start by analyzing a resume!
          </p>
        </div>
      </Card>

      {/* Badge shelf */}
      <h3 style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>Milestones</h3>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Badge variant="info">🌊 First Dive — Locked</Badge>
        <Badge variant="info">👁️ Sharp Eye — Locked</Badge>
        <Badge variant="info">🔥 Consistent — Locked</Badge>
      </div>
    </ScreenWrapper>
  );
}
