import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';

/* Placeholder score — will be driven by real data in Phase 2 */
const PLACEHOLDER = {
  score: null,
  strengths: [],
  gaps: [],
  recommendations: [],
};

export default function Results() {
  const { score, strengths, gaps, recommendations } = PLACEHOLDER;
  const hasResult = score !== null;

  const ottState = !hasResult
    ? 'waving'
    : score >= 70
      ? 'celebrating'
      : score >= 40
        ? 'encouraging'
        : 'coaching';

  return (
    <ScreenWrapper>
      <h2 style={{ marginBottom: 'var(--space-6)' }}>Results</h2>

      {!hasResult ? (
        /* Empty state */
        <Card style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-5)' }}>
          <Ott state="waving" size={120} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>No results yet</p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Upload a resume and job description to see your match score
          </p>
        </Card>
      ) : (
        <>
          {/* Ott reaction */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
            <Ott state={ottState} size={100} />
          </div>

          {/* Score ring placeholder */}
          <Card style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
            <p style={{ fontWeight: 800, fontSize: '48px', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              {score}
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>/100 match score</p>
          </Card>

          {/* Strengths */}
          {strengths.length > 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>Strengths</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {strengths.map((s, i) => (
                  <Card key={i}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      <Badge variant="success">Match</Badge>
                      <p style={{ color: 'var(--color-text-secondary)' }}>{s}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {gaps.length > 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>Gaps</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {gaps.map((g, i) => (
                  <Card key={i}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      <Badge variant="danger">Gap</Badge>
                      <p style={{ color: 'var(--color-text-secondary)' }}>{g}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>Recommendations</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {recommendations.map((r, i) => (
                  <Card key={i}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      <span style={{
                        fontWeight: 800,
                        color: 'var(--color-accent)',
                        minWidth: '24px',
                      }}>
                        {i + 1}.
                      </span>
                      <p style={{ color: 'var(--color-text-secondary)' }}>{r}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Save + optimize CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Button full>Save Result</Button>
            <Button full variant="secondary">Optimize for This Job</Button>
          </div>
        </>
      )}
    </ScreenWrapper>
  );
}
