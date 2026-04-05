import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Ott from '../components/ott/Ott';
import { useAuth } from '../hooks/useAuth.jsx';
import { getProfile, updateProfile, deleteAllData, listAnalyses, listBadges } from '../services/api';
import { supabase } from '../services/supabase';
import { User, FileText, Award, Settings, Trash2, LogOut, Save, ChevronLeft } from 'lucide-react';

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

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [targetRoles, setTargetRoles] = useState('');
  const [targetSalaryMin, setTargetSalaryMin] = useState('');
  const [targetSalaryMax, setTargetSalaryMax] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [analyses, setAnalyses] = useState([]);
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    loadProfile();
    loadAnalyses();
    loadBadges();
  }, []);

  async function loadProfile() {
    try {
      const data = await getProfile();
      setFullName(data.full_name || '');
      setJobTitle(data.job_title || '');
      setTargetRoles(data.target_roles || '');
      setTargetSalaryMin(data.target_salary_min?.toString() || '');
      setTargetSalaryMax(data.target_salary_max?.toString() || '');
      setLocation(data.location || '');
    } catch {
      // Profile will be created on first save
    }
  }

  async function loadAnalyses() {
    try {
      const data = await listAnalyses();
      setAnalyses(data);
    } catch {
      // Silently fail
    }
  }

  async function loadBadges() {
    try {
      const data = await listBadges();
      setEarnedBadges(data.map((b) => b.badge_key));
    } catch {
      // Silently fail
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updates = {};
      if (fullName.trim()) updates.full_name = fullName.trim();
      if (jobTitle.trim()) updates.job_title = jobTitle.trim();
      if (targetRoles.trim()) updates.target_roles = targetRoles.trim();
      if (targetSalaryMin) updates.target_salary_min = parseInt(targetSalaryMin, 10);
      if (targetSalaryMax) updates.target_salary_max = parseInt(targetSalaryMax, 10);
      if (location.trim()) updates.location = location.trim();

      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    setPasswordError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess(true);
      setNewPassword('');
      setChangingPassword(false);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password.');
    }
  }

  async function handleDeleteAllData() {
    try {
      await deleteAllData();
      await signOut();
      navigate('/login');
    } catch {
      // Handle error
    }
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-5)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            padding: 'var(--space-1)',
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Back to dashboard"
        >
          <ChevronLeft size={24} />
        </button>
        <h2>Profile</h2>
      </div>

      {/* Ott + user email */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Ott state="idle" size={60} />
        <p style={{ fontWeight: 700, marginTop: 'var(--space-2)' }}>
          {fullName || user?.email || 'Job Seeker'}
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          {user?.email}
        </p>
      </div>

      {/* Profile fields */}
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            label="Name"
            placeholder="Your name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input
            label="Job Title"
            placeholder="e.g. Operations Manager"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
          <Input
            label="Target Roles"
            placeholder="e.g. Program Manager, Operations Lead"
            value={targetRoles}
            onChange={(e) => setTargetRoles(e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Min Salary"
              type="number"
              placeholder="e.g. 80000"
              value={targetSalaryMin}
              onChange={(e) => setTargetSalaryMin(e.target.value)}
            />
            <Input
              label="Max Salary"
              type="number"
              placeholder="e.g. 120000"
              value={targetSalaryMax}
              onChange={(e) => setTargetSalaryMax(e.target.value)}
            />
          </div>
          <Input
            label="Location"
            placeholder="e.g. Tampa, FL"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <Button full onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
          </Button>
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
        {analyses.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {analyses.slice(0, 10).map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-2) 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, fontSize: '14px' }}>
                    {a.role_name || a.company_name || 'Analysis'}
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={a.score >= 70 ? 'success' : a.score >= 40 ? 'warning' : 'danger'}>
                  {a.score}%
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p style={{
            color: 'var(--color-text-muted)',
            textAlign: 'center',
            padding: 'var(--space-4) 0',
          }}>
            No resumes analyzed yet
          </p>
        )}
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
          {Object.entries(BADGE_META).map(([key, meta]) => {
            const earned = earnedBadges.includes(key);
            return (
              <Badge
                key={key}
                variant={earned ? 'success' : 'info'}
                style={earned ? {} : { opacity: 0.5 }}
              >
                {meta.emoji} {meta.name}
              </Badge>
            );
          })}
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
        {/* Change password */}
        {changingPassword ? (
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Input
                label="New Password"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {passwordError && (
                <p style={{ color: 'var(--color-danger)', fontSize: '13px', fontWeight: 600 }}>
                  {passwordError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button full onClick={handleChangePassword}>Update Password</Button>
                <Button variant="ghost" onClick={() => { setChangingPassword(false); setNewPassword(''); setPasswordError(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" full onClick={() => setChangingPassword(true)}>
            Change Password
          </Button>
        )}

        {passwordSuccess && (
          <p style={{ color: 'var(--color-success)', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>
            Password updated successfully!
          </p>
        )}

        <Button variant="secondary" full onClick={handleSignOut}>
          <LogOut size={16} /> Sign Out
        </Button>

        {/* Delete all data */}
        {confirmDelete ? (
          <Card style={{ background: 'var(--color-danger-light)', borderColor: 'var(--color-danger)' }}>
            <p style={{ fontWeight: 700, color: 'var(--color-danger)', marginBottom: 'var(--space-2)' }}>
              Are you sure?
            </p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: 'var(--space-3)' }}>
              This will permanently delete all your analyses, applications, badges, and profile data. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                variant="ghost"
                full
                style={{ color: 'var(--color-danger)' }}
                onClick={handleDeleteAllData}
              >
                <Trash2 size={16} /> Delete Everything
              </Button>
              <Button variant="ghost" full onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <Button
            variant="ghost"
            full
            style={{ color: 'var(--color-danger)' }}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={16} /> Delete All Data
          </Button>
        )}
      </div>
    </ScreenWrapper>
  );
}
