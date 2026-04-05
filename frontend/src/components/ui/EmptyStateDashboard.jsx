export default function EmptyStateDashboard({ size = 200 }) {
  return (
    <svg
      viewBox="0 0 220 180"
      width={size}
      height={size * (180 / 220)}
      role="img"
      aria-label="Ott waving hello with a welcome speech bubble"
      style={{ display: 'block', margin: '0 auto' }}
    >
      {/* Speech bubble */}
      <g>
        <rect x="95" y="8" width="115" height="42" rx="12" fill="var(--color-surface-raised, #FFFFFF)" stroke="var(--color-border, #E8E0D5)" strokeWidth="1.5" />
        {/* Bubble tail */}
        <path d="M105 50 L95 62 L115 50" fill="var(--color-surface-raised, #FFFFFF)" />
        <path d="M105 50 L95 62 L115 50" fill="none" stroke="var(--color-border, #E8E0D5)" strokeWidth="1.5" />
        {/* Cover overlap of tail stroke with bubble */}
        <rect x="104" y="48" width="13" height="4" fill="var(--color-surface-raised, #FFFFFF)" />
        {/* Text */}
        <text
          x="152"
          y="26"
          fontFamily="'Nunito', sans-serif"
          fontWeight="800"
          fontSize="11"
          fill="var(--color-text, #2D2A26)"
          textAnchor="middle"
          letterSpacing="-0.02em"
        >
          Welcome to Holt!
        </text>
        <text
          x="152"
          y="41"
          fontFamily="'Nunito', sans-serif"
          fontWeight="500"
          fontSize="8.5"
          fill="var(--color-text-secondary, #5A5349)"
          textAnchor="middle"
        >
          Let's find your next role
        </text>
      </g>

      {/* Ground */}
      <ellipse cx="65" cy="165" rx="50" ry="5" fill="var(--color-surface, #F0EBE3)" />

      {/* Ott waving */}
      <g transform="translate(25, 45)">
        {/* Tail */}
        <ellipse cx="60" cy="100" rx="20" ry="6" fill="var(--color-ott-brown, #8B5E3C)" transform="rotate(-10 60 100)" />
        {/* Body */}
        <ellipse cx="40" cy="82" rx="22" ry="30" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Belly */}
        <ellipse cx="40" cy="85" rx="14" ry="20" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Head */}
        <ellipse cx="40" cy="30" rx="20" ry="18" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Ears */}
        <ellipse cx="23" cy="16" rx="5" ry="3.5" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="23" cy="16" rx="3" ry="2" fill="var(--color-ott-cream, #F5E6C8)" />
        <ellipse cx="57" cy="16" rx="5" ry="3.5" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="57" cy="16" rx="3" ry="2" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Face patch */}
        <ellipse cx="40" cy="34" rx="14" ry="11" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Eyes — big and happy */}
        <circle cx="33" cy="27" r="3.5" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="47" cy="27" r="3.5" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="34" cy="25.5" r="1.2" fill="white" />
        <circle cx="48" cy="25.5" r="1.2" fill="white" />
        {/* Nose */}
        <ellipse cx="40" cy="32" rx="3" ry="2" fill="var(--color-ott-dark, #5C3D22)" />
        {/* Big smile */}
        <path d="M33 36 Q40 42 47 36" fill="none" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="1.2" strokeLinecap="round" />
        {/* Whiskers */}
        <line x1="22" y1="31" x2="29" y2="32.5" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="22" y1="34" x2="29" y2="33.5" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="51" y1="32.5" x2="58" y2="31" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="51" y1="33.5" x2="58" y2="34" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        {/* Scarf */}
        <path d="M22 46 Q40 53 58 46" fill="none" stroke="var(--color-accent, #2BB5C0)" strokeWidth="4" strokeLinecap="round" />
        {/* Left arm down */}
        <ellipse cx="18" cy="70" rx="6" ry="4.5" fill="var(--color-ott-brown, #8B5E3C)" transform="rotate(-15 18 70)" />
        {/* Right arm waving up */}
        <g transform="rotate(-45 62 55)">
          <ellipse cx="62" cy="55" rx="6" ry="4.5" fill="var(--color-ott-brown, #8B5E3C)" />
          {/* Paw pad */}
          <circle cx="66" cy="53" r="2" fill="var(--color-ott-cream, #F5E6C8)" />
        </g>
      </g>
    </svg>
  );
}
