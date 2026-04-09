import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import HoltWordmark from '../components/ui/HoltWordmark';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setSubmitting(true);
    setError(null);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen" style={{ position: 'relative', overflow: 'hidden' }}>
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
          <p style={{ fontWeight: 700, fontSize: '18px', marginTop: 'var(--space-2)' }}>Welcome back</p>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            Your cozy corner for finding what's next.
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
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

            <Button full disabled={submitting || !email.trim() || !password}>
              {submitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </Card>

        <p style={{
          textAlign: 'center',
          marginTop: 'var(--space-5)',
          color: 'var(--color-text-secondary)',
          fontSize: '14px',
        }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ fontWeight: 700 }}>Sign up</Link>
        </p>
      </div>
      {/* Corner vegetation framing */}
      <img src="/ott/ott-corner-left.png" alt="" aria-hidden="true" style={{ position: 'fixed', bottom: 60, left: 0, width: 120, pointerEvents: 'none', zIndex: 0, opacity: 0.85 }} />
      <img src="/ott/ott-corner-right.png" alt="" aria-hidden="true" style={{ position: 'fixed', bottom: 60, right: 0, width: 120, pointerEvents: 'none', zIndex: 0, opacity: 0.85 }} />
    </div>
  );
}
