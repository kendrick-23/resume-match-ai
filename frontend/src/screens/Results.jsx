import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { listAnalyses } from '../services/api';

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
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={RING_STROKE}
        />
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

  // Result from navigation state (fresh analysis) or loaded from Supabase
  const [result, setResult] = useState(location.state?.result || null);
  const [pastAnalyses, setPastAnalyses] = useState([]);
  const [loading, setLoading] = useState(!location.state?.result);

  useEffect(() => {
    // If no result from navigation, load the most recent from Supabase
    if (!location.state?.result) {
      loadAnalyses();
    } else {
      // Still load past analyses for the history section
      loadPastAnalyses();
    }
  }, []);

  async function loadAnalyses() {
    try {
      const data = await listAnalyses();
      if (data.length > 0) {
        const latest = data[0];
        setResult({
          score: latest.score,
          strengths: typeof latest.strengths === 'string' ? JSON.parse(latest.strengths) : latest.strengths,
          gaps: typeof latest.gaps === 'string' ? JSON.parse(latest.gaps) : latest.gaps,
          recommendations: typeof latest.recommendations === 'string' ? JSON.parse(latest.recommendations) : latest.recommendations,
          summary: latest.summary,
          company_name: latest.company_name,
          role_name: latest.role_name,
          created_at: latest.created_at,
        });
        setPastAnalyses(data.slice(1));
      }
    } catch {
      // Silently fail — show empty state
    } finally {
      setLoading(false);
    }
  }

  async function loadPastAnalyses() {
    try {
      const data = await listAnalyses();
      // Skip the first one if it matches current result
      setPastAnalyses(data.length > 1 ? data.slice(1) : []);
    } catch {
      // Silently fail
    }
  }

  const hasResult = result && typeof result.score === 'number';
  const score = hasResult ? result.score : 0;
  const strengths = hasResult ? result.strengths : [];
  const gaps = hasResult ? result.gaps : [];
  const recommendations = hasResult ? result.recommendations : [];
  const summary = hasResult ? result.summary : '';

  const ottState = loading
    ? 'thinking'
    : !hasResult
      ? 'waving'
      : score >= 70
        ? 'celebrating'
        : score >= 40
          ? 'encouraging'
          : 'coaching';

  if (loading) {
    return (
      <ScreenWrapper>
        <h2 style={{ marginBottom: 'var(--space-6)' }}>Results</h2>
        <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
          <Ott state="thinking" size={100} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
            Loading your results...
          </p>
        </div>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <h2 style={{ marginBottom: 'var(--space-6)' }}>Results</h2>

      {!hasResult ? (
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
            {(result.company_name || result.role_name) && (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
                {[result.role_name, result.company_name].filter(Boolean).join(' at ')}
              </p>
            )}
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

          {/* Ott's Take — coaching tips */}
          {result.coaching_tips?.length > 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <Card style={{
                background: 'var(--color-accent-light)',
                borderColor: 'var(--color-accent)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-3)',
                }}>
                  <Ott state="encouraging" size={48} />
                  <h3 style={{ color: 'var(--color-accent-dark)' }}>Ott's Take</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {result.coaching_tips.map((tip, i) => (
                    <p key={i} style={{
                      color: 'var(--color-text)',
                      lineHeight: 1.6,
                      fontSize: '14px',
                      paddingLeft: 'var(--space-3)',
                      borderLeft: '3px solid var(--color-accent)',
                    }}>
                      {tip}
                    </p>
                  ))}
                </div>
              </Card>
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

          {/* Past analyses */}
          {pastAnalyses.length > 0 && (
            <div style={{ marginTop: 'var(--space-8)' }}>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>Previous Analyses</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {pastAnalyses.slice(0, 5).map((a) => (
                  <Card
                    key={a.id}
                    interactive
                    onClick={() => {
                      setResult({
                        score: a.score,
                        strengths: typeof a.strengths === 'string' ? JSON.parse(a.strengths) : a.strengths,
                        gaps: typeof a.gaps === 'string' ? JSON.parse(a.gaps) : a.gaps,
                        recommendations: typeof a.recommendations === 'string' ? JSON.parse(a.recommendations) : a.recommendations,
                        summary: a.summary,
                        company_name: a.company_name,
                        role_name: a.role_name,
                        created_at: a.created_at,
                      });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '14px' }}>
                          {a.role_name || a.company_name || 'Analysis'}
                        </p>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                          {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={a.score >= 70 ? 'success' : a.score >= 40 ? 'warning' : 'danger'}>
                        {a.score}%
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </ScreenWrapper>
  );
}
