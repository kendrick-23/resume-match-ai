import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

/**
 * One-shot contextual hint bubble with Ott image, dismissable via X.
 * Gated on localStorage — once dismissed, never returns.
 *
 * @param {string} storageKey — localStorage key to gate on
 * @param {string} ottImage — path to Ott PNG (e.g. '/ott/ott-coaching.png')
 * @param {string} text — hint body text
 */
export default function HintBubble({ storageKey, ottImage, text }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'true';
    } catch {
      return false;
    }
  });

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // ignore
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-3)',
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--color-surface-raised)',
      borderLeft: '3px solid var(--color-accent)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
      maxWidth: '320px',
      marginBottom: 'var(--space-3)',
      position: 'relative',
    }}>
      <img src={ottImage} alt="Ott" style={{ width: '32px', flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'var(--color-text)',
          fontFamily: "'Nunito', sans-serif",
          marginBottom: 'var(--space-2)',
        }}>
          {text}
        </p>
        <button
          onClick={() => navigate('/help')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-accent)',
            fontFamily: "'Nunito', sans-serif",
            fontWeight: 600,
            fontSize: '12px',
            padding: 0,
          }}
        >
          Learn more &rarr;
        </button>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss hint"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          padding: '2px',
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
