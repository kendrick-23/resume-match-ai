import { useState, useRef } from 'react';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Ott from '../components/ott/Ott';
import { Upload as UploadIcon } from 'lucide-react';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [jobText, setJobText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef(null);

  const ottState = analyzing ? 'thinking' : file ? 'encouraging' : 'waiting';

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) setFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  return (
    <ScreenWrapper>
      <h2 style={{ marginBottom: 'var(--space-6)' }}>Analyze Resume</h2>

      {/* Upload zone */}
      <Card
        style={{ textAlign: 'center', marginBottom: 'var(--space-5)', cursor: 'pointer' }}
        onClick={() => fileInputRef.current?.click()}
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
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
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
        />
      </div>

      {/* Analyze button */}
      <Button
        full
        disabled={!file || !jobText.trim() || analyzing}
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
    </ScreenWrapper>
  );
}
