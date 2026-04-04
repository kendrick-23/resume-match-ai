import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Ott from '../components/ott/Ott';
import { User, FileText, Award, Settings, Trash2 } from 'lucide-react';

export default function Profile() {
  return (
    <ScreenWrapper>
      {/* Header with Ott */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Ott state="idle" size={60} />
        <h2 style={{ marginTop: 'var(--space-3)' }}>Profile</h2>
      </div>

      {/* User info */}
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <User size={24} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <p style={{ fontWeight: 700 }}>Job Seeker</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
              No target role set
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input label="Name" placeholder="Your name" />
          <Input label="Target Role" placeholder="e.g. Software Engineer" />
          <Input label="Target Salary" placeholder="e.g. $80,000 - $120,000" />
        </div>
      </Card>

      {/* Resume vault */}
      <h3 style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-3)',
      }}>
        <FileText size={18} style={{ color: 'var(--color-accent)' }} />
        Resume Vault
      </h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <p style={{
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          padding: 'var(--space-4) 0',
        }}>
          No resumes analyzed yet
        </p>
      </Card>

      {/* Badge collection */}
      <h3 style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-3)',
      }}>
        <Award size={18} style={{ color: 'var(--color-accent)' }} />
        Badges
      </h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Badge variant="info">🌊 First Dive</Badge>
          <Badge variant="info">👁️ Sharp Eye</Badge>
          <Badge variant="info">🔥 Consistent</Badge>
          <Badge variant="info">⭐ Dedicated</Badge>
          <Badge variant="info">📋 First Wave</Badge>
          <Badge variant="info">💼 Making Moves</Badge>
          <Badge variant="info">🎯 Momentum</Badge>
          <Badge variant="info">📈 Upgraded</Badge>
        </div>
      </Card>

      {/* Account settings */}
      <h3 style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-3)',
      }}>
        <Settings size={18} style={{ color: 'var(--color-accent)' }} />
        Account
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Button variant="secondary" full>Change Password</Button>
        <Button
          variant="ghost"
          full
          style={{ color: 'var(--color-danger)' }}
        >
          <Trash2 size={16} /> Delete All Data
        </Button>
      </div>
    </ScreenWrapper>
  );
}
