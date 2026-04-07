import { useState, useEffect } from 'react';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { searchJobs, searchAdzunaJobs, searchAggregatedJobs, createApplication, listAnalyses, getProfile } from '../services/api';
import { MapPin, Clock, DollarSign, ExternalLink, Bookmark, Building2, Sparkles, ChevronDown, ChevronUp, Target, SlidersHorizontal, Star, AlertTriangle } from 'lucide-react';
import EmptyStateJobs from '../components/ui/EmptyStateJobs';
import { useToast } from '../context/ToastContext';
import './Jobs.css';

const STORAGE_KEY = 'holt_jobs_search';

function loadSavedSearch() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSearch(data) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function clearJobsSearch() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function Jobs() {
  const toast = useToast();

  const saved = loadSavedSearch();
  const [keyword, setKeyword] = useState(saved?.keyword || '');
  const [location, setLocation] = useState(saved?.location || '');
  const [remoteOnly, setRemoteOnly] = useState(saved?.remoteOnly || false);
  const [savedIds, setSavedIds] = useState(new Set());

  // Tab state
  const [activeTab, setActiveTab] = useState(saved?.activeTab || 'private');

  // Federal (USAJobs) state
  const [fedJobs, setFedJobs] = useState([]);
  const [fedTotal, setFedTotal] = useState(0);
  const [fedPage, setFedPage] = useState(1);
  const [fedLoading, setFedLoading] = useState(false);
  const [fedSearched, setFedSearched] = useState(false);
  const [fedError, setFedError] = useState('');

  // Private (Adzuna) state
  const [pvtJobs, setPvtJobs] = useState([]);
  const [pvtTotal, setPvtTotal] = useState(0);
  const [pvtPage, setPvtPage] = useState(1);
  const [pvtLoading, setPvtLoading] = useState(false);
  const [pvtSearched, setPvtSearched] = useState(false);

  // Smart feed state
  const [recommended, setRecommended] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);

  // Holt score data
  const [analysisKeywords, setAnalysisKeywords] = useState([]);
  const [analysisGaps, setAnalysisGaps] = useState([]);
  const [salaryTarget, setSalaryTarget] = useState({ min: null, max: null });
  const [analysisRoleName, setAnalysisRoleName] = useState('');
  const [userLocation, setUserLocation] = useState('');
  const [targetCompanies, setTargetCompanies] = useState([]);

  // Sort and filter
  const [sortBy, setSortBy] = useState('score');
  const [showFilters, setShowFilters] = useState(false);
  const [filterPostedWithin, setFilterPostedWithin] = useState('any');
  const [filterDegree, setFilterDegree] = useState('all');
  const [showDealbreakers, setShowDealbreakers] = useState(true);

  const [restoredSearch, setRestoredSearch] = useState(!!saved?.keyword);
  const [profileMatchLoading, setProfileMatchLoading] = useState(false);

  useEffect(() => {
    loadRecommendations();
    // Auto-trigger search if restoring from sessionStorage
    if (saved?.keyword) {
      searchFederal(saved.keyword, saved.location || '', 1);
      searchPrivate(saved.keyword, saved.location || '');
      setRestoredSearch(false);
    }
  }, []);

  async function loadRecommendations() {
    setRecError(false);
    try {
      // Load profile first for target roles + location
      let profileTargetRoles = '';
      let profileLocation = '';
      try {
        const profile = await getProfile();
        profileTargetRoles = profile.target_roles || '';
        profileLocation = profile.location || '';
        setUserLocation(profileLocation);
        setSalaryTarget({
          min: profile.target_salary_min || null,
          max: profile.target_salary_max || null,
        });
        setTargetCompanies(
          (profile.target_companies || '').split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
        );
      } catch {
        // No profile yet
      }

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
      setAnalysisKeywords([...new Set(words)]);

      // Use profile target_roles as primary search signal, fallback to analysis role
      let searchKeyword = '';
      if (profileTargetRoles.trim()) {
        const roles = profileTargetRoles.split(',').map((r) => r.trim()).filter(Boolean);
        searchKeyword = roles.slice(0, 2).join(' ');
      }
      if (!searchKeyword) {
        searchKeyword = roleName
          ? roleName.split(/\s+/).slice(0, 3).join(' ')
          : 'analyst';
      }

      const searchLocation = profileLocation || 'Florida';

      try {
        const data = await searchAggregatedJobs({
          keyword: searchKeyword,
          location: searchLocation,
          page: 1,
        });
        // Top 5 by Holt Score (already sorted by backend)
        setRecommended((data.jobs || []).slice(0, 5));
      } catch {
        setRecError(true);
      }
    } catch {
      setRecError(true);
    } finally {
      setRecLoading(false);
    }
  }

  // --- Federal search ---
  async function searchFederal(kw, loc, page = 1) {
    setFedLoading(true);
    setFedError('');
    try {
      const data = await searchJobs({
        keyword: kw,
        location: loc || undefined,
        remote: remoteOnly || undefined,
        page,
      });
      if (page === 1) {
        setFedJobs(data.jobs);
      } else {
        setFedJobs((prev) => [...prev, ...data.jobs]);
      }
      setFedTotal(data.total);
      setFedPage(page);
      setFedSearched(true);
    } catch (err) {
      setFedError(err.message);
    } finally {
      setFedLoading(false);
    }
  }

  // --- Private search ---
  async function searchPrivate(kw, loc, page = 1) {
    const searchKw = kw || analysisRoleName;
    if (!searchKw) return;
    setPvtLoading(true);
    try {
      const data = await searchAdzunaJobs({
        keyword: searchKw,
        location: loc || userLocation || undefined,
        page,
      });
      if (page === 1) {
        setPvtJobs(data.jobs || []);
      } else {
        setPvtJobs((prev) => [...prev, ...(data.jobs || [])]);
      }
      setPvtTotal(data.total || 0);
      setPvtPage(page);
      setPvtSearched(true);
    } catch {
      if (page === 1) { setPvtJobs([]); setPvtTotal(0); }
      setPvtSearched(true);
    } finally {
      setPvtLoading(false);
    }
  }

  async function handleSearch(e) {
    e?.preventDefault();
    if (!keyword.trim()) return;
    const kw = keyword.trim();
    const loc = location.trim();

    // Persist search state
    saveSearch({ keyword: kw, location: loc, remoteOnly, activeTab });

    // Search both sources, cache results
    searchFederal(kw, loc, 1);
    searchPrivate(kw, loc);
  }

  async function handleProfileMatch() {
    setProfileMatchLoading(true);
    try {
      const profile = await getProfile();
      const roles = (profile.target_roles || '').split(',').map((r) => r.trim()).filter(Boolean);
      const skills = Array.isArray(profile.skills_extracted) ? profile.skills_extracted : [];
      const loc = (profile.location || '').trim() || 'Florida';

      // Build up to 3 search queries: one per target role, plus a skills-based query
      const queries = [];
      for (const role of roles.slice(0, 2)) {
        queries.push(role);
      }
      // Third query: top skills as a phrase (e.g. "Operations Management Leadership")
      const skillPhrase = skills.slice(0, 3).join(' ').trim();
      if (skillPhrase && !queries.includes(skillPhrase)) {
        queries.push(skillPhrase);
      }
      // Fallback if no roles or skills
      if (queries.length === 0) queries.push('manager');

      // Do NOT pre-fill keyword box — profile search is separate from manual search
      setLocation(loc);

      // Run parallel federal searches (one per query)
      setFedLoading(true);
      setFedError('');
      const fedPromises = queries.map((q) =>
        searchJobs({ keyword: q, location: loc, page: 1 }).catch(() => ({ jobs: [], total: 0 }))
      );

      // Run parallel aggregated searches for private tab
      setPvtLoading(true);
      const pvtPromises = queries.map((q) =>
        searchAggregatedJobs({ keyword: q, location: loc, page: 1 }).catch(() => ({ jobs: [], total: 0 }))
      );

      const [fedResults, pvtResults] = await Promise.all([
        Promise.all(fedPromises),
        Promise.all(pvtPromises),
      ]);

      // Merge and deduplicate federal results
      const fedSeen = new Set();
      const fedMerged = [];
      for (const res of fedResults) {
        for (const job of (res.jobs || [])) {
          const key = `${(job.title || '').toLowerCase()}|${(job.company || job.department || '').toLowerCase()}`;
          if (!fedSeen.has(key)) {
            fedSeen.add(key);
            fedMerged.push(job);
          }
        }
      }
      fedMerged.sort((a, b) => (b.holt_score ?? 0) - (a.holt_score ?? 0));
      setFedJobs(fedMerged);
      setFedTotal(fedMerged.length);
      setFedPage(1);
      setFedSearched(true);
      setFedLoading(false);

      // Merge and deduplicate private results
      const pvtSeen = new Set();
      const pvtMerged = [];
      for (const res of pvtResults) {
        for (const job of (res.jobs || [])) {
          const key = `${(job.title || '').toLowerCase()}|${(job.company || '').toLowerCase()}`;
          if (!pvtSeen.has(key)) {
            pvtSeen.add(key);
            pvtMerged.push(job);
          }
        }
      }
      pvtMerged.sort((a, b) => (b.holt_score ?? 0) - (a.holt_score ?? 0));
      setPvtJobs(pvtMerged);
      setPvtTotal(pvtMerged.length);
      setPvtPage(1);
      setPvtSearched(true);
      setPvtLoading(false);

      saveSearch({ keyword: '', location: loc, remoteOnly, activeTab });
    } catch (err) {
      toast.error('Could not load your profile — try keyword search instead');
      setFedLoading(false);
      setPvtLoading(false);
    } finally {
      setProfileMatchLoading(false);
    }
  }

  function handleLoadMoreFed() {
    searchFederal(keyword.trim(), location.trim(), fedPage + 1);
  }

  function handleLoadMorePvt() {
    searchPrivate(keyword.trim(), location.trim(), pvtPage + 1);
  }

  function handleTabSwitch(tab) {
    setActiveTab(tab);
    // Persist tab choice
    if (keyword.trim()) {
      saveSearch({ keyword: keyword.trim(), location: location.trim(), remoteOnly, activeTab: tab });
    }
    // If switching to private and no results yet, auto-search
    if (tab === 'private' && !pvtSearched && !pvtLoading) {
      const kw = keyword.trim() || analysisRoleName;
      const loc = location.trim() || userLocation;
      if (kw) searchPrivate(kw, loc);
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

  function formatSalary(min, max) {
    if (!min && !max) return null;
    const fmt = (n) => '$' + n.toLocaleString();
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    return `Up to ${fmt(max)}`;
  }

  function sortJobs(jobList) {
    const sorted = [...jobList];
    switch (sortBy) {
      case 'score': return sorted.sort((a, b) => (b.holt_score ?? 0) - (a.holt_score ?? 0));
      case 'newest': return sorted.sort((a, b) => (b.posted || '').localeCompare(a.posted || ''));
      case 'salary_high': return sorted.sort((a, b) => (b.salary_max ?? 0) - (a.salary_max ?? 0));
      case 'salary_low': return sorted.sort((a, b) => (a.salary_min ?? Infinity) - (b.salary_min ?? Infinity));
      default: return sorted;
    }
  }

  function filterJobs(jobList) {
    return jobList.filter((job) => {
      if (filterPostedWithin !== 'any' && job.posted) {
        const posted = new Date(job.posted);
        const now = new Date();
        const diffH = (now - posted) / 3600000;
        if (filterPostedWithin === '24h' && diffH > 24) return false;
        if (filterPostedWithin === '3d' && diffH > 72) return false;
        if (filterPostedWithin === '7d' && diffH > 168) return false;
      }
      // Degree filter
      if (filterDegree !== 'all') {
        const flag = job.holt_breakdown?.degree_flag || 'none';
        if (filterDegree === 'no_degree' && flag === 'required') return false;
        if (filterDegree === 'preferred_only' && flag === 'required') return false;
      }
      return true;
    });
  }

  // Active tab data
  const isSearched = activeTab === 'federal' ? fedSearched : pvtSearched;
  const isLoading = activeTab === 'federal' ? fedLoading : pvtLoading;
  const rawJobs = activeTab === 'federal' ? fedJobs : pvtJobs;
  const activeTotal = activeTab === 'federal' ? fedTotal : pvtTotal;
  const tabLabel = activeTab === 'federal' ? 'Federal' : 'Private';

  // Apply filters then sort — target companies always first within sort
  const filteredJobs = filterJobs(rawJobs);
  const sortedJobs = sortJobs(filteredJobs);
  const activeJobs = [
    ...sortedJobs.filter((j) => j.is_target_company),
    ...sortedJobs.filter((j) => !j.is_target_company),
  ];

  const withinReachJobs = activeJobs.filter(
    (j) => j.holt_score != null && j.holt_score >= 50 && j.holt_score <= 69
  );

  // Tab labels with counts
  const fmtCount = (n) => n > 1000 ? '1,000+' : n.toLocaleString();
  const fedLabel = fedSearched ? `Federal (${fmtCount(fedTotal)})` : 'Federal';
  const pvtLabel = pvtSearched ? `Private (${fmtCount(pvtTotal)})` : 'Private';

  return (
    <ScreenWrapper screenName="Jobs">
      <h2 style={{ marginBottom: 'var(--space-5)' }}>Find Jobs</h2>

      {/* Recommended for You — only on Federal tab before search */}
      {activeTab === 'federal' && !recLoading && hasAnalysis && recommended.length > 0 && !fedSearched && (
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
                holtScore={job.holt_score}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations error state */}
      {recError && !recLoading && !fedSearched && !pvtSearched && (
        <Card style={{
          textAlign: 'center',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
        }}>
          <Ott state="coaching" size={64} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)', fontSize: '14px' }}>
            Couldn't load recommendations
          </p>
          <Button variant="ghost" onClick={loadRecommendations} style={{ marginTop: 'var(--space-2)' }}>
            Tap to retry
          </Button>
        </Card>
      )}

      {/* No analysis — prompt to analyze first */}
      {!recLoading && !recError && !hasAnalysis && !fedSearched && (
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

      {/* Profile match button */}
      <Button
        full
        onClick={handleProfileMatch}
        disabled={profileMatchLoading || (fedLoading && pvtLoading)}
        style={{ marginBottom: 0 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
          <Ott state="idle" size={24} />
          {profileMatchLoading ? 'Finding your matches...' : 'Find jobs that fit me'}
        </span>
      </Button>

      {/* Divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        margin: 'var(--space-3) 0',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>or</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-4)',
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
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setRemoteOnly(!remoteOnly)}
            className={`jobs-filter-chip ${remoteOnly ? 'jobs-filter-chip--active' : ''}`}
          >
            Remote only
          </button>
        </div>

        <Button full disabled={(fedLoading && pvtLoading) || !keyword.trim()}>
          {fedLoading && !fedJobs.length ? 'Searching...' : 'Search'}
        </Button>
      </form>

      {/* Source tabs */}
      {(fedSearched || pvtSearched || fedLoading || pvtLoading) && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div className="jobs-tabs">
            <button
              className={`jobs-tabs__tab ${activeTab === 'federal' ? 'jobs-tabs__tab--active' : ''}`}
              onClick={() => handleTabSwitch('federal')}
            >
              {fedLabel}
              {fedLoading && <span className="jobs-tabs__loading" />}
            </button>
            <button
              className={`jobs-tabs__tab ${activeTab === 'private' ? 'jobs-tabs__tab--active' : ''}`}
              onClick={() => handleTabSwitch('private')}
            >
              {pvtLabel}
              {pvtLoading && <span className="jobs-tabs__loading" />}
            </button>
          </div>
          <p style={{
            textAlign: 'center',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            marginTop: 'var(--space-1)',
          }}>
            Federal = government jobs &middot; Private = Indeed, Glassdoor, ZipRecruiter &amp; more
          </p>
        </div>
      )}

      {/* Sort + Filter controls */}
      {(fedSearched || pvtSearched) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="jobs-sort-select"
          >
            <option value="score">Best match</option>
            <option value="newest">Newest first</option>
            <option value="salary_high">Salary: high to low</option>
            <option value="salary_low">Salary: low to high</option>
          </select>

          <button
            className={`jobs-filter-chip ${showFilters ? 'jobs-filter-chip--active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={14} /> Filters
          </button>
        </div>
      )}

      {showFilters && (
        <Card style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                Posted within
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {[['any', 'Any time'], ['24h', '24 hours'], ['3d', '3 days'], ['7d', '1 week']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`jobs-filter-chip ${filterPostedWithin === val ? 'jobs-filter-chip--active' : ''}`}
                    onClick={() => setFilterPostedWithin(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Degree filter */}
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                Degree requirement
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {[['all', 'Show all'], ['no_degree', 'No degree mentioned'], ['preferred_only', 'Preferred only']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`jobs-filter-chip ${filterDegree === val ? 'jobs-filter-chip--active' : ''}`}
                    onClick={() => setFilterDegree(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showDealbreakers}
                onChange={(e) => setShowDealbreakers(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                Show dealbreaker jobs (dimmed)
              </span>
            </label>
          </div>
        </Card>
      )}

      {/* Error — federal only */}
      {activeTab === 'federal' && fedError && (
        <Card style={{ background: 'var(--color-danger-light)', marginBottom: 'var(--space-4)' }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{fedError}</p>
        </Card>
      )}

      {/* Empty state — before any search */}
      {!fedSearched && !fedLoading && !hasAnalysis && recommended.length === 0 && !recLoading && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-5)' }}>
          <Ott state="waiting" size={80} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            Search for jobs to get started
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Results from federal and private sector listings
          </p>
        </Card>
      )}

      {/* Loading state for active tab */}
      {isLoading && activeJobs.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
          <Ott state="thinking" size={60} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)', fontSize: '13px' }}>
            Searching {tabLabel.toLowerCase()} jobs...
          </p>
        </Card>
      )}

      {/* No results for active tab */}
      {isSearched && !isLoading && activeJobs.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)' }}>
          <Ott state="coaching" size={80} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            No {tabLabel.toLowerCase()} jobs found
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Try different keywords or a broader location
          </p>
        </Card>
      )}

      {/* Within Reach — scoped to active tab */}
      {withinReachJobs.length > 0 && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
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
                Within Reach — {tabLabel}
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
                score={job.holt_score}
                savedIds={savedIds}
                onSave={handleSave}
                formatSalary={formatSalary}
              />
            ))}
          </div>
        </div>
      )}

      {/* Degree filter coaching note */}
      {filterDegree !== 'all' && isSearched && !isLoading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          background: 'var(--color-accent-light)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-3)',
          fontSize: '13px',
          color: 'var(--color-accent-dark)',
          fontWeight: 600,
        }}>
          <Ott state="encouraging" size={32} />
          Showing jobs with no degree requirement — your experience speaks louder than a diploma
        </div>
      )}

      {/* Results count */}
      {isSearched && !isLoading && activeJobs.length > 0 && (
        <p style={{
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          fontSize: '13px',
          marginBottom: 'var(--space-3)',
        }}>
          {activeTotal > 1000 ? '1,000+' : activeTotal.toLocaleString()} {tabLabel.toLowerCase()} jobs found
        </p>
      )}

      {/* Job cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {activeJobs
          .filter((job) => showDealbreakers || !job.dealbreaker_triggered)
          .map((job) => (
          <JobCard
            key={job.id + job.title}
            job={job}
            savedIds={savedIds}
            onSave={handleSave}
            formatSalary={formatSalary}
            holtScore={job.holt_score}
          />
        ))}
      </div>

      {/* Load more */}
      {activeTab === 'federal' && fedSearched && fedJobs.length > 0 && fedJobs.length < fedTotal && (
        <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
          <Button variant="secondary" onClick={handleLoadMoreFed} disabled={fedLoading}>
            {fedLoading ? 'Loading...' : 'Load more federal jobs'}
          </Button>
        </div>
      )}
      {activeTab === 'private' && pvtSearched && pvtJobs.length > 0 && pvtJobs.length < pvtTotal && (
        <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
          <Button variant="secondary" onClick={handleLoadMorePvt} disabled={pvtLoading}>
            {pvtLoading ? 'Loading...' : 'Load more private jobs'}
          </Button>
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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const isDealbreaker = job.dealbreaker_triggered;
  const isTarget = job.is_target_company;
  const breakdown = job.holt_breakdown;

  return (
    <Card style={isDealbreaker ? { opacity: 0.6 } : {}}>
      {/* Target company badge */}
      {isTarget && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-2)',
          padding: '4px 10px',
          background: 'var(--color-warning-light)',
          borderRadius: 'var(--radius-full)',
          width: 'fit-content',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--color-warning)',
        }}>
          <Star size={12} /> Target company
        </div>
      )}

      {/* Dealbreaker notice */}
      {isDealbreaker && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-2)',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--color-text-muted)',
        }}>
          <AlertTriangle size={12} /> Outside your preferences
        </div>
      )}

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

      {/* Score breakdown toggle */}
      {breakdown && holtScore != null && (
        <>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--color-accent)', fontFamily: "'Nunito', sans-serif",
              fontWeight: 600, fontSize: '12px', marginBottom: 'var(--space-2)',
            }}
          >
            {showBreakdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {job.coaching_label || 'Score breakdown'}
          </button>
          {showBreakdown && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-1) var(--space-4)',
              fontSize: '12px', marginBottom: 'var(--space-3)',
              padding: 'var(--space-2)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)',
            }}>
              {[
                ['Skills', breakdown.skills_match],
                ['Salary', breakdown.salary_alignment],
                ['Schedule', breakdown.schedule_fit],
                ['Experience', breakdown.experience_match],
                ['Location', breakdown.location_fit],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{
                    fontWeight: 700,
                    color: val >= 70 ? 'var(--color-success)' : val >= 50 ? 'var(--color-warning)' : 'var(--color-accent)',
                  }}>{val}</span>
                </div>
              ))}
              {breakdown.degree_flag !== 'none' && (
                <div style={{ gridColumn: '1 / -1', color: 'var(--color-warning)', fontWeight: 600 }}>
                  Degree: {breakdown.degree_flag}
                </div>
              )}
              {breakdown.reasoning && (
                <div style={{
                  gridColumn: '1 / -1',
                  marginTop: 'var(--space-1)',
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid var(--color-border)',
                }}>
                  <p style={{
                    fontSize: '12px',
                    fontStyle: 'italic',
                    color: 'var(--color-text-muted)',
                    lineHeight: 1.4,
                  }}>
                    {breakdown.reasoning}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

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


function WithinReachCard({ job, score, savedIds, onSave, formatSalary }) {
  const [expanded, setExpanded] = useState(false);
  const delta = 70 - score;
  const jobGaps = job.holt_breakdown?.job_specific_gaps || [];

  const coachLabel = delta <= 5
    ? "You're almost there"
    : delta <= 12
      ? 'One skill away'
      : 'Strong foundation';

  return (
    <Card className="within-reach-card">
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

      <div className="within-reach-progress">
        <div className="within-reach-progress__bar">
          <div className="within-reach-progress__fill" style={{ width: `${score}%` }} />
          <div className="within-reach-progress__target" style={{ left: '70%' }} />
        </div>
        <div className="within-reach-progress__labels">
          <span className="within-reach-progress__score">{score}%</span>
          <span className="within-reach-progress__delta">+{delta}% to 70%</span>
        </div>
      </div>

      <p style={{
        fontWeight: 600,
        fontSize: '13px',
        color: 'var(--color-warning)',
        marginBottom: 'var(--space-2)',
      }}>
        {coachLabel}
      </p>

      {jobGaps.length > 0 ? (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {jobGaps.map((gap, i) => (
            <p key={i} style={{
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              paddingLeft: 'var(--space-3)',
              borderLeft: '2px solid var(--color-warning)',
              marginBottom: i < jobGaps.length - 1 ? 'var(--space-2)' : 0,
            }}>
              {gap}
            </p>
          ))}
        </div>
      ) : (
        <p style={{
          fontSize: '12px',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-3)',
          fontStyle: 'italic',
        }}>
          Close your skills gap to reach 70%
        </p>
      )}

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
