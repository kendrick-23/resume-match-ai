import './Ott.css';

/* ============================================
   Ott the Otter — SVG Mascot Component
   9 states, all built from rounded geometric shapes.
   Colors reference CSS custom properties from tokens.css.

   Anatomy: compact, wide body with low center of gravity.
   Small flat ears flush to head. Prominent puffy cheeks
   (whisker pads). Thick tapered tail. Webbed paws.
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
  /* Thick, flat, tapered otter tail — visible behind body to the right */
  return (
    <path
      d="M 80 96 C 96 86, 116 90, 114 102 C 112 112, 100 116, 94 110 C 88 104, 86 100, 80 96"
      style={{ fill: C.brown }}
    />
  );
}

function Feet() {
  /* Wide, webbed otter feet */
  return (
    <g>
      {/* Left foot */}
      <ellipse cx={44} cy={119} rx={14} ry={5} style={{ fill: C.brown }} />
      <g style={{ stroke: C.dark, strokeWidth: 0.8, strokeLinecap: 'round', fill: 'none' }}>
        <line x1={38} y1={117} x2={38} y2={122} />
        <line x1={42} y1={116} x2={42} y2={122} />
        <line x1={46} y1={116} x2={46} y2={122} />
      </g>
      {/* Right foot */}
      <ellipse cx={76} cy={119} rx={14} ry={5} style={{ fill: C.brown }} />
      <g style={{ stroke: C.dark, strokeWidth: 0.8, strokeLinecap: 'round', fill: 'none' }}>
        <line x1={72} y1={116} x2={72} y2={122} />
        <line x1={76} y1={116} x2={76} y2={122} />
        <line x1={80} y1={117} x2={80} y2={122} />
      </g>
    </g>
  );
}

function BodyShape() {
  /* Wide, round body — low center of gravity */
  return <ellipse cx={60} cy={88} rx={32} ry={30} style={{ fill: C.brown }} />;
}

function BellyShape() {
  return <ellipse cx={60} cy={86} rx={21} ry={22} style={{ fill: C.cream }} />;
}

function Scarf() {
  return (
    <g>
      <rect x={32} y={57} width={56} height={7} rx={3.5} style={{ fill: C.accent }} />
      <rect
        x={64} y={62} width={7} height={13} rx={3.5}
        style={{ fill: C.accent }}
        transform="rotate(10, 67, 68)"
      />
      <rect
        x={57} y={62} width={6} height={10} rx={3}
        style={{ fill: C.accent }}
        transform="rotate(-8, 60, 67)"
      />
    </g>
  );
}

function HeadShape() {
  /* Wider, flatter head — otter proportions */
  return <ellipse cx={60} cy={36} rx={32} ry={23} style={{ fill: C.brown }} />;
}

function Ears() {
  /* Small, flat ears — barely extending above head, flush to sides */
  return (
    <g>
      <ellipse cx={34} cy={18} rx={6} ry={4} style={{ fill: C.brown }} />
      <ellipse cx={34} cy={18} rx={3.5} ry={2.5} style={{ fill: C.cream }} />
      <ellipse cx={86} cy={18} rx={6} ry={4} style={{ fill: C.brown }} />
      <ellipse cx={86} cy={18} rx={3.5} ry={2.5} style={{ fill: C.cream }} />
    </g>
  );
}

function Cheeks() {
  /* Prominent puffy whisker pads — the defining otter feature */
  return (
    <g>
      <ellipse cx={43} cy={44} rx={11} ry={8} style={{ fill: C.cream }} />
      <ellipse cx={77} cy={44} rx={11} ry={8} style={{ fill: C.cream }} />
    </g>
  );
}

function Muzzle() {
  /* Wide muzzle connecting the cheeks */
  return <ellipse cx={60} cy={45} rx={13} ry={9} style={{ fill: C.cream }} />;
}

function Nose() {
  /* Small, dark, oval — otter nose is wider than tall */
  return <ellipse cx={60} cy={42} rx={4} ry={2.5} style={{ fill: C.dark }} />;
}

function Whiskers() {
  /* Three whiskers per side, fanning out from cheeks */
  return (
    <g style={{ stroke: C.dark, strokeWidth: 1.2, strokeLinecap: 'round' }}>
      <line x1={43} y1={42} x2={22} y2={37} style={{ fill: 'none' }} />
      <line x1={43} y1={44} x2={22} y2={46} style={{ fill: 'none' }} />
      <line x1={43} y1={43} x2={24} y2={42} style={{ fill: 'none' }} />
      <line x1={77} y1={42} x2={98} y2={37} style={{ fill: 'none' }} />
      <line x1={77} y1={44} x2={98} y2={46} style={{ fill: 'none' }} />
      <line x1={77} y1={43} x2={96} y2={42} style={{ fill: 'none' }} />
    </g>
  );
}

/* -----------------------------------------------
   EYE VARIANTS
   Eyes are wide-set to match the broader head.
   ----------------------------------------------- */

function EyesNormal() {
  return (
    <g>
      <circle cx={47} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={47} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={45} cy={31} r={1.2} style={{ fill: C.white }} />
      <circle cx={73} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={73} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={71} cy={31} r={1.2} style={{ fill: C.white }} />
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
      <path d="M 41 34 Q 47 28 53 34" />
      <path d="M 67 34 Q 73 28 79 34" />
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
      <line x1={41} y1={33} x2={53} y2={33} />
      <line x1={67} y1={33} x2={79} y2={33} />
    </g>
  );
}

function EyesWink() {
  return (
    <g>
      {/* Left eye — normal */}
      <circle cx={47} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={47} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={45} cy={31} r={1.2} style={{ fill: C.white }} />
      {/* Right eye — wink arc */}
      <path
        d="M 67 34 Q 73 28 79 34"
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
      <circle cx={47} cy={32} r={7} style={{ fill: C.white }} />
      <circle cx={47} cy={33} r={4} style={{ fill: C.dark }} />
      <circle cx={45} cy={30} r={1.4} style={{ fill: C.white }} />
      <circle cx={73} cy={32} r={7} style={{ fill: C.white }} />
      <circle cx={73} cy={33} r={4} style={{ fill: C.dark }} />
      <circle cx={71} cy={30} r={1.4} style={{ fill: C.white }} />
    </g>
  );
}

function EyesLookUp() {
  return (
    <g>
      <circle cx={47} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={47} cy={30} r={3.5} style={{ fill: C.dark }} />
      <circle cx={45} cy={28.5} r={1.2} style={{ fill: C.white }} />
      <circle cx={73} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={73} cy={30} r={3.5} style={{ fill: C.dark }} />
      <circle cx={71} cy={28.5} r={1.2} style={{ fill: C.white }} />
    </g>
  );
}

function EyesLookSide() {
  return (
    <g>
      <circle cx={47} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={49} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={47.5} cy={31} r={1.2} style={{ fill: C.white }} />
      <circle cx={73} cy={32} r={6} style={{ fill: C.white }} />
      <circle cx={75} cy={33} r={3.5} style={{ fill: C.dark }} />
      <circle cx={73.5} cy={31} r={1.2} style={{ fill: C.white }} />
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
      <line x1={41} y1={24} x2={50} y2={22} />
      <line x1={79} y1={24} x2={70} y2={22} />
    </g>
  );
}

/* -----------------------------------------------
   ARM HELPERS — positioned for wider body
   ----------------------------------------------- */

function LeftArm({ transform }) {
  return (
    <g transform={transform}>
      <rect x={22} y={72} width={12} height={26} rx={6} style={{ fill: C.brown }} />
      <ellipse cx={28} cy={98} rx={7} ry={5} style={{ fill: C.accent }} />
    </g>
  );
}

function RightArm({ transform }) {
  return (
    <g transform={transform}>
      <rect x={86} y={72} width={12} height={26} rx={6} style={{ fill: C.brown }} />
      <ellipse cx={92} cy={98} rx={7} ry={5} style={{ fill: C.accent }} />
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
      <Cheeks />
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
          <LeftArm transform="rotate(130, 28, 72)" />
          {/* Right arm — raised, holding magnifying glass */}
          <RightArm transform="rotate(140, 92, 72)" />
        </>
      }
      extras={
        <g>
          {/* Magnifying glass: handle + lens */}
          <line
            x1={108} y1={47}
            x2={110} y2={38}
            style={{ stroke: C.dark, strokeWidth: 3, strokeLinecap: 'round' }}
          />
          <circle
            cx={112} cy={28}
            r={10}
            style={{ stroke: C.dark, strokeWidth: 2.5, fill: 'none' }}
          />
          <circle
            cx={112} cy={28}
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
          <LeftArm transform="rotate(-130, 28, 72)" />
          <RightArm transform="rotate(130, 92, 72)" />
        </>
      }
      extras={
        <g>
          {/* Celebration sparkles */}
          <circle cx={18} cy={24} r={2.5} style={{ fill: C.accent }} />
          <circle cx={102} cy={18} r={2} style={{ fill: C.accent }} />
          <circle cx={12} cy={40} r={1.5} style={{ fill: C.accent }} />
          <circle cx={108} cy={38} r={1.8} style={{ fill: C.accent }} />
          {/* Star shapes via rotated rects */}
          <rect
            x={8} y={12} width={4} height={4} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 10, 14)"
          />
          <rect
            x={106} y={8} width={3} height={3} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 107.5, 9.5)"
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
          <RightArm transform="rotate(120, 92, 72)" />
        </>
      }
      extras={
        <g>
          {/* Thumb detail on right paw */}
          <circle
            cx={115} cy={50}
            r={3.5}
            style={{ fill: C.accent }}
          />
          <rect
            x={113} y={44} width={4} height={8} rx={2}
            style={{ fill: C.accent }}
            transform="rotate(-20, 115, 48)"
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
          <RightArm transform="rotate(60, 92, 72)" />
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
          <LeftArm transform="rotate(50, 28, 72)" />
          <RightArm transform="rotate(-50, 92, 72)" />
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
          <LeftArm transform="rotate(-90, 28, 72)" />
          <RightArm transform="rotate(90, 92, 72)" />
        </>
      }
      extras={
        <g>
          {/* Energy sparkles */}
          <circle cx={6} cy={50} r={2.5} style={{ fill: C.accent }} />
          <circle cx={114} cy={50} r={2.5} style={{ fill: C.accent }} />
          <circle cx={12} cy={36} r={1.8} style={{ fill: C.accent }} />
          <circle cx={108} cy={36} r={1.8} style={{ fill: C.accent }} />
          <rect
            x={2} y={62} width={3} height={3} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 3.5, 63.5)"
          />
          <rect
            x={115} y={62} width={3} height={3} rx={0.5}
            style={{ fill: C.accent }}
            transform="rotate(45, 116.5, 63.5)"
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
          <RightArm transform="rotate(150, 92, 72)" />
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
            x={92} y={20}
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
            x={100} y={12}
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
            x={106} y={6}
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
