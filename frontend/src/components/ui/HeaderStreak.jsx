import { useStreak } from '../../context/StreakContext';

export default function HeaderStreak() {
  const { streak } = useStreak();

  // Don't show a 0 — keep the bar clean for new users
  if (!streak || streak < 1) return null;

  return (
    <div className="header-streak" aria-label={`${streak} day streak`}>
      <img
        src="/ott/streak-active.png"
        alt=""
        className="header-streak__icon"
      />
      <span className="header-streak__count">{streak}</span>
    </div>
  );
}
