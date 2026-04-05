import Ott from '../ott/Ott';
import './Toast.css';

const OTT_STATE = {
  success: 'celebrating',
  error: 'coaching',
  warning: 'thinking',
  info: 'encouraging',
};

export default function Toast({ message, variant = 'info', exiting, onTap, onDismiss }) {
  const classes = [
    'toast',
    `toast--${variant}`,
    exiting ? 'toast--exit' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      onClick={() => {
        if (onTap) onTap();
        onDismiss();
      }}
      role="alert"
    >
      <div className="toast__icon">
        <Ott state={OTT_STATE[variant] || 'idle'} size={24} />
      </div>
      <p className="toast__message">{message}</p>
    </div>
  );
}
