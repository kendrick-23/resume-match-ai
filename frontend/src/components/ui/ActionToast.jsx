import './ActionToast.css';

const ACTION_META = {
  'job-saved': {
    image: '/ott/ott-encouraging.png',
    message: "Saved. I'll keep an eye on this one.",
  },
  'application-logged': {
    image: '/ott/ott-waving.png',
    message: 'Logged. One step closer.',
  },
  'status-updated': {
    image: '/ott/ott-coaching.png',
    message: 'Nice move. Keep the momentum.',
  },
  'analysis-complete': {
    image: '/ott/ott-excited.png',
    message: "Done. Here's what stood out.",
  },
};

export const ACTION_TYPES = Object.keys(ACTION_META);

export function getActionMeta(action) {
  return ACTION_META[action] || null;
}

export default function ActionToast({ action, exiting }) {
  const meta = getActionMeta(action);
  if (!meta) return null;

  return (
    <div className={`action-toast${exiting ? ' action-toast--exiting' : ''}`} role="status" aria-live="polite">
      <img className="action-toast__ott" src={meta.image} alt="Ott" />
      <p className="action-toast__message">{meta.message}</p>
    </div>
  );
}
