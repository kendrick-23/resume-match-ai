import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { listAnalyses, analyzeResume } from '../services/api';
import { generateResume, parseResumeMarkdown, downloadResumeAsDocx } from '../services/resumeGenerator';
import { generateCoverLetter, downloadCoverLetterAsDocx } from '../services/coverLetterGenerator';
import { Copy, Download, ClipboardList, Search, FileText, ChevronDown, ChevronUp, X, ExternalLink, Mail } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useActionToast } from '../context/ActionToastContext';
import VerdictCard from '../components/ui/VerdictCard';
import EmptyStateResults from '../components/ui/EmptyStateResults';
import HintBubble from '../components/ui/HintBubble';
import { deriveTier, scoreColor, scoreBadgeVariant, scoreOttState, subScoreColor } from '../constants/scoring';
import { clearRecommendationsCache } from '../utils/cache';
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
  const color = scoreColor(score);

  return (
    <div className="score-ring" style={{ position: 'relative', margin: '0 auto' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
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
    <div className="results-pills-wrapper">
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
    <Card style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)', background: 'rgba(43,181,192,0.03)' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-3)',
      }}>
        <img
          src="/ott/ott-holding-rock.png"
          alt=""
          aria-hidden="true"
          style={{ width: 32, height: 32, objectFit: 'contain' }}
        />
        <p style={{ fontWeight: 700, fontSize: '14px' }}>Score Breakdown</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {SUB_SCORE_LABELS.map((s, i) => {
          const value = result[s.key] ?? 0;
          const barColor = subScoreColor(value);
          return (
            <div key={s.key}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-1)',
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
  const resumeLabel = result.resume_label;
  const resumeUsedAt = result.resume_used_at;

  // "Analyzed with" line — makes the wrong-resume unhappy path visible.
  const analyzedWithText = (() => {
    const name = resumeLabel || filename;
    if (!name) return null;
    const dateStr = resumeUsedAt
      ? new Date(resumeUsedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;
    return dateStr ? `Analyzed with: ${name} · ${dateStr}` : `Analyzed with: ${name}`;
  })();

  const postingUrl = result.posting_url;

  return (
    <Card style={{ marginBottom: 'var(--space-4)', position: 'relative' }}>
      {postingUrl && (
        <a
          href={postingUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View original job posting"
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            color: 'var(--color-accent-dark)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ExternalLink size={16} />
        </a>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <FileText size={18} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.3 }}>
            {roleName || <span style={{ color: 'var(--color-text-muted)' }}>Role not detected</span>}
          </p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '2px' }}>
            {companyName || <span style={{ color: 'var(--color-text-muted)' }}>Company not detected</span>}
          </p>
          {analyzedWithText && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
              {analyzedWithText}
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
  const showAction = useActionToast();
  const [result, setResult] = useState(location.state?.result || null);
  const [pastAnalyses, setPastAnalyses] = useState([]);
  const [loading, setLoading] = useState(!location.state?.result);

  // ATS Resume Generator state
  const [resumeMd, setResumeMd] = useState(null);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [copied, setCopied] = useState(false);

  // Cover Letter Generator state
  const [coverLetter, setCoverLetter] = useState(null);
  const [editedCoverLetter, setEditedCoverLetter] = useState('');
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState('');
  const [coverLetterCopied, setCoverLetterCopied] = useState(false);
  const [clLoadingPhase, setClLoadingPhase] = useState(0);

  // Sticky pill nav
  const [activePill, setActivePill] = useState('overview');
  // Pagination for previous analyses list
  const [historyPage, setHistoryPage] = useState(0);
  const sectionRefs = useRef({});
  // Guard against React StrictMode double-invoking the mount effect,
  // which would fire two /analyze calls and create duplicate rows.
  const analyzeCalledRef = useRef(false);

  // Just-in-time guided hint — first-time only, gated on localStorage.
  // Shows 400ms after mount so it lands AFTER the VerdictCard entrance animation.
  const [showHint, setShowHint] = useState(false);
  // Per-analysis stretch upgrade banner — dismissable, never returns for the same analysis.
  const [showStretchBanner, setShowStretchBanner] = useState(false);

  useEffect(() => {
    if (location.state?.analyzeRequest) {
      // Guard: StrictMode double-invoke would fire two /analyze calls.
      if (analyzeCalledRef.current) return;
      analyzeCalledRef.current = true;
      runJobAnalysis(location.state.analyzeRequest);
    } else if (!location.state?.result) {
      loadAnalyses();
    } else {
      // Fresh analysis just landed from Upload — celebrate it.
      showAction('analysis-complete');
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

  // Just-in-time guided hint + stretch banner — both gated on localStorage and
  // tied to the current result. Re-run whenever the user switches analyses.
  useEffect(() => {
    if (!result || typeof result.score !== 'number') {
      setShowHint(false);
      setShowStretchBanner(false);
      return;
    }

    // Hint: first time only, ever. 400ms delay so it lands after VerdictCard animates.
    let hintTimer;
    try {
      const seen = localStorage.getItem('holt_seen_verdict_explanation') === 'true';
      if (!seen) {
        hintTimer = setTimeout(() => setShowHint(true), 400);
      } else {
        setShowHint(false);
      }
    } catch {
      // localStorage unavailable (private mode etc.) — just don't show the hint
      setShowHint(false);
    }

    // Stretch banner: only when this is a stretch-tier match AND no resume
    // has been generated yet AND it hasn't been dismissed for THIS analysis.
    const tier = result.score_tier || deriveTier(result.score);
    const analysisDismissKey = `holt_dismissed_stretch_${result.analysis_id || ''}`;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(analysisDismissKey) === 'true';
    } catch {
      // ignore
    }
    setShowStretchBanner(tier === 'stretch' && !resumeMd && !dismissed);

    return () => {
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, [result, resumeMd]);

  function dismissHint() {
    setShowHint(false);
    try {
      localStorage.setItem('holt_seen_verdict_explanation', 'true');
    } catch {
      // ignore
    }
  }

  function dismissStretchBanner() {
    setShowStretchBanner(false);
    if (result?.analysis_id) {
      try {
        localStorage.setItem(`holt_dismissed_stretch_${result.analysis_id}`, 'true');
      } catch {
        // ignore
      }
    }
  }

  async function loadAnalyses() {
    const timeout = setTimeout(() => setLoading(false), 8000);
    try {
      const data = await listAnalyses();
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[0];
        setResult({
          score: latest.score,
          score_tier: latest.score_tier || null,
          strengths: typeof latest.strengths === 'string' ? JSON.parse(latest.strengths) : latest.strengths,
          gaps: typeof latest.gaps === 'string' ? JSON.parse(latest.gaps) : latest.gaps,
          recommendations: typeof latest.recommendations === 'string' ? JSON.parse(latest.recommendations) : latest.recommendations,
          summary: latest.summary,
          company_name: latest.company_name,
          role_name: latest.role_name,
          created_at: latest.created_at,
          analysis_id: latest.id,
          coaching_tips: typeof latest.coaching_tips === 'string' ? JSON.parse(latest.coaching_tips) : (latest.coaching_tips || []),
          job_description_text: latest.job_description_text,
          skills_match: latest.skills_match,
          seniority_fit: latest.seniority_fit,
          salary_alignment: latest.salary_alignment,
          growth_potential: latest.growth_potential,
          posting_url: latest.posting_url || null,
        });
        if (latest.generated_resume_md) {
          setResumeMd(latest.generated_resume_md);
        }
        if (latest.cover_letter) {
          setCoverLetter(latest.cover_letter);
          setEditedCoverLetter(latest.cover_letter);
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

  async function runJobAnalysis(req) {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 45000);
    try {
      const data = await analyzeResume(
        '',                // resume text — use default vault
        req.job_description,
        req.company_name,
        req.role_name,
        '',                // linkedin text
        null,              // resume_id — use default vault
        { priorHoltScore: req.prior_holt_score, postingUrl: req.posting_url },
      );
      clearRecommendationsCache();
      setResult({
        ...data,
        posting_url: req.posting_url,
      });
      showAction('analysis-complete');
      loadPastAnalyses();
    } catch (err) {
      toast.error(err.message || 'Analysis failed — try again.');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  function handlePillClick(id) {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Trigger the ATS resume generator and scroll the user to the resume section
   * so they see the loading state. Shared by the existing Resume-section button
   * AND the VerdictCard CTAs (stretch / weak tiers).
   */
  async function handleGenerateResume() {
    if (!result?.analysis_id || generatingResume || resumeMd) return;
    // Scroll to the resume section first so the loading state is visible
    const el = sectionRefs.current.resume;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActivePill('resume');
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
  }

  const CL_LOADING_MESSAGES = [
    "Reading the job description carefully...",
    "Finding your strongest angle...",
    "Writing your opening line...",
    "Polishing the language...",
  ];

  async function handleGenerateCoverLetter(regenerate = false) {
    if (!result?.analysis_id || generatingCoverLetter) return;
    if (!regenerate && coverLetter) return;
    setGeneratingCoverLetter(true);
    setCoverLetterError('');
    setClLoadingPhase(0);
    const interval = setInterval(() => {
      setClLoadingPhase((p) => (p + 1) % CL_LOADING_MESSAGES.length);
    }, 4000);
    try {
      const data = await generateCoverLetter(result.analysis_id, { regenerate });
      setCoverLetter(data.cover_letter);
      setEditedCoverLetter(data.cover_letter);
    } catch (err) {
      setCoverLetterError(err.message);
    } finally {
      clearInterval(interval);
      setGeneratingCoverLetter(false);
    }
  }

  function setSectionRef(id) {
    return (el) => { sectionRefs.current[id] = el; };
  }

  const hasResult = result && typeof result.score === 'number';
  const score = hasResult ? result.score : 0;
  const resolvedTier = hasResult
    ? (result.score_tier || deriveTier(score))
    : null;

  // First-time hint copy — keyed to the resolved tier.
  const HINT_COPY = {
    strong: "Green means go. Your skills translate — the ATS should see it too. Hit 'Log this application' when you're ready to submit.",
    stretch: "You've got the foundation — the language just needs translating. Generate the tailored resume and compare it side-by-side with the original.",
    weak: "It's a real shot. The gap is specific and closeable. I've listed exactly what's missing below — none of it takes years.",
    wrong_domain: "I'm not going to waste your time on this one. The gap is fundamental — not your skills, just the wrong field. Let's find one that fits.",
  };

  const strengths = hasResult ? result.strengths : [];
  const gaps = hasResult ? result.gaps : [];
  const recommendations = hasResult ? result.recommendations : [];
  const summary = hasResult ? result.summary : '';

  const ottState = loading
    ? 'thinking'
    : !hasResult
      ? 'waving'
      : scoreOttState(score);

  if (loading) {
    return (
      <ScreenWrapper>
        <h2 style={{ marginBottom: 'var(--space-6)' }}>Results</h2>
        <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
          <Ott state="thinking" size={56} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
            Loading your results...
          </p>
        </div>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <div className="dashboard-world" style={{ position: 'relative', overflow: 'hidden' }}>
      <h2 style={{ marginBottom: 'var(--space-6)' }}>Results</h2>

      {!hasResult ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
          <EmptyStateResults />
        </Card>
      ) : (
        <>
          {/* Verdict-first header — always the top of the screen */}
          <VerdictCard
            score={score}
            scoreTier={result.score_tier}
            companyName={result.company_name || ''}
            roleName={result.role_name || ''}
            postingUrl={result.posting_url || ''}
            analysisId={result.analysis_id}
            onGenerateResume={handleGenerateResume}
            onGenerateCoverLetter={() => {
              const el = document.getElementById('cover-letter-section');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setActivePill('resume');
            }}
          />

          {/* First-time guided hint — appears once, ever, then never returns */}
          {showHint && resolvedTier && HINT_COPY[resolvedTier] && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                marginBottom: 'var(--space-4)',
                background: 'var(--color-accent-light)',
                border: '1.5px solid var(--color-accent)',
                borderRadius: 'var(--radius-md)',
                position: 'relative',
                animation: 'fade-up 280ms ease-out both',
              }}
            >
              <Ott state="encouraging" size={32} />
              <p style={{
                flex: 1,
                color: 'var(--color-accent-dark)',
                fontSize: '13px',
                lineHeight: 1.5,
                fontWeight: 600,
                paddingRight: 'var(--space-4)',
              }}>
                {HINT_COPY[resolvedTier]}
              </p>
              <button
                onClick={dismissHint}
                aria-label="Dismiss hint"
                style={{
                  position: 'absolute',
                  top: 'var(--space-2)',
                  right: 'var(--space-2)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-accent-dark)',
                  padding: 'var(--space-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Stretch upgrade banner — only on stretch tier without a generated resume */}
          {showStretchBanner && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                marginBottom: 'var(--space-4)',
                background: 'var(--color-stretch-light)',
                border: '1.5px solid var(--color-stretch)',
                borderRadius: 'var(--radius-md)',
                position: 'relative',
              }}
            >
              <div style={{ flex: 1, paddingRight: 'var(--space-4)' }}>
                <p style={{
                  color: 'var(--color-text)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  fontWeight: 700,
                }}>
                  Tailoring your resume could move this to Apply Now.
                </p>
                <button
                  onClick={() => { dismissStretchBanner(); handleGenerateResume(); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-stretch-dark)',
                    fontFamily: "'Nunito', sans-serif",
                    fontWeight: 800,
                    fontSize: '13px',
                    padding: 0,
                    marginTop: 'var(--space-1)',
                    textDecoration: 'underline',
                  }}
                >
                  Generate tailored resume →
                </button>
              </div>
              <button
                onClick={dismissStretchBanner}
                aria-label="Dismiss banner"
                style={{
                  position: 'absolute',
                  top: 'var(--space-2)',
                  right: 'var(--space-2)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-stretch-dark)',
                  padding: 'var(--space-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Job context card */}
          <JobContextCard result={result} />

          {/* Legacy score card — kept as a supporting summary (no longer the lead) */}
          <Card style={{ textAlign: 'center', marginBottom: 0, padding: 'var(--space-5)' }}>
            <Ott state={ottState} size={56} />
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

          {/* JIT hint — shown once per session, guides user to Ott's Take */}
          <HintBubble
            storageKey="holt_hint_results"
            ottImage="/ott/ott-encouraging.png"
            text="Scroll down to Ott's Take for my honest coaching notes — and tap Resume to generate a tailored version in seconds."
          />

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
                {gaps.map((g, i) => {
                  // Backwards-compat: legacy analyses store gaps as plain strings;
                  // new analyses store them as { gap, effort, honest } objects.
                  const gapText = typeof g === 'string' ? g : (g?.gap || '');
                  const effort = typeof g === 'object' ? g?.effort : null;
                  const EFFORT_LABEL = {
                    reframe: 'Already have it — just reframe',
                    easy: 'Quick to close',
                    months: 'Months of effort',
                    years: 'Years / major detour',
                  };
                  return (
                    <Card key={i}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                        <Badge variant="danger">Gap</Badge>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: 'var(--color-text-secondary)' }}>{gapText}</p>
                          {effort && EFFORT_LABEL[effort] && (
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600, marginTop: 'var(--space-1)' }}>
                              {EFFORT_LABEL[effort]}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
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
                <Ott state="encouraging" size={32} />
                <p style={{ fontWeight: 700, color: 'var(--color-accent-dark)' }}>
                  {resolvedTier === 'strong' ? "You're in great shape!" : resolvedTier === 'stretch' ? "Good foundation — let's sharpen it." : "Don't worry — here's your game plan."}
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
                  {resolvedTier === 'strong'
                    ? "Your resume is a strong match. Focus on tailoring your cover letter and preparing for behavioral interviews."
                    : resolvedTier === 'stretch'
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
                <Ott state="encouraging" size={56} />
                <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
                  Get Your ATS-Ready Resume
                </p>
                <p style={{
                  color: 'var(--color-text-muted)',
                  fontSize: '13px',
                  marginTop: 'var(--space-1)',
                  marginBottom: 'var(--space-4)',
                }}>
                  I'll rewrite your resume using the exact keywords this job is scanning for. Takes about 15 seconds.
                </p>
                {resumeError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: '13px', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                    {resumeError}
                  </p>
                )}
                <Button onClick={handleGenerateResume}>
                  Generate Resume
                </Button>
              </Card>
            )}

            {generatingResume && (
              <Card style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)' }}>
                <Ott state="thinking" size={56} />
                <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
                  Tailoring your resume...
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
                      <Ott state="celebrating" size={32} />
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

          {/* === COVER LETTER SECTION === */}
          {result.analysis_id && (
            <div id="cover-letter-section" style={{ marginTop: 'var(--space-6)', scrollMarginTop: '120px' }}>
              <h3 className="results-section__title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Mail size={18} style={{ color: 'var(--color-accent)' }} /> Cover Letter
              </h3>

              {/* Not yet generated */}
              {!coverLetter && !generatingCoverLetter && (
                <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
                  <Ott state="encouraging" size={56} />
                  <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
                    Get Your Tailored Cover Letter
                  </p>
                  <p style={{
                    color: 'var(--color-text-muted)',
                    fontSize: '13px',
                    marginTop: 'var(--space-1)',
                    marginBottom: 'var(--space-4)',
                  }}>
                    I'll write it using your resume and exactly what this role is looking for. Takes about 15 seconds.
                  </p>
                  {coverLetterError && (
                    <p style={{ color: 'var(--color-danger)', fontSize: '13px', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                      {coverLetterError}
                    </p>
                  )}
                  <Button onClick={() => handleGenerateCoverLetter()}>
                    Generate Cover Letter
                  </Button>
                </Card>
              )}

              {/* Loading */}
              {generatingCoverLetter && (
                <Card style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)' }}>
                  <div className="ott-thinking-anim">
                    <Ott state="thinking" size={56} />
                  </div>
                  <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
                    {CL_LOADING_MESSAGES[clLoadingPhase]}
                  </p>
                </Card>
              )}

              {/* Generated */}
              {coverLetter && !generatingCoverLetter && (
                <div>
                  {/* Ott personalization nudge */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    marginBottom: 'var(--space-3)',
                  }}>
                    <img src="/ott/ott-coaching.png" alt="Ott coaching" style={{ width: '32px', flexShrink: 0 }} />
                    <p style={{
                      fontSize: '13px',
                      color: 'var(--color-accent-dark)',
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}>
                      Add one specific detail only you would know — a name, a number, a moment. It makes this yours.
                    </p>
                  </div>

                  <Card style={{ marginBottom: 'var(--space-3)' }}>
                    <textarea
                      value={editedCoverLetter}
                      onChange={(e) => setEditedCoverLetter(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '320px',
                        lineHeight: 1.8,
                        fontSize: '14px',
                        color: 'var(--color-text)',
                        fontFamily: "'Nunito', sans-serif",
                        background: 'var(--color-bg)',
                        border: 'none',
                        borderLeft: '3px solid var(--color-accent)',
                        paddingLeft: 'var(--space-4)',
                        paddingTop: 'var(--space-3)',
                        paddingBottom: 'var(--space-3)',
                        paddingRight: 'var(--space-2)',
                        resize: 'vertical',
                        outline: 'none',
                        borderRadius: 0,
                        boxSizing: 'border-box',
                      }}
                    />
                    <p style={{
                      color: 'var(--color-text-muted)',
                      fontSize: '13px',
                      marginTop: 'var(--space-2)',
                      textAlign: 'right',
                    }}>
                      {editedCoverLetter.trim().split(/\s+/).filter(Boolean).length} words
                    </p>
                  </Card>

                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <Button
                      full
                      onClick={() => downloadCoverLetterAsDocx(editedCoverLetter, result.role_name, result.company_name, (msg) => toast.error(msg))}
                    >
                      <Download size={16} /> Download as Word Doc
                    </Button>
                    <Button
                      variant="ghost"
                      full
                      onClick={() => {
                        navigator.clipboard.writeText(editedCoverLetter);
                        setCoverLetterCopied(true);
                        setTimeout(() => setCoverLetterCopied(false), 2000);
                      }}
                    >
                      <Copy size={16} /> {coverLetterCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>

                  <div style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
                    <button
                      onClick={() => {
                        setCoverLetter(null);
                        setEditedCoverLetter('');
                        handleGenerateCoverLetter(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-accent)',
                        fontFamily: "'Nunito', sans-serif",
                        fontWeight: 600,
                        fontSize: '13px',
                        padding: 'var(--space-1) var(--space-2)',
                      }}
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                    url: result.posting_url || '',
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
                {pastAnalyses.slice(historyPage * 5, historyPage * 5 + 5).map((a) => (
                  <Card
                    key={a.id}
                    interactive
                    onClick={() => {
                      setResult({
                        score: a.score,
                        score_tier: a.score_tier || null,
                        strengths: typeof a.strengths === 'string' ? JSON.parse(a.strengths) : a.strengths,
                        gaps: typeof a.gaps === 'string' ? JSON.parse(a.gaps) : a.gaps,
                        recommendations: typeof a.recommendations === 'string' ? JSON.parse(a.recommendations) : a.recommendations,
                        summary: a.summary,
                        company_name: a.company_name,
                        role_name: a.role_name,
                        created_at: a.created_at,
                        analysis_id: a.id,
                        coaching_tips: typeof a.coaching_tips === 'string' ? JSON.parse(a.coaching_tips) : (a.coaching_tips || []),
                        job_description_text: a.job_description_text,
                        posting_url: a.posting_url || null,
                      });
                      setResumeMd(a.generated_resume_md || null);
                      setResumeError('');
                      setCoverLetter(a.cover_letter || null);
                      setEditedCoverLetter(a.cover_letter || '');
                      setCoverLetterError('');
                      setActivePill('overview');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '14px' }}>
                          {a.role_name || a.company_name || 'Analysis'}
                        </p>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                          {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={scoreBadgeVariant(a.score)}>
                        {a.score}%
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
              {pastAnalyses.length > 5 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  marginTop: 'var(--space-3)',
                  fontSize: '13px',
                }}>
                  <button
                    disabled={historyPage === 0}
                    onClick={() => setHistoryPage((p) => p - 1)}
                    style={{
                      background: 'none', border: 'none', cursor: historyPage === 0 ? 'default' : 'pointer',
                      color: historyPage === 0 ? 'var(--color-text-muted)' : 'var(--color-accent)',
                      fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: '13px', padding: 'var(--space-1) var(--space-2)',
                    }}
                  >
                    Prev
                  </button>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {historyPage + 1} / {Math.ceil(pastAnalyses.length / 5)}
                  </span>
                  <button
                    disabled={historyPage >= Math.ceil(pastAnalyses.length / 5) - 1}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    style={{
                      background: 'none', border: 'none',
                      cursor: historyPage >= Math.ceil(pastAnalyses.length / 5) - 1 ? 'default' : 'pointer',
                      color: historyPage >= Math.ceil(pastAnalyses.length / 5) - 1 ? 'var(--color-text-muted)' : 'var(--color-accent)',
                      fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: '13px', padding: 'var(--space-1) var(--space-2)',
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      </div>
    </ScreenWrapper>
  );
}
