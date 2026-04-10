import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import './HintBubble.css';

/**
 * Two-part hotspot + popover hint system.
 *
 * Renders as a wrapper around its children. When the hint hasn't been seen
 * (per sessionStorage key), a pulsing teal hotspot dot appears in the
 * top-right of the children. Tapping the dot opens a speech-bubble
 * popover below. Dismissing sets the sessionStorage key permanently.
 *
 * If no children are provided, renders inline (popover only, auto-open).
 */
export default function HintBubble({ storageKey, ottImage, text, children }) {
  const navigate = useNavigate();
  const [seen] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === 'true'; } catch { return true; }
  });
  const [popoverOpen, setPopoverOpen] = useState(!children);
  const [dismissed, setDismissed] = useState(false);

  if (seen || dismissed) {
    return children || null;
  }

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, 'true'); } catch {}
  }

  // Inline mode (no children): render popover directly
  if (!children) {
    return (
      <div className={`hint-popover ${popoverOpen ? 'hint-popover--visible' : ''}`}>
        <div className="hint-popover__tail" />
        <div className="hint-popover__body">
          <img src={ottImage} alt="Ott" className="hint-popover__ott" />
          <div className="hint-popover__content">
            <p className="hint-popover__text">{text}</p>
            <button className="hint-popover__link" onClick={() => navigate('/help')}>
              Learn more &rarr;
            </button>
          </div>
          <button className="hint-popover__dismiss" onClick={dismiss} aria-label="Dismiss hint">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Wrapper mode: hotspot dot on children, popover below on tap
  return (
    <div className="hint-anchor">
      {children}
      <button className="hint-hotspot" onClick={() => setPopoverOpen(true)} aria-label="Show tip">
        <span className="hint-hotspot__dot" />
      </button>
      {popoverOpen && (
        <div className="hint-popover hint-popover--visible hint-popover--anchored">
          <div className="hint-popover__tail" />
          <div className="hint-popover__body">
            <img src={ottImage} alt="Ott" className="hint-popover__ott" />
            <div className="hint-popover__content">
              <p className="hint-popover__text">{text}</p>
              <button className="hint-popover__link" onClick={() => navigate('/help')}>
                Learn more &rarr;
              </button>
            </div>
            <button className="hint-popover__dismiss" onClick={dismiss} aria-label="Dismiss hint">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
