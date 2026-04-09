import { useEffect } from 'react';
import Ott from '../ott/Ott';
import { BADGES } from '../../constants/badges';

export default function MilestoneCelebration({ badgeKey, onClose }) {
  const meta = BADGES[badgeKey];
  if (!meta) return null;

  // Idempotency: only show each milestone once per badge key.
  const storageKey = `holt_milestone_${badgeKey}`;
  let alreadySeen = false;
  try {
    alreadySeen = localStorage.getItem(storageKey) === 'true';
  } catch {
    // localStorage unavailable
  }

  useEffect(() => {
    if (alreadySeen) {
      onClose();
      return;
    }
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // ignore
    }
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose, alreadySeen, storageKey]);

  if (alreadySeen) return null;

  return (
    <div className="milestone-overlay" onClick={onClose}>
      <div className="milestone-overlay__content">
        <Ott state="celebrating" size={160} />
        <img
          src={meta.image}
          alt={meta.name}
          style={{ width: '64px', height: '64px', objectFit: 'contain' }}
        />
        <div className="milestone-overlay__title">{meta.name}</div>
        <div className="milestone-overlay__subtitle">{meta.subtitle}</div>
      </div>
    </div>
  );
}
