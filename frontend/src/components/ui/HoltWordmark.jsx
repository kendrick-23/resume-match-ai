export default function HoltWordmark({ size = 'default' }) {
  const height = size === 'large' ? 48 : 28;
  const scale = height / 28;

  return (
    <svg
      viewBox="0 0 110 28"
      height={height}
      width={110 * scale}
      role="img"
      aria-label="Holt"
      className="holt-wordmark"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Simplified Ott face icon — face only, no body */}
      <g transform="translate(1, 1)">
        {/* Head */}
        <ellipse cx="13" cy="14" rx="12" ry="11" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Left ear — small, flat, otter-style */}
        <ellipse cx="3.5" cy="6" rx="3" ry="2" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="3.5" cy="6" rx="1.8" ry="1.2" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Right ear */}
        <ellipse cx="22.5" cy="6" rx="3" ry="2" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="22.5" cy="6" rx="1.8" ry="1.2" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Face patch */}
        <ellipse cx="13" cy="16" rx="8.5" ry="7.5" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Eyes */}
        <circle cx="9" cy="12" r="2.2" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="17" cy="12" r="2.2" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="9.6" cy="11" r="0.7" fill="white" />
        <circle cx="17.6" cy="11" r="0.7" fill="white" />
        {/* Nose */}
        <ellipse cx="13" cy="14.5" rx="1.8" ry="1.2" fill="var(--color-ott-dark, #5C3D22)" />
        {/* Smile */}
        <path d="M11 16.5 Q13 18.5 15 16.5" fill="none" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.7" strokeLinecap="round" />
        {/* Whiskers */}
        <line x1="3" y1="14" x2="7" y2="14.5" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.5" />
        <line x1="3" y1="16" x2="7" y2="15.5" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.5" />
        <line x1="19" y1="14.5" x2="23" y2="14" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.5" />
        <line x1="19" y1="15.5" x2="23" y2="16" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.5" />
        {/* Teal scarf */}
        <path d="M4 22 Q13 26 22 22" fill="none" stroke="var(--color-accent, #2BB5C0)" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* "holt" text */}
      <text
        x="32"
        y="21"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="21"
        fill="var(--color-text, #2D2A26)"
        letterSpacing="-0.02em"
      >
        holt
      </text>
    </svg>
  );
}
