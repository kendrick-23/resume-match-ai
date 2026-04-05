import { useState, useEffect } from 'react';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Ott from '../components/ott/Ott';
import { Plus, X, Trash2, ExternalLink } from 'lucide-react';
import {
  listApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  checkBadges,
} from '../services/api';
import MilestoneCelebration from '../components/ui/MilestoneCelebration';

const STAGES = ['Saved', 'Applied', 'Responded', 'Interview', 'Offer', 'Closed'];

const STAGE_VARIANT = {
  Saved: 'info',
  Applied: 'info',
  Responded: 'warning',
  Interview: 'success',
  Offer: 'success',
  Closed: 'danger',
};

export default function Tracker() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [celebratingBadge, setCelebratingBadge] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    try {
      const data = await listApplications();
      setApplications(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(formData) {
    try {
      const app = await createApplication(formData);
      setApplications((prev) => [app, ...prev]);
      setShowForm(false);

      // Check for badges
      const badgeResult = await checkBadges();
      if (badgeResult.newly_earned?.length > 0) {
        setCelebratingBadge(badgeResult.newly_earned[0]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStatusChange(app, newStatus) {
    try {
      const updated = await updateApplication(app.id, { status: newStatus });
      setApplications((prev) =>
        prev.map((a) => (a.id === app.id ? updated : a))
      );

      // Check for badges (covers momentum badge for Interview)
      const badgeResult = await checkBadges();
      if (badgeResult.newly_earned?.length > 0) {
        setCelebratingBadge(badgeResult.newly_earned[0]);
      } else if (newStatus === 'Interview') {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 2500);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteApplication(id);
      setApplications((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = activeStage
    ? applications.filter((a) => a.status === activeStage)
    : applications;

  const stageCounts = {};
  for (const stage of STAGES) {
    stageCounts[stage] = applications.filter((a) => a.status === stage).length;
  }

  const ottState = celebrating
    ? 'celebrating'
    : applications.length === 0
      ? 'waving'
      : 'idle';

  return (
    <ScreenWrapper screenName="Tracker">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-5)',
      }}>
        <h2>Tracker</h2>
        <Button
          variant="primary"
          style={{ padding: '10px 20px', minHeight: '44px', fontSize: '14px' }}
          onClick={() => setShowForm(true)}
        >
          <Plus size={18} /> Add
        </Button>
      </div>

      {/* Pipeline stage tabs */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        paddingBottom: 'var(--space-2)',
        marginBottom: 'var(--space-5)',
      }}>
        <button
          className={`tracker-stage-tab${activeStage === null ? ' tracker-stage-tab--active' : ''}`}
          onClick={() => setActiveStage(null)}
        >
          All ({applications.length})
        </button>
        {STAGES.map((stage) => (
          <button
            key={stage}
            className={`tracker-stage-tab${activeStage === stage ? ' tracker-stage-tab--active' : ''}`}
            onClick={() => setActiveStage(activeStage === stage ? null : stage)}
          >
            {stage} ({stageCounts[stage]})
          </button>
        ))}
      </div>

      {error && (
        <Card style={{
          marginBottom: 'var(--space-4)',
          background: 'var(--color-danger-light)',
          borderColor: 'var(--color-danger)',
        }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: '14px' }}>
            {error}
          </p>
          <Button
            variant="ghost"
            style={{ marginTop: 'var(--space-2)', fontSize: '13px', padding: '6px 12px', minHeight: '32px' }}
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
          <Ott state="thinking" size={100} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
            Loading your applications...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-5)' }}>
          <Ott state={ottState} size={120} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            {activeStage
              ? `No applications in "${activeStage}"`
              : 'No applications tracked yet'}
          </p>
          <p style={{
            color: 'var(--color-text-muted)',
            marginTop: 'var(--space-1)',
            marginBottom: 'var(--space-4)',
          }}>
            {activeStage
              ? 'Try selecting a different stage'
              : 'Tap "Add" to log your first application'}
          </p>
          {!activeStage && (
            <Button variant="secondary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Log Your First Application
            </Button>
          )}
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {celebrating && (
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-3)' }}>
              <Ott state="celebrating" size={80} />
              <p style={{ fontWeight: 700, color: 'var(--color-success)', marginTop: 'var(--space-2)' }}>
                Interview scheduled! You're making moves!
              </p>
            </div>
          )}
          {filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add Application Modal */}
      {showForm && (
        <AddApplicationModal
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Milestone celebration */}
      {celebratingBadge && (
        <MilestoneCelebration
          badgeKey={celebratingBadge}
          onClose={() => setCelebratingBadge(null)}
        />
      )}
    </ScreenWrapper>
  );
}


function ApplicationCard({ app, onStatusChange, onDelete }) {
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const currentIndex = STAGES.indexOf(app.status);

  return (
    <Card>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-2)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700 }}>{app.role}</p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            {app.company}
          </p>
        </div>
        <button
          onClick={() => setShowStatusPicker(!showStatusPicker)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Badge variant={STAGE_VARIANT[app.status]}>{app.status}</Badge>
        </button>
      </div>

      {/* Status picker */}
      {showStatusPicker && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-3)',
          padding: 'var(--space-2)',
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
        }}>
          {STAGES.map((stage) => (
            <button
              key={stage}
              onClick={() => {
                if (stage !== app.status) onStatusChange(app, stage);
                setShowStatusPicker(false);
              }}
              style={{
                background: stage === app.status ? 'var(--color-accent-light)' : 'none',
                border: stage === app.status ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-full)',
                padding: '4px 12px',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'Nunito, sans-serif',
                cursor: 'pointer',
                color: stage === app.status ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >
              {stage}
            </button>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}>
        {app.applied_date && (
          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
            {new Date(app.applied_date).toLocaleDateString()}
          </span>
        )}
        {app.match_score != null && (
          <Badge variant={app.match_score >= 70 ? 'success' : app.match_score >= 40 ? 'warning' : 'danger'}>
            {app.match_score}% match
          </Badge>
        )}
        {app.url && (
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={12} /> Link
          </a>
        )}
        <button
          onClick={() => onDelete(app.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            padding: '4px',
            marginLeft: 'auto',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {app.notes && (
        <p style={{
          color: 'var(--color-text-muted)',
          fontSize: '13px',
          marginTop: 'var(--space-2)',
          lineHeight: 1.5,
        }}>
          {app.notes}
        </p>
      )}
    </Card>
  );
}


function AddApplicationModal({ onSubmit, onClose }) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Saved');
  const [appliedDate, setAppliedDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;

    setSubmitting(true);
    const data = {
      company: company.trim(),
      role: role.trim(),
      status,
    };
    if (url.trim()) data.url = url.trim();
    if (notes.trim()) data.notes = notes.trim();
    if (appliedDate) data.applied_date = appliedDate;

    await onSubmit(data);
    setSubmitting(false);
  };

  return (
    <div className="milestone-overlay" onClick={onClose}>
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--max-width)',
          padding: 'var(--space-4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Card>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-5)',
          }}>
            <h3>Add Application</h3>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              label="Company"
              placeholder="e.g. Google"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={submitting}
            />
            <Input
              label="Role"
              placeholder="e.g. Operations Manager"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={submitting}
            />
            <Input
              label="Job Posting URL"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={submitting}
            />
            <div className="input-wrapper">
              <label className="input-wrapper__label">Status</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                {STAGES.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setStatus(stage)}
                    style={{
                      background: stage === status ? 'var(--color-accent-light)' : 'var(--color-surface-raised)',
                      border: stage === status ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-border)',
                      borderRadius: 'var(--radius-full)',
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      fontFamily: 'Nunito, sans-serif',
                      cursor: 'pointer',
                      color: stage === status ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="Date Applied"
              type="date"
              value={appliedDate}
              onChange={(e) => setAppliedDate(e.target.value)}
              disabled={submitting}
            />
            <Input
              textarea
              label="Notes"
              placeholder="Any notes about this application..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              style={{ minHeight: '80px' }}
            />
            <Button full disabled={submitting || !company.trim() || !role.trim()}>
              {submitting ? 'Saving...' : 'Save Application'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
