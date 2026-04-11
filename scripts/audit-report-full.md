# Full Audit Report — 2026-04-09

Viewport: Mobile 390x844 (iPhone 14 Pro) + Desktop 1280x800
Auth: Supabase session injection (wildcateuph@gmail.com)
Screenshots: `scripts/audit-screenshots/mobile/` and `scripts/audit-screenshots/desktop/`

---

## Asset Rendering Issues (Agent 1)

| # | Screen | Viewport | Description | Severity |
|---|--------|----------|-------------|----------|
| A1 | Login | Both | **Right corner vegetation (ott-corner-right.png) has visible non-transparent background.** A light gray rectangular bounding box is visible behind the right corner asset. Left corner renders correctly with transparency. | P1 |
| A2 | Dashboard | Both | **Corner vegetation assets are missing.** The position:fixed corner vegetation specified for Dashboard is not rendering. Only the inline milestone badge art is visible at the bottom. | P1 |
| A3 | Dashboard | Both | **Kelp wrap accent not visible in streak card.** The streak card shows a clean white/light background with no kelp-wrap texture overlay at opacity 0.4. | P2 |
| A4 | Dashboard | Both | **Paw print dividers not visible.** No paw-print dividers visible anywhere on Dashboard; the journey map uses standard circle/dot step indicators. | P2 |
| A5 | Results | Both | **Corner vegetation missing.** No corner vegetation assets visible in the fixed bottom positions. A faint teal water-like banner appears at the bottom of the desktop Results but no vegetation. | P1 |
| A6 | Results | Both | **ott-holding-rock.png missing next to "Score Breakdown" heading.** No otter-holding-rock asset rendered beside the heading. | P2 |
| A7 | Results | Both | **ott-sliding.png not verifiable.** Score shown is 67 (below 70 threshold for Apply Now), so ott-sliding.png would not be expected. Needs verification with score >= 70. | P2 |
| A8 | Help | Both | **ott-with-pup.png missing at bottom of page.** The page ends after "Your Streak" with a Back button; no otter-with-pup asset rendered. | P2 |

**Summary:** 0 P0, 3 P1, 5 P2. The most impactful are the missing corner vegetation on Dashboard and Results, and the non-transparent background on the right corner asset.

---

## Layout Issues (Agent 2)

| # | Screen | Viewport | Description | Severity |
|---|--------|----------|-------------|----------|
| L1 | Dashboard | Both | **Greeting text overlaps busy illustration.** "Back already. I like the energy." renders on top of the tree/river scene artwork with insufficient contrast separation. Text is hard to read in places. | P1 |
| L2 | Dashboard | Desktop | **Milestones section clipped at bottom.** Badge labels are barely visible and the section appears to run into the bottom edge without enough clearance. | P1 |
| L3 | Dashboard | Mobile | **Journey stepper touch targets too small.** The numbered circle icons are ~24px, falling below the 44x44px minimum. | P2 |
| L4 | Dashboard | Desktop | **Bottom nav bar spans full 1280px width.** Nav items are spread extremely far apart. Should be constrained to content max-width at desktop breakpoints. | P2 |
| L5 | Jobs | Desktop | **Content stuck at mobile width in 1280px viewport.** Job cards rendered in ~300px column with massive empty whitespace on both sides. Search controls similarly cramped. | P1 |
| L6 | Jobs | Mobile | **Generic loading state instead of Ott thinking animation.** The "Searching..." state shows a standard loading indicator rather than the spec'd Ott thinking state. | P2 |
| L7 | Results | Mobile | **Dense text blocks with tight spacing.** Strengths and Gaps sections are tightly packed, challenging readability on a 390px device. | P2 |
| L8 | Results | Desktop | **Narrow content column (~500px) in 1280px viewport.** Large empty margins on both sides; analysis text could use wider reading column. | P2 |
| L9 | Help | Both | **Bottom nav missing.** No persistent navigation bar; user can only navigate via the Back button. Breaks navigation consistency with all other screens. | P1 |
| L10 | Upload | Desktop | **"Use this resume" button stretches full column width (~850px).** Primary CTA buttons should have a max-width (~320-400px). | P2 |
| L11 | Tracker | Desktop | **Hint card width inconsistent with job cards.** Hint card spans ~40% of content width while job cards span full width. | P2 |
| L12 | Login | Desktop | **Right corner vegetation partially clipped.** The right-side illustration is cut off at the viewport edge. | P2 |

**Summary:** 0 P0, 4 P1, 8 P2. The most critical are Jobs desktop being stuck at mobile width, Dashboard text-over-illustration contrast, Help missing bottom nav, and Dashboard milestones clipped.

---

## Visual Consistency (Agent 3)

| Screen | Mobile | Desktop | Notes |
|--------|--------|---------|-------|
| **Login** | READY | NEEDS MINOR FIX | Mobile is charming. Desktop: right corner vegetation shows hard rectangular boundary, asymmetry between L/R corners. |
| **Dashboard** | READY | READY | Bank-header river scene is the strongest visual in the app. Streak card, journey stepper, milestones all cohesive. |
| **Upload** | NEEDS MINOR FIX | NEEDS MINOR FIX | Otter world disappears. Tiny Ott avatar on resume card is the only character presence. Spec calls for Ott in `waiting` state in upload zone. Desktop especially bare. |
| **Jobs** | NEEDS MINOR FIX | NEEDS MAJOR FIX | Mobile is acceptable (Ott appears in loading states). Desktop is the weakest screen — no otter-world treatment, zero vegetation, faint job cards. Looks like a completely different app from Dashboard. |
| **Results** | NEEDS MINOR FIX | NEEDS MINOR FIX | VerdictCard and Ott's Take coaching section work well. Middle sections (Strengths/Gaps) are text-heavy with minimal breathing room. Density issue on both viewports. |
| **Tracker** | READY | NEEDS MINOR FIX | Mobile is clean and well-structured. Desktop: content only occupies ~40% of viewport, enormous empty space. |
| **Help** | READY | READY | Strongest otter-world screen after Dashboard. Hero Ott-in-holt, section icons, consistent warm tone. Proves the design system works when applied consistently. |

### Overall Assessment

**The otter world is cohesive in concept but inconsistent in execution.** The screens where it works (Dashboard, Help, Login, Results verdict/coaching) are genuinely charming and hit the Headspace-warmth-meets-Duolingo-energy target. The bank-header river scene on Dashboard is a standout.

The problem is that 3 of 7 screens largely abandon the otter world. **Upload, Jobs, and Tracker** feel like they belong to a different, more generic app. Jobs desktop is the most severe — it looks like a bare data table with no character. This creates a jarring experience navigating between Dashboard (rich, illustrated, warm) and Jobs (sparse, clinical, cold).

No screen feels cluttered — the risk is the opposite. Mobile generally holds up better because narrow viewport naturally constrains content. Desktop exposes the gaps with vast empty cream expanses. The design language (cream bg, teal accents, Nunito, rounded cards, 3D buttons) is consistent everywhere; the inconsistency is specifically in the illustrated/character layer.

---

## Demo Readiness (Agent 4)

### Nicole's Journey

| Step | Screen | Reaction | Assessment |
|------|--------|----------|------------|
| 1 | Login | SMILE | Ott waving, warm copy, corner vegetation — strong first impression. "This app was made by someone who cares about me." |
| 2 | Dashboard | NEUTRAL-POSITIVE | Charming Ott scene, good copy, streak motivating. "0 jobs submitted" is honest but slightly deflating for a new user. Text-over-illustration readability concern. |
| 3 | Upload | SMILE | Extremely clear. Resume pre-loaded, dead-simple JD textarea, big CTA. She knows what to do in 2 seconds. |
| 4 | Jobs | MILDLY CONFUSED | Caught in loading state on mobile. Desktop results are faint and hard to scan. Job cards need clearer typography hierarchy and visible match scores. |
| 5 | Results | POSITIVE BUT OVERWHELMED | Score reveal and VerdictCard are great. But massive text wall on mobile. Best content (Ott's Take, interview prep) buried at the bottom — she may never scroll there. |
| 6 | Tracker | SMILE | Clean, intuitive, Ott's hint bubble is delightful. Filter tabs with counts, clear job cards. Duolingo-meets-Headspace energy done right. |
| 7 | Help | NEUTRAL-POSITIVE | Covers features clearly with friendly copy. Does its job without being exciting. |

### Top 3 Fixes Before Showing Nicole

1. **Results screen is a text wall.** The most valuable features (Ott's Take coaching, interview prep, resume rewrite) are buried at the very bottom. Nicole will stop scrolling. Fix: collapse sections by default (accordion-style) or add sticky jump-to navigation so she sees all section headers at once.

2. **Jobs desktop cards are faint and hard to scan.** The cards look washed out with low-contrast text and very subtle borders. For Nicole scrolling through dozens of results, each card needs clearer typography hierarchy (bold title, visible match score badge, color coding). This is the core value proposition tab.

3. **Dashboard hero text overlaps the illustrated background.** "Back already. I like the energy." renders over the Ott river scene. On both viewports, readability could suffer over darker illustration elements. A semi-transparent text backdrop or positioning text outside the illustration would guarantee readability.

### Top 3 Things to Preserve Exactly

1. **The Upload screen is perfect.** Resume card with Ott avatar, word count, date, "Switch resume," clear JD textarea, optional LinkedIn accordion, big teal CTA. Zero confusion. Flawless information architecture. Do not touch this screen.

2. **The Tracker with Ott's hint bubble is delightful.** Filter tabs with counts, clean card layout, and the Ott hint ("hitting Interview unlocks a special moment") gamifies without pressuring, explains without lecturing. Dismissible so it's not annoying. This is the target energy, executed perfectly.

3. **The Login screen sets the emotional tone immediately.** Ott waving, "Your cozy corner for finding what's next," cattail illustrations — Nicole's first impression is warmth and care. The copy, the character, the design — this is the brand identity distilled into one screen.

---

## Prioritized Fix List

### P0 — Fix before any demo
_(none — app is functional and navigable)_

### P1 — Fix today
1. **Dashboard text-over-illustration contrast** — greeting text is hard to read on the bank-header scene (L1)
2. **Corner vegetation missing on Dashboard and Results** — the position:fixed corners are not rendering on these screens (A2, A5)
3. **Right corner vegetation has non-transparent background** — visible gray rectangle behind ott-corner-right.png (A1)
4. **Jobs desktop layout stuck at mobile width** — content in ~300px column within 1280px viewport (L5)
5. **Help screen missing bottom nav** — strands user without persistent navigation (L9)
6. **Dashboard milestones clipped on desktop** — badge labels barely visible at bottom (L2)

### P2 — Fix this week
7. Kelp wrap accent not visible in streak card (A3)
8. Paw print dividers not visible on Dashboard (A4)
9. ott-holding-rock.png missing next to Score Breakdown heading (A6)
10. ott-with-pup.png missing at bottom of Help page (A8)
11. Results text density — Strengths/Gaps sections need more breathing room (L7)
12. Upload screen missing Ott `waiting` state in upload zone (per spec)
13. Jobs mobile loading state should use Ott thinking animation (L6)

### P3 — Polish
14. Bottom nav should be max-width constrained on desktop (L4)
15. "Use this resume" button needs max-width on desktop (L10)
16. Results desktop content column too narrow (L8)
17. Tracker hint card width inconsistent with job cards (L11)
18. Dashboard journey stepper touch targets below 44px minimum (L3)
19. Login desktop right corner clipped at viewport edge (L12)
20. Consider adding corner vegetation to Tracker and Jobs for baseline visual continuity
