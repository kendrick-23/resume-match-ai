# Holt Product Backlog
> Compiled 2026-04-06 from 4 parallel audits: QA Engineer, Product Manager, Nicole Persona, UX Researcher.
> Severity: CRITICAL > HIGH > MEDIUM > LOW. Effort: S (hours) / M (1-2 days) / L (3+ days).

---

## CRITICAL — Fix before any user testing

### C1. Profile save silently drops cleared/default fields
**Source:** QA (BUG-001, BUG-019), Nicole
**Problem:** `handleSave()` in Profile.jsx wraps every field in `if (value)` guards. If a user clears a field, the empty value is never sent — the old value persists. `maxCommute` only sends if `!== 30`. Skills are saved by a separate button, not the main "Save All Preferences" button.
**Impact:** Users cannot clear profile fields. Skills edits lost if wrong save button clicked.
**Fix:** Send all fields in the PATCH payload, using `null` for cleared values. Merge `handleSaveSkills` into `handleSave`.
**Effort:** S
**Files:** `frontend/src/screens/Profile.jsx` lines 119-151

### C2. Onboarding collects too little data to power smart features
**Source:** PM (Gap 2), Nicole, UX (F4, F5)
**Problem:** Onboarding only asks name, target roles, salary. The "Find jobs that fit me" button, Holt Score, and recommendations all need location, skills, schedule preference, and degree status — none of which are collected. First use of flagship features produces generic/empty results.
**Impact:** Users see zero value on day one. Highest churn risk point.
**Fix:** Add location (required) to onboarding step 3. Navigate to `/upload` after onboarding instead of Dashboard. Add a "complete your profile" nudge card on Dashboard.
**Effort:** M
**Files:** `frontend/src/screens/Onboarding.jsx`, `frontend/src/App.jsx`

### C3. Onboarding flag in localStorage — shared across accounts
**Source:** QA (BUG-002)
**Problem:** `holt_onboarded` in localStorage means User B skips onboarding if User A completed it on the same browser. Clearing browser data forces re-onboarding.
**Fix:** Store onboarding completion as a profile field in Supabase.
**Effort:** S
**Files:** `frontend/src/App.jsx`, `frontend/src/screens/Onboarding.jsx`

### C4. No magic bytes validation on uploaded files
**Source:** QA (BUG-006)
**Problem:** CLAUDE.md spec requires magic bytes validation. Backend only checks client-provided Content-Type header, which is trivially spoofable.
**Fix:** Check first bytes (`%PDF` for PDF, `PK` for DOCX) before processing.
**Effort:** S
**Files:** `backend/app/main.py` lines 227-238

### C5. Holt Score inflated by gap words counted as skills
**Source:** QA (BUG-025)
**Problem:** `holt_score.py` splits analysis gaps into individual words and treats them as skill terms. "lacks project management experience" turns "lacks" into a matchable skill. Finding "lacks" in a job description counts as a positive match.
**Impact:** Scores are misleading — the core metric is unreliable.
**Fix:** Use `resume_skills` only for skill matching. Use `analysis_gaps` separately to identify areas where the candidate is weak (subtract, don't add).
**Effort:** S
**Files:** `backend/app/services/holt_score.py` lines 49-57

---

## HIGH — Fix this sprint

### H1. Silent failures throughout the app — no user feedback
**Source:** QA (BUG-003, BUG-004), UX (F7)
**Problem:** Multiple `catch` blocks silently swallow errors: `loadPastAnalyses()`, `loadAnalyses()`, `loadRecommendations()`, `handleDeleteAllData()`. `generateResume` bypasses the api.js retry/auth infrastructure entirely. `analyzeResume` bypasses `apiRequest` error handling. Users see blank sections with no explanation.
**Fix:** Replace silent catches with toast notifications or inline error states with retry buttons. Route `generateResume` through `apiRequest`.
**Effort:** M
**Files:** `frontend/src/screens/Results.jsx`, `Profile.jsx`, `Jobs.jsx`, `frontend/src/services/resumeGenerator.js`, `api.js`

### H2. No ATS/terminology explanation for non-technical users
**Source:** Nicole
**Problem:** The app uses "ATS", "Holt Score", "Match Score" without explaining what they mean. Nicole (no degree, convenience store background) doesn't know what ATS is. "Holt Score" vs "Match Score" inconsistency adds confusion.
**Fix:** Add a one-line explainer on first encounter of "ATS" ("Applicant Tracking System — the software companies use to filter resumes"). Standardize on "Holt Score" everywhere. Add info tooltips on score dimensions.
**Effort:** S
**Files:** `frontend/src/screens/Results.jsx`, `Jobs.jsx`, `Upload.jsx`

### H3. Federal tab defaults first — wrong for most users
**Source:** Nicole, PM
**Problem:** Federal tab is default, but most job seekers (like Nicole from Wawa) have no federal background. They see zero results and think the app is broken. No explanation of what "Federal" means or whether they qualify.
**Fix:** Default to the tab with more results after search completes. Add a brief description under each tab label. Or auto-detect: if user has no federal-related skills, default to Private.
**Effort:** S
**Files:** `frontend/src/screens/Jobs.jsx` line 47

### H4. No degree filter on Jobs search screen
**Source:** Nicole
**Problem:** The #1 frustration for non-degreed job seekers is applying to degree-required jobs. The dealbreaker system exists in Profile but doesn't surface as a search filter. Dealbreaker jobs are dimmed (opacity 0.6) but shown by default.
**Fix:** Add a "Hide degree-required" filter chip on Jobs. Change `showDealbreakers` default to `false` when user has degree dealbreaker set.
**Effort:** S
**Files:** `frontend/src/screens/Jobs.jsx` lines 81, 411-419

### H5. Accessibility gaps — aria-labels, focus trapping, contrast
**Source:** UX (F11, F12, F13, F14, F15)
**Problem:** Icon-only buttons lack `aria-label`. Modals don't trap focus. `--color-text-muted` (#7A7169 on #FAF7F2) fails WCAG AA at 3.4:1 ratio. No skip-to-content link. Input labels not wired via `htmlFor`.
**Fix:** Add aria-labels to all icon buttons. Implement focus trapping on modals. Darken muted text to `#6B6259`. Add skip link. Wire `htmlFor` using `useId()`.
**Effort:** M
**Files:** `frontend/src/screens/Tracker.jsx`, `frontend/src/components/ui/Input.jsx`, `frontend/src/styles/tokens.css`, `frontend/src/components/ui/ScreenWrapper.jsx`

### H6. Application tracker — no edit, no follow-up reminders, no delete confirmation
**Source:** Nicole, QA (BUG-023), UX (F9)
**Problem:** Applications cannot be edited after creation (notes, company name, role). No follow-up date field despite CLAUDE.md spec. Delete has no confirmation — one accidental tap on 14px trash icon is permanent. Interview prep questions stored in component state, lost on navigation.
**Fix:** Add edit capability to ApplicationCard. Add follow-up date field with reminder logic. Add delete confirmation. Persist interview prep questions to Supabase.
**Effort:** L
**Files:** `frontend/src/screens/Tracker.jsx`, `backend/app/routes/applications.py`

### H7. File upload reads entire file into memory before size check
**Source:** QA (BUG-005)
**Problem:** `contents = await file.read()` loads the full file before checking size. A 1GB upload would consume 1GB of server memory before being rejected.
**Fix:** Use streaming read with early termination, or enforce request body size limit at the ASGI/reverse proxy layer.
**Effort:** S
**Files:** `backend/app/main.py` lines 233-238

### H8. No input length validation on resume/job description text
**Source:** QA (BUG-008)
**Problem:** `AnalyzeRequest` has no `max_length` on `resume` or `job_description`. Users could submit 100K+ chars, consuming excessive Anthropic API tokens.
**Fix:** Add `max_length=50000` on `resume` and `max_length=10000` on `job_description` per CLAUDE.md spec.
**Effort:** S
**Files:** `backend/app/main.py` lines 138-143

### H9. CORS allows localhost in production
**Source:** QA (BUG-021)
**Problem:** `allow_origins` hardcodes `http://localhost:5173` alongside `FRONTEND_URL`. In production, localhost is still allowed.
**Fix:** Only include localhost origins when `FRONTEND_URL` is a localhost URL.
**Effort:** S
**Files:** `backend/app/main.py` lines 46-47

---

## MEDIUM — This quarter

### M1. Keyword match view on Results (vs Jobscan)
**Source:** UX (F22), PM
**Problem:** Jobscan's core feature is a keyword-by-keyword comparison showing which JD terms appear in the resume. Holt shows prose strengths/gaps but no granular keyword matrix. This is the #1 feature users expect from ATS tools.
**Fix:** Add a "Keyword Match" section to Results showing top 15-20 JD keywords with matched/missing indicators.
**Effort:** M
**Files:** `frontend/src/screens/Results.jsx`, `backend/app/main.py` (analysis prompt)

### M2. Push-to-apply flow
**Source:** PM (Priority 1)
**Problem:** Save job → manually generate resume → manually open URL → manually update tracker. The dream: Save → auto-generate tailored resume for this JD → download → open URL → auto-move to "Applied".
**Effort:** L

### M3. Cover letter generation
**Source:** PM (Priority 2)
**Problem:** Resume generator exists but cover letters are the natural companion. Most applications require both. This is the obvious premium feature.
**Effort:** M

### M4. Notifications for streak maintenance
**Source:** PM (Gap 3), UX (F27)
**Problem:** Streak is purely passive — users who don't open the app don't know their streak is at risk. Job searches aren't logged as activity, so the most common action doesn't count.
**Fix:** Log job searches as activity. Add email/push notifications for streak reminders. Service worker registration exists but no push implementation.
**Effort:** L

### M5. Profile screen too long — needs segmentation
**Source:** UX (F3), Nicole
**Problem:** 7+ sections in a single scroll. Critical fields (degree status, dealbreakers) buried below the fold. Two save buttons confuse users about what's saved.
**Fix:** Break into tabbed sections or sub-routes. One save action for everything.
**Effort:** M

### M6. First-time score framing
**Source:** Nicole
**Problem:** A low first score with no context ("32%") feels like confirmation that the user is unqualified. No benchmark or encouragement for new users.
**Fix:** Add context: "Most people start between 30-50 — that's normal. Holt will help you get to 70+." Show score improvement trajectory after 2+ analyses.
**Effort:** S

### M7. Job description URL input (spec'd but not built)
**Source:** Nicole, CLAUDE.md spec
**Problem:** Spec says "text area OR URL input toggle" for job descriptions. URL option was never built. Users must manually copy/paste.
**Effort:** M

### M8. Mobile keyboard optimization
**Source:** UX (F17)
**Problem:** Jobs keyword input doesn't use `inputmode="search"` or `enterkeyhint="search"`. Mobile keyboard shows "Return" instead of "Search".
**Fix:** One-line attribute addition.
**Effort:** S

### M9. "Within Reach" section should distinguish fixable vs structural gaps
**Source:** Nicole
**Problem:** Gaps like "No bachelor's degree" are shown alongside "Add Python to your skills section." The user can't fix structural gaps but CAN fix keyword gaps. Treating them the same is demoralizing.
**Fix:** Tag gaps as "fixable" (keyword/phrasing) vs "structural" (degree/certification). Show fixable gaps prominently with action buttons; show structural gaps as informational.
**Effort:** M

### M10. Analysis progress indicator
**Source:** UX (F8, F20)
**Problem:** Resume analysis shows static "Ott is reading your resume..." for 10-15 seconds with no progress feedback. Jobscan shows multi-step progress.
**Fix:** Add stepped indicator: "Uploading... Analyzing... Scoring..." with each step completing as the API call resolves. Add gentle animation to Ott's thinking state.
**Effort:** S

### M11. Private search uses different sources depending on entry point
**Source:** QA (BUG-017, BUG-029)
**Problem:** "Find jobs that fit me" uses `/jobs/aggregated` (5 sources) for private tab, but keyword search uses `/jobs/adzuna` (1 source). "Load more" after profile match switches to Adzuna. Inconsistent result sets.
**Fix:** Use aggregated endpoint for all private tab searches, or clearly label which sources are being searched.
**Effort:** M

### M12. `deleteAllData` doesn't delete Supabase Auth user
**Source:** QA (BUG-016)
**Problem:** "Delete all data" removes DB rows but Auth account persists. User can sign back in to an empty profile. If intent is "delete my account," the auth user should be removed too.
**Effort:** S

### M13. Sign-up race condition — navigates before auth state propagates
**Source:** QA (BUG-013)
**Problem:** After `signUp`, code immediately calls `navigate('/')`. If email confirmation is enabled, there's no session yet. User hits ProtectedRoute, gets redirected to login.
**Fix:** Wait for auth state change before navigating.
**Effort:** S

### M14. 401 handler causes concurrent sign-out calls
**Source:** QA (BUG-014)
**Problem:** Multiple parallel API calls that get 401 each trigger `signOut()` and `window.location.href = '/login'` simultaneously.
**Fix:** Add a deduplication guard — only the first 401 triggers sign-out.
**Effort:** S

### M15. Personalized dashboard greeting
**Source:** UX (F21)
**Problem:** Dashboard says "Welcome back!" generically. LinkedIn greets by name and references progress. Duolingo references specific position in curriculum.
**Fix:** Use profile name and reference specific status: "Hey Nicole! You have 3 applications waiting for follow-up."
**Effort:** S

### M16. Hardcoded "Florida" location fallback
**Source:** QA (BUG-020)
**Problem:** Jobs recommendations and profile match fallback to "Florida" when user has no location. Not all users are in Florida.
**Fix:** Omit location parameter if not set, or prompt user to set one.
**Effort:** S

---

## LOW — Later / nice to have

### L1. `.doc` accepted by frontend, rejected by backend (BUG-007)
### L2. Past analyses lose sub-scores when clicked (BUG-011)
### L3. Sub-score colors: teal for low scores instead of red (BUG-024)
### L4. Tracker celebrating state never set to true (BUG-010)
### L5. No auth rate limiting (handled by Supabase, but not matching spec) (BUG-028)
### L6. Duplicate Supabase client instantiation per request (BUG-009)
### L7. No `hasChanges` tracking on core profile fields (BUG-022)
### L8. Score history / trend chart on Dashboard (PM Priority 4)
### L9. Tiered badge progression — Bronze > Silver > Gold (UX F26)
### L10. Saved searches and job alerts (UX F24)
### L11. Resume version comparison / diff view (UX F23)
### L12. Mood check-in on Dashboard (UX F28)
### L13. Social sharing for milestones (UX F27)
### L14. Horizontal scroll affordance on Tracker tabs (UX F18)
### L15. Ott overuse / mascot fatigue on Jobs screen (UX F19)
### L16. Move inline styles to CSS for responsiveness (UX F16)
### L17. Copy-to-clipboard feedback missing on Tracker (UX F10)
### L18. Re-analyze with different JD without re-uploading (UX F1)
### L19. Company insights on job cards (UX F25)

---

## Summary

| Severity | Count | Top priority |
|----------|-------|-------------|
| CRITICAL | 5 | Profile save, onboarding depth, magic bytes, score inflation |
| HIGH | 9 | Silent failures, accessibility, tracker editing, ATS explanation |
| MEDIUM | 16 | Keyword match view, push-to-apply, cover letters, notifications |
| LOW | 19 | Polish, competitive features, nice-to-haves |

**Recommended next session:** Fix C1-C5 (all are small effort, high impact). Then H2-H4 (small effort quality-of-life). That alone would transform the first-time user experience.
