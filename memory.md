# memory.md — Holt Quick Reference
> Speed-read this at the start of every Claude Code session.
> Full details are in CLAUDE.md.

---

## The App
**Name:** Holt — AI-powered job search companion
**Mascot:** Ott the Otter (encouraging coach)
**Repo:** github.com/kendrick-23/resume-match-ai
**Primary test user:** Nicole — operations/leadership background, targeting corporate pivot

## Stack (Never Change Without Explicit Instruction)
| Layer | Technology |
|---|---|
| Frontend | React + CSS custom properties |
| Backend | FastAPI + Python (existing, modify carefully) |
| Auth | Supabase Auth (JWT — never custom auth) |
| Database | Supabase PostgreSQL with RLS |
| AI | Anthropic `claude-opus-4-20250514` |
| Rate limiting | slowapi |
| Font | Nunito (Google Fonts — free, SIL OFL) |

## Design in One Paragraph
Warm cream background (`#FAF7F2`). Teal accent (`#2BB5C0`). Nunito font, ExtraBold for headlines, Medium for body. Duolingo-style 3D press buttons (box-shadow shrinks on :active). Rounded corners everywhere (min 8px). Mobile-first — bottom nav bar, 72px tall, 5 tabs. All tap targets 44px minimum. Ott the Otter reacts to every key moment. EVERYTHING IS ANIMATED — screens stagger in, buttons spring, Ott bounces. The app must feel alive, not like a static mockup.

## Color Quick Reference
```
--color-accent:    #2BB5C0  ← teal, buttons, highlights
--color-bg:        #FAF7F2  ← cream, background
--color-surface:   #F0EBE3  ← cards
--color-success:   #58CC02  ← strengths
--color-danger:    #FF4B4B  ← gaps
--color-text:      #2D2A26  ← body text
--color-ott-brown: #8B5E3C  ← Ott body
--color-ott-cream: #F5E6C8  ← Ott belly
--color-ott-accent:#2BB5C0  ← Ott teal detail
```
All tokens live in `frontend/src/styles/tokens.css`. Never hardcode hex values in components.

## Ott — NEEDS FIX (Priority 1)
Current Ott reads as a bear. Must be fixed before Phase 2.

**Correct otter anatomy:**
- Ears: Small, flat, rounded — close to head, NOT round bear ears sticking up
- Face: Wider, flatter muzzle with prominent whisker pads
- Body: Round and wide, low center of gravity
- Tail: Thick, tapered, visible behind body
- Nose: Small, dark, oval
- Eyes: Large, round, expressive — wide-set
- Overall: Compact and low, not tall and upright like a bear

Teal scarf/collar detail is correct — keep it.

## Ott States
`idle` | `thinking` | `celebrating` | `encouraging` | `coaching` | `waiting` | `excited` | `waving` | `sleeping`

Score thresholds: ≥70% → `celebrating` | 40–69% → `encouraging` | <40% → `coaching`

## Animation Requirements (Non-Negotiable)
Every one of these must be implemented:
- **Screen entrance:** Cards stagger in with fade-up (60ms delay between each, 250ms duration)
- **Button press:** Spring feel — translateY 3px + box-shadow shrink on :active, spring back on release
- **Score ring:** Dramatic animated fill on reveal (800ms, ease-out stroke animation)
- **Ott bounce:** Spring scale animation on screen entry (0.8 → 1.05 → 1, 350ms)
- **Ott celebration:** Full bounce dance on milestone (translateY 0 → -20px → 0, repeats 3x)
- **Milestone reveal:** Full-screen overlay with Ott celebration + badge drop-in
- **Tab switch:** Subtle scale + fade (0.96 → 1, 200ms)

## 6 Screens
1. **Dashboard** — Ott + streak + quick actions + recent activity
2. **Upload** — Resume + job description → analysis
3. **Results** — Score ring + strengths + gaps + recommendations
4. **Tracker** — Application pipeline (Saved → Applied → Interview → Offer)
5. **Jobs** — Job aggregation (USAJobs, Indeed, Adzuna)
6. **Profile** — Settings + resume vault + badges + delete data

## Nicole — Primary Test User Profile
Used for testing AI analysis quality and job matching relevance.
- **Background:** 10+ years Wawa (Assistant General Manager, Food & Bev Manager, CS Supervisor)
- **Skills:** Operations, team leadership, compliance, training, scheduling, payroll, vendor relations, hiring, onboarding
- **Education:** UCF — Hospitality Administration/Management + Psychology & Health Science minors
- **Target roles:** Operations Manager, HR/Training & Development, Compliance/QA, Healthcare Administration, Office/Business Manager, Project Coordinator
- **Target salary:** $70,000–85,000
- **Schedule:** Monday–Friday strongly preferred — filter out shift/weekend roles
- **Location:** Remote or Central Florida (Casselberry/Winter Springs area)
- **The ATS problem:** Resume uses retail/food service language — needs translation to corporate keywords

## Job Filter Defaults (Pre-populate for Nicole's profile)
- Salary min: $70,000
- Schedule type: Monday–Friday / standard business hours
- Location: Remote OR within 30 miles of Casselberry FL 32707
- Exclude: Weekend-required, shift work, overnight

## Gamification (Meaningful Only)
- ✅ Application streak (daily action)
- ✅ Resume score ring (history over time) — animated dramatically
- ✅ Milestone badges (8 total — real achievements only) — full screen celebration
- ✅ Ott reaction system (emotional layer) — every key moment
- ✅ Application pipeline tracker
- ❌ No leaderboards | No XP/points | No daily quests | No shame mechanics

## Security Checklist (Every Session)
- [ ] No API keys in frontend code
- [ ] `.env` not committed
- [ ] File uploads: PDF/DOCX only, 5MB max, MIME validated
- [ ] All endpoints: Pydantic model validation
- [ ] Auth routes: Supabase JWT validated server-side
- [ ] RLS: per-request user JWT context (NOT global service role client)
- [ ] Rate limits on all routes (slowapi)
- [ ] CORS: specific origins only, no wildcard in production

## Rate Limits
```
POST /analyze      → 10/hour per user
POST /upload       → 20/hour per user
GET  /jobs/search  → 30/hour per user
POST /auth/*       → 5 attempts/15min per IP
All others         → 100/hour per user
```

## Supabase Critical Note
Use per-request user JWT context for all user database operations.
A single global service-role client bypasses Row Level Security.
Every user must only read/write their own data.

## PWA Requirement
Holt must be installable as a Progressive Web App:
- Works on Android home screen (primary — Nicole's device)
- Works on iOS Safari (add to home screen)
- Works as desktop web app
- Requires: manifest.json, service worker, correct meta tags
- Add PWA setup when frontend is functionally complete

## Git Rules
- Always use: `git commit -m "message"` — simple inline only
- NEVER use heredoc/EOF pattern for commits — causes co-author tags
- NEVER add Co-Authored-By tags to any commits

## Build Phase Order
### Phase A — Foundation (all complete)
1. ✅ Design tokens, global styles
2. ✅ Ott SVG (9 states) + anatomy fix
3. ✅ UI component library (Button, Card, Badge, Input, BottomNav, ScreenWrapper)
4. ✅ 6 screen shells with React Router navigation
5. ✅ All animations (screen stagger, button spring, score ring, Ott bounce, milestones)
6. ✅ Connect Upload → FastAPI backend (real AI analysis)
7. ✅ Supabase auth (login/signup)

### Phase B — Features (all complete)
8. ✅ Tracker CRUD (add/edit/move applications)
9. ✅ Job aggregation (USAJobs + Holt fit score)
10. ✅ ATS Resume Generator (Claude rewrite + Word doc download)
11. ✅ Results sticky pill navigation (Overview, Strengths, Gaps, Ott's Take, Resume)

### Phase C — Brand & Polish (all complete)
12. ✅ Brand identity: HoltWordmark, illustrated empty states, app header
13. ✅ Onboarding flow (3-screen welcome at /welcome)

### Phase D — AI Scoring Pipeline (all complete)
14. ✅ Job description enrichment (Claude Haiku, sparse jobs only, 24h cache)
15. ✅ Semantic re-scoring (Haiku, blends 30/70 with keyword score, eligibility-gated)
16. ✅ Job-specific gap analyzer (Haiku, 2-3 missing skills per Within Reach job)
17. ✅ Token budget guardrail (`HAIKU_DAILY_TOKEN_LIMIT`, every Haiku call gates)
18. ✅ Domain penalty bulletproof (28% cap applied LAST, semantic can't override)
19. ✅ Parallel Haiku via `asyncio.gather` + `Semaphore(5)`
20. ✅ Search result caching — `job_search_cache` Supabase table, 4h TTL per user

### Phase E — Resilience & Reliability (all complete)
21. ✅ Auth corruption fix — `_score_jobs()` uses ONE Supabase client; downstream services receive profile as parameter (never fetch their own session)
22. ✅ Backend pipeline timeout — `asyncio.wait_for(_score_jobs, timeout=30.0)` on all 3 job routes; returns partial results on timeout
23. ✅ Frontend `handleProfileMatch` — `finally` block always resets all loading flags
24. ✅ Frontend `AbortController` — 45s timeout cancels in-flight fetches, shows Ott coaching + Try Again
25. ✅ Results screen — 8s loading safety timeout, empty state always reachable
26. ✅ Jobs empty profile state — coaching prompt instead of generic "manager" search

## Scoring Pipeline (read CLAUDE.md "AI Scoring Pipeline" for full details)
Order is fixed: enrich → fetch profile (once) → keyword score → semantic rescore → gap analysis → domain penalty (last). Domain penalty applied LAST so it can never be overridden. Every Haiku stage gates on `check_budget()`. Skip semantic + gap stages for `domain_penalized` jobs.

## Resilience Rules (Non-Negotiable — read CLAUDE.md for context)
- Backend `_score_jobs()` MUST use one Supabase client; downstream services receive profile as parameter
- Every job route MUST wrap `_score_jobs()` in `asyncio.wait_for(timeout=30.0)`
- Frontend long-running handlers MUST reset loading state in `finally` regardless of outcome
- Loading screens MUST have a hard timeout fallback — never infinite spinners

### Still to build
- LinkedIn PDF upload
- Score history chart
- Polish pass

## Known Issues
- **Profile screen shows empty fields for Nicole** — UNRESOLVED. Data confirmed in Supabase, column names verified correct across the entire stack (Profile.jsx, Onboarding.jsx, HeaderSettingsMenu.jsx, Jobs.jsx, backend `profile.py`, SQL migrations). There is NO column-name mismatch to fix. Next step: DevTools Network tab on `GET /profile` — does it return Nicole's populated row or an empty object? That distinguishes a frontend rendering bug from a backend query/RLS/auto-create bug in `profile.py::get_profile()`.

## What NEVER To Do
❌ Dark backgrounds | ❌ Purple gradients | ❌ Glassmorphism
❌ Inter/Roboto/Arial | ❌ Hamburger menus | ❌ Gray spinners (use Ott)
❌ Hardcode hex values | ❌ Inline styles | ❌ Custom auth
❌ Store raw resume files | ❌ Wildcard CORS in production
❌ Static screens with no animation | ❌ Heredoc git commits

## Environment Variables Required
```
# Backend
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
FRONTEND_URL
ADZUNA_APP_ID
ADZUNA_APP_KEY

# Frontend
VITE_API_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

---
*Full spec: CLAUDE.md*
