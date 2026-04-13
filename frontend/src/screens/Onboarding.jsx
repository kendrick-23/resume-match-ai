import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ott from '../components/ott/Ott';
import HoltWordmark from '../components/ui/HoltWordmark';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { updateProfile } from '../services/api';
import { useToast } from '../context/ToastContext';
import './Onboarding.css';

export default function Onboarding() {
  const [step, setStep] = useState(0);

  // Screen 1 — identity
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  // Screen 2 — targeting
  const [targetRoles, setTargetRoles] = useState('');
  const [location, setLocation] = useState('');
  const [targetSalaryMin, setTargetSalaryMin] = useState('');
  const [targetSalaryMax, setTargetSalaryMax] = useState('');

  // Screen 3 — preferences
  const [schedulePref, setSchedulePref] = useState('');
  const [degreeStatus, setDegreeStatus] = useState('');
  const [jobSeekerStatus, setJobSeekerStatus] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  async function handleFinish() {
    setSaving(true);
    setSaveError(false);
    try {
      const updates = {};
      if (name.trim()) updates.full_name = name.trim();
      if (jobTitle.trim()) updates.job_title = jobTitle.trim();
      if (targetRoles.trim()) updates.target_roles = targetRoles.trim();
      if (location.trim()) updates.location = location.trim();
      if (targetSalaryMin) updates.target_salary_min = parseInt(targetSalaryMin, 10);
      if (targetSalaryMax) updates.target_salary_max = parseInt(targetSalaryMax, 10);
      if (schedulePref) updates.schedule_preference = schedulePref;
      if (degreeStatus) updates.degree_status = degreeStatus;
      if (jobSeekerStatus) updates.job_seeker_status = jobSeekerStatus;
      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
      }
    } catch (err) {
      // Block onboarding completion on save failure — do NOT advance.
      setSaving(false);
      setSaveError(true);
      toast.error(err?.message || 'Could not save your profile — try again');
      return;
    }
    localStorage.setItem('holt_onboarded', 'true');
    setSaving(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="onboarding">
      <div className="onboarding__inner">
        {/* Screen 0 — Welcome */}
        {step === 0 && (
          <div className="onboarding__screen onboarding__screen--enter">
            <div className="onboarding__ott-bounce">
              <img
                src="/ott/ott-splash.png"
                alt="Ott"
                style={{ width: 160, height: 'auto', display: 'block', margin: '0 auto' }}
              />
            </div>
            <div style={{ marginTop: 'var(--space-5)', display: 'flex', justifyContent: 'center' }}>
              <HoltWordmark size="large" />
            </div>
            <h1 className="onboarding__headline">Welcome to Holt</h1>
            <p className="onboarding__subtext">
              Your AI-powered job search companion.
              I'll help you find the right jobs and stand out.
            </p>
            <Button full onClick={() => setStep(1)}>
              Meet Ott &rarr;
            </Button>
          </div>
        )}

        {/* Screen 1 — Identity + targeting */}
        {step === 1 && (
          <div className="onboarding__screen onboarding__screen--enter">
            <Ott state="encouraging" size={56} />
            <h2 className="onboarding__headline">Tell Ott about yourself</h2>
            <p className="onboarding__subtext">
              This helps Ott find jobs that actually match you
            </p>

            <div className="onboarding__fields">
              <input
                className="onboarding__input"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="onboarding__input"
                type="text"
                placeholder="Current job title (e.g. Assistant General Manager)"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
              <input
                className="onboarding__input"
                type="text"
                placeholder="Target roles (e.g. Operations Manager, HR Coordinator)"
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
              />
              <input
                className="onboarding__input"
                type="text"
                placeholder="Location (e.g. Casselberry, FL)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '15px', pointerEvents: 'none',
                  }}>$</span>
                  <input
                    className="onboarding__input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Min (e.g. 75000)"
                    value={targetSalaryMin}
                    onChange={(e) => setTargetSalaryMin(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{ paddingLeft: 24 }}
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '15px', pointerEvents: 'none',
                  }}>$</span>
                  <input
                    className="onboarding__input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Max (e.g. 85000)"
                    value={targetSalaryMax}
                    onChange={(e) => setTargetSalaryMax(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{ paddingLeft: 24 }}
                  />
                </div>
              </div>
            </div>

            <Button full onClick={() => setStep(2)}>
              Almost done &rarr;
            </Button>
            <button className="onboarding__skip" onClick={() => setStep(0)}>
              &larr; Back
            </button>
          </div>
        )}

        {/* Screen 2 — Preferences */}
        {step === 2 && (
          <div className="onboarding__screen onboarding__screen--enter">
            <Ott state="idle" size={56} />
            <h2 className="onboarding__headline">Your preferences</h2>
            <p className="onboarding__subtext">
              Ott uses these to filter out jobs that aren't a fit
            </p>

            <div className="onboarding__fields">
              {/* Schedule preference */}
              <div className="onboarding__field-group">
                <label className="onboarding__label">Schedule preference</label>
                <div className="onboarding__pills">
                  {[
                    ['monday_friday', 'M-F only'],
                    ['any', 'Any schedule'],
                    ['remote_only', 'Remote only'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={`onboarding__pill ${schedulePref === val ? 'onboarding__pill--active' : ''}`}
                      onClick={() => setSchedulePref(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Degree status */}
              <div className="onboarding__field-group">
                <label className="onboarding__label">Highest education</label>
                <select
                  className="onboarding__input onboarding__select"
                  value={degreeStatus}
                  onChange={(e) => setDegreeStatus(e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="no_degree">No degree</option>
                  <option value="high_school">High school / GED</option>
                  <option value="some_college">Some college</option>
                  <option value="associates">Associate's degree</option>
                  <option value="bachelors">Bachelor's degree</option>
                  <option value="masters">Master's degree</option>
                  <option value="doctorate">Doctorate / professional</option>
                </select>
              </div>

              {/* Job seeker status */}
              <div className="onboarding__field-group">
                <label className="onboarding__label">Where are you in your search?</label>
                <div className="onboarding__pills">
                  {[
                    ['actively_hunting', 'Actively searching'],
                    ['casually_looking', 'Casually looking'],
                    ['open_to_offers', 'Open to offers'],
                    ['employed_exploring', 'Employed, exploring'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={`onboarding__pill ${jobSeekerStatus === val ? 'onboarding__pill--active' : ''}`}
                      onClick={() => setJobSeekerStatus(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {saveError && (
              <p
                role="alert"
                style={{
                  color: 'var(--color-danger)',
                  fontSize: '14px',
                  fontWeight: 600,
                  margin: 'var(--space-3) 0 var(--space-2)',
                  textAlign: 'center',
                }}
              >
                Couldn't save your profile. Check your connection and try again.
              </p>
            )}
            <Button full onClick={handleFinish} disabled={saving}>
              {saving ? 'Saving...' : saveError ? 'Try again \u2192' : 'Start my search \u2192'}
            </Button>
            <button className="onboarding__skip" onClick={handleFinish} disabled={saving}>
              I'll fill this in later
            </button>
            <button className="onboarding__skip" onClick={() => setStep(1)} disabled={saving}>
              &larr; Back
            </button>
          </div>
        )}

        {/* Progress dots */}
        <div className="onboarding__dots">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`onboarding__dot ${i === step ? 'onboarding__dot--active' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
