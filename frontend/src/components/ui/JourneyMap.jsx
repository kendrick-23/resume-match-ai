import './JourneyMap.css';

const STAGES = [
  { key: 'resume', label: 'Resume' },
  { key: 'profile', label: 'Profile' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
];

function Checkmark() {
  return (
    <svg className="journey-map__check" viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {object} props.completed — { resume, profile, applied, interview, offer } booleans
 * @param {boolean} props.ready — true once ALL upstream data has loaded; gates the
 *                                sequential entrance animation so Nicole never sees
 *                                an intermediate state lighting up node-by-node.
 */
export default function JourneyMap({ completed, ready = false }) {
  // First incomplete stage is "current". If everything is done, no current stage.
  const currentIndex = STAGES.findIndex((s) => !completed[s.key]);

  return (
    <div
      className={`journey-map${ready ? ' journey-map--ready' : ''}`}
      role="list"
      aria-label="Job search journey"
      aria-busy={!ready}
    >
      {STAGES.map((stage, i) => {
        const isComplete = completed[stage.key];
        const isCurrent = !isComplete && i === currentIndex;
        const state = isComplete ? 'complete' : isCurrent ? 'current' : 'locked';

        return (
          <div
            key={stage.key}
            role="listitem"
            className={`journey-map__node journey-map__node--${state}`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <div className="journey-map__circle-wrap">
              {isCurrent && (
                <img
                  className="journey-map__ott"
                  src="/ott/ott-coaching.png"
                  alt=""
                  aria-hidden="true"
                />
              )}
              <div className="journey-map__circle">
                {isComplete ? <Checkmark /> : i + 1}
              </div>
              {isCurrent && <span className="journey-map__pulse" aria-hidden="true" />}
            </div>
            <span className="journey-map__label">{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}
