import { useLocation, useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';

const RING_SIZE = 140;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score }) {
  const offset = RING_CIRCUMFERENCE - (score / 100) * RING_CIRCUMFERENCE;
  const color =
    score >= 70
      ? 'var(--color-success)'
      : score >= 40
        ? 'var(--color-warning)'
        : 'var(--color-danger)';

  return (
    <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE, margin: '0 auto' }}>
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        {/* Background track */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={RING_STROKE}
        />
        {/* Animated fill */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          className="score-ring__circle"
          style={{
            '--score-ring-circumference': RING_CIRCUMFERENCE,
            '--score-ring-offset': offset,
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{
          fontWeight: 800,
          fontSize: '36px',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
        }}>
          {score}
        </span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>/100</span>
      </div>
    </div>
  );
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.result;

  const hasResult = result && typeof result.score === 'number';
  const score = hasResult ? result.score : 0;
  const strengths = hasResult ? result.strengths : [];
  const gaps = hasResult ? result.gaps : [];
  const recommendations = hasResult ? result.recommendations : [];
  const summary = hasResult ? result.summary : '';

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
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
            Upload a resume and job description to see your match score
          </p>
          <Button onClick={() => navigate('/upload')}>Analyze a Resume</Button>
        </Card>
      ) : (
        <>
          {/* Ott reaction */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
            <Ott state={ottState} size={100} />
          </div>

          {/* Score ring */}
          <Card style={{ textAlign: 'center', marginBottom: 'var(--space-5)', padding: 'var(--space-6) var(--space-5)' }}>
            <ScoreRing score={score} />
            <p style={{
              color: 'var(--color-text-secondary)',
              fontSize: '14px',
              marginTop: 'var(--space-3)',
              fontWeight: 600,
            }}>
              Match Score
            </p>
          </Card>

          {/* Summary */}
          {summary && (
            <Card style={{ marginBottom: 'var(--space-5)' }}>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{summary}</p>
            </Card>
          )}

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

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Button full onClick={() => navigate('/upload')}>Analyze Another Resume</Button>
          </div>
        </>
      )}
    </ScreenWrapper>
  );
}
