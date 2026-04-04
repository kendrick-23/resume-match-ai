import './Ott.css';

/* ============================================
   Ott the Otter — SVG Mascot Component
   9 states, all built from rounded geometric shapes.
   Colors reference CSS custom properties from tokens.css.
   ============================================ */

const C = {
  brown: 'var(--color-ott-brown)',
  cream: 'var(--color-ott-cream)',
  dark: 'var(--color-ott-dark)',
  accent: 'var(--color-ott-accent)',
  white: 'var(--color-text-inverse)',
  accentLight: 'var(--color-accent-light)',
};

/* -----------------------------------------------
   SHARED ANATOMY — static parts reused across states
   ----------------------------------------------- */

function Tail() {
  return (
    <path
      d="M 82 100 C 92 88, 110 92, 107 106 C 105 116, 92 118, 88 108"
      style={{ fill: C.brown }}
    />
  );
}

function Feet() {
  return (
    <g>
      <ellipse cx={47} cy={117} rx={12} ry={5} style={{ fill: C.brown }} />
      <ellipse cx={73} cy={117} rx={12} ry={5} style={{ fill: C.brown }} />
    </g>
  );
}

function BodyShape() {
  return <ellipse cx={60} cy={85} rx={26} ry={30} style={{ fill: C.brown }} />;
}

function BellyShape() {
  return <ellipse cx={60} cy={83} rx={17} ry={22} style={{ fill: C.cream }} />;
}

function Scarf() {
  return (
    <g>
      <rect x={34} y={56} width={52} height={7} rx={3.5} style={{ fill: C.accent }} />
      <rect
        x={62} y={61} width={7} height={13} rx={3.5}
        style={{ fill: C.accent }}
        transform="rotate(10, 65, 67)"
      />
      <rect
        x={55} y={61} width={6} height={10} rx={3}
        style={{ fill: C.accent }}
        transform="rotate(-8, 58, 66)"
      />
    </g>
  );
}

function HeadShape() {
  return <ellipse cx={60} cy={36} rx={28} ry={24} style={{ fill: C.brown }} />;
}

function Ears() {
  return (
    <g>
      <ellipse cx={38} cy={17} rx={10} ry={8} style={{ fill: C.brown }} />
      <ellipse cx={38} cy={17} rx={6} ry={5} style={{ fill: C.cream }} />
      <ellipse cx={82} cy={17} rx={10} ry={8} style={{ fill: C.brown }} />
      <ellipse cx={82} cy={17} rx={6} ry={5} style={{ fill: C.cream }} />
    </g>
  );
}

function Muzzle() {
  return <ellipse cx={60} cy={44} rx={14} ry={10} style={{ fill: C.cream }} />;
}

function Nose() {
  return <ellipse cx={60} cy={42} rx={3.5} ry={2.5} style={{ fill: C.dark }} />;
}

function Whiskers() {
  return (
    <g style={{ stroke: C.dark, strokeWidth: 1.2, strokeLinecap: 'round' }}>
      <line x1={46} y1={42} x2={27} y2={38} style={{ fill: 'none' }} />
      <line x1={46} y1={44} x2={27} y2={46} style={{ fill: 'none' }} />
      <line x1={46} y1={43} x2={29} y2={42} style={{ fill: 'none' }} />
      <line x1={74} y1={42} x2={93} y2={38} style={{ fill: 'none' }} />
      <line x1={74} y1={44} x2={93} y2={46} style={{ fill: 'none' }} />
      <line x1={74} y1={43} x2={91} y2={42} style={{ fill: 'none' }} />
    </g>
  );
}

/* -----------------------------------------------
   EYE VARIANTS
   ----------------------------------------------- */

function EyesNormal() {
  return (
    <g>
      <circle cx={49} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={49} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={47} cy={31} r={1.2} style={{ fill: C.white }} />
      <circle cx={71} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={71} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={69} cy={31} r={1.2} style={{ fill: C.white }} />
    </g>
  );
}

function EyesHappy() {
  return (
    <g
      style={{
        stroke: C.dark,
        strokeWidth: 2.5,
        strokeLinecap: 'round',
        fill: 'none',
      }}
    >
      <path d="M 43 34 Q 49 28 55 34" />
      <path d="M 65 34 Q 71 28 77 34" />
    </g>
  );
}

function EyesSleeping() {
  return (
    <g
      style={{
        stroke: C.dark,
        strokeWidth: 2,
        strokeLinecap: 'round',
        fill: 'none',
      }}
    >
      <line x1={43} y1={33} x2={55} y2={33} />
      <line x1={65} y1={33} x2={77} y2={33} />
    </g>
  );
}

function EyesWink() {
  return (
    <g>
      {/* Left eye — normal */}
      <circle cx={49} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={49} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={47} cy={31} r={1.2} style={{ fill: C.white }} />
      {/* Right eye — wink arc */}
      <path
        d="M 65 34 Q 71 28 77 34"
        style={{
          stroke: C.dark,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
        }}
      />
    </g>
  );
}

function EyesWide() {
  return (
    <g>
      <circle cx={49} cy={32} r={7} style={{ fill: C.white }} />
      <circle cx={49} cy={33} r={4} style={{ fill: C.dark }} />
      <circle cx={47} cy={30} r={1.4} style={{ fill: C.white }} />
      <circle cx={71} cy={32} r={7} style={{ fill: C.white }} />
      <circle cx={71} cy={33} r={4} style={{ fill: C.dark }} />
      <circle cx={69} cy={30} r={1.4} style={{ fill: C.white }} />
    </g>
  );
}

function EyesLookUp() {
  return (
    <g>
      <circle cx={49} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={49} cy={30} r={3.5} style={{ fill: C.dark }} />
      <circle cx={47} cy={28.5} r={1.2} style={{ fill: C.white }} />
      <circle cx={71} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={71} cy={30} r={3.5} style={{ fill: C.dark }} />
      <circle cx={69} cy={28.5} r={1.2} style={{ fill: C.white }} />
    </g>
  );
}

function EyesLookSide() {
  return (
    <g>
      <circle cx={49} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={51} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={49.5} cy={31} r={1.2} style={{ fill: C.white }} />
      <circle cx={71} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={73} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={71.5} cy={31} r={1.2} style={{ fill: C.white }} />
    </g>
  );
}

/* -----------------------------------------------
   MOUTH VARIANTS
   ----------------------------------------------- */

const mouthStroke = {
  stroke: C.dark,
  strokeWidth: 2,
  strokeLinecap: 'round',
  fill: 'none',
};

function MouthSmile() {
  return <path d="M 53 49 Q 60 55 67 49" style={mouthStroke} />;
}

function MouthGrin() {
  return <path d="M 50 48 Q 60 57 70 48" style={mouthStroke} />;
}

function MouthOpen() {
  return (
    <g>
      <ellipse cx={60} cy={50} rx={7} ry={5.5} style={{ fill: C.dark }} />
      <ellipse cx={60} cy={48} rx={5} ry={2} style={{ fill: C.cream }} />
    </g>
  );
}

function MouthSmall() {
  return <path d="M 56 49 Q 60 52 64 49" style={mouthStroke} />;
}

function MouthGentle() {
  return <path d="M 55 50 Q 60 52 65 50" style={mouthStroke} />;
}

/* -----------------------------------------------
   EYEBROW HELPERS (used selectively)
   ----------------------------------------------- */

function BrowsConcerned() {
  return (
    <g
      style={{
        stroke: C.dark,
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        fill: 'none',
      }}
    >
      <line x1={43} y1={24} x2={52} y2={22} />
      <line x1={77} y1={24} x2={68} y2={22} />
    </g>
  );
}

/* -----------------------------------------------
   ARM HELPERS
   ----------------------------------------------- */

function LeftArm({ transform }) {
  return (
    <g transform={transform}>
      <rect x={26} y={70} width={12} height={28} rx={6} style={{ fill: C.brown }} />
      <circle cx={32} cy={98} r={6.5} style={{ fill: C.accent }} />
    </g>
  );
}

function RightArm({ transform }) {
  return (
    <g transform={transform}>
      <rect x={82} y={70} width={12} height={28} rx={6} style={{ fill: C.brown }} />
      <circle cx={88} cy={98} r={6.5} style={{ fill: C.accent }} />
    </g>
  );
}

/* -----------------------------------------------
   OTTER BASE — composes shared parts with variants
   ----------------------------------------------- */

function OtterBase({ eyes, mouth, arms, extras, tilt }) {
  const inner = (
    <>
      <Tail />
      <Feet />
      <BodyShape />
      <BellyShape />
      <Scarf />
      <HeadShape />
      <Ears />
      <Muzzle />
      {eyes}
      <Nose />
      <Whiskers />
      {mouth}
      {arms}
      {extras}
    </>
  );

  return tilt ? (
    <g transform={`rotate(${tilt}, 60, 70)`}>{inner}</g>
  ) : (
    <g>{inner}</g>
  );
}

/* -----------------------------------------------
   STATE COMPOSITIONS — 9 visually distinct poses
   ----------------------------------------------- */

function IdleState() {
  return (
    <OtterBase
      eyes={<EyesNormal />}
      mouth={<MouthSmile />}
      arms={
        <>
          <LeftArm />
          <RightArm />
        </>
      }
    />
  );
}

function ThinkingState() {
  return (
    <OtterBase
      tilt={4}
      eyes={<EyesLookSide />}
      mouth={<MouthSmall />}
      arms={
        <>
          {/* Left arm — paw on chin */}
          <LeftArm transform="rotate(130, 32, 70)" />
          {/* Right arm — raised, holding magnifying glass */}
          <RightArm transform="rotate(140, 88, 70)" />
        </>
      }
      extras={
        <g>
          {/* Magnifying glass: handle + lens */}
          <line
            x1={106} y1={47}
            x2={108} y2={38}
            style={{ stroke: C.dark, strokeWidth: 3, strokeLinecap: 'round' }}
          />
          <circle
            cx={110} cy={28}
            r={10}
            style={{ stroke: C.dark, strokeWidth: 2.5, fill: 'none' }}
          />
          <circle
            cx={110} cy={28}
            r={7}
            style={{ fill: C.accentLight, opacity: 0.4 }}
          />
        </g>
      }
    />
  );
}

function CelebratingState() {
  return (
    <OtterBase
      eyes={<EyesHappy />}
      mouth={<MouthGrin />}
      arms={
        <>
          <LeftArm transform="rotate(-130, 32, 70)" />
          <RightArm transform="rotate(130, 88, 70)" />
        </>
      }
      extras={
        <g>
          {/* Celebration sparkles */}
          <circle cx={20} cy={24} r={2.5} style={{ fill: C.accent }} />
          <circle cx={100} cy={18} r={2} style={{ fill: C.accent }} />
          <circle cx={14} cy={40} r={1.5} style={{ fill: C.accent }} />
          <circle cx={106} cy={38} r={1.8} style={{ fill: C.accent }} />
          {/* Star shapes via rotated rects */}
          <rect
            x={10} y={12} width={4} height={4} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 12, 14)"
          />
          <rect
            x={104} y={8} width={3} height={3} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 105.5, 9.5)"
          />
        </g>
      }
    />
  );
}

function EncouragingState() {
  return (
    <OtterBase
      eyes={<EyesWink />}
      mouth={<MouthSmile />}
      arms={
        <>
          <LeftArm />
          {/* Right arm — raised in thumbs-up position */}
          <RightArm transform="rotate(120, 88, 70)" />
        </>
      }
      extras={
        <g>
          {/* Thumb detail on right paw */}
          <circle
            cx={113} cy={50}
            r={3.5}
            style={{ fill: C.accent }}
          />
          <rect
            x={111} y={44} width={4} height={8} rx={2}
            style={{ fill: C.accent }}
            transform="rotate(-20, 113, 48)"
          />
        </g>
      }
    />
  );
}

function CoachingState() {
  return (
    <OtterBase
      tilt={-3}
      eyes={
        <>
          <EyesNormal />
          <BrowsConcerned />
        </>
      }
      mouth={<MouthGentle />}
      arms={
        <>
          <LeftArm />
          {/* Right arm — extended outward toward user */}
          <RightArm transform="rotate(60, 88, 70)" />
        </>
      }
    />
  );
}

function WaitingState() {
  return (
    <OtterBase
      tilt={-5}
      eyes={<EyesLookUp />}
      mouth={<MouthSmall />}
      arms={
        <>
          {/* Both arms resting in front of body */}
          <LeftArm transform="rotate(50, 32, 70)" />
          <RightArm transform="rotate(-50, 88, 70)" />
        </>
      }
    />
  );
}

function ExcitedState() {
  return (
    <OtterBase
      eyes={<EyesWide />}
      mouth={<MouthOpen />}
      arms={
        <>
          {/* Arms flung wide out to both sides */}
          <LeftArm transform="rotate(-90, 32, 70)" />
          <RightArm transform="rotate(90, 88, 70)" />
        </>
      }
      extras={
        <g>
          {/* Energy sparkles */}
          <circle cx={8} cy={50} r={2.5} style={{ fill: C.accent }} />
          <circle cx={112} cy={50} r={2.5} style={{ fill: C.accent }} />
          <circle cx={14} cy={36} r={1.8} style={{ fill: C.accent }} />
          <circle cx={106} cy={36} r={1.8} style={{ fill: C.accent }} />
          <rect
            x={4} y={62} width={3} height={3} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 5.5, 63.5)"
          />
          <rect
            x={113} y={62} width={3} height={3} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 114.5, 63.5)"
          />
        </g>
      }
    />
  );
}

function WavingState() {
  return (
    <OtterBase
      eyes={<EyesNormal />}
      mouth={<MouthGrin />}
      arms={
        <>
          <LeftArm />
          {/* Right arm — raised high, waving */}
          <RightArm transform="rotate(150, 88, 70)" />
        </>
      }
    />
  );
}

function SleepingState() {
  return (
    <OtterBase
      tilt={6}
      eyes={<EyesSleeping />}
      mouth={<MouthSmall />}
      arms={
        <>
          <LeftArm />
          <RightArm />
        </>
      }
      extras={
        <g>
          {/* Static Zzz — no looping animation on idle screens */}
          <text
            x={90} y={20}
            style={{
              fill: C.accent,
              fontSize: '16px',
              fontWeight: 800,
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            Z
          </text>
          <text
            x={98} y={12}
            style={{
              fill: C.accent,
              fontSize: '12px',
              fontWeight: 800,
              fontFamily: 'Nunito, sans-serif',
              opacity: 0.6,
            }}
          >
            z
          </text>
          <text
            x={104} y={6}
            style={{
              fill: C.accent,
              fontSize: '9px',
              fontWeight: 800,
              fontFamily: 'Nunito, sans-serif',
              opacity: 0.3,
            }}
          >
            z
          </text>
        </g>
      }
    />
  );
}

/* -----------------------------------------------
   STATE MAP
   ----------------------------------------------- */

const STATE_MAP = {
  idle: IdleState,
  thinking: ThinkingState,
  celebrating: CelebratingState,
  encouraging: EncouragingState,
  coaching: CoachingState,
  waiting: WaitingState,
  excited: ExcitedState,
  waving: WavingState,
  sleeping: SleepingState,
};

/* -----------------------------------------------
   MAIN COMPONENT
   ----------------------------------------------- */

export default function Ott({ state = 'idle', size = 120 }) {
  const StateComponent = STATE_MAP[state] || IdleState;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 140"
      className={`ott ott--${state}`}
      role="img"
      aria-label={`Ott the Otter — ${state}`}
    >
      <StateComponent />
    </svg>
  );
}
