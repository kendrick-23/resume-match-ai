# Codebase Audit Report — 2026-04-10

4 parallel agents: emojis+colors, assets+empty states+hints, layout+spacing+typography, mobile+desktop+z-index

---

## Global Findings

### Emojis
**CLEAN.** Zero emoji characters found in any .jsx, .js, or .css file.

### Orphaned Assets (P2)
3 art assets in `frontend/public/ott/` are not referenced by any code:
- `ott-bank-header.png` — removed from Dashboard greeting card
- `ott-kelp-wrap.png` — removed from streak card
- `ott-sleeping-kelp.png` — never wired up

6 `.bak` files should be cleaned up or .gitignored.

### Missing Design Tokens (P2)
The stretch/weak tier colors appear 6+ times across Results.jsx, VerdictCard.jsx, VerdictCard.css with no token:
- `#F5A623` (stretch amber) — needs `--color-stretch`
- `#E8821A` (weak dark amber) — needs `--color-weak`
- `#FFF7E6` (stretch bg) — needs `--color-stretch-light`
- `#B86F00` (stretch text) — needs `--color-stretch-dark`
- `#FFF8F0` (warm gradient stop) — needs `--color-bg-warm`

---

## Per-Screen Findings

### Login
| # | Issue | Severity |
|---|-------|----------|
| 1 | Corner vegetation z-index inconsistent with Signup (Login=2, Signup=0) | P3 |
| 2 | `bottom: 60` on corners is a magic number — no named constant | P3 |

### Dashboard
| # | Issue | Severity |
|---|-------|----------|
| 3 | `.dashboard-greeting` has `overflow: hidden` — could clip Ott imagery with animation transforms | P3 |
| 4 | No loading indicator while activity fetches — brief empty state flash before data arrives | P2 |
| 5 | Streak icon watermark uses `top: '8px', right: '8px'` — should be `var(--space-2)` | P3 |
| 6 | Activity timestamp uses `fontSize: '12px'` — typography table says 13px is smallest label | P3 |

### Upload
| # | Issue | Severity |
|---|-------|----------|
| 7 | `.linkedin-file-selected__remove` is 28x28px — well below 44px touch target | P2 |
| 8 | `.linkedin-body` max-height cap at 400px — long content could clip | P3 |
| 9 | Several `marginTop: '2px'` hardcoded — should be `var(--space-1)` or removed | P3 |

### Jobs
| # | Issue | Severity |
|---|-------|----------|
| 10 | `.within-reach-expand` button has `padding: 0`, no min-height — below 44px touch target | P2 |
| 11 | `.jobs-filter-chip` ~31px tall — below 44px touch target | P2 |
| 12 | `.jobs-tabs__tab` min-height 40px — 4px short of 44px | P3 |
| 13 | `padding: '8px 14px'` on action buttons (6 instances) — 14px is not a spacing token | P2 |
| 14 | Missing word-break/overflow-wrap on job titles — long strings could overflow cards | P2 |
| 15 | No HintBubble on Jobs search results area | P2 |

### Results
| # | Issue | Severity |
|---|-------|----------|
| 16 | `fontSize: '36px'` for score — not in typography scale (should be 32px or 40px) | P2 |
| 17 | Stretch banner uses 3 hardcoded hex colors (`#FFF7E6`, `#F5A623`, `#B86F00`) — no tokens | P2 |
| 18 | Corner vegetation z-index: 10 — inconsistent with Login (2) and Signup (0) | P3 |
| 19 | Multiple `marginBottom: '4px'` — should be `var(--space-1)` | P3 |
| 20 | No HintBubble for score interpretation or coaching tips | P2 |

### Tracker
| # | Issue | Severity |
|---|-------|----------|
| 21 | `.tracker-stage-tab` ~31px tall — below 44px touch target | P2 |
| 22 | Status picker pills use `padding: '4px 12px'` — hardcoded spacing | P3 |
| 23 | Delete button `padding: '4px'` — hardcoded | P3 |

### Profile
| # | Issue | Severity |
|---|-------|----------|
| 24 | No overall loading/error state for `loadProfile()` — blank form on slow/failed fetch | P2 |
| 25 | Save bar stretches full viewport width on desktop — no max-width constraint | P2 |
| 26 | Save bar z-index 100 matches header/nav — fragile stacking | P3 |
| 27 | ~15 instances of `padding: '3px 10px'` on small buttons — sub-token values | P3 |
| 28 | `padding: '12px var(--space-4)'` on selects — mixed raw/token (12px = `var(--space-3)`) | P3 |

### Help
| # | Issue | Severity |
|---|-------|----------|
| 29 | `ott-with-pup.png` renders at bottom but page is static — verified working | OK |
| 30 | No HintBubble — acceptable since the page IS the help content | P3 |

---

## Cross-Cutting Findings

### Z-Index Conflicts
| # | Issue | Severity |
|---|-------|----------|
| 31 | HintBubble popover at z-index 100 — conflicts with header and bottom nav (both 100) | P2 |
| 32 | Legacy `.milestone-overlay` in animations.css at z-index 200 — conflicts with settings dropdown | P2 |
| 33 | Toast z-index 1000 — overshoots the 300 modal max by 3x | P3 |
| 34 | Corner vegetation z-index inconsistent: Login=2, Signup=0, Results=10 | P3 |

### Touch Targets Below 44px (Mobile)
| Element | Size | File | Severity |
|---------|------|------|----------|
| `.header-settings__trigger` | 40x40px | ScreenWrapper.css:115 | P2 |
| `.within-reach-expand` | ~30px | Jobs.css:61 | P2 |
| `.jobs-filter-chip` | ~31px | Jobs.css:83 | P2 |
| `.tracker-stage-tab` | ~31px | global.css:110 | P2 |
| `.linkedin-file-selected__remove` | 28x28px | Upload.css:140 | P2 |
| `.jobs-tabs__tab` | 40px | Jobs.css:156 | P3 |
| `.onboarding__pill` | 40px | Onboarding.css:207 | P3 |

### Hint Bubble Coverage
| Screen | Has Hint? | Storage Key |
|--------|-----------|-------------|
| Dashboard | No | — |
| Upload | No | — |
| Results | No | — |
| Jobs | Yes | `holt_hint_jobs_search` |
| Tracker | Yes | `holt_hint_tracker` |
| Profile | Yes | `holt_hint_resume_vault` |

### HintBubble.css `#FFFFFF` (P1)
Lines 67, 79 use `#FFFFFF` instead of `var(--color-surface-raised)`.

---

## Prioritized Summary

### P1 — Blocking / ugly (1)
1. HintBubble.css hardcodes `#FFFFFF` instead of `var(--color-surface-raised)` — inconsistent with token system

### P2 — Noticeable, fix soon (19)
2. Missing design tokens for stretch/weak tier colors (6+ hardcoded instances)
3. Results.jsx stretch banner uses 3 raw hex colors
4. VerdictCard ring colors hardcoded (`#F5A623`, `#E8821A`)
5. Results score fontSize 36px not in typography scale
6. Jobs action buttons use non-token `padding: '8px 14px'` (6 instances)
7. 5 touch targets below 44px minimum (header gear, expand btn, filter chips, tracker tabs, linkedin remove)
8. HintBubble popover z-index 100 conflicts with header/nav
9. Legacy milestone overlay z-index 200 conflicts with dropdown
10. Missing word-break on job titles/descriptions
11. Dashboard activity fetch has no loading indicator (flash of empty state)
12. Profile has no loading/error state for profile fetch
13. Profile save bar stretches full width on desktop
14. 3 orphaned art assets unreferenced in code
15. No HintBubble on Dashboard, Upload, or Results

### P3 — Polish (20+)
16. ~30 instances of hardcoded 2-4px spacing that should use `var(--space-1)`
17. `fontSize: '12px'` used in ~15 places — not in typography table (table says 13px minimum)
18. Corner vegetation z-index inconsistent across 3 screens
19. Toast z-index 1000 overshoots spec
20. Profile save bar z-index fragile at 100
21. 6 `.bak` files in public/ott/ should be cleaned up
22. `bottom: 60` magic number on auth screen corners
23. Various `padding: '3px 10px'` sub-token values on Profile small buttons
24. Mixed raw/token spacing on Profile selects
25. `.dashboard-greeting` overflow:hidden could clip animated Ott
