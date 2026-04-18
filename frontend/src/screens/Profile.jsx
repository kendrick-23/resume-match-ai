import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Ott from '../components/ott/Ott';
import { useAuth } from '../hooks/useAuth.jsx';
import { getProfile, updateProfile, deleteAllData, listAnalyses, listBadges, uploadResume, analyzeResume, listResumes, createResume, updateResume, deleteResume } from '../services/api';
import { supabase } from '../services/supabase';
import { User, FileText, Award, Settings, Trash2, LogOut, Save, ChevronLeft, TrendingUp, Upload, ChevronDown, ChevronUp, UserCircle, X, Plus } from 'lucide-react';
import ScoreTrendChart, { TrendBadge } from '../components/ui/ScoreTrendChart';
import { useToast } from '../context/ToastContext';
import { BADGES } from '../constants/badges';
import { scoreBadgeVariant } from '../constants/scoring';
import { clearRecommendationsCache } from '../utils/cache';
import HintBubble from '../components/ui/HintBubble';
import './Profile.css';

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
  const [editingSkills, setEditingSkills] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [linkedinText, setLinkedinText] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeAnalyzing, setResumeAnalyzing] = useState(false);
  const resumeInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const toast = useToast();
  const [analyses, setAnalyses] = useState([]);
  const [vaultPage, setVaultPage] = useState(0);
  const [earnedBadges, setEarnedBadges] = useState([]);
  // Resume Vault state
  const [vaultResumes, setVaultResumes] = useState([]);
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [confirmDeleteResumeId, setConfirmDeleteResumeId] = useState(null);
  const vaultUploadRef = useRef(null);
  const [vaultUploading, setVaultUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    loadProfile();
    loadAnalyses();
    loadBadges();
    loadVaultResumes();
  }, []);

  // Warn on browser refresh/close with unsaved changes
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  async function loadVaultResumes() {
    try {
      const data = await listResumes();
      setVaultResumes(Array.isArray(data) ? data : []);
    } catch {
      // Silent — vault stays empty if the call fails
    }
  }

  async function handleVaultUpload(e) {
    const f = e.target.files[0];
    if (!f) return;
    setVaultUploading(true);
    try {
      await createResume({ file: f });
      await loadVaultResumes();
      toast.success('Resume saved to vault');
    } catch (err) {
      toast.error(err.message || "Couldn't save resume");
    } finally {
      setVaultUploading(false);
      if (vaultUploadRef.current) vaultUploadRef.current.value = '';
    }
  }

  async function handleSetDefaultResume(id) {
    try {
      await updateResume(id, { is_default: true });
      await loadVaultResumes();
    } catch (err) {
      toast.error(err.message || "Couldn't set default");
    }
  }

  async function handleSaveLabel(id) {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setEditingLabelId(null);
      return;
    }
    try {
      await updateResume(id, { label: trimmed });
      setEditingLabelId(null);
      setLabelDraft('');
      await loadVaultResumes();
    } catch (err) {
      toast.error(err.message || "Couldn't update label");
    }
  }

  async function handleDeleteResume(id) {
    try {
      await deleteResume(id);
      setConfirmDeleteResumeId(null);
      await loadVaultResumes();
      toast.success('Resume deleted');
    } catch (err) {
      toast.error(err.message || "Couldn't delete resume");
      setConfirmDeleteResumeId(null);
    }
  }

  async function loadProfile() {
    setProfileLoading(true);
    setProfileError(false);
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
      // Handle dealbreakers — may come as JSON string from old data or dict from JSONB
      let db = data.dealbreakers;
      if (typeof db === 'string') { try { db = JSON.parse(db); } catch { db = null; } }
      setDealbreakers(db || { hard_degree_required: false, below_salary: false, outside_commute: false });
      setJobSeekerStatus(data.job_seeker_status || 'actively_hunting');
      // Handle skills_extracted — may come as JSON string or array
      let sk = data.skills_extracted;
      if (typeof sk === 'string') { try { sk = JSON.parse(sk); } catch { sk = []; } }
      setSkillsExtracted(sk || []);
      setLinkedinText(data.linkedin_text || '');
      setAboutMe(data.about_me || '');
    } catch {
      setProfileError(true);
    } finally {
      setProfileLoading(false);
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
      const updates = {
        full_name: fullName.trim() || null,
        job_title: jobTitle.trim() || null,
        target_roles: targetRoles.trim() || null,
        target_salary_min: targetSalaryMin ? parseInt(targetSalaryMin, 10) : null,
        target_salary_max: targetSalaryMax ? parseInt(targetSalaryMax, 10) : null,
        location: location.trim() || null,
        schedule_preference: schedulePref || null,
        max_commute_miles: maxCommute,
        degree_status: degreeStatus || null,
        work_authorization: workAuth || null,
        target_companies: targetCompanies.trim() || null,
        dealbreakers: dealbreakers,
        job_seeker_status: jobSeekerStatus || null,
        linkedin_text: linkedinText.trim() || null,
        about_me: aboutMe.trim() || null,
        skills_extracted: skillsExtracted,
      };

      await updateProfile(updates);
      clearRecommendationsCache();
      setSaved(true);
      setHasChanges(false);
      toast.success('Profile updated');
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error('Save failed — try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleResumeUpload() {
    if (!resumeFile) return;
    setResumeAnalyzing(true);
    try {
      const { text } = await uploadResume(resumeFile);
      await analyzeResume(text, 'General job analysis for skills extraction', '', '', linkedinText);
      // Refresh profile to get updated skills
      const refreshed = await getProfile();
      setSkillsExtracted(refreshed.skills_extracted || []);
      toast.success('Resume analyzed — your matches just got smarter');
      setResumeFile(null);
      // Also refresh analyses
      const data = await listAnalyses();
      setAnalyses(data);
    } catch (err) {
      toast.error(err.message || 'Resume analysis failed — try again');
    } finally {
      setResumeAnalyzing(false);
    }
  }

  async function handleSaveSkills() {
    try {
      await updateProfile({ skills_extracted: skillsExtracted });
      setEditingSkills(false);
      toast.success('Skills updated');
    } catch {
      toast.error('Failed to save skills');
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

      {/* Loading / error states */}
      {profileLoading ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <Ott state="thinking" size={56} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-3)', fontSize: '14px' }}>
            Loading your profile...
          </p>
        </Card>
      ) : profileError ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <Ott state="coaching" size={56} />
          <p style={{ fontWeight: 600, fontSize: '14px', marginTop: 'var(--space-2)' }}>
            Couldn't load your profile
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
            Your data is safe — just a hiccup on our end.
          </p>
          <Button variant="ghost" onClick={loadProfile} style={{ marginTop: 'var(--space-3)' }}>
            Tap to retry
          </Button>
        </Card>
      ) : null}

      {!profileLoading && !profileError && (<>
      {/* User avatar + email */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(43,181,192,0.15)',
          border: '2px solid var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
        }}>
          <span style={{
            fontFamily: "'Nunito', sans-serif",
            fontWeight: 700,
            fontSize: '22px',
            color: 'var(--color-accent)',
          }}>
            {(fullName || user?.email || 'J')[0].toUpperCase()}
          </span>
        </div>
        <p style={{ fontWeight: 700, marginTop: 'var(--space-2)' }}>
          {fullName || user?.email || 'Job Seeker'}
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          {user?.email}
        </p>
      </div>

      {/* Hint — empty profile nudge */}
      {!fullName && !targetRoles && !location && (
        <HintBubble
          storageKey="holt_hint_profile_empty"
          ottImage="/ott/ott-encouraging.png"
          text="The more you tell me, the better I can score jobs for you. Fill in your target role and salary — it only takes a minute."
        />
      )}

      <div className="profile-form-grid">
      {/* My Resume section */}
      <h3 style={{ marginBottom: 'var(--space-3)' }}>My Resume</h3>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        {analyses.length > 0 ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <FileText size={18} style={{ color: 'var(--color-accent)' }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: '14px' }}>
                  {analyses[0].role_name || 'Resume analyzed'}
                </p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  Last analyzed: {new Date(analyses[0].created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={scoreBadgeVariant(analyses[0].score)}>
                {analyses[0].score}%
              </Badge>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <input
                ref={resumeInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                onChange={(e) => e.target.files[0] && setResumeFile(e.target.files[0])}
                style={{ display: 'none' }}
              />
              {resumeFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <p style={{ fontSize: '13px', flex: 1 }}>{resumeFile.name}</p>
                  <Button
                    variant="primary"
                    style={{ padding: 'var(--space-2) var(--space-4)', minHeight: '44px', fontSize: '13px' }}
                    onClick={handleResumeUpload}
                    disabled={resumeAnalyzing}
                  >
                    {resumeAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => resumeInputRef.current?.click()}>
                  <Upload size={14} /> Update resume
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 'var(--space-3) 0' }}>
            <input
              ref={resumeInputRef}
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={(e) => e.target.files[0] && setResumeFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
            <Ott state="waiting" size={56} />
            <p style={{ fontWeight: 600, fontSize: '14px', marginTop: 'var(--space-2)' }}>
              Upload your resume to power your job matches
            </p>
            {resumeFile ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <p style={{ fontSize: '13px' }}>{resumeFile.name}</p>
                <Button
                  style={{ padding: 'var(--space-2) var(--space-4)', minHeight: '44px', fontSize: '13px' }}
                  onClick={handleResumeUpload}
                  disabled={resumeAnalyzing}
                >
                  {resumeAnalyzing ? 'Analyzing...' : 'Analyze'}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => resumeInputRef.current?.click()} style={{ marginTop: 'var(--space-2)' }}>
                <Upload size={14} /> Upload Resume
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* My Resumes — vault management */}
      {vaultResumes.length >= 2 ? (
        <HintBubble
          storageKey="holt_hint_resume_vault"
          ottImage="/ott/ott-waving.png"
          text="Your default resume is used automatically when you analyze a job. Tap 'Set as default' to switch anytime."
        >
          <h3 style={{ marginBottom: 'var(--space-3)' }}>My Resumes</h3>
        </HintBubble>
      ) : (
        <h3 style={{ marginBottom: 'var(--space-3)' }}>My Resumes</h3>
      )}
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        {vaultResumes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-3) 0' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: 'var(--space-3)' }}>
              No resumes saved yet. Upload one to skip re-uploading every time you analyze.
            </p>
            <input
              ref={vaultUploadRef}
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={handleVaultUpload}
              style={{ display: 'none' }}
            />
            <Button
              variant="secondary"
              onClick={() => vaultUploadRef.current?.click()}
              disabled={vaultUploading}
            >
              <Upload size={14} /> {vaultUploading ? 'Uploading...' : 'Upload your first resume'}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {vaultResumes.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: r.is_default ? 'var(--color-accent-light)' : 'var(--color-bg)',
                  border: `1.5px solid ${r.is_default ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <FileText size={16} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingLabelId === r.id ? (
                    <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
                      <input
                        type="text"
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveLabel(r.id);
                          if (e.key === 'Escape') { setEditingLabelId(null); setLabelDraft(''); }
                        }}
                        autoFocus
                        style={{
                          flex: 1, padding: 'var(--space-1) var(--space-2)', fontSize: '14px', fontWeight: 700,
                          fontFamily: "'Nunito', sans-serif",
                          border: '1.5px solid var(--color-accent)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-surface-raised)',
                        }}
                      />
                      <button
                        onClick={() => handleSaveLabel(r.id)}
                        style={{
                          background: 'var(--color-accent)', color: 'white',
                          border: 'none', borderRadius: 'var(--radius-sm)',
                          padding: '4px 10px', fontSize: '13px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <p
                      onClick={() => { setEditingLabelId(r.id); setLabelDraft(r.label || ''); }}
                      style={{ fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
                      title="Click to rename"
                    >
                      {r.label || r.source_filename || 'Resume'}
                      {r.is_default && (
                        <Badge variant="success" style={{ fontSize: '10px', marginLeft: 'var(--space-2)', padding: '1px 6px' }}>
                          Default
                        </Badge>
                      )}
                    </p>
                  )}
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    {new Date(r.updated_at || r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {r.word_count ? ` · ${r.word_count.toLocaleString()} words` : ''}
                    {r.source_format ? ` · ${r.source_format.toUpperCase()}` : ''}
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {!r.is_default && (
                      <button
                        onClick={() => handleSetDefaultResume(r.id)}
                        style={{
                          background: 'none', border: '1px solid var(--color-accent)',
                          color: 'var(--color-accent)', borderRadius: 'var(--radius-full)',
                          padding: '3px 10px', fontSize: '13px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
                        }}
                      >
                        Set as default
                      </button>
                    )}
                    {confirmDeleteResumeId === r.id ? (
                      <>
                        <button
                          onClick={() => handleDeleteResume(r.id)}
                          style={{
                            background: 'var(--color-danger)', color: 'white',
                            border: 'none', borderRadius: 'var(--radius-full)',
                            padding: '3px 10px', fontSize: '13px', fontWeight: 700,
                            cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
                          }}
                        >
                          Confirm delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteResumeId(null)}
                          style={{
                            background: 'none', border: '1px solid var(--color-border)',
                            color: 'var(--color-text-muted)', borderRadius: 'var(--radius-full)',
                            padding: '3px 10px', fontSize: '13px', fontWeight: 700,
                            cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteResumeId(r.id)}
                        style={{
                          background: 'none', border: 'none',
                          color: 'var(--color-text-muted)',
                          padding: 0, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                          fontFamily: "'Nunito', sans-serif", fontSize: '13px', fontWeight: 600,
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {vaultResumes.length < 5 && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <input
                  ref={vaultUploadRef}
                  type="file"
                  accept=".pdf,.docx,.doc"
                  onChange={handleVaultUpload}
                  style={{ display: 'none' }}
                />
                <Button
                  variant="ghost"
                  full
                  onClick={() => vaultUploadRef.current?.click()}
                  disabled={vaultUploading}
                >
                  <Upload size={14} /> {vaultUploading ? 'Uploading...' : 'Upload new resume'}
                </Button>
              </div>
            )}
            {vaultResumes.length >= 5 && (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', textAlign: 'center', marginTop: 'var(--space-2)' }}>
                Vault is full (5/5). Delete one to upload a new resume.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* LinkedIn section */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <button
          onClick={() => setLinkedinOpen(!linkedinOpen)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-surface-raised)', border: '1.5px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', cursor: 'pointer',
            fontFamily: "'Nunito', sans-serif", color: 'var(--color-text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <UserCircle size={18} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>LinkedIn Profile</span>
            {linkedinText && <Badge variant="success" style={{ fontSize: '11px', padding: '2px 8px' }}>Added</Badge>}
          </div>
          {linkedinOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {linkedinOpen && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Input
              textarea
              placeholder="Paste your LinkedIn About section, experience summary, or any profile text..."
              value={linkedinText}
              onChange={(e) => { setLinkedinText(e.target.value); setHasChanges(true); }}
              maxLength={10000}
              style={{ minHeight: '100px' }}
            />
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
              Helps Ott understand your full professional background
            </p>
          </div>
        )}
      </div>

      {/* Profile fields */}
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            label="Name"
            placeholder="Your name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setHasChanges(true); }}
          />
          <Input
            label="Job Title"
            placeholder="e.g. Operations Manager"
            value={jobTitle}
            onChange={(e) => { setJobTitle(e.target.value); setHasChanges(true); }}
          />
          <Input
            label="Target Roles"
            placeholder="e.g. Program Manager, Operations Lead"
            value={targetRoles}
            onChange={(e) => { setTargetRoles(e.target.value); setHasChanges(true); }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Min Salary"
              type="number"
              placeholder="e.g. 80000"
              value={targetSalaryMin}
              onChange={(e) => { setTargetSalaryMin(e.target.value); setHasChanges(true); }}
            />
            <Input
              label="Max Salary"
              type="number"
              placeholder="e.g. 120000"
              value={targetSalaryMax}
              onChange={(e) => { setTargetSalaryMax(e.target.value); setHasChanges(true); }}
            />
          </div>
          <Input
            label="Location"
            placeholder="e.g. Tampa, FL"
            value={location}
            onChange={(e) => { setLocation(e.target.value); setHasChanges(true); }}
          />
          <Input
            textarea
            label="About Me"
            placeholder="Describe your background, what you're looking for, industries you're interested in..."
            value={aboutMe}
            onChange={(e) => { setAboutMe(e.target.value); setHasChanges(true); }}
            style={{ minHeight: '80px' }}
          />
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
                padding: 'var(--space-3) var(--space-4)',
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
                padding: 'var(--space-3) var(--space-4)',
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
                padding: 'var(--space-1) var(--space-3)',
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

      </div>
      {/* Spacer before skills — sticky save footer handles saving now */}

      {/* Skills — editable */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <h3>Your Skills</h3>
        <Button
          variant="ghost"
          style={{ padding: '6px 12px', minHeight: '44px', fontSize: '13px' }}
          onClick={() => setEditingSkills(!editingSkills)}
        >
          {editingSkills ? 'Done' : 'Edit skills'}
        </Button>
      </div>
      <Card style={{ marginBottom: 'var(--space-5)' }}>
        {skillsExtracted.length > 0 || editingSkills ? (
          <>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {skillsExtracted.map((skill, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                    padding: 'var(--space-1) var(--space-3)', background: 'var(--color-accent-light)',
                    color: 'var(--color-accent-dark)', borderRadius: 'var(--radius-full)',
                    fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {skill}
                  {editingSkills && (
                    <button
                      onClick={() => { setSkillsExtracted((prev) => prev.filter((_, j) => j !== i)); setHasChanges(true); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent-dark)', padding: 0, fontSize: '14px' }}
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>
            {editingSkills && (
              <>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  <Input
                    placeholder="Add a skill..."
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
                        e.preventDefault();
                        if (!skillsExtracted.includes(skillInput.trim())) {
                          setSkillsExtracted((prev) => [...prev, skillInput.trim()]); setHasChanges(true);
                        }
                        setSkillInput('');
                      }
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
                  {['Team leadership', 'Inventory management', 'Scheduling', 'Compliance', 'P&L management',
                    'Staff training', 'Customer service', 'Budgeting', 'Vendor relations', 'Audit management']
                    .filter((s) => !skillsExtracted.includes(s))
                    .slice(0, 6)
                    .map((s) => (
                      <button
                        key={s}
                        onClick={() => { setSkillsExtracted((prev) => [...prev, s]); setHasChanges(true); }}
                        style={{
                          padding: '3px 10px', border: '1px dashed var(--color-border-strong)',
                          borderRadius: 'var(--radius-full)', background: 'none', cursor: 'pointer',
                          fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)',
                          fontFamily: "'Nunito', sans-serif",
                        }}
                      >
                        + {s}
                      </button>
                    ))}
                </div>
                {/* Skills saved via the sticky footer along with all other fields */}
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 'var(--space-3) 0' }}>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
              Add skills to improve your job matches
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Team leadership', 'Inventory management', 'Scheduling', 'Compliance', 'Customer service', 'Budgeting']
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSkillsExtracted((prev) => [...prev, s]); setEditingSkills(true); setHasChanges(true); }}
                    style={{
                      padding: '3px 10px', border: '1px dashed var(--color-border-strong)',
                      borderRadius: 'var(--radius-full)', background: 'none', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)',
                      fontFamily: "'Nunito', sans-serif",
                    }}
                  >
                    + {s}
                  </button>
                ))}
            </div>
          </div>
        )}
      </Card>

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
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: 'var(--space-2)' }}>
              Your last {Math.min(analyses.length, 5)} analyses
            </p>
            <ScoreTrendChart analyses={analyses.slice(0, 5)} />
          </Card>
        ) : (
          <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
            <Ott state="encouraging" size={56} />
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
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {analyses.slice(vaultPage * 5, vaultPage * 5 + 5).map((a) => (
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
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '2px' }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={scoreBadgeVariant(a.score)}>
                    {a.score}%
                  </Badge>
                </div>
              ))}
            </div>
            {analyses.length > 5 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 'var(--space-4)',
                marginTop: 'var(--space-3)',
                fontSize: '13px',
              }}>
                <button
                  disabled={vaultPage === 0}
                  onClick={() => setVaultPage((p) => p - 1)}
                  style={{
                    background: 'none', border: 'none', cursor: vaultPage === 0 ? 'default' : 'pointer',
                    color: vaultPage === 0 ? 'var(--color-text-muted)' : 'var(--color-accent)',
                    fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: '13px', padding: 'var(--space-1) var(--space-2)',
                  }}
                >
                  Prev
                </button>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {vaultPage + 1} / {Math.ceil(analyses.length / 5)}
                </span>
                <button
                  disabled={vaultPage >= Math.ceil(analyses.length / 5) - 1}
                  onClick={() => setVaultPage((p) => p + 1)}
                  style={{
                    background: 'none', border: 'none',
                    cursor: vaultPage >= Math.ceil(analyses.length / 5) - 1 ? 'default' : 'pointer',
                    color: vaultPage >= Math.ceil(analyses.length / 5) - 1 ? 'var(--color-text-muted)' : 'var(--color-accent)',
                    fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: '13px', padding: 'var(--space-1) var(--space-2)',
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
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

      {/* Paw print section divider */}
      <div className="paw-divider" aria-hidden="true">
        <img src="/ott/ott-paw-print.png" alt="" className="paw-divider__print" />
        <img src="/ott/ott-paw-print.png" alt="" className="paw-divider__print" />
        <img src="/ott/ott-paw-print.png" alt="" className="paw-divider__print" />
      </div>

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
      {/* Sticky save footer */}
      {hasChanges && (
        <div style={{
          position: 'fixed',
          bottom: 'var(--bottom-nav-height)',
          left: 0,
          right: 0,
          background: 'var(--color-surface-raised)',
          borderTop: '1.5px solid var(--color-border)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-4)',
          zIndex: 100,
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-warning)' }}>
            Unsaved changes
          </span>
          <Button onClick={handleSave} disabled={saving} style={{ minWidth: '140px' }}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save all changes'}
          </Button>
        </div>
      )}
      </>)}
    </ScreenWrapper>
  );
}
