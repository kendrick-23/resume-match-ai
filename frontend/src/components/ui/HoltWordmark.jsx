export default function HoltWordmark({ size = 'default' }) {
  const height = size === 'large' ? 48 : 32;
  const scale = height / 32;

  return (
    <svg
      viewBox="0 0 140 32"
      height={height}
      width={140 * scale}
      role="img"
      aria-label="Holt"
      className="holt-wordmark"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Ott face icon */}
      <g transform="translate(2, 2)">
        {/* Head */}
        <ellipse cx="14" cy="15" rx="13" ry="12" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Left ear */}
        <ellipse cx="4" cy="6" rx="3.5" ry="2.5" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="4" cy="6" rx="2" ry="1.5" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Right ear */}
        <ellipse cx="24" cy="6" rx="3.5" ry="2.5" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="24" cy="6" rx="2" ry="1.5" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Face patch */}
        <ellipse cx="14" cy="17" rx="9" ry="8" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Eyes */}
        <circle cx="9.5" cy="12" r="2.5" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="18.5" cy="12" r="2.5" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="10.2" cy="11.2" r="0.8" fill="white" />
        <circle cx="19.2" cy="11.2" r="0.8" fill="white" />
        {/* Nose */}
        <ellipse cx="14" cy="15.5" rx="2" ry="1.4" fill="var(--color-ott-dark, #5C3D22)" />
        {/* Mouth */}
        <path d="M12 17.5 Q14 19.5 16 17.5" fill="none" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.8" strokeLinecap="round" />
        {/* Whiskers */}
        <line x1="3" y1="15" x2="8" y2="16" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.6" />
        <line x1="3" y1="17" x2="8" y2="17" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.6" />
        <line x1="20" y1="16" x2="25" y2="15" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.6" />
        <line x1="20" y1="17" x2="25" y2="17" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.5" opacity="0.6" />
        {/* Teal scarf detail */}
        <path d="M5 23 Q14 27 23 23" fill="none" stroke="var(--color-accent, #2BB5C0)" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* "holt" text */}
      <text
        x="38"
        y="24"
        fontFamily="'Nunito', sans-serif"
        fontWeight="900"
        fontSize="24"
        fill="var(--color-text, #2D2A26)"
        letterSpacing="-0.02em"
      >
        holt
      </text>
    </svg>
  );
}
