export default function EmptyStateUpload({ size = 180 }) {
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={size * 0.8}
      role="img"
      aria-label="Ott waiting at a desk with papers"
      style={{ display: 'block', margin: '0 auto' }}
    >
      {/* Desk */}
      <rect x="30" y="105" width="140" height="8" rx="4" fill="var(--color-accent, #2BB5C0)" opacity="0.8" />
      {/* Desk legs */}
      <rect x="45" y="113" width="6" height="20" rx="2" fill="var(--color-accent-dark, #1E8F99)" />
      <rect x="149" y="113" width="6" height="20" rx="2" fill="var(--color-accent-dark, #1E8F99)" />

      {/* Papers on desk */}
      <g transform="translate(50, 78)">
        {/* Back paper */}
        <rect x="4" y="2" width="28" height="36" rx="2" fill="var(--color-surface, #F0EBE3)" stroke="var(--color-border, #E8E0D5)" strokeWidth="1" transform="rotate(-8 18 20)" />
        {/* Front paper */}
        <rect x="0" y="0" width="28" height="36" rx="2" fill="var(--color-surface-raised, #FFFFFF)" stroke="var(--color-border, #E8E0D5)" strokeWidth="1" transform="rotate(3 14 18)" />
        {/* Paper lines */}
        <line x1="6" y1="10" x2="22" y2="10" stroke="var(--color-border-strong, #C8BFB4)" strokeWidth="1" transform="rotate(3 14 18)" />
        <line x1="6" y1="16" x2="20" y2="16" stroke="var(--color-border-strong, #C8BFB4)" strokeWidth="1" transform="rotate(3 14 18)" />
        <line x1="6" y1="22" x2="18" y2="22" stroke="var(--color-border-strong, #C8BFB4)" strokeWidth="1" transform="rotate(3 14 18)" />
      </g>

      {/* More papers right side */}
      <g transform="translate(125, 82)">
        <rect x="0" y="0" width="24" height="32" rx="2" fill="var(--color-surface-raised, #FFFFFF)" stroke="var(--color-border, #E8E0D5)" strokeWidth="1" transform="rotate(-5 12 16)" />
        <line x1="5" y1="9" x2="19" y2="9" stroke="var(--color-border-strong, #C8BFB4)" strokeWidth="1" transform="rotate(-5 12 16)" />
        <line x1="5" y1="14" x2="17" y2="14" stroke="var(--color-border-strong, #C8BFB4)" strokeWidth="1" transform="rotate(-5 12 16)" />
      </g>

      {/* Ott sitting at desk */}
      <g transform="translate(82, 36)">
        {/* Body */}
        <ellipse cx="18" cy="52" rx="16" ry="20" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Belly */}
        <ellipse cx="18" cy="54" rx="10" ry="14" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Head */}
        <ellipse cx="18" cy="20" rx="16" ry="14" fill="var(--color-ott-brown, #8B5E3C)" />
        {/* Ears */}
        <ellipse cx="5" cy="10" rx="4" ry="3" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="5" cy="10" rx="2.5" ry="1.8" fill="var(--color-ott-cream, #F5E6C8)" />
        <ellipse cx="31" cy="10" rx="4" ry="3" fill="var(--color-ott-brown, #8B5E3C)" />
        <ellipse cx="31" cy="10" rx="2.5" ry="1.8" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Face patch */}
        <ellipse cx="18" cy="24" rx="11" ry="9" fill="var(--color-ott-cream, #F5E6C8)" />
        {/* Eyes — looking up expectantly */}
        <circle cx="12" cy="18" r="3" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="24" cy="18" r="3" fill="var(--color-ott-dark, #5C3D22)" />
        <circle cx="12.5" cy="16.5" r="1" fill="white" />
        <circle cx="24.5" cy="16.5" r="1" fill="white" />
        {/* Nose */}
        <ellipse cx="18" cy="22" rx="2.5" ry="1.6" fill="var(--color-ott-dark, #5C3D22)" />
        {/* Slight smile */}
        <path d="M14 25 Q18 28 22 25" fill="none" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="1" strokeLinecap="round" />
        {/* Whiskers */}
        <line x1="4" y1="22" x2="10" y2="23" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="4" y1="25" x2="10" y2="24.5" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="26" y1="23" x2="32" y2="22" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        <line x1="26" y1="24.5" x2="32" y2="25" stroke="var(--color-ott-dark, #5C3D22)" strokeWidth="0.6" opacity="0.5" />
        {/* Scarf */}
        <path d="M4 32 Q18 38 32 32" fill="none" stroke="var(--color-accent, #2BB5C0)" strokeWidth="3" strokeLinecap="round" />
        {/* Arms resting on desk */}
        <ellipse cx="2" cy="58" rx="5" ry="3.5" fill="var(--color-ott-brown, #8B5E3C)" transform="rotate(-20 2 58)" />
        <ellipse cx="34" cy="58" rx="5" ry="3.5" fill="var(--color-ott-brown, #8B5E3C)" transform="rotate(20 34 58)" />
      </g>
    </svg>
  );
}
