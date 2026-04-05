import { useEffect } from 'react';
import Ott from '../ott/Ott';

const BADGE_META = {
  first_dive:   { emoji: '\u{1F30A}', name: 'First Dive', subtitle: 'You ran your first analysis!' },
  sharp_eye:    { emoji: '\u{1F441}\uFE0F', name: 'Sharp Eye', subtitle: 'You scored 80% or higher!' },
  consistent:   { emoji: '\u{1F525}', name: 'Consistent', subtitle: '7-day streak achieved!' },
  dedicated:    { emoji: '\u2B50', name: 'Dedicated', subtitle: '30-day streak — incredible!' },
  first_wave:   { emoji: '\u{1F4CB}', name: 'First Wave', subtitle: 'You tracked your first application!' },
  making_moves: { emoji: '\u{1F4BC}', name: 'Making Moves', subtitle: '10 applications tracked!' },
  momentum:     { emoji: '\u{1F3AF}', name: 'Momentum', subtitle: 'First interview scheduled!' },
  upgraded:     { emoji: '\u{1F4C8}', name: 'Upgraded', subtitle: 'Score improved by 20+ points!' },
};

export default function MilestoneCelebration({ badgeKey, onClose }) {
  const meta = BADGE_META[badgeKey];
  if (!meta) return null;

  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="milestone-overlay" onClick={onClose}>
      <div className="milestone-overlay__content">
        <Ott state="celebrating" size={100} />
        <div className="milestone-overlay__badge">{meta.emoji}</div>
        <div className="milestone-overlay__title">{meta.name}</div>
        <div className="milestone-overlay__subtitle">{meta.subtitle}</div>
      </div>
    </div>
  );
}
