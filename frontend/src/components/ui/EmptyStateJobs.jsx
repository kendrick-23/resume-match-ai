export default function EmptyStateJobs({ size = 120 }) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
      <img
        src="/ott/ott-thinking.png"
        alt="Ott thinking"
        width={size}
        style={{ display: 'block', margin: '0 auto' }}
      />
      <p style={{
        color: 'var(--color-text-muted)',
        fontSize: '14px',
        lineHeight: 1.6,
        marginTop: 'var(--space-3)',
        maxWidth: '280px',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}>
        Ott's sniffing around. Try a different search or check back soon.
      </p>
    </div>
  );
}
