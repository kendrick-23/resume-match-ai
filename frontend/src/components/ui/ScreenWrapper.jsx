import './ScreenWrapper.css';

export default function ScreenWrapper({ children, className = '' }) {
  const classes = ['screen', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="screen__inner">
        <div className="screen__content">
          {children}
        </div>
      </div>
    </div>
  );
}
