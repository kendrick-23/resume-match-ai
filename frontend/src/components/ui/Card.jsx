import './Card.css';

export default function Card({
  children,
  interactive = false,
  className = '',
  ...props
}) {
  const classes = [
    'card',
    interactive && 'card--interactive',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
