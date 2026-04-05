import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Ott from '../components/ott/Ott';
import { Upload as UploadIcon } from 'lucide-react';
import { uploadResume, analyzeResume, checkBadges } from '../services/api';
import MilestoneCelebration from '../components/ui/MilestoneCelebration';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [jobText, setJobText] = useState('');
  const [linkedinText, setLinkedinText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [celebratingBadge, setCelebratingBadge] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const ottState = error
    ? 'coaching'
    : analyzing
      ? 'thinking'
      : file
        ? 'encouraging'
        : 'waiting';

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file || !jobText.trim()) return;

    setAnalyzing(true);
    setError(null);

    try {
      const { text: resumeText } = await uploadResume(file);
      const result = await analyzeResume(resumeText, jobText, '', '', linkedinText);

      // Check for newly earned badges
      const badgeResult = await checkBadges();
      if (badgeResult.newly_earned?.length > 0) {
        setCelebratingBadge(badgeResult.newly_earned[0]);
        // Navigate after celebration
        setTimeout(() => navigate('/results', { state: { result } }), 3500);
        return;
      }

      navigate('/results', { state: { result } });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ScreenWrapper>
      <h2 style={{ marginBottom: 'var(--space-6)' }}>Analyze Resume</h2>

      {/* Upload zone */}
      <Card
        style={{ textAlign: 'center', marginBottom: 'var(--space-5)', cursor: 'pointer' }}
        onClick={() => !analyzing && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <Ott state={ottState} size={100} />

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {file ? (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <p style={{ fontWeight: 700 }}>{file.name}</p>
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
          <div style={{ marginTop: 'var(--space-3)' }}>
            <UploadIcon
              size={24}
              style={{ color: 'var(--color-accent)', margin: '0 auto var(--space-2)' }}
            />
            <p style={{ fontWeight: 700 }}>Tap to upload or drag & drop</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
              PDF or DOCX, 5 MB max
            </p>
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

      {/* LinkedIn profile (optional) */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <Input
          textarea
          label="LinkedIn Profile (optional)"
          placeholder="Paste your LinkedIn About section, experience summary, or any profile text..."
          value={linkedinText}
          onChange={(e) => setLinkedinText(e.target.value)}
          style={{ minHeight: '100px' }}
          disabled={analyzing}
        />
        <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 'var(--space-1)' }}>
          Gives Ott extra context about your skills and experience
        </p>
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
