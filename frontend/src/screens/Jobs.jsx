import { useState, useEffect } from 'react';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { searchJobs, createApplication, listAnalyses, getProfile } from '../services/api';
import { MapPin, Clock, DollarSign, ExternalLink, Bookmark, Building2, Sparkles } from 'lucide-react';

export default function Jobs() {
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

  // Smart feed state
  const [recommended, setRecommended] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [hasAnalysis, setHasAnalysis] = useState(false);

  // Holt score data
  const [analysisKeywords, setAnalysisKeywords] = useState([]);
  const [salaryTarget, setSalaryTarget] = useState({ min: null, max: null });

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

      // Build search keywords from analysis
      const roleName = latest.role_name || '';
      const strengths = typeof latest.strengths === 'string'
        ? JSON.parse(latest.strengths)
        : latest.strengths || [];
      const gaps = typeof latest.gaps === 'string'
        ? JSON.parse(latest.gaps)
        : latest.gaps || [];

      // Extract keywords for Holt score matching
      const allText = [...strengths, ...gaps, roleName].join(' ').toLowerCase();
      const words = allText.split(/[\s,;.()]+/).filter((w) => w.length > 3);
      const uniqueWords = [...new Set(words)];
      setAnalysisKeywords(uniqueWords);

      // Extract meaningful keywords from strengths (first 3 words of each)
      const strengthKeywords = strengths
        .slice(0, 3)
        .map((s) => s.split(/\s+/).slice(0, 3).join(' '))
        .join(' ');

      const searchKeyword = roleName || strengthKeywords || 'analyst';

      // Get user location and salary from profile
      let userLocation = '';
      try {
        const profile = await getProfile();
        userLocation = profile.location || '';
        setSalaryTarget({
          min: profile.target_salary_min || null,
          max: profile.target_salary_max || null,
        });
      } catch {
        // No profile yet
      }

      const data = await searchJobs({
        keyword: searchKeyword,
        location: userLocation || undefined,
        page: 1,
      });

      setRecommended(data.jobs?.slice(0, 5) || []);
    } catch {
      // Silently fail — recommendations are a nice-to-have
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
    try {
      await createApplication({
        company: job.department || job.company,
        role: job.title,
        status: 'Saved',
        url: job.url || job.apply_url,
        notes: `Source: USAJobs | Location: ${job.location}`,
      });
      setSavedIds((prev) => new Set(prev).add(job.id));
    } catch {
      // Silently fail
    }
  }

  function computeHoltScore(job) {
    if (!hasAnalysis || analysisKeywords.length === 0) return null;

    // 1. Keyword match (60%)
    const jobText = `${job.title} ${job.department || ''} ${job.company || ''}`.toLowerCase();
    const matches = analysisKeywords.filter((kw) => jobText.includes(kw));
    const keywordScore = Math.min(100, Math.round((matches.length / Math.min(analysisKeywords.length, 10)) * 100));

    // 2. Salary fit (25%)
    let salaryScore = 50; // default unknown
    if (salaryTarget.min && job.salary_min && job.salary_max) {
      // Check if job salary range overlaps with target
      const targetMax = salaryTarget.max || salaryTarget.min * 1.5;
      if (job.salary_max >= salaryTarget.min && job.salary_min <= targetMax) {
        salaryScore = 100;
      } else if (job.salary_max < salaryTarget.min) {
        salaryScore = 0;
      }
    }

    // 3. Schedule fit (15%) — USAJobs titles don't usually indicate shift work
    // Default to 50 (unknown) unless title suggests shift/weekend
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

  return (
    <ScreenWrapper>
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

      {/* No analysis — prompt to analyze first */}
      {!recLoading && !hasAnalysis && !searched && (
        <Card style={{
          textAlign: 'center',
          padding: 'var(--space-6) var(--space-5)',
          marginBottom: 'var(--space-5)',
          background: 'var(--color-accent-light)',
          borderColor: 'var(--color-accent)',
        }}>
          <Ott state="waiting" size={60} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)', fontSize: '14px' }}>
            Analyze your resume first to get personalized job matches
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
            We'll recommend jobs based on your skills and experience
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
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${remoteOnly ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: remoteOnly ? 'var(--color-accent-light)' : 'transparent',
              color: remoteOnly ? 'var(--color-accent-dark)' : 'var(--color-text-secondary)',
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Remote only
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
            No jobs found
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Try different keywords or a broader location
          </p>
        </Card>
      )}

      {/* Results header */}
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

      {/* Job cards */}
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

      {/* Load more */}
      {searched && jobs.length > 0 && jobs.length < total && (
        <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
          <Button variant="secondary" onClick={handleLoadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load more jobs'}
          </Button>
        </div>
      )}
    </ScreenWrapper>
  );
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
          {!recommended && holtScore == null && <Badge variant="info">Federal</Badge>}
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
