import { useNavigate } from 'react-router-dom';
import Button from './Button';

export default function EmptyStateResults({ size = 120 }) {
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
      <img
        src="/ott/ott-encouraging.png"
        alt="Ott encouraging"
        width={size}
        style={{ display: 'block', margin: '0 auto' }}
      />
      <p style={{
        color: 'var(--color-text-muted)',
        fontSize: '14px',
        lineHeight: 1.6,
        marginTop: 'var(--space-3)',
        maxWidth: '280px',
        marginLeft: 'auto',
        marginRight: 'auto',
        marginBottom: 'var(--space-4)',
      }}>
        Run an analysis to see your score trend build over time.
      </p>
      <Button onClick={() => navigate('/upload')}>Analyze a Resume</Button>
    </div>
  );
}
