/**
 * Canonical Ott size tiers. Every Ott appearance must use one of these.
 * Keep in sync with the visual audit hierarchy in scripts/audit-report.md.
 */
export const OTT_SIZES = {
  scene: 160,      // milestone modal, onboarding full scenes, login splash
  hero: 120,       // Dashboard greeting, VerdictCard, full-page error/empty
  supporting: 56,  // empty states within cards, loading states, CTA cards
  accent: 32,      // hint bubbles, toasts, inline coaching tips
  badge: 20,       // logo lockup, favicon-style uses
};
