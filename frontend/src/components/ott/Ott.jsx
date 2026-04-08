import './Ott.css';

/* ============================================
   Ott the Otter — Illustrated PNG Mascot
   9 states, served from /public/ott/.

   Replaces the previous hand-authored SVG. Same prop API
   (state, size, className) so all 20 existing call sites
   continue to work without modification.
   ============================================ */

const STATE_IMAGES = {
  idle: '/ott/ott-idle.png',
  waving: '/ott/ott-waving.png',
  encouraging: '/ott/ott-encouraging.png',
  coaching: '/ott/ott-coaching.png',
  thinking: '/ott/ott-thinking.png',
  waiting: '/ott/ott-waiting.png',
  excited: '/ott/ott-excited.png',
  celebrating: '/ott/ott-celebrating.png',
  sleeping: '/ott/ott-sleeping.png',
};

function stateAnimationClass(state) {
  if (state === 'celebrating' || state === 'excited') return 'ott-celebrate';
  if (state === 'thinking' || state === 'waiting') return 'ott-thinking-anim';
  if (state === 'waving') return 'ott-wave';
  if (state === 'idle') return 'ott-breathe';
  return '';
}

export default function Ott({ state = 'idle', size = 120, className = '' }) {
  const safeState = STATE_IMAGES[state] ? state : 'idle';
  const src = STATE_IMAGES[safeState];
  const animClass = stateAnimationClass(safeState);

  // key={safeState} forces a remount on state change so the entrance + crossfade
  // animations restart cleanly each time the user transitions between states.
  return (
    <div
      key={safeState}
      className={`ott ott--${safeState} ott-entrance ${animClass} ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Ott the otter — ${safeState}`}
    >
      <img
        src={src}
        alt="Ott the otter"
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  );
}
