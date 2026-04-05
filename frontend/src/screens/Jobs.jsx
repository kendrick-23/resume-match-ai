import { useState } from 'react';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { searchJobs, createApplication } from '../services/api';
import { MapPin, Clock, DollarSign, ExternalLink, Bookmark, Building2, Loader2 } from 'lucide-react';

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
      // Silently fail — user will see the button didn't change
    }
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

      {/* Empty state */}
      {!searched && !loading && (
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
          <Card key={job.id + job.title} style={{ animationDelay: '60ms' }}>
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
              <Badge variant="info">Federal</Badge>
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
                onClick={() => handleSave(job)}
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
