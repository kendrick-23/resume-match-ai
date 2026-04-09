import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';

export default function Help() {
  const navigate = useNavigate();

  return (
    <ScreenWrapper>
      <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
        <Ott state="encouraging" size={120} />
        <h2 style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-2)' }}>
          How Holt Works
        </h2>
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '14px',
          lineHeight: 1.6,
          maxWidth: '280px',
          margin: '0 auto var(--space-6)',
        }}>
          This guide is coming soon. You're one of Holt's first explorers.
        </p>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          &larr; Back
        </Button>
      </div>
    </ScreenWrapper>
  );
}
