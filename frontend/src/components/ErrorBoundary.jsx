import { Component } from 'react';
import Ott from './ott/Ott';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          background: 'var(--color-bg)',
          fontFamily: "'Nunito', sans-serif",
          textAlign: 'center',
        }}>
          <Ott state="idle" size={120} />
          <p style={{
            marginTop: '24px',
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--color-text)',
          }}>
            Something went wrong.
          </p>
          <p style={{
            marginTop: '8px',
            fontSize: '14px',
            color: 'var(--color-text-secondary)',
          }}>
            Let's try that again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '24px',
              padding: '14px 28px',
              background: 'var(--color-accent)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '9999px',
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 800,
              fontSize: '16px',
              cursor: 'pointer',
              boxShadow: '0 4px 0 var(--color-accent-dark)',
              minHeight: '52px',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
