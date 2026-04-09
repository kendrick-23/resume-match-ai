export default function EmptyStateUpload({ size = 180 }) {
  return (
    <img
      src="/ott/ott-waiting.png"
      alt="Ott waiting"
      width={size}
      style={{ display: 'block', margin: '0 auto' }}
    />
  );
}
