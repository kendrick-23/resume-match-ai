/**
 * Single source of truth for score-tier breakpoints and colors.
 * Keep in sync with backend/app/constants/scoring.py.
 */

export const TIER_BREAKPOINTS = { strong: 70, stretch: 45, weak: 20 };

export const SCORE_COLORS = {
  strong: 'var(--color-success)',
  stretch: 'var(--color-warning)',
  weak: 'var(--color-danger)',
  wrong_domain: 'var(--color-text-muted)',
};

export const SCORE_COLORS_HEX = {
  strong: '#58CC02',
  stretch: '#FFC800',
  weak: '#FF4B4B',
  wrong_domain: '#CCCCCC',
};

/**
 * Derive a tier label from a raw 0-100 score.
 */
export function deriveTier(score) {
  if (score == null) return 'stretch';
  if (score >= TIER_BREAKPOINTS.strong) return 'strong';
  if (score >= TIER_BREAKPOINTS.stretch) return 'stretch';
  if (score >= TIER_BREAKPOINTS.weak) return 'weak';
  return 'wrong_domain';
}

/**
 * Return the appropriate CSS variable color for a score.
 */
export function scoreColor(score) {
  if (score >= TIER_BREAKPOINTS.strong) return SCORE_COLORS.strong;
  if (score >= TIER_BREAKPOINTS.stretch) return SCORE_COLORS.stretch;
  return SCORE_COLORS.weak;
}

/**
 * Map a score to a Badge variant name (success/warning/danger).
 */
export function scoreBadgeVariant(score) {
  if (score >= TIER_BREAKPOINTS.strong) return 'success';
  if (score >= TIER_BREAKPOINTS.stretch) return 'warning';
  return 'danger';
}

/**
 * Map a score to an Ott emotional state.
 */
export function scoreOttState(score) {
  if (score >= TIER_BREAKPOINTS.strong) return 'celebrating';
  if (score >= TIER_BREAKPOINTS.stretch) return 'encouraging';
  return 'coaching';
}

/**
 * Return a sub-score bar color (uses a 70/50 split for finer granularity).
 */
export function subScoreColor(value) {
  if (value >= 70) return 'var(--color-success)';
  if (value >= 50) return 'var(--color-warning)';
  return 'var(--color-accent)';
}
