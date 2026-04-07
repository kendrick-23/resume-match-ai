import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { listAnalyses } from '../services/api';
import { generateResume, parseResumeMarkdown, downloadResumeAsDocx } from '../services/resumeGenerator';
import { Copy, Download, ClipboardList, Search, FileText, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import './Results.css';

const RING_SIZE = 140;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const PILLS = [
  { id: 'overview', label: 'Overview' },
  { id: 'strengths', label: 'Strengths' },
  { id: 'gaps', label: 'Gaps' },
  { id: 'otts-take', label: "Ott's Take" },
  { id: 'resume', label: 'Resume' },
];

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

function StickyPillNav({ activePill, onPillClick }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const pill = activeRef.current;
      const scrollLeft = pill.offsetLeft - container.offsetWidth / 2 + pill.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [activePill]);

  return (
    <div className="results-pills" ref={scrollRef}>
      {PILLS.map((pill) => (
        <button
          key={pill.id}
          ref={pill.id === activePill ? activeRef : null}
          className={`results-pills__pill ${pill.id === activePill ? 'results-pills__pill--active' : ''}`}
          onClick={() => onPillClick(pill.id)}
        >
          {pill.label}
        </button>
      ))}
    </div>
  );
}

const SUB_SCORE_LABELS = [
  { key: 'skills_match', label: 'Skills match' },
  { key: 'seniority_fit', label: 'Seniority fit' },
  { key: 'salary_alignment', label: 'Salary alignment' },
  { key: 'growth_potential', label: 'Growth potential' },
];

function ScoreBreakdown({ result }) {
  const hasSubScores = SUB_SCORE_LABELS.some((s) => result[s.key] != null);
  if (!hasSubScores) return null;

  return (
    <Card style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-3)',
      }}>
        <BarChart3 size={16} style={{ color: 'var(--color-accent)' }} />
        <p style={{ fontWeight: 700, fontSize: '14px' }}>Score Breakdown</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {SUB_SCORE_LABELS.map((s, i) => {
          const value = result[s.key] ?? 0;
          const barColor = value >= 70
            ? 'var(--color-success)'
            : value >= 50
              ? 'var(--color-warning)'
              : 'var(--color-accent)';
          return (
            <div key={s.key}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  {s.label}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-text)' }}>
                  {value}
                </span>
              </div>
              <div style={{
                height: '6px',
                background: 'var(--color-border)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
              }}>
                <div
                  className="score-breakdown-bar"
                  style={{
                    height: '100%',
                    borderRadius: 'var(--radius-full)',
                    background: barColor,
                    width: `${value}%`,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function JobContextCard({ result }) {
  const [expanded, setExpanded] = useState(false);
  const roleName = result.role_name;
  const companyName = result.company_name;
  const jobText = result.job_description_text;
  const filename = result.resume_filename;

  return (
    <Card style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <FileText size={18} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.3 }}>
            {roleName || <span style={{ color: 'var(--color-text-muted)' }}>Role not detected</span>}
          </p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '2px' }}>
            {companyName || <span style={{ color: 'var(--color-text-muted)' }}>Company not detected</span>}
          </p>
          {filename && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 'var(--space-1)' }}>
              {filename}
            </p>
          )}
        </div>
      </div>

      {jobText && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              marginTop: 'var(--space-3)',
              padding: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-accent)',
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Hide job description' : 'View job description'}
          </button>

          {expanded && (
            <div style={{
              marginTop: 'var(--space-2)',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: 'var(--space-3)',
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              fontSize: '13px',
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
            }}>
              {jobText}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();

  const toast = useToast();
  const [result, setResult] = useState(location.state?.result || null);
  const [pastAnalyses, setPastAnalyses] = useState([]);
  const [loading, setLoading] = useState(!location.state?.result);

  // ATS Resume Generator state
  const [resumeMd, setResumeMd] = useState(null);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [copied, setCopied] = useState(false);

  // Sticky pill nav
  const [activePill, setActivePill] = useState('overview');
  const sectionRefs = useRef({});

  useEffect(() => {
    if (!location.state?.result) {
      loadAnalyses();
    } else {
      loadPastAnalyses();
    }
  }, []);

  // IntersectionObserver for active pill tracking
  useEffect(() => {
    if (!result) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActivePill(entry.target.id);
          }
        }
      },
      {
        rootMargin: '-120px 0px -60% 0px',
        threshold: 0.1,
      }
    );

    // Small delay to let refs populate after render
    const timer = setTimeout(() => {
      for (const id of PILLS.map((p) => p.id)) {
        const el = sectionRefs.current[id];
        if (el) observer.observe(el);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [result]);

  async function loadAnalyses() {
    const timeout = setTimeout(() => setLoading(false), 8000);
    try {
      const data = await listAnalyses();
      if (Array.isArray(data) && data.length > 0) {
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
          analysis_id: latest.id,
          coaching_tips: latest.coaching_tips,
          job_description_text: latest.job_description_text,
          skills_match: latest.skills_match,
          seniority_fit: latest.seniority_fit,
          salary_alignment: latest.salary_alignment,
          growth_potential: latest.growth_potential,
        });
        if (latest.generated_resume_md) {
          setResumeMd(latest.generated_resume_md);
        }
        setPastAnalyses(data.slice(1));
      }
    } catch {
      // Empty state will show — no analyses available
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  async function loadPastAnalyses() {
    try {
      const data = await listAnalyses();
      setPastAnalyses(data.length > 1 ? data.slice(1) : []);
    } catch {
      // Silently fail
    }
  }

  function handlePillClick(id) {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function setSectionRef(id) {
    return (el) => { sectionRefs.current[id] = el; };
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
          {/* Job context card */}
          <JobContextCard result={result} />

          {/* Score card — always at top */}
          <Card style={{ textAlign: 'center', marginBottom: 0, padding: 'var(--space-5)' }}>
            <Ott state={ottState} size={80} />
            <div style={{ marginTop: 'var(--space-3)' }}>
              <ScoreRing score={score} />
            </div>
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

          {/* Score breakdown */}
          <ScoreBreakdown result={result} />

          {/* Sticky pill navigation */}
          <StickyPillNav activePill={activePill} onPillClick={handlePillClick} />

          {/* === OVERVIEW SECTION === */}
          <section id="overview" ref={setSectionRef('overview')} className="results-section" style={{ scrollMarginTop: '120px' }}>
            <h3 className="results-section__title">Overview</h3>
            {summary && (
              <Card>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{summary}</p>
              </Card>
            )}
            {recommendations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
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
            )}
          </section>

          {/* === STRENGTHS SECTION === */}
          <section id="strengths" ref={setSectionRef('strengths')} className="results-section" style={{ scrollMarginTop: '120px' }}>
            <h3 className="results-section__title">Strengths</h3>
            {strengths.length > 0 ? (
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
            ) : (
              <Card>
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  No specific strengths identified for this role
                </p>
              </Card>
            )}
          </section>

          {/* === GAPS SECTION === */}
          <section id="gaps" ref={setSectionRef('gaps')} className="results-section" style={{ scrollMarginTop: '120px' }}>
            <h3 className="results-section__title">Gaps</h3>
            {gaps.length > 0 ? (
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
            ) : (
              <Card>
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  No significant gaps found — nice work!
                </p>
              </Card>
            )}
          </section>

          {/* === OTT'S TAKE SECTION === */}
          <section id="otts-take" ref={setSectionRef('otts-take')} className="results-section" style={{ scrollMarginTop: '120px' }}>
            <h3 className="results-section__title">Ott's Take</h3>
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
                <p style={{ fontWeight: 700, color: 'var(--color-accent-dark)' }}>
                  {score >= 70 ? "You're in great shape!" : score >= 40 ? "Good foundation — let's sharpen it." : "Don't worry — here's your game plan."}
                </p>
              </div>
              {result.coaching_tips?.length > 0 ? (
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
              ) : (
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6, fontSize: '14px' }}>
                  {score >= 70
                    ? "Your resume is a strong match. Focus on tailoring your cover letter and preparing for behavioral interviews."
                    : score >= 40
                      ? "You have transferable skills. Try rewording your experience to use the same language as the job description."
                      : "Start by addressing the gaps above. Even small keyword additions can significantly improve your ATS score."}
                </p>
              )}
            </Card>
          </section>

          {/* === RESUME SECTION === */}
          <section id="resume" ref={setSectionRef('resume')} className="results-section" style={{ scrollMarginTop: '120px' }}>
            <h3 className="results-section__title">ATS-Ready Resume</h3>

            {result.analysis_id && !resumeMd && !generatingResume && (
              <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
                <Ott state="encouraging" size={80} />
                <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
                  Get Your ATS-Ready Resume
                </p>
                <p style={{
                  color: 'var(--color-text-muted)',
                  fontSize: '13px',
                  marginTop: 'var(--space-1)',
                  marginBottom: 'var(--space-4)',
                }}>
                  Ott will rewrite your resume using the exact keywords this job is scanning for. Takes about 15 seconds.
                </p>
                {resumeError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: '13px', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                    {resumeError}
                  </p>
                )}
                <Button onClick={async () => {
                  setGeneratingResume(true);
                  setResumeError('');
                  try {
                    const data = await generateResume(result.analysis_id);
                    setResumeMd(data.resume_md);
                  } catch (err) {
                    setResumeError(err.message);
                  } finally {
                    setGeneratingResume(false);
                  }
                }}>
                  Generate Resume
                </Button>
              </Card>
            )}

            {generatingResume && (
              <Card style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)' }}>
                <Ott state="thinking" size={80} />
                <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
                  Ott is tailoring your resume...
                </p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
                  Matching keywords, reframing experience, optimizing for ATS
                </p>
              </Card>
            )}

            {resumeMd && !generatingResume && (
              <div>
                <Card style={{ marginBottom: 'var(--space-3)' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, right: 0 }}>
                      <Ott state="celebrating" size={40} />
                    </div>
                    <div style={{ lineHeight: 1.7, fontSize: '14px' }}>
                      {parseResumeMarkdown(resumeMd).map((section, i) => {
                        if (section.type === 'name') {
                          return (
                            <h2 key={i} style={{ fontSize: '20px', marginBottom: 'var(--space-3)', paddingRight: '50px' }}>
                              {section.title}
                            </h2>
                          );
                        }
                        if (section.type === 'section') {
                          return (
                            <div key={i} style={{ marginBottom: 'var(--space-4)' }}>
                              <h3 style={{
                                fontSize: '15px',
                                color: 'var(--color-accent-dark)',
                                borderBottom: '2px solid var(--color-accent)',
                                paddingBottom: 'var(--space-1)',
                                marginBottom: 'var(--space-2)',
                              }}>
                                {section.title}
                              </h3>
                              {section.content.map((line, j) => (
                                <p key={j} style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                                  {line}
                                </p>
                              ))}
                            </div>
                          );
                        }
                        if (section.type === 'subsection') {
                          return (
                            <div key={i} style={{ marginBottom: 'var(--space-3)' }}>
                              <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: 'var(--space-1)' }}>
                                {section.title}
                              </p>
                              <ul style={{ paddingLeft: 'var(--space-5)', margin: 0 }}>
                                {section.content.map((line, j) => (
                                  <li key={j} style={{
                                    color: 'var(--color-text-secondary)',
                                    marginBottom: 'var(--space-1)',
                                    listStyle: 'disc',
                                  }}>
                                    {line}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </Card>

                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <Button
                    variant="secondary"
                    full
                    onClick={() => downloadResumeAsDocx(resumeMd, result.role_name, result.company_name, (msg) => toast.error(msg))}
                  >
                    <Download size={16} /> Download as Word Doc
                  </Button>
                  <Button
                    variant="ghost"
                    full
                    onClick={() => {
                      navigator.clipboard.writeText(resumeMd);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    <Copy size={16} /> {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}

            {!result.analysis_id && (
              <Card>
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  Run a fresh analysis to generate an ATS-optimized resume
                </p>
              </Card>
            )}
          </section>

          {/* Bottom actions */}
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(result.company_name || result.role_name) && (
              <Button
                full
                onClick={() => navigate('/tracker', {
                  state: {
                    prefill: true,
                    company: result.company_name || '',
                    role: result.role_name || '',
                    notes: `Holt Score: ${result.score}%`,
                  },
                })}
              >
                <ClipboardList size={16} /> Log this application
              </Button>
            )}
            <Button
              variant="secondary"
              full
              onClick={() => navigate('/jobs')}
            >
              <Search size={16} /> Find similar jobs
            </Button>
            <Button variant="ghost" full onClick={() => navigate('/upload')}>Analyze Another Resume</Button>
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
                        analysis_id: a.id,
                        coaching_tips: a.coaching_tips,
                        job_description_text: a.job_description_text,
                      });
                      setResumeMd(a.generated_resume_md || null);
                      setResumeError('');
                      setActivePill('overview');
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
