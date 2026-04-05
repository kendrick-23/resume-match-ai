import HoltWordmark from './HoltWordmark';
import './ScreenWrapper.css';

export default function ScreenWrapper({ children, className = '', screenName = '' }) {
  const classes = ['screen', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {screenName && (
        <div className="screen__header">
          <HoltWordmark />
          <span className="screen__header-name">{screenName}</span>
        </div>
      )}
      <div className="screen__inner">
        <div className="screen__content">
          {children}
        </div>
      </div>
    </div>
  );
}
