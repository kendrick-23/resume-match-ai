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
import { User, FileText, Award, Settings, Trash2, LogOut, Save, ChevronLeft, TrendingUp } from 'lucide-react';
import ScoreTrendChart, { TrendBadge } from '../components/ui/ScoreTrendChart';
import { useToast } from '../context/ToastContext';

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
  const [schedulePref, setSchedulePref] = useState('');
  const [maxCommute, setMaxCommute] = useState(30);
  const [degreeStatus, setDegreeStatus] = useState('');
  const [workAuth, setWorkAuth] = useState('');
  const [targetCompanies, setTargetCompanies] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [dealbreakers, setDealbreakers] = useState({ hard_degree_required: false, below_salary: false, outside_commute: false });
  const [jobSeekerStatus, setJobSeekerStatus] = useState('actively_hunting');
  const [skillsExtracted, setSkillsExtracted] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const toast = useToast();
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
      setSchedulePref(data.schedule_preference || '');
      setMaxCommute(data.max_commute_miles ?? 30);
      setDegreeStatus(data.degree_status || '');
      setWorkAuth(data.work_authorization || '');
      setTargetCompanies(data.target_companies || '');
      setDealbreakers(data.dealbreakers || { hard_degree_required: false, below_salary: false, outside_commute: false });
      setJobSeekerStatus(data.job_seeker_status || 'actively_hunting');
      setSkillsExtracted(data.skills_extracted || []);
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
      if (schedulePref) updates.schedule_preference = schedulePref;
      updates.max_commute_miles = maxCommute;
      if (degreeStatus) updates.degree_status = degreeStatus;
      if (workAuth) updates.work_authorization = workAuth;
      if (targetCompanies.trim()) updates.target_companies = targetCompanies.trim();
      updates.dealbreakers = dealbreakers;
      if (jobSeekerStatus) updates.job_seeker_status = jobSeekerStatus;

      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
        setSaved(true);
        setHasChanges(false);
        toast.success('Profile updated');
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      toast.error('Save failed — try again');
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
    <ScreenWrapper screenName="Profile">
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

      {/* Search Preferences */}
      <h3 style={{ marginBottom: 'var(--space-3)', marginTop: 'var(--space-5)' }}>My Search Preferences</h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Schedule</p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {[['monday_friday', 'M-F only'], ['any', 'Any schedule'], ['remote_only', 'Remote only']].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setSchedulePref(val); setHasChanges(true); }}
                  className={`tracker-stage-tab${schedulePref === val ? ' tracker-stage-tab--active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
              Max commute: {maxCommute} miles
            </p>
            <input
              type="range"
              min={5}
              max={50}
              value={maxCommute}
              onChange={(e) => { setMaxCommute(parseInt(e.target.value, 10)); setHasChanges(true); }}
              style={{ width: '100%', accentColor: 'var(--color-accent)' }}
            />
          </div>
        </div>
      </Card>

      {/* Background */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>My Background</h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Degree Status</p>
            <select
              value={degreeStatus}
              onChange={(e) => { setDegreeStatus(e.target.value); setHasChanges(true); }}
              style={{
                width: '100%',
                padding: '12px var(--space-4)',
                fontFamily: "'Nunito', sans-serif",
                fontSize: '15px',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface-raised)',
                color: 'var(--color-text)',
              }}
            >
              <option value="">Select...</option>
              <option value="no_degree">No degree</option>
              <option value="some_college">Some college</option>
              <option value="associates">Associate's</option>
              <option value="bachelors">Bachelor's</option>
              <option value="masters">Master's+</option>
            </select>
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Work Authorization</p>
            <select
              value={workAuth}
              onChange={(e) => { setWorkAuth(e.target.value); setHasChanges(true); }}
              style={{
                width: '100%',
                padding: '12px var(--space-4)',
                fontFamily: "'Nunito', sans-serif",
                fontSize: '15px',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface-raised)',
                color: 'var(--color-text)',
              }}
            >
              <option value="">Select...</option>
              <option value="us_citizen">US Citizen</option>
              <option value="green_card">Green Card</option>
              <option value="visa_required">Need Visa Sponsorship</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Target Companies */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Target Companies</h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: targetCompanies ? 'var(--space-2)' : 0 }}>
          {targetCompanies.split(',').filter((c) => c.trim()).map((company, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                padding: '4px 12px',
                background: 'var(--color-accent-light)',
                color: 'var(--color-accent-dark)',
                borderRadius: 'var(--radius-full)',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {company.trim()}
              <button
                onClick={() => {
                  const arr = targetCompanies.split(',').filter((c) => c.trim());
                  arr.splice(i, 1);
                  setTargetCompanies(arr.join(', '));
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent-dark)', padding: 0, fontSize: '14px' }}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Input
            placeholder="Disney, AdventHealth, Universal..."
            value={companyInput}
            onChange={(e) => setCompanyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && companyInput.trim()) {
                e.preventDefault();
                const existing = targetCompanies.split(',').filter((c) => c.trim());
                existing.push(companyInput.trim());
                setTargetCompanies(existing.join(', '));
                setCompanyInput('');
              }
            }}
          />
        </div>
      </Card>

      {/* Job Seeker Status */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Job Seeker Status</h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {[
            ['actively_hunting', 'Actively Hunting'],
            ['casually_exploring', 'Casually Exploring'],
            ['in_interviews', 'In Interviews'],
            ['taking_a_break', 'Taking a Break'],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => { setJobSeekerStatus(val); setHasChanges(true); }}
              className={`tracker-stage-tab${jobSeekerStatus === val ? ' tracker-stage-tab--active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* Dealbreakers */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>Dealbreakers</h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[
            ['hard_degree_required', 'Skip jobs requiring a 4-year degree'],
            ['below_salary', 'Skip jobs below my salary minimum'],
            ['outside_commute', 'Skip jobs outside my commute range'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={dealbreakers[key] || false}
                onChange={(e) => { setDealbreakers((prev) => ({ ...prev, [key]: e.target.checked })); setHasChanges(true); }}
                style={{ width: '20px', height: '20px', accentColor: 'var(--color-accent)' }}
              />
              <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{label}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* Save all preferences */}
      {hasChanges && (
        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--color-warning)',
          marginBottom: 'var(--space-2)',
        }}>
          Unsaved changes
        </p>
      )}
      <Button full onClick={handleSave} disabled={saving} style={{ marginBottom: 'var(--space-5)' }}>
        <Save size={16} /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Preferences'}
      </Button>

      {/* Skills from resume */}
      {skillsExtracted.length > 0 && (
        <>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Your Skills (from resume)</h3>
          <Card style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {skillsExtracted.map((skill, i) => (
                <span
                  key={i}
                  style={{
                    padding: '4px 12px',
                    background: 'var(--color-accent-light)',
                    color: 'var(--color-accent-dark)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Score trend */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-3)',
        }}>
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}>
            <Ott
              state={analyses.length >= 2 && analyses[0].score >= analyses[analyses.length - 1].score ? 'celebrating' : 'encouraging'}
              size={40}
            />
            Score Trend
          </h3>
          {analyses.length >= 2 && <TrendBadge analyses={analyses.slice(0, 5)} />}
        </div>

        {analyses.length >= 2 ? (
          <Card>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginBottom: 'var(--space-2)' }}>
              Your last {Math.min(analyses.length, 5)} analyses
            </p>
            <ScoreTrendChart analyses={analyses.slice(0, 5)} />
          </Card>
        ) : (
          <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
            <Ott state="encouraging" size={60} />
            <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
              {analyses.length === 1
                ? 'Run one more analysis to see your trend'
                : 'Analyze a few resumes to see your progress over time'}
            </p>
            <p style={{
              color: 'var(--color-text-muted)',
              fontSize: '13px',
              marginTop: 'var(--space-1)',
              marginBottom: 'var(--space-4)',
            }}>
              Run more analyses to see your trend
            </p>
            <Button variant="secondary" onClick={() => navigate('/upload')}>
              Analyze a Resume
            </Button>
          </Card>
        )}
      </div>

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
                    {a.role_name || 'Resume Analysis'}
                  </p>
                  {a.company_name && (
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                      {a.company_name}
                    </p>
                  )}
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '2px' }}>
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
