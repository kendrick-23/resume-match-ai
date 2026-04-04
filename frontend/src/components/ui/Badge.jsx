import './Badge.css';

export default function Badge({
  children,
  variant = 'info',
  className = '',
  ...props
}) {
  const classes = ['badge', `badge--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
