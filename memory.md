# memory.md — Holt Quick Reference
> Speed-read this at the start of every Claude Code session.
> Full details are in CLAUDE.md.

---

## The App
**Name:** Holt — AI-powered job search companion
**Mascot:** Ott the Otter (encouraging coach)
**Repo:** github.com/kendrick-23/resume-match-ai

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
Warm cream background (`#FAF7F2`). Teal accent (`#2BB5C0`). Nunito font, ExtraBold for headlines, Medium for body. Duolingo-style 3D press buttons (box-shadow shrinks on :active). Rounded corners everywhere (min 8px). Mobile-first — bottom nav bar, 72px tall, 5 tabs. All tap targets 44px minimum. Ott the Otter reacts to every key moment.

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

## Ott States
`idle` | `thinking` | `celebrating` | `encouraging` | `coaching` | `waiting` | `excited` | `waving` | `sleeping`

Score thresholds: ≥70% → `celebrating` | 40–69% → `encouraging` | <40% → `coaching`

## 6 Screens
1. **Dashboard** — Ott + streak + quick actions + recent activity
2. **Upload** — Resume + job description → analysis
3. **Results** — Score ring + strengths + gaps + recommendations
4. **Tracker** — Application pipeline (Saved → Applied → Interview → Offer)
5. **Jobs** — Job aggregation (USAJobs, Indeed, Adzuna)
6. **Profile** — Settings + resume vault + badges + delete data

## Gamification (Meaningful Only)
- ✅ Application streak (daily action)
- ✅ Resume score ring (history over time)
- ✅ Milestone badges (8 total — real achievements only)
- ✅ Ott reaction system (emotional layer)
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

## What NEVER To Do
❌ Dark backgrounds | ❌ Purple gradients | ❌ Glassmorphism
❌ Inter/Roboto/Arial | ❌ Hamburger menus | ❌ Gray spinners (use Ott)
❌ Hardcode hex values | ❌ Inline styles | ❌ Custom auth
❌ Store raw resume files | ❌ Wildcard CORS in production

## Current Build Phase
**Phase 1:** Design system tokens → Ott SVG component → UI components → 6 screens (UI shell) → Bottom nav

## Environment Variables Required
```
# Backend
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
FRONTEND_URL

# Frontend
VITE_API_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

---
*Full spec: CLAUDE.md*
