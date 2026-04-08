import HoltWordmark from './HoltWordmark';
import HeaderSettingsMenu from './HeaderSettingsMenu';
import HeaderStreak from './HeaderStreak';
import './ScreenWrapper.css';

export default function ScreenWrapper({ children, className = '', screenName = '' }) {
  const classes = ['screen', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {screenName && (
        <div className="screen__header">
          <div className="screen__header-left">
            <HoltWordmark />
            <HeaderStreak />
          </div>
          <div className="screen__header-right">
            <span className="screen__header-name">{screenName}</span>
            <HeaderSettingsMenu />
          </div>
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
