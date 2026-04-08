export default function HoltWordmark({ size = 'default' }) {
  const logoHeight = size === 'large' ? 56 : 36;
  const fontSize = size === 'large' ? 32 : 22;

  return (
    <span
      className="holt-wordmark"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        verticalAlign: 'middle',
      }}
      role="img"
      aria-label="Holt"
    >
      <img
        src="/ott/holt-logo.png"
        alt="Holt"
        style={{
          height: logoHeight,
          width: logoHeight,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      <span
        style={{
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 900,
          fontSize,
          color: 'var(--color-text, #2D2A26)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        holt
      </span>
    </span>
  );
}
