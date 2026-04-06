import { useState, useEffect } from 'react';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { searchJobs, searchAdzunaJobs, createApplication, listAnalyses, getProfile } from '../services/api';
import { MapPin, Clock, DollarSign, ExternalLink, Bookmark, Building2, Sparkles, ChevronDown, ChevronUp, Target } from 'lucide-react';
import EmptyStateJobs from '../components/ui/EmptyStateJobs';
import { useToast } from '../context/ToastContext';
import './Jobs.css';

export default function Jobs() {
  const toast = useToast();
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState(new Set());
  const [remoteOnly, setRemoteOnly] = useState(false);

  // Private sector (Adzuna)
  const [showPrivate, setShowPrivate] = useState(false);
  const [adzunaJobs, setAdzunaJobs] = useState([]);
  const [adzunaTotal, setAdzunaTotal] = useState(0);
  const [adzunaLoading, setAdzunaLoading] = useState(false);
  const [adzunaSearched, setAdzunaSearched] = useState(false);

  // Smart feed state
  const [recommended, setRecommended] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [hasAnalysis, setHasAnalysis] = useState(false);

  // Holt score data
  const [analysisKeywords, setAnalysisKeywords] = useState([]);
  const [analysisGaps, setAnalysisGaps] = useState([]);
  const [salaryTarget, setSalaryTarget] = useState({ min: null, max: null });
  const [analysisRoleName, setAnalysisRoleName] = useState('');
  const [userLocation, setUserLocation] = useState('');

  useEffect(() => {
    loadRecommendations();
  }, []);

  async function loadRecommendations() {
    try {
      const analyses = await listAnalyses();
      if (!analyses || analyses.length === 0) {
        setHasAnalysis(false);
        setRecLoading(false);
        return;
      }

      setHasAnalysis(true);
      const latest = analyses[0];

      const roleName = latest.role_name || '';
      setAnalysisRoleName(roleName);
      const strengths = typeof latest.strengths === 'string'
        ? JSON.parse(latest.strengths)
        : latest.strengths || [];
      const gaps = typeof latest.gaps === 'string'
        ? JSON.parse(latest.gaps)
        : latest.gaps || [];

      setAnalysisGaps(gaps);

      const allText = [...strengths, ...gaps, roleName].join(' ').toLowerCase();
      const words = allText.split(/[\s,;.()]+/).filter((w) => w.length > 3);
      const uniqueWords = [...new Set(words)];
      setAnalysisKeywords(uniqueWords);

      const searchKeyword = roleName
        ? roleName.split(/\s+/).slice(0, 3).join(' ')
        : 'analyst';

      let profileLocation = '';
      try {
        const profile = await getProfile();
        profileLocation = profile.location || '';
        setUserLocation(profileLocation);
        setSalaryTarget({
          min: profile.target_salary_min || null,
          max: profile.target_salary_max || null,
        });
      } catch {
        // No profile yet
      }

      try {
        const data = await searchJobs({
          keyword: searchKeyword,
          location: profileLocation || undefined,
          page: 1,
        });
        setRecommended(data.jobs?.slice(0, 5) || []);
      } catch (err) {
        console.warn('[Jobs] Recommendation search failed:', err.message);
      }
    } catch (err) {
      console.warn('[Jobs] Failed to load analyses:', err.message);
    } finally {
      setRecLoading(false);
    }
  }

  async function handleSearch(e) {
    e?.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setError('');
    setPage(1);

    try {
      const data = await searchJobs({
        keyword: keyword.trim(),
        location: location.trim() || undefined,
        remote: remoteOnly || undefined,
        page: 1,
      });
      setJobs(data.jobs);
      setTotal(data.total);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }

    // Also search Adzuna if private sector is toggled on
    if (showPrivate) {
      loadAdzuna(keyword.trim(), location.trim());
    }
  }

  async function loadAdzuna(kw, loc) {
    const searchKw = kw || analysisRoleName || keyword.trim();
    if (!searchKw) return;

    setAdzunaLoading(true);
    try {
      const data = await searchAdzunaJobs({
        keyword: searchKw,
        location: loc || userLocation || undefined,
        page: 1,
      });
      setAdzunaJobs(data.jobs || []);
      setAdzunaTotal(data.total || 0);
      setAdzunaSearched(true);
    } catch {
      setAdzunaJobs([]);
      setAdzunaTotal(0);
      setAdzunaSearched(true);
    } finally {
      setAdzunaLoading(false);
    }
  }

  // When toggling private sector on, auto-search if we have keywords
  function handleTogglePrivate() {
    const next = !showPrivate;
    setShowPrivate(next);
    if (next && !adzunaSearched) {
      const kw = keyword.trim() || analysisRoleName;
      const loc = location.trim() || userLocation;
      if (kw) loadAdzuna(kw, loc);
    }
  }

  async function handleLoadMore() {
    const nextPage = page + 1;
    setLoading(true);
    try {
      const data = await searchJobs({
        keyword: keyword.trim(),
        location: location.trim() || undefined,
        remote: remoteOnly || undefined,
        page: nextPage,
      });
      setJobs((prev) => [...prev, ...data.jobs]);
      setPage(nextPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(job) {
    if (savedIds.has(job.id)) return;
    setSavedIds((prev) => new Set(prev).add(job.id));
    try {
      await createApplication({
        company: job.department || job.company,
        role: job.title,
        status: 'Saved',
        url: job.url || job.apply_url,
        notes: `Source: ${job.source === 'adzuna' ? 'Adzuna' : 'USAJobs'} | Location: ${job.location}`,
      });
      toast.success('Saved to your tracker!');
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
      toast.error("Couldn't save — tap to retry", { onTap: () => handleSave(job) });
    }
  }

  function computeHoltScore(job) {
    if (!hasAnalysis || analysisKeywords.length === 0) return null;

    // Include description for Adzuna jobs (they have richer text)
    const jobText = `${job.title} ${job.department || ''} ${job.company || ''} ${job.description || ''}`.toLowerCase();
    const matches = analysisKeywords.filter((kw) => jobText.includes(kw));
    const keywordScore = Math.min(100, Math.round((matches.length / Math.min(analysisKeywords.length, 10)) * 100));

    let salaryScore = 50;
    if (salaryTarget.min && job.salary_min && job.salary_max) {
      const targetMax = salaryTarget.max || salaryTarget.min * 1.5;
      if (job.salary_max >= salaryTarget.min && job.salary_min <= targetMax) {
        salaryScore = 100;
      } else if (job.salary_max < salaryTarget.min) {
        salaryScore = 0;
      }
    }

    let scheduleScore = 50;
    const titleLower = job.title.toLowerCase();
    if (titleLower.includes('shift') || titleLower.includes('weekend') || titleLower.includes('night')) {
      scheduleScore = 0;
    } else if (titleLower.includes('manager') || titleLower.includes('specialist') || titleLower.includes('analyst') || titleLower.includes('program')) {
      scheduleScore = 100;
    }

    return Math.round(keywordScore * 0.6 + salaryScore * 0.25 + scheduleScore * 0.15);
  }

  function formatSalary(min, max) {
    if (!min && !max) return null;
    const fmt = (n) => '$' + n.toLocaleString();
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    return `Up to ${fmt(max)}`;
  }

  // Compute Within Reach jobs from ALL sources
  function getWithinReachJobs(jobList) {
    return jobList
      .map((job) => ({ ...job, _holtScore: computeHoltScore(job) }))
      .filter((job) => job._holtScore != null && job._holtScore >= 50 && job._holtScore <= 69)
      .sort((a, b) => b._holtScore - a._holtScore);
  }

  const allVisibleJobs = [...(searched ? jobs : recommended), ...(showPrivate ? adzunaJobs : [])];
  const withinReachJobs = getWithinReachJobs(allVisibleJobs);

  return (
    <ScreenWrapper screenName="Jobs">
      <h2 style={{ marginBottom: 'var(--space-5)' }}>Find Jobs</h2>

      {/* Recommended for You section */}
      {!recLoading && hasAnalysis && recommended.length > 0 && !searched && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}>
            <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
            Recommended for You
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {recommended.map((job) => (
              <JobCard
                key={'rec-' + job.id + job.title}
                job={job}
                savedIds={savedIds}
                onSave={handleSave}
                formatSalary={formatSalary}
                recommended
                holtScore={computeHoltScore(job)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Within Reach section — merges all sources */}
      {withinReachJobs.length > 0 && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-2)',
          }}>
            <Ott state="encouraging" size={48} />
            <div>
              <h3 style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}>
                <Target size={18} style={{ color: 'var(--color-warning)' }} />
                Within Reach
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '2px' }}>
                These roles are closer than you think. Close these gaps to hit 70%+
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {withinReachJobs.map((job) => (
              <WithinReachCard
                key={'wr-' + job.id + job.title}
                job={job}
                score={job._holtScore}
                gaps={analysisGaps}
                savedIds={savedIds}
                onSave={handleSave}
                formatSalary={formatSalary}
              />
            ))}
          </div>
        </div>
      )}

      {/* No analysis — prompt to analyze first */}
      {!recLoading && !hasAnalysis && !searched && (
        <Card style={{
          textAlign: 'center',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
          background: 'var(--color-accent-light)',
          borderColor: 'var(--color-accent)',
        }}>
          <EmptyStateJobs size={160} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)', fontSize: '14px' }}>
            Analyze your resume first
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
            Then Ott will find your best matches
          </p>
        </Card>
      )}

      {/* Search form */}
      <form onSubmit={handleSearch} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-5)',
      }}>
        <Input
          placeholder="Job title, keywords..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Input
          placeholder="Location (city, state, or remote)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        {/* Filter chips */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={() => setRemoteOnly(!remoteOnly)}
            className={`jobs-filter-chip ${remoteOnly ? 'jobs-filter-chip--active' : ''}`}
          >
            Remote only
          </button>
          <button
            type="button"
            onClick={handleTogglePrivate}
            className={`jobs-filter-chip jobs-filter-chip--private ${showPrivate ? 'jobs-filter-chip--active jobs-filter-chip--private-active' : ''}`}
          >
            Private sector
          </button>
        </div>

        <Button full disabled={loading || !keyword.trim()}>
          {loading && !jobs.length ? 'Searching...' : 'Search'}
        </Button>
      </form>

      {/* Error */}
      {error && (
        <Card style={{ background: 'var(--color-danger-light)', marginBottom: 'var(--space-4)' }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{error}</p>
        </Card>
      )}

      {/* Empty state — only show if no recommendations either */}
      {!searched && !loading && !hasAnalysis && recommended.length === 0 && !recLoading && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-5)' }}>
          <Ott state="waiting" size={80} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            Search for jobs to get started
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Results from USAJobs federal job listings
          </p>
        </Card>
      )}

      {/* No results */}
      {searched && !loading && jobs.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)' }}>
          <Ott state="coaching" size={80} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            No federal jobs found
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Try different keywords or a broader location
          </p>
        </Card>
      )}

      {/* Federal results header */}
      {searched && jobs.length > 0 && (
        <p style={{
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          fontSize: '13px',
          marginBottom: 'var(--space-3)',
        }}>
          {total.toLocaleString()} federal jobs found
        </p>
      )}

      {/* Federal job cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {jobs.map((job) => (
          <JobCard
            key={job.id + job.title}
            job={job}
            savedIds={savedIds}
            onSave={handleSave}
            formatSalary={formatSalary}
            holtScore={computeHoltScore(job)}
          />
        ))}
      </div>

      {/* Load more federal */}
      {searched && jobs.length > 0 && jobs.length < total && (
        <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
          <Button variant="secondary" onClick={handleLoadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load more jobs'}
          </Button>
        </div>
      )}

      {/* Private sector results */}
      {showPrivate && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}>
            <Building2 size={18} style={{ color: 'var(--color-info)' }} />
            Private Sector
          </h3>

          {adzunaLoading && (
            <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
              <Ott state="thinking" size={60} />
              <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)', fontSize: '13px' }}>
                Searching private sector jobs...
              </p>
            </Card>
          )}

          {!adzunaLoading && adzunaSearched && adzunaJobs.length === 0 && (
            <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
              <Ott state="coaching" size={60} />
              <p style={{ fontWeight: 700, marginTop: 'var(--space-2)' }}>
                No private sector results found
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
                Try different keywords
              </p>
            </Card>
          )}

          {!adzunaLoading && adzunaJobs.length > 0 && (
            <>
              <p style={{
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                fontSize: '13px',
                marginBottom: 'var(--space-3)',
              }}>
                {adzunaTotal.toLocaleString()} private sector jobs found
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {adzunaJobs.map((job) => (
                  <JobCard
                    key={job.id + job.title}
                    job={job}
                    savedIds={savedIds}
                    onSave={handleSave}
                    formatSalary={formatSalary}
                    holtScore={computeHoltScore(job)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </ScreenWrapper>
  );
}


function SourceBadge({ source }) {
  if (source === 'adzuna') {
    return <Badge variant="info" className="source-badge--private">Private</Badge>;
  }
  return <Badge variant="info">Federal</Badge>;
}


function JobCard({ job, savedIds, onSave, formatSalary, recommended = false, holtScore }) {
  return (
    <Card>
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-2)',
      }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 'var(--space-2)' }}>
          <p style={{ fontWeight: 700, lineHeight: 1.3 }}>{job.title}</p>
          <p style={{
            color: 'var(--color-text-secondary)',
            fontSize: '13px',
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}>
            <Building2 size={13} />
            {job.department || job.company}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
          {recommended && <Badge variant="success">Recommended</Badge>}
          {holtScore != null && (
            <Badge variant={holtScore >= 70 ? 'success' : holtScore >= 40 ? 'warning' : 'danger'}>
              {holtScore}% Holt
            </Badge>
          )}
          <SourceBadge source={job.source} />
        </div>
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        color: 'var(--color-text-muted)',
        fontSize: '13px',
        marginBottom: 'var(--space-3)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <MapPin size={14} /> {job.location}
        </span>
        {job.posted && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <Clock size={14} /> {job.posted}
          </span>
        )}
        {formatSalary(job.salary_min, job.salary_max) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <DollarSign size={14} /> {formatSalary(job.salary_min, job.salary_max)}
          </span>
        )}
      </div>

      {/* Closing date */}
      {job.closing && (
        <p style={{
          fontSize: '12px',
          color: 'var(--color-warning)',
          fontWeight: 600,
          marginBottom: 'var(--space-3)',
        }}>
          Closes {job.closing}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button
          variant="ghost"
          style={{ padding: '8px 14px', minHeight: '36px', fontSize: '13px' }}
          onClick={() => onSave(job)}
          disabled={savedIds.has(job.id)}
        >
          <Bookmark size={14} style={savedIds.has(job.id) ? { fill: 'var(--color-accent)' } : {}} />
          {savedIds.has(job.id) ? 'Saved' : 'Save'}
        </Button>
        {(job.apply_url || job.url) && (
          <a
            href={job.apply_url || job.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: "'Nunito', sans-serif",
              color: 'var(--color-accent)',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> View posting
          </a>
        )}
      </div>
    </Card>
  );
}


function WithinReachCard({ job, score, gaps, savedIds, onSave, formatSalary }) {
  const [expanded, setExpanded] = useState(false);
  const delta = 70 - score;

  const topGaps = gaps.slice(0, 3);

  const coachLabel = delta <= 5
    ? "You're almost there"
    : delta <= 12
      ? 'One skill away'
      : 'Strong foundation';

  return (
    <Card className="within-reach-card">
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-2)',
      }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 'var(--space-2)' }}>
          <p style={{ fontWeight: 700, lineHeight: 1.3 }}>{job.title}</p>
          <p style={{
            color: 'var(--color-text-secondary)',
            fontSize: '13px',
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}>
            <Building2 size={13} />
            {job.department || job.company}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
          <Badge variant="warning">{score}% Holt</Badge>
          <SourceBadge source={job.source} />
        </div>
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        color: 'var(--color-text-muted)',
        fontSize: '13px',
        marginBottom: 'var(--space-3)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <MapPin size={14} /> {job.location}
        </span>
        {formatSalary(job.salary_min, job.salary_max) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <DollarSign size={14} /> {formatSalary(job.salary_min, job.salary_max)}
          </span>
        )}
      </div>

      {/* Progress bar + gap delta */}
      <div className="within-reach-progress">
        <div className="within-reach-progress__bar">
          <div
            className="within-reach-progress__fill"
            style={{ width: `${score}%` }}
          />
          <div
            className="within-reach-progress__target"
            style={{ left: '70%' }}
          />
        </div>
        <div className="within-reach-progress__labels">
          <span className="within-reach-progress__score">{score}%</span>
          <span className="within-reach-progress__delta">+{delta}% to 70%</span>
        </div>
      </div>

      {/* Coaching label */}
      <p style={{
        fontWeight: 600,
        fontSize: '13px',
        color: 'var(--color-warning)',
        marginBottom: 'var(--space-2)',
      }}>
        {coachLabel}
      </p>

      {/* Gap hints */}
      {topGaps.length > 0 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {topGaps.map((gap, i) => (
            <p key={i} style={{
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              paddingLeft: 'var(--space-3)',
              borderLeft: '2px solid var(--color-warning)',
              marginBottom: i < topGaps.length - 1 ? 'var(--space-2)' : 0,
            }}>
              {gap}
            </p>
          ))}
        </div>
      )}

      {/* Expand toggle for more detail */}
      {gaps.length > 3 && (
        <button
          className="within-reach-expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Show less' : 'How to get there \u2192'}
        </button>
      )}

      {expanded && gaps.length > 3 && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          {gaps.slice(3).map((gap, i) => (
            <p key={i} style={{
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              paddingLeft: 'var(--space-3)',
              borderLeft: '2px solid var(--color-warning)',
              marginBottom: 'var(--space-2)',
            }}>
              {gap}
            </p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <Button
          variant="ghost"
          style={{ padding: '8px 14px', minHeight: '36px', fontSize: '13px' }}
          onClick={() => onSave(job)}
          disabled={savedIds.has(job.id)}
        >
          <Bookmark size={14} style={savedIds.has(job.id) ? { fill: 'var(--color-accent)' } : {}} />
          {savedIds.has(job.id) ? 'Saved' : 'Save'}
        </Button>
        {(job.apply_url || job.url) && (
          <a
            href={job.apply_url || job.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: "'Nunito', sans-serif",
              color: 'var(--color-accent)',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> View posting
          </a>
        )}
      </div>
    </Card>
  );
}
