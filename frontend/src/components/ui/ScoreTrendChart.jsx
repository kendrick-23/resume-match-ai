import { useState, useMemo } from 'react';
import './ScoreTrendChart.css';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const PAD_X = 24;
const PAD_TOP = 8;
const PAD_BOTTOM = 24;
const DOT_RADIUS = 6;
const PLOT_W = CHART_WIDTH - PAD_X * 2;
const PLOT_H = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

export default function ScoreTrendChart({ analyses }) {
  const [activeIdx, setActiveIdx] = useState(null);

  // Oldest first for left-to-right display
  const points = useMemo(() => {
    const sorted = [...analyses].reverse();
    return sorted.map((a, i) => {
      const x = sorted.length === 1
        ? PAD_X + PLOT_W / 2
        : PAD_X + (i / (sorted.length - 1)) * PLOT_W;
      const y = PAD_TOP + PLOT_H - (a.score / 100) * PLOT_H;
      return {
        x,
        y,
        score: a.score,
        roleName: a.role_name || a.company_name || 'Analysis',
        date: new Date(a.created_at).toLocaleDateString(),
      };
    });
  }, [analyses]);

  // Trend detection
  const trend = useMemo(() => {
    if (points.length < 2) return 'steady';
    const first = points[0].score;
    const last = points[points.length - 1].score;
    const diff = last - first;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'steady';
  }, [points]);

  const lineColor = trend === 'improving'
    ? 'var(--color-accent)'
    : trend === 'steady'
      ? 'var(--color-warning)'
      : 'var(--color-accent)';

  // Build SVG path
  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');

  // Gradient fill area path
  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x} ${CHART_HEIGHT - PAD_BOTTOM} L ${points[0].x} ${CHART_HEIGHT - PAD_BOTTOM} Z`
    : '';

  // Calculate path length for draw animation
  const pathLength = useMemo(() => {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return Math.ceil(len);
  }, [points]);

  // Enough space for labels?
  const showLabels = points.length <= 1 || (PLOT_W / (points.length - 1)) >= 48;

  const gradientId = 'score-trend-gradient';

  return (
    <div className="score-trend">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height={CHART_HEIGHT}
        className="score-trend__svg"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trend === 'improving' ? '#2BB5C0' : trend === 'steady' ? '#FFC800' : '#2BB5C0'} stopOpacity="0.2" />
            <stop offset="100%" stopColor={trend === 'improving' ? '#2BB5C0' : trend === 'steady' ? '#FFC800' : '#2BB5C0'} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gradient fill under line */}
        {areaD && (
          <path
            d={areaD}
            fill={`url(#${gradientId})`}
            className="score-trend__area"
          />
        )}

        {/* Trend line */}
        {points.length > 1 && (
          <path
            d={pathD}
            fill="none"
            stroke={lineColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="score-trend__line"
            style={{
              '--path-length': pathLength,
            }}
          />
        )}

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i} className="score-trend__point" style={{ '--point-delay': `${600 + i * 100}ms` }}>
            <circle
              cx={p.x}
              cy={p.y}
              r={DOT_RADIUS}
              fill="white"
              stroke={lineColor}
              strokeWidth="2.5"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onTouchStart={() => setActiveIdx(activeIdx === i ? null : i)}
            />
            {/* Score label below dot */}
            {showLabels && (
              <text
                x={p.x}
                y={p.y + DOT_RADIUS + 14}
                textAnchor="middle"
                className="score-trend__label"
              >
                {p.score}
              </text>
            )}
          </g>
        ))}

        {/* Tooltip */}
        {activeIdx !== null && points[activeIdx] && (
          <g className="score-trend__tooltip">
            <rect
              x={points[activeIdx].x - 60}
              y={points[activeIdx].y - 42}
              width="120"
              height="32"
              rx="8"
              fill="var(--color-surface-raised, white)"
              stroke="var(--color-border, #E8E0D5)"
              strokeWidth="1"
            />
            <text
              x={points[activeIdx].x}
              y={points[activeIdx].y - 28}
              textAnchor="middle"
              className="score-trend__tooltip-score"
            >
              {points[activeIdx].score}%
            </text>
            <text
              x={points[activeIdx].x}
              y={points[activeIdx].y - 16}
              textAnchor="middle"
              className="score-trend__tooltip-detail"
            >
              {points[activeIdx].roleName.length > 20
                ? points[activeIdx].roleName.slice(0, 20) + '...'
                : points[activeIdx].roleName}
              {' · '}
              {points[activeIdx].date}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function TrendBadge({ analyses }) {
  if (analyses.length < 2) return null;

  const sorted = [...analyses].reverse();
  const first = sorted[0].score;
  const last = sorted[sorted.length - 1].score;
  const diff = last - first;

  let label, className;
  if (diff > 5) {
    label = '\u2191 Improving';
    className = 'trend-badge--improving';
  } else if (diff < -5) {
    label = '\u2193 Needs work';
    className = 'trend-badge--declining';
  } else {
    label = '\u2192 Steady';
    className = 'trend-badge--steady';
  }

  return (
    <span className={`trend-badge ${className}`}>{label}</span>
  );
}
