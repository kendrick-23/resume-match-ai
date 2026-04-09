import { useNavigate } from 'react-router-dom';
import Button from './Button';
import { deriveTier } from '../../constants/scoring';
import './VerdictCard.css';

// Score ring math kept self-contained so this component doesn't depend on
// the larger one inside Results.jsx.
const RING_SIZE = 100;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TIER_META = {
  strong: {
    label: 'Apply Now',
    headline: "You're ready for this one.",
    ottState: 'encouraging',
    ottImage: '/ott/ott-encouraging.png',
    ringColor: 'var(--color-success)',
  },
  stretch: {
    label: 'Polish First',
    headline: "You're closer than you think.",
    ottState: 'coaching',
    ottImage: '/ott/ott-coaching.png',
    ringColor: '#F5A623',
  },
  weak: {
    label: 'Worth a Shot',
    headline: 'Gap is closeable — here\'s how.',
    ottState: 'thinking',
    ottImage: '/ott/ott-thinking.png',
    ringColor: '#E8821A',
  },
  wrong_domain: {
    label: 'Not Your Path',
    headline: "This one needs years — let's find a better fit.",
    ottState: 'waiting',
    ottImage: '/ott/ott-waiting.png',
    ringColor: 'var(--color-text-muted)',
  },
};

// Re-export so existing imports from VerdictCard still work.
export { deriveTier } from '../../constants/scoring';

/**
 * @param {object} props
 * @param {number} props.score
 * @param {string|null} props.scoreTier — strong | stretch | weak | wrong_domain (or null for legacy)
 * @param {string} props.companyName
 * @param {string} props.roleName
 * @param {string} props.analysisId
 * @param {function} props.onGenerateResume — handler for the "Generate tailored resume" CTA
 */
export default function VerdictCard({
  score = 0,
  scoreTier = null,
  companyName = '',
  roleName = '',
  postingUrl = '',
  analysisId = null,
  onGenerateResume = () => {},
  onGenerateCoverLetter = null,
}) {
  const navigate = useNavigate();
  const tier = scoreTier || deriveTier(score);
  const meta = TIER_META[tier] || TIER_META.stretch;

  const offset = RING_CIRCUMFERENCE - (Math.max(0, Math.min(100, score)) / 100) * RING_CIRCUMFERENCE;

  // CTA actions are bound to the verdict — wired to existing nav targets.
  const goToTrackerPrefilled = () => {
    navigate('/tracker', {
      state: {
        prefill: true,
        company: companyName || '',
        role: roleName || '',
        url: postingUrl || '',
        notes: `Holt Score: ${score}%`,
      },
    });
  };

  const goToJobs = () => navigate('/jobs');

  return (
    <div
      className={`verdict-card verdict-card--${tier}`}
      role="region"
      aria-label={`Match verdict: ${meta.label}`}
    >
      <span className="verdict-card__pill">{meta.label}</span>
      <img className="verdict-card__ott" src={meta.ottImage} alt={`Ott ${meta.ottState}`} />
      <h2 className="verdict-card__headline">{meta.headline}</h2>

      {/* Score ring — smaller than the legacy one. Supporting, not leading. */}
      <div className="verdict-card__ring-wrap" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={meta.ringColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
              transition: 'stroke-dashoffset 800ms ease-out',
            }}
          />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Nunito, sans-serif"
            fontWeight="800"
            fontSize="26"
            fill="var(--color-text)"
          >
            {score}
          </text>
        </svg>
      </div>

      {/* Gap-closing message for stretch tiers */}
      {(tier === 'stretch' || tier === 'weak') && (
        <p style={{
          fontSize: '12px',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          marginBottom: 'var(--space-3)',
        }}>
          A tailored resume + cover letter can close this gap.
        </p>
      )}

      {/* Smart CTA — the heart of verdict-first design */}
      <div className="verdict-card__cta-row">
        {tier === 'strong' && (
          <>
            <Button full onClick={goToTrackerPrefilled}>
              Log this application
            </Button>
            {onGenerateCoverLetter && (
              <Button variant="secondary" full onClick={onGenerateCoverLetter}>
                Generate cover letter
              </Button>
            )}
          </>
        )}

        {tier === 'stretch' && (
          <>
            <Button full onClick={onGenerateResume} disabled={!analysisId}>
              Generate tailored resume
            </Button>
            {onGenerateCoverLetter && (
              <Button variant="secondary" full onClick={onGenerateCoverLetter}>
                Generate cover letter
              </Button>
            )}
          </>
        )}

        {tier === 'weak' && (
          <>
            <Button full onClick={onGenerateResume} disabled={!analysisId}>
              Generate tailored resume
            </Button>
            {onGenerateCoverLetter && (
              <Button variant="secondary" full onClick={onGenerateCoverLetter}>
                Generate cover letter
              </Button>
            )}
          </>
        )}

        {tier === 'wrong_domain' && (
          <Button full onClick={goToJobs}>
            Find better matches
          </Button>
        )}
      </div>
    </div>
  );
}
