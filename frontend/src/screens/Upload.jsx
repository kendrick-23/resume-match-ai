import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Ott from '../components/ott/Ott';
import { Upload as UploadIcon, UserCircle, ChevronDown, ChevronUp, Check, X, Info, FileText } from 'lucide-react';
import { uploadResume, analyzeResume, checkBadges, listResumes, createResume, getProfile } from '../services/api';
import MilestoneCelebration from '../components/ui/MilestoneCelebration';
import { clearRecommendationsCache } from '../utils/cache';
import { useToast } from '../context/ToastContext';
import './Upload.css';

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
const MAX_SIZE = 5 * 1024 * 1024;

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Middle-truncate a filename so the extension is preserved.
 *   "Regional_Training_Manager_Resume_v3.docx" → "Regional_Training_Man...esume_v3.docx"
 * For labels without an extension, falls back to a simple end-truncate.
 */
function truncate(str, n = 30) {
  if (!str) return '';
  if (str.length <= n) return str;

  // Detect a real extension (≤6 chars, alphanumeric) — anything else is a label, not a file.
  const dot = str.lastIndexOf('.');
  const ext = dot > 0 && dot > str.length - 8 ? str.slice(dot) : '';
  if (!ext || /[^A-Za-z0-9.]/.test(ext)) {
    return str.slice(0, n - 1) + '…';
  }

  const base = str.slice(0, dot);
  // Reserve 1 char for the ellipsis + the extension; split the remaining budget
  // between the leading and trailing portions of the basename.
  const budget = n - 1 - ext.length;
  if (budget < 4) {
    // Extension is so long there's no room for a meaningful base — just end-truncate.
    return str.slice(0, n - 1) + '…';
  }
  const head = Math.ceil(budget * 0.6);
  const tail = budget - head;
  return base.slice(0, head) + '…' + base.slice(base.length - tail) + ext;
}

export default function Upload() {
  const [file, setFile] = useState(null);
  const [jobText, setJobText] = useState('');
  const [linkedinText, setLinkedinText] = useState('');
  const [linkedinFile, setLinkedinFile] = useState(null);
  const [linkedinMode, setLinkedinMode] = useState('pdf');
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [linkedinError, setLinkedinError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [celebratingBadge, setCelebratingBadge] = useState(null);

  // Resume Vault state
  const [vaultResumes, setVaultResumes] = useState([]);     // list of {id, label, ...}
  const [vaultLoading, setVaultLoading] = useState(true);
  const [selectedResumeId, setSelectedResumeId] = useState(null);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [forceUploadMode, setForceUploadMode] = useState(false); // user opted to upload a new file

  // LinkedIn pre-fill from profile
  const [profileLinkedin, setProfileLinkedin] = useState('');
  const [linkedinPrefilledFromProfile, setLinkedinPrefilledFromProfile] = useState(false);

  const fileInputRef = useRef(null);
  const linkedinInputRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  // Fetch vault + profile on mount.
  useEffect(() => {
    Promise.allSettled([listResumes(), getProfile()]).then(([resumesRes, profileRes]) => {
      if (resumesRes.status === 'fulfilled' && Array.isArray(resumesRes.value)) {
        setVaultResumes(resumesRes.value);
        const def = resumesRes.value.find((r) => r.is_default);
        if (def) setSelectedResumeId(def.id);
      }
      if (profileRes.status === 'fulfilled' && profileRes.value?.linkedin_text) {
        setProfileLinkedin(profileRes.value.linkedin_text);
        setLinkedinText(profileRes.value.linkedin_text);
        setLinkedinPrefilledFromProfile(true);
        setLinkedinMode('text');
      }
      setVaultLoading(false);
    });
  }, []);

  const selectedResume = vaultResumes.find((r) => r.id === selectedResumeId) || null;
  const hasVaultResumes = vaultResumes.length > 0;
  // Vault mode: we have at least one saved resume AND the user hasn't opted to upload a fresh one.
  const inVaultMode = hasVaultResumes && !forceUploadMode;

  const ottState = error
    ? 'coaching'
    : analyzing
      ? 'thinking'
      : (file || selectedResume)
        ? 'encouraging'
        : 'waiting';

  function validateFile(f) {
    if (!ALLOWED_MIMES.has(f.type)) {
      setError('Only PDF and Word files are accepted');
      return false;
    }
    if (f.size > MAX_SIZE) {
      setError('That file is too large (max 5MB)');
      return false;
    }
    return true;
  }

  function validateLinkedinPdf(f) {
    if (f.type !== 'application/pdf') {
      setLinkedinError('Only PDF files are accepted');
      return false;
    }
    if (f.size > MAX_SIZE) {
      setLinkedinError('That file is too large (max 5MB)');
      return false;
    }
    return true;
  }

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setError(null);
      if (validateFile(selected)) setFile(selected);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setError(null);
      if (validateFile(dropped)) setFile(dropped);
    }
  };

  const handleLinkedinFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setLinkedinError(null);
      if (validateLinkedinPdf(selected)) setLinkedinFile(selected);
    }
  };

  const handleLinkedinDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setLinkedinError(null);
      if (validateLinkedinPdf(dropped)) setLinkedinFile(dropped);
    }
  };

  const canAnalyze = jobText.trim() && (file || (inVaultMode && selectedResumeId));

  const handleAnalyze = async () => {
    if (!canAnalyze) return;

    setAnalyzing(true);
    setError(null);

    try {
      // Resolve LinkedIn text first (PDF extraction if needed)
      let finalLinkedinText = linkedinText;
      if (linkedinMode === 'pdf' && linkedinFile) {
        const { text: liText } = await uploadResume(linkedinFile);
        finalLinkedinText = liText;
      }

      let result;
      let displayedResumeName = '';

      if (inVaultMode && selectedResumeId) {
        // VAULT PATH — backend fetches the resume by id
        result = await analyzeResume('', jobText, '', '', finalLinkedinText, selectedResumeId);
        displayedResumeName = selectedResume?.label || selectedResume?.source_filename || '';
      } else {
        // UPLOAD PATH — extract text, then analyze. Backend auto-saves to the vault.
        const { text: resumeText } = await uploadResume(file);
        result = await analyzeResume(resumeText, jobText, '', '', finalLinkedinText);
        displayedResumeName = file.name;
      }

      if (result.pruned_resume) {
        toast.info(`Replaced your oldest resume — '${result.pruned_resume}' was removed to stay within your 5-resume limit.`);
      }

      clearRecommendationsCache();
      const badgeResult = await checkBadges();
      const navState = {
        result: {
          ...result,
          resume_filename: displayedResumeName,
          resume_label: selectedResume?.label || null,
          resume_used_at: new Date().toISOString(),
        },
      };

      if (badgeResult.newly_earned?.length > 0) {
        setCelebratingBadge(badgeResult.newly_earned[0]);
        setTimeout(() => navigate('/results', { state: navState }), 3500);
        return;
      }

      navigate('/results', { state: navState });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const hasLinkedinData = linkedinMode === 'pdf' ? !!linkedinFile : !!linkedinText.trim();

  return (
    <ScreenWrapper>
      <h2 style={{ marginBottom: 'var(--space-6)' }}>Analyze Resume</h2>

      {/* Resume zone — three states: vault default / vault picker / fresh upload */}
      {vaultLoading ? (
        <Card style={{ textAlign: 'center', marginBottom: 'var(--space-5)', padding: 'var(--space-6)' }}>
          <Ott state="thinking" size={56} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)', fontSize: '13px' }}>
            Loading your resumes...
          </p>
        </Card>
      ) : inVaultMode && selectedResume ? (
        // STATE B/C — vault has at least one resume; show the default + optional picker
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <img
              src="/ott/ott-reading.png"
              alt="Ott"
              loading="lazy"
              style={{ width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your Resume
              </p>
              <p
                title={selectedResume.label || selectedResume.source_filename || 'Resume'}
                style={{
                  fontWeight: 700,
                  fontSize: '15px',
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {truncate(selectedResume.label || selectedResume.source_filename || 'Resume', 30)}
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '2px' }}>
                Last updated: {formatDate(selectedResume.updated_at || selectedResume.created_at)}
                {selectedResume.word_count ? ` · ${selectedResume.word_count.toLocaleString()} words` : ''}
              </p>
            </div>
          </div>

          {/* Switch resume — only shown when there are 2+ saved */}
          {vaultResumes.length >= 2 && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <button
                onClick={() => setShowVaultPicker(!showVaultPicker)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-accent)',
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: 600,
                  fontSize: '13px',
                  padding: 0,
                }}
              >
                {showVaultPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Switch resume
              </button>
              {showVaultPicker && (
                <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  {vaultResumes.filter((r) => r.id !== selectedResumeId).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedResumeId(r.id); setShowVaultPicker(false); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-2)',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        fontFamily: "'Nunito', sans-serif",
                      }}
                    >
                      <FileText size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          title={r.label || r.source_filename || 'Resume'}
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                          }}
                        >
                          {truncate(r.label || r.source_filename || 'Resume', 30)}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {formatDate(r.updated_at || r.created_at)}
                          {r.word_count ? ` · ${r.word_count.toLocaleString()} words` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload a different resume — secondary text link */}
          <div style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
            <button
              onClick={() => { setForceUploadMode(true); setShowVaultPicker(false); }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 600,
                fontSize: '12px',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Upload a different resume
            </button>
          </div>
        </Card>
      ) : (
        // STATE A — no saved resumes (or user clicked "upload a different one")
        <Card
          style={{ textAlign: 'center', marginBottom: 'var(--space-5)', cursor: 'pointer' }}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {file ? (
            <div>
              <Ott state={ottState} size={56} />
              <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>{file.name}</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
                {(file.size / 1024).toFixed(0)} KB
              </p>
              <Button
                variant="ghost"
                style={{ marginTop: 'var(--space-2)' }}
                onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); }}
                disabled={analyzing}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <img
                src="/ott/ott-reading.png"
                alt="Ott reviewing your resume"
                loading="lazy"
                style={{ width: '56px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
              />
              <div style={{ marginTop: 'var(--space-3)' }}>
                <UploadIcon
                  size={20}
                  style={{ color: 'var(--color-accent)', margin: '0 auto var(--space-1)' }}
                />
                <p style={{ fontWeight: 700 }}>Tap to upload or drag & drop</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
                  PDF or DOCX, 5 MB max
                </p>
              </div>
            </div>
          )}

          {/* Back to vault link if the user has saved resumes and chose upload mode */}
          {hasVaultResumes && forceUploadMode && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setForceUploadMode(false); setFile(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: 600,
                  fontSize: '12px',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                ← Use a saved resume instead
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Job description input */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <Input
          textarea
          label="Job Description"
          placeholder="Paste the job description here..."
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          style={{ minHeight: '160px' }}
          disabled={analyzing}
        />
      </div>

      {/* LinkedIn section — progressive disclosure */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <button
          className="linkedin-toggle"
          onClick={() => setLinkedinOpen(!linkedinOpen)}
          disabled={analyzing}
        >
          <div className="linkedin-toggle__left">
            <UserCircle size={18} className="linkedin-toggle__icon" />
            <span className="linkedin-toggle__label">Add LinkedIn profile</span>
            <Badge variant="info" style={{ fontSize: '11px', padding: '2px 8px' }}>Optional</Badge>
            {hasLinkedinData && <Check size={14} style={{ color: 'var(--color-success)' }} />}
          </div>
          {linkedinOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        <div className={`linkedin-body ${linkedinOpen ? 'linkedin-body--open' : ''}`}>
          <div className="linkedin-body__inner">
            {/* Segmented toggle */}
            <div className="linkedin-segmented">
              <button
                className={`linkedin-segmented__option ${linkedinMode === 'pdf' ? 'linkedin-segmented__option--active' : ''}`}
                onClick={() => setLinkedinMode('pdf')}
              >
                Upload PDF
              </button>
              <button
                className={`linkedin-segmented__option ${linkedinMode === 'text' ? 'linkedin-segmented__option--active' : ''}`}
                onClick={() => setLinkedinMode('text')}
              >
                Paste text
              </button>
            </div>

            {/* PDF upload surface */}
            {linkedinMode === 'pdf' && (
              <div>
                <input
                  ref={linkedinInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleLinkedinFileChange}
                  style={{ display: 'none' }}
                />

                {linkedinFile ? (
                  <div className="linkedin-file-selected">
                    <Check size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                    <span className="linkedin-file-selected__name">{linkedinFile.name}</span>
                    <button
                      className="linkedin-file-selected__remove"
                      onClick={() => { setLinkedinFile(null); setLinkedinError(null); }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="linkedin-dropzone"
                    onClick={() => linkedinInputRef.current?.click()}
                    onDrop={handleLinkedinDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <UploadIcon size={16} style={{ color: 'var(--color-accent)' }} />
                    <p className="linkedin-dropzone__label">
                      Upload your LinkedIn profile as PDF
                    </p>
                    <p style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-1)',
                      fontSize: '12px',
                      color: 'var(--color-text-muted)',
                      lineHeight: 1.4,
                      marginTop: 'var(--space-1)',
                    }}>
                      <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                      On desktop: go to your LinkedIn profile &rarr; More &rarr; Save to PDF. Not available on mobile.
                    </p>
                  </div>
                )}

                {linkedinError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: '12px', fontWeight: 600, marginTop: 'var(--space-2)' }}>
                    {linkedinError}
                  </p>
                )}
              </div>
            )}

            {/* Paste text surface */}
            {linkedinMode === 'text' && (
              <div>
                <Input
                  textarea
                  placeholder="Paste your LinkedIn About section, experience, or any profile text..."
                  value={linkedinText}
                  onChange={(e) => setLinkedinText(e.target.value)}
                  style={{ minHeight: '80px' }}
                  disabled={analyzing}
                />
                <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 'var(--space-1)' }}>
                  More text = better analysis
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <Card style={{
          marginBottom: 'var(--space-4)',
          background: 'var(--color-danger-light)',
          borderColor: 'var(--color-danger)',
        }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: '14px' }}>
            {error}
          </p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
            Don't worry — check your file and try again.
          </p>
        </Card>
      )}

      {/* Analyze button — label adapts to mode */}
      <Button
        full
        disabled={!canAnalyze || analyzing}
        onClick={handleAnalyze}
      >
        {analyzing
          ? 'Reading through this carefully...'
          : inVaultMode
            ? 'Use this resume'
            : 'Analyze Match'}
      </Button>

      {/* Loading state hint */}
      {analyzing && (
        <p style={{
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '13px',
          marginTop: 'var(--space-3)',
        }}>
          This usually takes about 10 seconds
        </p>
      )}

      {/* Milestone celebration */}
      {celebratingBadge && (
        <MilestoneCelebration
          badgeKey={celebratingBadge}
          onClose={() => setCelebratingBadge(null)}
        />
      )}
    </ScreenWrapper>
  );
}
