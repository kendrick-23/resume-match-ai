import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ott from '../components/ott/Ott';
import HoltWordmark from '../components/ui/HoltWordmark';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { updateProfile } from '../services/api';
import './Onboarding.css';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [targetRoles, setTargetRoles] = useState('');
  const [targetSalary, setTargetSalary] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function handleFinish() {
    setSaving(true);
    try {
      const updates = {};
      if (name.trim()) updates.full_name = name.trim();
      if (targetRoles.trim()) updates.target_roles = targetRoles.trim();
      if (targetSalary) updates.target_salary_min = parseInt(targetSalary, 10);
      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
      }
    } catch {
      // Profile save failed — continue anyway, they can update in settings
    }
    localStorage.setItem('holt_onboarded', 'true');
    setSaving(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="onboarding">
      <div className="onboarding__inner">
        {step === 0 && (
          <div className="onboarding__screen onboarding__screen--enter">
            <div className="onboarding__ott-bounce">
              <Ott state="waving" size={120} />
            </div>
            <div style={{ marginTop: 'var(--space-5)', display: 'flex', justifyContent: 'center' }}>
              <HoltWordmark size="large" />
            </div>
            <h1 className="onboarding__headline">Welcome to Holt</h1>
            <p className="onboarding__subtext">
              Your AI-powered job search companion.
              Ott will help you find the right jobs and stand out.
            </p>
            <Button full onClick={() => setStep(1)}>
              Meet Ott &rarr;
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding__screen onboarding__screen--enter">
            <h2 className="onboarding__headline">Here's how Holt works</h2>

            <div className="onboarding__steps">
              <Card className="onboarding__step-card" style={{ animationDelay: '0ms' }}>
                <div className="onboarding__step-icon">
                  <Ott state="waiting" size={48} />
                </div>
                <div>
                  <p className="onboarding__step-title">Upload your resume</p>
                  <p className="onboarding__step-desc">Drop in your PDF or DOCX and a job description</p>
                </div>
              </Card>

              <Card className="onboarding__step-card" style={{ animationDelay: '80ms' }}>
                <div className="onboarding__step-icon">
                  <ScoreRingMini />
                </div>
                <div>
                  <p className="onboarding__step-title">Get your match score</p>
                  <p className="onboarding__step-desc">See how well your resume fits the role</p>
                </div>
              </Card>

              <Card className="onboarding__step-card" style={{ animationDelay: '160ms' }}>
                <div className="onboarding__step-icon">
                  <Ott state="celebrating" size={48} />
                </div>
                <div>
                  <p className="onboarding__step-title">Download your ATS resume</p>
                  <p className="onboarding__step-desc">Optimized to pass applicant tracking systems</p>
                </div>
              </Card>
            </div>

            <Button full onClick={() => setStep(2)}>
              Got it &rarr;
            </Button>
            <button className="onboarding__skip" onClick={() => setStep(2)}>
              Skip
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding__screen onboarding__screen--enter">
            <Ott state="encouraging" size={100} />
            <h2 className="onboarding__headline">Let's set you up</h2>
            <p className="onboarding__subtext">
              Tell Ott what you're looking for so he can find your best matches
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
                placeholder="Target roles (e.g. Operations Manager, HR Coordinator)"
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
              />
              <input
                className="onboarding__input"
                type="number"
                placeholder="Target salary (e.g. 75000)"
                value={targetSalary}
                onChange={(e) => setTargetSalary(e.target.value)}
              />
            </div>

            <Button full onClick={handleFinish} disabled={saving}>
              {saving ? 'Saving...' : 'Start my search \u2192'}
            </Button>
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

function ScoreRingMini() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle
        cx="24" cy="24" r="18"
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="4"
      />
      <circle
        cx="24" cy="24" r="18"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="84 113"
        transform="rotate(-90 24 24)"
      />
      <text
        x="24" y="28"
        textAnchor="middle"
        fontFamily="'Nunito', sans-serif"
        fontWeight="800"
        fontSize="14"
        fill="var(--color-text)"
      >
        74
      </text>
    </svg>
  );
}
