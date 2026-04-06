import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Ott from '../components/ott/Ott';
import { Upload as UploadIcon, UserCircle, ChevronDown, ChevronUp, Check, X, Info } from 'lucide-react';
import EmptyStateUpload from '../components/ui/EmptyStateUpload';
import { uploadResume, analyzeResume, checkBadges } from '../services/api';
import MilestoneCelebration from '../components/ui/MilestoneCelebration';
import './Upload.css';

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
const MAX_SIZE = 5 * 1024 * 1024;

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
  const fileInputRef = useRef(null);
  const linkedinInputRef = useRef(null);
  const navigate = useNavigate();

  const ottState = error
    ? 'coaching'
    : analyzing
      ? 'thinking'
      : file
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

  const handleAnalyze = async () => {
    if (!file || !jobText.trim()) return;

    setAnalyzing(true);
    setError(null);

    try {
      const { text: resumeText } = await uploadResume(file);

      // Extract LinkedIn text from PDF if uploaded
      let finalLinkedinText = linkedinText;
      if (linkedinMode === 'pdf' && linkedinFile) {
        const { text: liText } = await uploadResume(linkedinFile);
        finalLinkedinText = liText;
      }

      const result = await analyzeResume(resumeText, jobText, '', '', finalLinkedinText);

      const badgeResult = await checkBadges();
      if (badgeResult.newly_earned?.length > 0) {
        setCelebratingBadge(badgeResult.newly_earned[0]);
        setTimeout(() => navigate('/results', { state: { result: { ...result, resume_filename: file.name } } }), 3500);
        return;
      }

      navigate('/results', { state: { result: { ...result, resume_filename: file.name } } });
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

      {/* Resume upload zone */}
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
            <Ott state={ottState} size={80} />
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
            <EmptyStateUpload size={160} />
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
      </Card>

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

      {/* Analyze button */}
      <Button
        full
        disabled={!file || !jobText.trim() || analyzing}
        onClick={handleAnalyze}
      >
        {analyzing ? 'Ott is reading your resume...' : 'Analyze Match'}
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
