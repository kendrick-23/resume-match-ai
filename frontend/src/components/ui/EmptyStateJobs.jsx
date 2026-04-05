export default function EmptyStateJobs({ size = 180 }) {
  return (
    <svg
      viewBox="0 0 200 170"
      width={size}
      height={size * 0.85}
      role="img"
      aria-label="Ott looking through binoculars into the distance"
      style={{ display: 'block', margin: '0 auto' }}
    >
      {/* Sparkles */}
      <g fill="var(--color-accent, #2BB5C0)" opacity="0.6">
        <path d="M40 25 L42 20 L44 25 L49 27 L44 29 L42 34 L40 29 L35 27 Z" />
        <path d="M155 15 L156.5 11 L158 15 L162 16.5 L158 18 L156.5 22 L155 18 L151 16.5 Z" />
        <path d="M170 55 L171 52 L172 55 L175 56 L172 57 L171 60 L170 57 L167 56 Z" />
      </g>

      {/* Small sparkles */}
      <g fill="var(--color-warning, #FFC800)" opacity="0.5">
        <path d="M30 50 L31 47.5 L32 50 L34.5 51 L32 52 L31 54.5 L30 52 L27.5 51 Z" />
        <path d="M165 85 L166 83 L167 85 L169 86 L167 87 L166 89 L165 87 L163 86 Z" />
      </g>

      {/* Ground line */}
      <ellipse cx="100" cy="145" rx="60" ry="4" fill="var(--color-surface, #F0EBE3)" />

      {/* Ott with binoculars */}
      <g transform="translate(65, 40)">
        {/* Tail */}
        <ellipse cx="55" cy="90" rx="18" ry="5" fill="var(--color-ott-brown, #8B5E3C)" transform="rotate(-15 55 90)" />
        {/* Body */}
        <ellipse cx="35" cy="75" rx="20" ry="26" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Belly */}
        <ellipse cx="35" cy="78" rx="13" ry="18" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Head */}
        <ellipse cx="35" cy="28" rx="18" ry="16" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Ears */}
        <ellipse cx="20" cy="16" rx="4.5" ry="3" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="20" cy="16" rx="2.8" ry="1.8" fill="var(--color-ott-cream, #F5E6C8)" />
        <ellipse cx="50" cy="16" rx="4.5" ry="3" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="50" cy="16" rx="2.8" ry="1.8" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Face patch */}
        <ellipse cx="35" cy="32" rx="12" ry="10" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Scarf */}
        <path d="M20 42 Q35 48 50 42" fill="none" stroke="var(--color-accent, #2BB5C0)" strokeWidth="3.5" strokeLinecap="round" />

        {/* Binoculars */}
        <g transform="translate(22, 22)">
          {/* Left barrel */}
          <rect x="0" y="0" width="8" height="12" rx="3" fill="var(--color-ott-dark, #5C3D22)" />
          <circle cx="4" cy="1" r="4" fill="var(--color-ott-dark, #5C3D22)" />
          <circle cx="4" cy="1" r="2.5" fill="var(--color-accent, #2BB5C0)" opacity="0.4" />
          {/* Right barrel */}
          <rect x="12" y="0" width="8" height="12" rx="3" fill="var(--color-ott-dark, #5C3D22)" />
          <circle cx="16" cy="1" r="4" fill="var(--color-ott-dark, #5C3D22)" />
          <circle cx="16" cy="1" r="2.5" fill="var(--color-accent, #2BB5C0)" opacity="0.4" />
          {/* Bridge */}
          <rect x="7" y="3" width="6" height="4" rx="1" fill="var(--color-ott-dark, #5C3D22)" />
        </g>

        {/* Arms holding binoculars */}
        <ellipse cx="20" cy="48" rx="6" ry="4" fill="var(--color-ott-brown, #8B5E3C)" transform="rotate(-30 20 48)" />
        <ellipse cx="50" cy="48" rx="6" ry="4" fill="var(--color-ott-brown, #8B5E3C)" transform="rotate(30 50 48)" />

        {/* Nose (peeking below binoculars) */}
        <ellipse cx="35" cy="32" rx="2.5" ry="1.6" fill="var(--color-ott-dark, #5C3D22)" />
        {/* Mouth */}
        <path d="M31 35 Q35 38 39 35" fill="none" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="1" strokeLinecap="round" />
        {/* Whiskers */}
        <line x1="20" y1="30" x2="26" y2="31" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="20" y1="33" x2="26" y2="32.5" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="44" y1="31" x2="50" y2="30" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="44" y1="32.5" x2="50" y2="33" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
      </g>
    </svg>
  );
}
