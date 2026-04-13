import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import HoltWordmark from '../components/ui/HoltWordmark';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signUp(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Unable to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen" style={{ position: 'relative', overflow: 'visible' }}>
      <style>{`.auth-corner{width:80px}@media(min-width:481px){.auth-corner{width:120px}}`}</style>
      <div className="auth-screen__inner" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <img
            src="/ott/ott-splash.png"
            alt="Ott"
            loading="lazy"
            style={{ width: 160, height: 'auto', display: 'block', margin: '0 auto' }}
          />
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
            <HoltWordmark size="large" textOnly />
          </div>
          <p style={{ fontWeight: 700, fontSize: '18px', marginTop: 'var(--space-2)' }}>Create your account</p>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            Start your job search with Ott by your side
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
            <Input
              label="Password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
            <Input
              label="Confirm Password"
              type="password"
              placeholder="Type it again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
            />

            {error && (
              <p style={{
                color: 'var(--color-danger)',
                fontSize: '13px',
                fontWeight: 600,
                textAlign: 'center',
              }}>
                {error}
              </p>
            )}

            <Button full disabled={submitting || !email.trim() || !password || !confirmPassword}>
              {submitting ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        </Card>

        <p style={{
          textAlign: 'center',
          marginTop: 'var(--space-5)',
          color: 'var(--color-text-secondary)',
          fontSize: '14px',
        }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 700 }}>Sign in</Link>
        </p>
      </div>
      {/* Corner vegetation framing */}
      <img src="/ott/ott-corner-left.png" alt="" aria-hidden="true" className="auth-corner" style={{ position: 'fixed', bottom: 60, left: 0, pointerEvents: 'none', zIndex: 2, opacity: 0.85 }} />
      <img src="/ott/ott-corner-right.png" alt="" aria-hidden="true" className="auth-corner" style={{ position: 'fixed', bottom: 60, right: 0, pointerEvents: 'none', zIndex: 2, opacity: 0.85 }} />
    </div>
  );
}
