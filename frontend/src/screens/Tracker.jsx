import { useState } from 'react';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { Plus } from 'lucide-react';

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
  /* Placeholder — no applications yet */
  const [applications] = useState([]);

  return (
    <ScreenWrapper>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-5)',
      }}>
        <h2>Tracker</h2>
        <Button variant="primary" style={{ padding: '10px 20px', minHeight: '44px', fontSize: '14px' }}>
          <Plus size={18} /> Add
        </Button>
      </div>

      {/* Pipeline stage tabs — horizontal scroll */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        paddingBottom: 'var(--space-2)',
        marginBottom: 'var(--space-5)',
      }}>
        {STAGES.map((stage) => (
          <Badge key={stage} variant={STAGE_VARIANT[stage]}>
            {stage} (0)
          </Badge>
        ))}
      </div>

      {applications.length === 0 ? (
        /* Empty state */
        <Card style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-5)' }}>
          <Ott state="waving" size={120} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            No applications tracked yet
          </p>
          <p style={{
            color: 'var(--color-text-muted)',
            marginTop: 'var(--space-1)',
            marginBottom: 'var(--space-4)',
          }}>
            Tap "Add" to log your first application
          </p>
          <Button variant="secondary">
            <Plus size={18} /> Log Your First Application
          </Button>
        </Card>
      ) : (
        /* Application cards — placeholder structure */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {applications.map((app) => (
            <Card key={app.id} interactive>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{app.role}</p>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    {app.company}
                  </p>
                </div>
                <Badge variant={STAGE_VARIANT[app.status]}>{app.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </ScreenWrapper>
  );
}
