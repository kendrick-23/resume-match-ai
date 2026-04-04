import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { MapPin, Clock, Bookmark } from 'lucide-react';

export default function Jobs() {
  /* Placeholder — no search results yet */
  const jobs = [];

  return (
    <ScreenWrapper>
      <h2 style={{ marginBottom: 'var(--space-5)' }}>Find Jobs</h2>

      {/* Search bar */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-5)',
      }}>
        <Input placeholder="Job title, keywords..." />
        <Input placeholder="Location (city, state, or remote)" />
        <Button full>Search</Button>
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-5)',
      }}>
        <Badge variant="info">Remote</Badge>
        <Badge variant="info">Hybrid</Badge>
        <Badge variant="info">On-site</Badge>
      </div>

      {jobs.length === 0 ? (
        /* Empty state — Ott is minimal on this screen */
        <Card style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-5)' }}>
          <Ott state="waiting" size={80} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            Search for jobs to get started
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Results from USAJobs, Indeed, and more
          </p>
        </Card>
      ) : (
        /* Job result cards — placeholder structure */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {jobs.map((job) => (
            <Card key={job.id}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 'var(--space-2)',
              }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{job.title}</p>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    {job.company}
                  </p>
                </div>
                {job.matchScore && (
                  <Badge variant={job.matchScore >= 70 ? 'success' : 'warning'}>
                    {job.matchScore}% match
                  </Badge>
                )}
              </div>
              <div style={{
                display: 'flex',
                gap: 'var(--space-4)',
                color: 'var(--color-text-muted)',
                fontSize: '13px',
                marginBottom: 'var(--space-3)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <MapPin size={14} /> {job.location}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <Clock size={14} /> {job.posted}
                </span>
              </div>
              <Button variant="ghost" style={{ padding: '8px 16px', minHeight: '36px', fontSize: '13px' }}>
                <Bookmark size={14} /> Save
              </Button>
            </Card>
          ))}
        </div>
      )}
    </ScreenWrapper>
  );
}
