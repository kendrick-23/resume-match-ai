import { useEffect, useMemo } from 'react';
import Button from './Button';
import './MilestoneModal.css';

const COPY = {
  Interview: {
    headline: 'Interview unlocked!',
    subtitle: 'All that prep paid off. You earned this.',
  },
  Offer: {
    headline: 'You got an offer!',
    subtitle: "This is what we've been working toward.",
  },
};

// Confetti palette — teal, warm gold, cream, brown (Holt brand)
const CONFETTI_COLORS = ['#2BB5C0', '#FFC800', '#F5E6C8', '#8B5E3C'];
const CONFETTI_COUNT = 30;

export default function MilestoneModal({ milestone, company, role, onClose }) {
  const copy = COPY[milestone];

  // Auto-dismiss after 6s
  useEffect(() => {
    if (!copy) return;
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [copy, onClose]);

  // Generate confetti once per mount with stable random offsets
  const confetti = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      duration: 2.5 + Math.random() * 2.5,
      delay: Math.random() * 0.8,
      size: 6 + Math.random() * 8,
      drift: -20 + Math.random() * 40,
    }));
  }, []);

  if (!copy) return null;

  return (
    <div className="milestone-modal" role="dialog" aria-modal="true" aria-labelledby="milestone-headline">
      <div className="milestone-modal__confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="milestone-confetti-piece"
            style={{
              left: c.left,
              background: c.color,
              width: `${c.size}px`,
              height: `${c.size}px`,
              animationDuration: `${c.duration}s`,
              animationDelay: `${c.delay}s`,
              transform: `translateX(${c.drift}px)`,
            }}
          />
        ))}
      </div>

      <div className="milestone-modal__content">
        <img
          className="milestone-modal__ott"
          src="/ott/ott-celebrating.png"
          alt="Ott celebrating"
        />
        <h2 id="milestone-headline" className="milestone-modal__headline">
          {copy.headline}
        </h2>
        <p className="milestone-modal__subtitle">{copy.subtitle}</p>
        {(role || company) && (
          <p className="milestone-modal__role">
            {[role, company].filter(Boolean).join(' at ')}
          </p>
        )}
        <div className="milestone-modal__button">
          <Button onClick={onClose}>Let's go!</Button>
        </div>
      </div>
    </div>
  );
}
