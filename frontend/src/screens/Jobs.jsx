import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Ott from '../components/ott/Ott';
import { searchJobs, searchAdzunaJobs, searchUnifiedJobs, searchUnifiedMulti, getScoringStatus, createApplication, getProfile, getSearchCache, saveSearchCache } from '../services/api';
import { MapPin, Clock, DollarSign, ExternalLink, Bookmark, Building2, Sparkles, ChevronDown, ChevronUp, Target, SlidersHorizontal, Star, AlertTriangle, Search } from 'lucide-react';
import EmptyStateJobs from '../components/ui/EmptyStateJobs';
import HintBubble from '../components/ui/HintBubble';
import { useToast } from '../context/ToastContext';
import { useActionToast } from '../context/ActionToastContext';
import { TIER_BREAKPOINTS, scoreBadgeVariant, subScoreColor, scoreColor } from '../constants/scoring';
import './Jobs.css';

const STORAGE_KEY = 'holt_jobs_search';
const RECOMMENDATIONS_CACHE_KEY = 'holt_recommendations_cache';
const PROFILE_MATCH_CACHE_KEY = 'holt_profile_match_cache';

// Client-side freshness gate for the Supabase job_search_cache. The backend
// holds rows for 4 hours so that an explicit Refresh after a long break can
// still fall back to cached data if the API is down — but unattended cache
// hits on browser refresh should NEVER show results older than this. Also
// reused for the sessionStorage recommendations cache.
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

// Role synonym expansion — surfaces more relevant inventory from existing sources.
// Maps normalized target role → related job titles that often match the same candidate.
// Role synonym expansion — surfaces more relevant inventory from existing sources.
// Maps normalized target role → related job titles. Kept specific to avoid
// pulling off-target roles (e.g. "general manager" is too broad — matches
// trucking, military, etc.). Each synonym should pass the test: "Would Nicole
// be qualified and interested in this role given her ops/training background?"
const ROLE_SYNONYMS = {
  'operations manager': ['operations coordinator', 'operations director', 'business operations manager', 'operations supervisor'],
  'operations coordinator': ['operations manager', 'operations specialist', 'administrative coordinator'],
  'training manager': ['training coordinator', 'learning and development manager', 'training specialist', 'l&d manager'],
  'training coordinator': ['training manager', 'training specialist', 'learning and development coordinator'],
  'compliance coordinator': ['compliance manager', 'compliance specialist', 'regulatory coordinator', 'quality assurance coordinator'],
  'compliance manager': ['compliance coordinator', 'compliance specialist', 'regulatory manager'],
  'office manager': ['administrative manager', 'business operations manager', 'office administrator'],
  'store manager': ['assistant store manager', 'retail operations manager', 'retail manager'],
  'assistant manager': ['shift manager', 'team lead', 'assistant store manager'],
  'facilities manager': ['facilities coordinator', 'building operations manager'],
  'project manager': ['program manager', 'project coordinator', 'operations project manager'],
  'administrative manager': ['office manager', 'administrative coordinator', 'operations administrator'],
};

function expandQueriesWithSynonyms(roles, maxTotal = 6) {
  const queries = [];
  const seen = new Set();

  // Primary roles first (highest priority)
  for (const role of roles.slice(0, 2)) {
    if (!seen.has(role.toLowerCase())) {
      queries.push(role);
      seen.add(role.toLowerCase());
    }
  }

  // Add synonyms for matched roles
  for (const role of roles.slice(0, 2)) {
    const key = role.toLowerCase().trim();
    const synonyms = ROLE_SYNONYMS[key];
    if (!synonyms) continue;
    for (const syn of synonyms) {
      if (queries.length >= maxTotal) break;
      if (!seen.has(syn)) {
        queries.push(syn);
        seen.add(syn);
      }
    }
    if (queries.length >= maxTotal) break;
  }

  return queries;
}


function loadRecommendationsCache() {
  try {
    const raw = sessionStorage.getItem(RECOMMENDATIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || !Array.isArray(parsed?.jobs)) return null;
    if (Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveRecommendationsCache(jobs, hasAnalysis) {
  try {
    sessionStorage.setItem(
      RECOMMENDATIONS_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), jobs, hasAnalysis }),
    );
  } catch {
    // sessionStorage full or unavailable — proceed without caching
  }
}

function clearRecommendationsCache() {
  try { sessionStorage.removeItem(RECOMMENDATIONS_CACHE_KEY); } catch {}
}

function loadSavedSearch() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSearch(data) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function clearJobsSearch() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

// --- Full page-state persistence for tab-return ---
const PAGE_STATE_KEY = 'holt_jobs_page_state';

function loadPageState() {
  try {
    const raw = sessionStorage.getItem(PAGE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp) return null;
    if (Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePageState(state) {
  try {
    sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify({
      ...state,
      timestamp: Date.now(),
    }));
  } catch {
    // sessionStorage full or unavailable
  }
}

function clearPageState() {
  try { sessionStorage.removeItem(PAGE_STATE_KEY); } catch {}
}

function saveProfileMatchCache(cacheKey, results) {
  try {
    sessionStorage.setItem(PROFILE_MATCH_CACHE_KEY, JSON.stringify({
      cacheKey, timestamp: Date.now(), results,
    }));
  } catch { /* sessionStorage full or unavailable */ }
}

function loadProfileMatchCache(cacheKey) {
  try {
    const raw = sessionStorage.getItem(PROFILE_MATCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.cacheKey !== cacheKey) return null;
    if (Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch { return null; }
}

function clearProfileMatchCache() {
  try { sessionStorage.removeItem(PROFILE_MATCH_CACHE_KEY); } catch {}
}

function makeCacheKey(searchType, keywords = '', location = '') {
  const raw = `${searchType}:${keywords}:${location}`.toLowerCase().trim();
  // Simple hash — same as backend md5 but client-side
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export default function Jobs() {
  const navigate = useNavigate();
  const toast = useToast();
  const showAction = useActionToast();

  // Try to restore full page state first; fall back to saved search inputs.
  const [restoredPageState] = useState(() => loadPageState());
  const saved = restoredPageState || loadSavedSearch();
  const [keyword, setKeyword] = useState(saved?.keyword || '');
  const [location, setLocation] = useState(saved?.location || '');
  const [remoteOnly, setRemoteOnly] = useState(saved?.remoteOnly || false);
  const [savedIds, setSavedIds] = useState(new Set());

  // Tab state
  const [activeTab, setActiveTab] = useState(saved?.activeTab || 'private');

  // Federal (USAJobs) state
  const [fedJobs, setFedJobs] = useState(restoredPageState?.fedJobs || []);
  const [fedTotal, setFedTotal] = useState(restoredPageState?.fedTotal || 0);
  const [fedPage, setFedPage] = useState(restoredPageState?.fedPage || 1);
  const [fedLoading, setFedLoading] = useState(false);
  const [fedSearched, setFedSearched] = useState(restoredPageState?.fedSearched || false);
  const [fedError, setFedError] = useState('');

  // Private (Adzuna) state
  const [pvtJobs, setPvtJobs] = useState(restoredPageState?.pvtJobs || []);
  const [pvtTotal, setPvtTotal] = useState(restoredPageState?.pvtTotal || 0);
  const [pvtPage, setPvtPage] = useState(restoredPageState?.pvtPage || 1);
  const [pvtLoading, setPvtLoading] = useState(false);
  const [pvtSearched, setPvtSearched] = useState(restoredPageState?.pvtSearched || false);

  // Smart feed state
  const [recommended, setRecommended] = useState(restoredPageState?.recommended || []);
  const [recLoading, setRecLoading] = useState(!restoredPageState);
  const [recError, setRecError] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(restoredPageState?.hasAnalysis || false);

  // Holt score data
  const [analysisKeywords, setAnalysisKeywords] = useState([]);
  const [analysisGaps, setAnalysisGaps] = useState([]);
  const [salaryTarget, setSalaryTarget] = useState({ min: null, max: null });
  const [analysisRoleName, setAnalysisRoleName] = useState('');
  const [userLocation, setUserLocation] = useState('');
  const [targetCompanies, setTargetCompanies] = useState([]);

  // Sort and filter
  const [sortBy, setSortBy] = useState(restoredPageState?.sortBy || 'score');
  const [showFilters, setShowFilters] = useState(false);
  const [filterPostedWithin, setFilterPostedWithin] = useState(restoredPageState?.filterPostedWithin || 'any');
  const [filterDegree, setFilterDegree] = useState(restoredPageState?.filterDegree || 'all');
  const [showDealbreakers, setShowDealbreakers] = useState(restoredPageState?.showDealbreakers ?? true);
  const [filterSource, setFilterSource] = useState(restoredPageState?.filterSource || 'all');

  // Unified search results (profile match only)
  const [unifiedJobs, setUnifiedJobs] = useState(restoredPageState?.unifiedJobs || []);
  const [isProfileMatch, setIsProfileMatch] = useState(restoredPageState?.isProfileMatch || false);

  // Cache state
  const [cachedAt, setCachedAt] = useState(null);
  // Whether we restored full results from page state (show indicator, skip API)
  const [restoredFromPageState, setRestoredFromPageState] = useState(!!restoredPageState);

  const [restoredSearch, setRestoredSearch] = useState(!!saved?.keyword && !restoredPageState);
  const [profileMatchLoading, setProfileMatchLoading] = useState(false);
  const [profileEmpty, setProfileEmpty] = useState(false);
  const [profileTimedOut, setProfileTimedOut] = useState(false);
  const profileAbortRef = useRef(null);
  const scoringPollRef = useRef(null);

  // Cached profile from mount — handleProfileMatch reuses this instead of
  // re-fetching. Stale-on-edit is acceptable: the user goes to /profile to
  // change anything, and Jobs unmounts.
  const [cachedProfile, setCachedProfile] = useState(null);

  // Ref snapshot of state values for the unmount save — avoids stale closures.
  const pageStateRef = useRef(null);
  useEffect(() => {
    pageStateRef.current = {
      keyword, location, remoteOnly, activeTab, sortBy,
      filterPostedWithin, filterDegree, showDealbreakers, filterSource,
      fedJobs, fedTotal, fedPage, fedSearched,
      pvtJobs, pvtTotal, pvtPage, pvtSearched,
      recommended, hasAnalysis, unifiedJobs, isProfileMatch,
    };
  });

  // Restore scroll position from page state
  useEffect(() => {
    if (restoredPageState?.scrollY) {
      setTimeout(() => window.scrollTo(0, restoredPageState.scrollY), 100);
    }
  }, []);

  // Guard: prevent stale async responses from setting state after unmount.
  const isMountedRef = useRef(true);
  useEffect(() => { return () => { isMountedRef.current = false; clearInterval(scoringPollRef.current); }; }, []);

  // Save scroll position + full state on unmount
  useEffect(() => {
    return () => {
      const s = pageStateRef.current;
      if (!s) return;
      // Only save if there are actual results to restore
      if (s.fedSearched || s.pvtSearched || s.recommended?.length > 0) {
        savePageState({ ...s, scrollY: window.scrollY });
      }
    };
  }, []);

  // Page Visibility API: prevent token-wasting re-fetches on sleep/wake.
  // When the tab becomes visible again, the valid page state cache means
  // there's nothing to do. Without this, some browsers re-trigger effects.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      // If cached page state is still valid, do nothing — no API calls.
      const cached = loadPageState();
      if (cached) return;
      // If no cache, the normal mount logic already handles fresh loads.
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    // If we restored full page state (results + inputs), skip all API calls.
    if (restoredPageState) {
      // Still load recommendations from their own cache (already fast/free)
      // but do NOT re-fetch search results — they're already in state.
      loadRecommendations();
      return () => { profileAbortRef.current?.abort(); };
    }
    loadRecommendations();
    // Auto-trigger search if restoring from sessionStorage (inputs only, no results).
    // keyword + location are already initialized from saved state (line 203-204),
    // so handleSearch() will pick them up.
    if (saved?.keyword) {
      handleSearch();
      setRestoredSearch(false);
    }
    return () => { profileAbortRef.current?.abort(); };
  }, []);

  // Re-derive Ott Recommends when job data arrives from handleProfileMatch.
  // This ensures recommendations populate even if loadRecommendations() ran
  // before handleProfileMatch completed (unifiedJobs was empty at that point).
  useEffect(() => {
    if (unifiedJobs.length > 0 && recommended.length === 0) {
      loadRecommendations(true);
    }
  }, [unifiedJobs]);

  function loadRecommendations(forceRefresh = false) {
    setRecError(false);

    // Cache hit (sessionStorage, 30-minute TTL)
    if (!forceRefresh) {
      const cached = loadRecommendationsCache();
      if (cached) {
        setRecommended(cached.jobs);
        setHasAnalysis(!!cached.hasAnalysis);
        setRecLoading(false);
        return;
      }
    }

    // Ott Recommends reads from jobs already in state (populated by
    // handleProfileMatch). NO separate API call — per Invariant #4.
    // If unifiedJobs is empty, recommendations will populate once
    // handleProfileMatch completes and triggers a re-render.
    const source = unifiedJobs.length > 0 ? unifiedJobs
      : [...fedJobs, ...pvtJobs];

    if (source.length === 0) {
      // No jobs in state yet — will re-derive on next render after
      // handleProfileMatch populates unifiedJobs.
      setRecLoading(false);
      return;
    }

    const filtered = source
      .filter((j) => (j.holt_score ?? 0) >= TIER_BREAKPOINTS.strong && !j.domain_penalized && !j.dealbreaker_triggered)
      .sort((a, b) => (b.holt_score ?? 0) - (a.holt_score ?? 0))
      .slice(0, 5);

    setRecommended(filtered);
    setHasAnalysis(true);
    saveRecommendationsCache(filtered, true);
    setRecLoading(false);
  }

  // --- Federal search ---
  async function searchFederal(kw, loc, page = 1) {
    setFedLoading(true);
    setFedError('');
    try {
      const data = await searchJobs({
        keyword: kw,
        location: loc || undefined,
        remote: remoteOnly || undefined,
        page,
      });
      if (!isMountedRef.current) return;
      if (page === 1) {
        setFedJobs(data.jobs);
      } else {
        setFedJobs((prev) => [...prev, ...data.jobs]);
      }
      setFedTotal(data.total);
      setFedPage(page);
      setFedSearched(true);
    } catch (err) {
      if (!isMountedRef.current) return;
      setFedError(err.message);
    } finally {
      if (isMountedRef.current) setFedLoading(false);
    }
  }

  // --- Private search ---
  async function searchPrivate(kw, loc, page = 1) {
    const searchKw = kw || analysisRoleName;
    if (!searchKw) return;
    setPvtLoading(true);
    try {
      const data = await searchAdzunaJobs({
        keyword: searchKw,
        location: loc || userLocation || undefined,
        page,
      });
      if (!isMountedRef.current) return;
      if (page === 1) {
        setPvtJobs(data.jobs || []);
      } else {
        setPvtJobs((prev) => [...prev, ...(data.jobs || [])]);
      }
      setPvtTotal(data.total || 0);
      setPvtPage(page);
      setPvtSearched(true);
    } catch {
      if (!isMountedRef.current) return;
      if (page === 1) { setPvtJobs([]); setPvtTotal(0); }
      setPvtSearched(true);
    } finally {
      setPvtLoading(false);
    }
  }

  async function handleSearch(e) {
    e?.preventDefault();
    if (!keyword.trim()) return;
    const kw = keyword.trim();
    const loc = location.trim();

    // Cancel any in-flight profile match polling — keyword search takes priority
    clearInterval(scoringPollRef.current);
    scoringPollRef.current = null;
    profileAbortRef.current?.abort();

    // Clear page state so this runs fresh
    clearPageState();
    setRestoredFromPageState(false);
    setIsProfileMatch(false);
    setProfileMatchLoading(false);
    setUnifiedJobs([]);

    // Persist search state
    saveSearch({ keyword: kw, location: loc, remoteOnly, activeTab });

    // Route through unified-multi so keyword searches get Holt scoring,
    // dedup, and results from all 4 sources — same as profile match.
    setFedLoading(true);
    setFedError('');
    setPvtLoading(true);

    try {
      const result = await searchUnifiedMulti({ keywords: [kw], location: loc || undefined });
      console.log('[handleSearch] Response received:', result?.jobs?.length, 'jobs, scoring_complete:', result?.scoring_complete);
      if (!isMountedRef.current) return;

      const allJobs = result.jobs || [];
      console.log('[handleSearch] Setting unifiedJobs:', allJobs.length);
      setUnifiedJobs(allJobs);

      if (result.degraded) {
        toast.warning("Running on cached intelligence today — results may be less specific.");
      }

      // Poll for batch completion if semantic scoring is still in progress
      if (result.scoring_complete === false) {
        toast.info("Ott is analyzing your matches — scores will update automatically.");
        clearInterval(scoringPollRef.current);
        let attempts = 0;
        scoringPollRef.current = setInterval(async () => {
          attempts++;
          if (attempts > 20 || !isMountedRef.current) {
            clearInterval(scoringPollRef.current);
            scoringPollRef.current = null;
            return;
          }
          try {
            const status = await getScoringStatus();
            if (status.scoring_complete) {
              clearInterval(scoringPollRef.current);
              scoringPollRef.current = null;
              if (isMountedRef.current) {
                // Re-fetch with fresh scores
                const refreshed = await searchUnifiedMulti({ keywords: [kw], location: loc || undefined });
                if (!isMountedRef.current) return;
                const refreshedJobs = refreshed.jobs || [];
                setUnifiedJobs(refreshedJobs);
                const fedRefresh = refreshedJobs.filter((j) => j.source === 'usajobs');
                const pvtRefresh = refreshedJobs.filter((j) => j.source !== 'usajobs');
                _applyResults(fedRefresh, pvtRefresh, loc);
              }
            }
          } catch (pollErr) { console.error('[handleSearch] Poll error:', pollErr); }
        }, 15000);
      }

      const fedMerged = allJobs.filter((j) => j.source === 'usajobs');
      const pvtMerged = allJobs.filter((j) => j.source !== 'usajobs');
      console.log('[handleSearch] Calling _applyResults: fed:', fedMerged.length, 'pvt:', pvtMerged.length);
      _applyResults(fedMerged, pvtMerged, loc);
      console.log('[handleSearch] _applyResults complete');
    } catch (err) {
      console.error('[handleSearch] ERROR:', err);
      if (!isMountedRef.current) return;
      setFedError(err.message);
    } finally {
      if (isMountedRef.current) {
        setFedLoading(false);
        setPvtLoading(false);
      }
    }
  }

  function _applyResults(fedMerged, pvtMerged, loc, cached = null) {
    fedMerged.sort((a, b) => (b.holt_score ?? 0) - (a.holt_score ?? 0));
    setFedJobs(fedMerged);
    setFedTotal(fedMerged.length);
    setFedPage(1);
    setFedSearched(true);
    setFedLoading(false);

    pvtMerged.sort((a, b) => (b.holt_score ?? 0) - (a.holt_score ?? 0));
    setPvtJobs(pvtMerged);
    setPvtTotal(pvtMerged.length);
    setPvtPage(1);
    setPvtSearched(true);
    setPvtLoading(false);

    setCachedAt(cached);
    // Preserve keyword in saved state so tab-return restores it
    saveSearch({ keyword: keyword.trim(), location: loc, remoteOnly, activeTab });
  }

  function _dedup(results, keyFn) {
    const seen = new Set();
    const merged = [];
    for (const res of results) {
      for (const job of (res.jobs || [])) {
        const k = keyFn(job);
        if (!seen.has(k)) { seen.add(k); merged.push(job); }
      }
    }
    return merged;
  }

  async function handleProfileMatch(forceRefresh = false) {
    clearPageState();
    setRestoredFromPageState(false);
    setProfileMatchLoading(true);
    setIsProfileMatch(true);
    setProfileEmpty(false);
    setProfileTimedOut(false);
    setCachedAt(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s — fetching 4 sources × 6 queries takes 3-8s, scoring <2s
    profileAbortRef.current = controller;

    try {
      // Reuse the profile fetched on mount instead of making a redundant API
      // call. Only fall back to a fresh fetch if mount failed (cachedProfile
      // is still null) or the user just signed in.
      let profile = cachedProfile;
      if (!profile) {
        profile = await getProfile();
        if (profile) setCachedProfile(profile);
      }
      const roles = (profile?.target_roles || '').split(',').map((r) => r.trim()).filter(Boolean);
      const skills = Array.isArray(profile?.skills_extracted) ? profile.skills_extracted : [];
      const loc = (profile?.location || '').trim() || 'Florida';

      if (roles.length === 0 && skills.length === 0) {
        setProfileEmpty(true);
        return;
      }

      // Expand target roles with synonyms — cap at 6 total queries
      const queries = expandQueriesWithSynonyms(roles, 6);

      setLocation(loc);

      // Check cache first (unless forced refresh). Prefer the sessionStorage
      // profile-match cache (updated synchronously on every fetch/refresh) over
      // the backend Supabase cache (async save that may lag behind a Refresh).
      const cacheKey = makeCacheKey('profile', queries.join('|'), loc);
      if (!forceRefresh) {
        // 1. sessionStorage — instant, always current after a Refresh
        const localCache = loadProfileMatchCache(cacheKey);
        if (localCache) {
          const r = localCache.results;
          if (r.unified) setUnifiedJobs(r.unified);
          _applyResults(r.federal || [], r.private || [], loc, new Date(localCache.timestamp).toISOString());
          return;
        }
        // 2. Backend Supabase cache — survives full page refreshes
        try {
          const cached = await getSearchCache(cacheKey);
          if (cached.cached) {
            const cachedAtMs = cached.cached_at
              ? new Date(cached.cached_at).getTime()
              : 0;
            const ageMs = Date.now() - cachedAtMs;
            if (cachedAtMs > 0 && ageMs <= CACHE_MAX_AGE_MS) {
              const r = cached.results;
              if (r.unified) setUnifiedJobs(r.unified);
              _applyResults(r.federal || [], r.private || [], loc, cached.cached_at);
              return;
            }
            // Stale cache — fall through to a fresh fetch below.
          }
        } catch { /* cache miss, proceed with fresh search */ }
      }

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      setFedLoading(true);
      setFedError('');
      setPvtLoading(true);

      // Single request sends ALL synonym queries — backend fetches in parallel,
      // deduplicates globally, then scores once via a single batch submission.
      // This guarantees every unique job gets semantic scoring.
      const multiResult = await searchUnifiedMulti({ keywords: queries, location: loc });

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const allMerged = multiResult.jobs || [];

      if (multiResult.degraded) {
        toast.warning("Running on cached intelligence today — results may be less specific.");
      }

      if (multiResult.scoring_complete === false) {
        toast.info("Ott is analyzing your matches — scores will update automatically.");
        clearInterval(scoringPollRef.current);
        let attempts = 0;
        scoringPollRef.current = setInterval(async () => {
          attempts++;
          if (attempts > 20 || !isMountedRef.current) {
            clearInterval(scoringPollRef.current);
            scoringPollRef.current = null;
            return;
          }
          try {
            const status = await getScoringStatus();
            if (status.scoring_complete) {
              clearInterval(scoringPollRef.current);
              scoringPollRef.current = null;
              if (isMountedRef.current) {
                handleProfileMatch(true);
              }
            }
          } catch { /* poll error — retry next interval */ }
        }, 15000);
      }

      // Store the full unified list for source filtering
      setUnifiedJobs(allMerged);

      // Split into fed/pvt for the existing display logic
      const fedMerged = allMerged.filter((j) => j.source === 'usajobs');
      const pvtMerged = allMerged.filter((j) => j.source !== 'usajobs');

      _applyResults(fedMerged, pvtMerged, loc);

      // Save to sessionStorage (synchronous — immediately available for the
      // next "Find jobs" tap, even if the backend save hasn't completed yet).
      const cacheResults = { federal: fedMerged, private: pvtMerged, unified: allMerged };
      saveProfileMatchCache(cacheKey, cacheResults);

      // Save to backend Supabase cache in background (survives full page refreshes)
      saveSearchCache({
        cacheKey,
        results: cacheResults,
        federalCount: fedMerged.length,
        privateCount: pvtMerged.length,
      }).catch(() => {});
    } catch (err) {
      if (err.name === 'AbortError') {
        setProfileTimedOut(true);
      } else {
        // Non-timeout errors must NOT leave the timeout coaching card
        // stuck on screen. Always clear it explicitly.
        setProfileTimedOut(false);
        toast.error('Could not load your profile — try keyword search instead');
      }
    } finally {
      clearTimeout(timeoutId);
      profileAbortRef.current = null;
      // Always reset every loading flag regardless of error type, so the
      // user can always retry. Per CLAUDE.md resilience rules.
      setProfileMatchLoading(false);
      setFedLoading(false);
      setPvtLoading(false);
    }
  }

  function handleLoadMoreFed() {
    searchFederal(keyword.trim(), location.trim(), fedPage + 1);
  }

  function handleLoadMorePvt() {
    searchPrivate(keyword.trim(), location.trim(), pvtPage + 1);
  }

  function handleTabSwitch(tab) {
    setActiveTab(tab);
    // Persist tab choice
    if (keyword.trim()) {
      saveSearch({ keyword: keyword.trim(), location: location.trim(), remoteOnly, activeTab: tab });
    }
  }

  async function handleSave(job) {
    if (savedIds.has(job.id)) return;
    setSavedIds((prev) => new Set(prev).add(job.id));
    try {
      await createApplication({
        company: job.department || job.company,
        role: job.title,
        status: 'Saved',
        url: job.url || job.apply_url,
        notes: `Source: ${({ usajobs: 'USAJobs', adzuna: 'Adzuna', indeed: 'Indeed', glassdoor: 'Glassdoor', google: 'Google Jobs', zip_recruiter: 'ZipRecruiter', jooble: 'Jooble' })[job.source] || job.source || 'Unknown'} | Location: ${job.location}`,
      });
      showAction('job-saved');
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
      toast.error("Couldn't save — tap to retry", { onTap: () => handleSave(job) });
    }
  }

  function handleAnalyze(job) {
    navigate('/results', {
      state: {
        analyzeRequest: {
          job_description: job.description || job.snippet || '',
          company_name: job.department || job.company || '',
          role_name: job.title || '',
          posting_url: job.apply_url || job.url || '',
          prior_holt_score: job.holt_score,
          prior_holt_breakdown: job.holt_breakdown,
        },
      },
    });
  }

  function formatSalary(min, max) {
    if (!min && !max) return null;
    const fmt = (n) => '$' + n.toLocaleString();
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    return `Up to ${fmt(max)}`;
  }

  function sortJobs(jobList) {
    const sorted = [...jobList];
    switch (sortBy) {
      case 'score': return sorted.sort((a, b) => (b.holt_score ?? 0) - (a.holt_score ?? 0));
      case 'newest': return sorted.sort((a, b) => (b.posted || '').localeCompare(a.posted || ''));
      case 'salary_high': return sorted.sort((a, b) => (b.salary_max ?? 0) - (a.salary_max ?? 0));
      case 'salary_low': return sorted.sort((a, b) => (a.salary_min ?? Infinity) - (b.salary_min ?? Infinity));
      default: return sorted;
    }
  }

  function filterJobs(jobList) {
    return jobList.filter((job) => {
      if (filterPostedWithin !== 'any' && job.posted) {
        const posted = new Date(job.posted);
        const now = new Date();
        const diffH = (now - posted) / 3600000;
        if (filterPostedWithin === '24h' && diffH > 24) return false;
        if (filterPostedWithin === '3d' && diffH > 72) return false;
        if (filterPostedWithin === '7d' && diffH > 168) return false;
      }
      // Degree filter
      if (filterDegree !== 'all') {
        const flag = job.holt_breakdown?.degree_flag || 'none';
        if (filterDegree === 'no_degree' && flag === 'required') return false;
        if (filterDegree === 'preferred_only' && flag === 'required') return false;
      }
      // Source filter
      if (filterSource === 'federal' && job.source !== 'usajobs') return false;
      if (filterSource === 'private' && job.source === 'usajobs') return false;
      return true;
    });
  }

  // Active tab data — both keyword and profile match now use unified-multi,
  // so use unifiedJobs whenever available. Fall back to tab split only for
  // legacy endpoints (searchFederal/searchPrivate) which are no longer called.
  const useUnified = isProfileMatch || unifiedJobs.length > 0;
  const isSearched = useUnified
    ? (fedSearched || pvtSearched)
    : (activeTab === 'federal' ? fedSearched : pvtSearched);
  const isLoading = useUnified
    ? (fedLoading || pvtLoading)
    : (activeTab === 'federal' ? fedLoading : pvtLoading);
  const rawJobs = useUnified
    ? unifiedJobs
    : (activeTab === 'federal' ? fedJobs : pvtJobs);
  const activeTotal = useUnified
    ? unifiedJobs.length
    : (activeTab === 'federal' ? fedTotal : pvtTotal);
  const tabLabel = useUnified
    ? 'all sources'
    : (activeTab === 'federal' ? 'Federal' : 'Private');

  // Apply filters then sort — target companies always first within sort
  const filteredJobs = filterJobs(rawJobs);
  const sortedJobs = sortJobs(filteredJobs);
  const activeJobs = [
    ...sortedJobs.filter((j) => j.is_target_company),
    ...sortedJobs.filter((j) => !j.is_target_company),
  ];

  // Profile match: Ott recommends (top 5 strong, any source, not penalized, not dealbreaker)
  const ottRecommends = isProfileMatch
    ? activeJobs.filter((j) => (j.holt_score ?? 0) >= TIER_BREAKPOINTS.strong && !j.domain_penalized && !j.dealbreaker_triggered).slice(0, 5)
    : [];
  const ottRecommendsIds = new Set(ottRecommends.map((j) => j.id));

  // Profile match: main list (score >= 70, not in recommends, not dealbreaker, capped at 25)
  const mainJobs = isProfileMatch
    ? activeJobs
        .filter((j) => (j.holt_score ?? 0) >= TIER_BREAKPOINTS.strong && !ottRecommendsIds.has(j.id) && !j.dealbreaker_triggered)
        .slice(0, 25)
    : activeJobs;

  // Within Reach: 60-69% — close enough to 70% to be genuinely closeable.
  // Jobs below 60% go to the collapsed "outside your preferences" section.
  const WITHIN_REACH_FLOOR = 60;
  const withinReachJobs = activeJobs.filter(
    (j) => j.holt_score != null && j.holt_score >= WITHIN_REACH_FLOOR && j.holt_score < TIER_BREAKPOINTS.strong && !j.dealbreaker_triggered
  );

  // "Outside your preferences" jobs — collapsed section for profile match
  const outsidePrefsJobs = isProfileMatch
    ? activeJobs.filter((j) => j.dealbreaker_triggered)
    : [];
  const [showOutsidePrefs, setShowOutsidePrefs] = useState(false);

  // Displayed job count — actual visible jobs after all filtering and caps
  const displayedCount = isProfileMatch
    ? ottRecommends.length + mainJobs.length + withinReachJobs.length
    : activeTotal;

  // Tab labels with counts (keyword search only)
  const fmtCount = (n) => n > 1000 ? '1,000+' : n.toLocaleString();
  const fedLabel = fedSearched ? `Federal (${fmtCount(fedTotal)})` : 'Federal';
  const pvtLabel = pvtSearched ? `Private (${fmtCount(pvtTotal)})` : 'Private';

  return (
    <ScreenWrapper screenName="Jobs">
      <h2 style={{ marginBottom: 'var(--space-5)' }}>Find Jobs</h2>

      {/* Ott Recommends — profile match: from unified results; pre-search: from recommendations cache */}
      {(isProfileMatch ? ottRecommends.length > 0 : (!recLoading && hasAnalysis && recommended.length > 0 && !fedSearched)) && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}>
            <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
            Ott Recommends
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(isProfileMatch ? ottRecommends : recommended).map((job) => (
              <JobCard
                key={'rec-' + job.id + job.title}
                job={job}
                savedIds={savedIds}
                onSave={handleSave}
                onAnalyze={handleAnalyze}
                formatSalary={formatSalary}
                recommended
                holtScore={job.holt_score}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations error state */}
      {recError && !recLoading && !fedSearched && !pvtSearched && (
        <Card style={{
          textAlign: 'center',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
        }}>
          <Ott state="coaching" size={56} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)', fontSize: '14px' }}>
            Couldn't load recommendations
          </p>
          <Button variant="ghost" onClick={() => loadRecommendations(true)} style={{ marginTop: 'var(--space-2)' }}>
            Tap to retry
          </Button>
        </Card>
      )}

      {/* No analysis — prompt to analyze first */}
      {!recLoading && !recError && !hasAnalysis && !fedSearched && (
        <Card style={{
          textAlign: 'center',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
          background: 'var(--color-accent-light)',
          borderColor: 'var(--color-accent)',
        }}>
          <EmptyStateJobs size={160} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)', fontSize: '14px' }}>
            Analyze your resume first
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)' }}>
            Then I'll find your best matches
          </p>
        </Card>
      )}

      {/* Profile match button + loading + timeout + empty states */}
      {profileMatchLoading ? (
        <ProfileMatchLoading />
      ) : profileTimedOut ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
          <Ott state="coaching" size={56} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
            Search took too long
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
            Try again or use keyword search instead
          </p>
          <Button onClick={() => { setProfileTimedOut(false); handleProfileMatch(true); }}>
            Try again
          </Button>
        </Card>
      ) : profileEmpty ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
          <Ott state="coaching" size={56} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
            I need to know more about you first!
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
            Upload your resume to power your job matches.
          </p>
          <Button onClick={() => navigate('/upload')}>Upload Resume</Button>
        </Card>
      ) : (
        <Button
          full
          onClick={() => handleProfileMatch()}
          disabled={profileMatchLoading || fedLoading || pvtLoading}
          style={{ marginBottom: 0 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
            <Ott state="idle" size={32} />
            Find jobs that fit me
          </span>
        </Button>
      )}

      {/* Divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        margin: 'var(--space-3) 0',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>or</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-4)',
      }}>
        <Input
          placeholder="Job title, keywords..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Input
          placeholder="Location (city, state, or remote)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setRemoteOnly(!remoteOnly)}
            className={`jobs-filter-chip ${remoteOnly ? 'jobs-filter-chip--active' : ''}`}
          >
            Remote only
          </button>
        </div>

        <Button full disabled={(fedLoading && pvtLoading) || !keyword.trim()}>
          {fedLoading && !fedJobs.length ? 'Searching...' : 'Search'}
        </Button>
      </form>

      {/* Source tabs — only shown for legacy tab-split searches (not unified-multi) */}
      {!useUnified && (fedSearched || pvtSearched || fedLoading || pvtLoading) && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div className="jobs-tabs">
            <button
              className={`jobs-tabs__tab ${activeTab === 'federal' ? 'jobs-tabs__tab--active' : ''}`}
              onClick={() => handleTabSwitch('federal')}
            >
              {fedLabel}
              {fedLoading && <span className="jobs-tabs__loading" />}
            </button>
            <button
              className={`jobs-tabs__tab ${activeTab === 'private' ? 'jobs-tabs__tab--active' : ''}`}
              onClick={() => handleTabSwitch('private')}
            >
              {pvtLabel}
              {pvtLoading && <span className="jobs-tabs__loading" />}
            </button>
          </div>
          <p style={{
            textAlign: 'center',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            marginTop: 'var(--space-1)',
          }}>
            Federal = government jobs &middot; Private = Indeed, Glassdoor, ZipRecruiter &amp; more
          </p>

        </div>
      )}

      {/* Cache status */}
      {cachedAt && (fedSearched || pvtSearched) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
          fontSize: '13px',
          color: 'var(--color-text-muted)',
        }}>
          <span>Showing saved results from {(() => {
            const mins = Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000);
            return mins < 1 ? 'just now' : `${mins}m ago`;
          })()}</span>
          <button
            onClick={() => {
              // Refresh clears caches and cancels any scoring poll.
              clearRecommendationsCache();
              clearInterval(scoringPollRef.current);
              scoringPollRef.current = null;
              handleProfileMatch(true);
              // Recommendations re-derive from unifiedJobs via useEffect
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-accent)', fontFamily: "'Nunito', sans-serif",
              fontWeight: 600, fontSize: '13px', padding: 0,
            }}
          >
            ↻ Refresh
          </button>
        </div>
      )}

      {/* Page-state restored indicator — shown when results came from sessionStorage */}
      {restoredFromPageState && !cachedAt && (fedSearched || pvtSearched) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
          fontSize: '13px',
          color: 'var(--color-text-muted)',
        }}>
          <span>Showing your last search</span>
          <button
            onClick={() => {
              clearPageState();
              setRestoredFromPageState(false);
              if (keyword.trim()) {
                handleSearch();
              } else {
                clearInterval(scoringPollRef.current);
                scoringPollRef.current = null;
                handleProfileMatch(true);
                // Recommendations re-derive from unifiedJobs via useEffect
              }
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-accent)', fontFamily: "'Nunito', sans-serif",
              fontWeight: 600, fontSize: '13px', padding: 0,
            }}
          >
            ↻ Refresh
          </button>
        </div>
      )}

      {/* JIT hint — only after results are fully loaded */}
      {!fedLoading && !pvtLoading && (fedJobs.length > 0 || pvtJobs.length > 0) && (
        <HintBubble
          storageKey="holt_hint_jobs_search"
          ottImage="/ott/ott-coaching.png"
          text="Tap Analyze on any job to see exactly how your resume stacks up — no copy-pasting needed."
        />
      )}

      {/* Sort + Filter controls */}
      {(fedSearched || pvtSearched) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="jobs-sort-select"
          >
            <option value="score">Best match</option>
            <option value="newest">Newest first</option>
            <option value="salary_high">Salary: high to low</option>
            <option value="salary_low">Salary: low to high</option>
          </select>

          <button
            className={`jobs-filter-chip ${showFilters ? 'jobs-filter-chip--active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={14} /> Filters
          </button>
        </div>
      )}

      {showFilters && (
        <Card style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                Posted within
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {[['any', 'Any time'], ['24h', '24 hours'], ['3d', '3 days'], ['7d', '1 week']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`jobs-filter-chip ${filterPostedWithin === val ? 'jobs-filter-chip--active' : ''}`}
                    onClick={() => setFilterPostedWithin(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Degree filter */}
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                Degree requirement
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {[['all', 'Show all'], ['no_degree', 'No degree mentioned'], ['preferred_only', 'Preferred only']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`jobs-filter-chip ${filterDegree === val ? 'jobs-filter-chip--active' : ''}`}
                    onClick={() => setFilterDegree(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Source filter */}
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                Source
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {[['all', 'All'], ['federal', 'Federal'], ['private', 'Private']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`jobs-filter-chip ${filterSource === val ? 'jobs-filter-chip--active' : ''}`}
                    onClick={() => setFilterSource(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showDealbreakers}
                onChange={(e) => setShowDealbreakers(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                Show dealbreaker jobs (dimmed)
              </span>
            </label>
          </div>
        </Card>
      )}

      {/* Error — federal only */}
      {activeTab === 'federal' && fedError && (
        <Card style={{ background: 'var(--color-danger-light)', marginBottom: 'var(--space-4)' }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{fedError}</p>
        </Card>
      )}

      {/* Empty state — before any search */}
      {!fedSearched && !fedLoading && !hasAnalysis && recommended.length === 0 && !recLoading && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-5)' }}>
          <Ott state="waiting" size={56} />
          <div style={{
            position: 'relative',
            width: '160px',
            margin: 'var(--space-3) auto',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ width: '100%', height: '10px', borderRadius: 'var(--radius-full)', background: 'rgba(0,0,0,0.04)' }} />
              <div style={{ width: '75%', height: '10px', borderRadius: 'var(--radius-full)', background: 'rgba(0,0,0,0.04)' }} />
              <div style={{ width: '90%', height: '10px', borderRadius: 'var(--radius-full)', background: 'rgba(0,0,0,0.04)' }} />
            </div>
            <Search size={20} style={{
              position: 'absolute',
              right: '-4px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-accent)',
              opacity: 0.6,
            }} />
          </div>
          <p style={{ fontWeight: 700, marginTop: 'var(--space-3)' }}>
            Search for jobs to get started
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Results from federal and private sector listings
          </p>
        </Card>
      )}

      {/* Loading state for active tab */}
      {isLoading && activeJobs.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
          <Ott state="thinking" size={56} />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-2)', fontSize: '13px' }}>
            {isProfileMatch ? 'Scoring your matches across all sources...' : `Searching ${tabLabel.toLowerCase()} jobs...`}
          </p>
        </Card>
      )}

      {/* No results for active tab */}
      {isSearched && !isLoading && activeJobs.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)' }}>
          <Ott state="coaching" size={56} />
          <p style={{ fontWeight: 700, marginTop: 'var(--space-4)' }}>
            {isProfileMatch ? 'No matching jobs found' : `No ${tabLabel.toLowerCase()} jobs found`}
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Try different keywords or a broader location
          </p>
        </Card>
      )}

      {/* Within Reach — scoped to active tab */}
      {withinReachJobs.length > 0 && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-2)',
          }}>
            <Ott state="encouraging" size={32} />
            <div>
              <h3 style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}>
                <Target size={18} style={{ color: 'var(--color-warning)' }} />
                Within Reach{!isProfileMatch ? ` — ${tabLabel}` : ''}
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '2px' }}>
                These roles are closer than you think. Close these gaps to hit 70%+
              </p>
            </div>
          </div>
          <HintBubble
            storageKey="holt_hint_within_reach"
            ottImage="/ott/ott-encouraging.png"
            text="These jobs are close — the gap pills show exactly what skills would push your score over 70. Small moves, real results."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {withinReachJobs.map((job) => (
              <WithinReachCard
                key={'wr-' + job.id + job.title}
                job={job}
                score={job.holt_score}
                savedIds={savedIds}
                onSave={handleSave}
                onAnalyze={handleAnalyze}
                formatSalary={formatSalary}
              />
            ))}
          </div>
        </div>
      )}

      {/* Degree filter coaching note */}
      {filterDegree !== 'all' && isSearched && !isLoading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          background: 'var(--color-accent-light)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-3)',
          fontSize: '13px',
          color: 'var(--color-accent-dark)',
          fontWeight: 600,
        }}>
          <Ott state="encouraging" size={32} />
          Showing jobs with no degree requirement — your experience speaks louder than a diploma
        </div>
      )}

      {/* Results count */}
      {isSearched && !isLoading && activeJobs.length > 0 && (
        <p style={{
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          fontSize: '13px',
          marginBottom: 'var(--space-3)',
        }}>
          {isProfileMatch
            ? `${displayedCount} jobs found across all sources`
            : `${activeTotal > 1000 ? '1,000+' : activeTotal.toLocaleString()} ${tabLabel.toLowerCase()} jobs found`
          }
        </p>
      )}

      {/* Job cards */}
      {console.log('[Render] activeJobs:', activeJobs.length, 'mainJobs:', mainJobs.length, 'unifiedJobs:', unifiedJobs.length, 'isSearched:', isSearched, 'isLoading:', isLoading, 'isProfileMatch:', isProfileMatch, 'useUnified:', useUnified)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {(isProfileMatch ? mainJobs : activeJobs)
          .filter((job) => showDealbreakers || !job.dealbreaker_triggered)
          .map((job) => (
          <JobCard
            key={job.id + job.title}
            job={job}
            savedIds={savedIds}
            onSave={handleSave}
            onAnalyze={handleAnalyze}
            formatSalary={formatSalary}
            holtScore={job.holt_score}
          />
        ))}
      </div>

      {/* Outside your preferences — collapsed section for profile match */}
      {isProfileMatch && outsidePrefsJobs.length > 0 && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <button
            onClick={() => setShowOutsidePrefs(!showOutsidePrefs)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
              padding: 'var(--space-2) 0',
              minHeight: '44px',
            }}
          >
            <AlertTriangle size={14} />
            {outsidePrefsJobs.length} job{outsidePrefsJobs.length !== 1 ? 's' : ''} outside your preferences
            <ChevronDown size={14} style={{ transform: showOutsidePrefs ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
          </button>
          {showOutsidePrefs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              {outsidePrefsJobs.map((job) => (
                <JobCard
                  key={job.id + job.title}
                  job={job}
                  savedIds={savedIds}
                  onSave={handleSave}
                  onAnalyze={handleAnalyze}
                  formatSalary={formatSalary}
                  holtScore={job.holt_score}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Load more — keyword search only */}
      {!isProfileMatch && activeTab === 'federal' && fedSearched && fedJobs.length > 0 && fedJobs.length < fedTotal && (
        <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
          <Button variant="secondary" onClick={handleLoadMoreFed} disabled={fedLoading}>
            {fedLoading ? 'Loading...' : 'Load more federal jobs'}
          </Button>
        </div>
      )}
      {!isProfileMatch && activeTab === 'private' && pvtSearched && pvtJobs.length > 0 && pvtJobs.length < pvtTotal && (
        <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
          <Button variant="secondary" onClick={handleLoadMorePvt} disabled={pvtLoading}>
            {pvtLoading ? 'Loading...' : 'Load more private jobs'}
          </Button>
        </div>
      )}
    </ScreenWrapper>
  );
}


const LOADING_MESSAGES = [
  'Searching across 6 job sources...',
  'Scoring each job against your profile...',
  'Finding and ranking your matches — this takes about a minute...',
  'Still working — Ott is carefully reading each job description...',
  'Almost there — applying your preferences and filters...',
];

function ProfileMatchLoading() {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length), 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <Card style={{ textAlign: 'center', padding: 'var(--space-5)', marginBottom: 0 }}>
      <Ott state="thinking" size={56} />
      <p style={{
        fontWeight: 600,
        fontSize: '14px',
        marginTop: 'var(--space-3)',
        color: 'var(--color-text)',
      }}>
        {LOADING_MESSAGES[msgIdx]}
      </p>
    </Card>
  );
}


function SourceBadge({ source }) {
  if (source === 'usajobs') {
    return <Badge variant="info">Federal</Badge>;
  }
  return <Badge variant="info" className="source-badge--private">Private</Badge>;
}


function JobCard({ job, savedIds, onSave, onAnalyze, formatSalary, recommended = false, holtScore }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const isDealbreaker = job.dealbreaker_triggered;
  const isTarget = job.is_target_company;
  const breakdown = job.holt_breakdown;

  return (
    <Card style={isDealbreaker ? { opacity: 0.6 } : {}}>
      {/* Target company badge */}
      {isTarget && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-2)',
          padding: '4px 10px',
          background: 'var(--color-warning-light)',
          borderRadius: 'var(--radius-full)',
          width: 'fit-content',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--color-warning)',
        }}>
          <Star size={12} /> Target company
        </div>
      )}

      {/* Dealbreaker notice */}
      {isDealbreaker && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          marginBottom: 'var(--space-2)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--color-text-muted)',
        }}>
          <AlertTriangle size={12} /> Outside your preferences
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-2)',
      }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 'var(--space-2)' }}>
          <p style={{ fontWeight: 700, lineHeight: 1.3 }}>{job.title}</p>
          <p style={{
            color: 'var(--color-text-secondary)',
            fontSize: '13px',
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}>
            <Building2 size={13} />
            {job.department || job.company}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
          {recommended && <Badge variant="success">Recommended</Badge>}
          {holtScore != null && (
            <Badge variant={scoreBadgeVariant(holtScore)}>
              {holtScore}% Holt
            </Badge>
          )}
          <SourceBadge source={job.source} />
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        color: 'var(--color-text-muted)',
        fontSize: '13px',
        marginBottom: 'var(--space-3)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <MapPin size={14} /> {job.location}
        </span>
        {job.posted && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <Clock size={14} /> {job.posted}
          </span>
        )}
        {formatSalary(job.salary_min, job.salary_max) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <DollarSign size={14} /> {formatSalary(job.salary_min, job.salary_max)}
          </span>
        )}
      </div>

      {/* Score breakdown toggle */}
      {breakdown && holtScore != null && (
        <>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--color-accent)', fontFamily: "'Nunito', sans-serif",
              fontWeight: 600, fontSize: '13px', marginBottom: 'var(--space-2)',
            }}
          >
            {showBreakdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {job.coaching_label || 'Score breakdown'}
          </button>
          {showBreakdown && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2) var(--space-4)',
              fontSize: '13px', marginBottom: 'var(--space-3)',
              padding: 'var(--space-2)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)',
            }}>
              {[
                ['Skills', breakdown.skills_match],
                ['Salary', breakdown.salary_alignment],
                ['Schedule', breakdown.schedule_fit],
                ['Experience', breakdown.experience_match],
                ['Location', breakdown.location_fit],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                    <span style={{ fontWeight: 700, color: scoreColor(val) }}>{val}</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--color-border)', borderRadius: '2px' }}>
                    <div style={{
                      height: '4px',
                      width: `${Math.max(0, Math.min(100, val || 0))}%`,
                      background: scoreColor(val),
                      borderRadius: '2px',
                      transition: 'width 300ms ease-out',
                    }} />
                  </div>
                </div>
              ))}
              {breakdown.degree_flag !== 'none' && (
                <div style={{ gridColumn: '1 / -1', color: 'var(--color-warning)', fontWeight: 600 }}>
                  Degree: {breakdown.degree_flag}
                </div>
              )}
              {breakdown.reasoning && (
                <div style={{
                  gridColumn: '1 / -1',
                  marginTop: 'var(--space-1)',
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid var(--color-border)',
                }}>
                  <p style={{
                    fontSize: '13px',
                    fontStyle: 'italic',
                    color: 'var(--color-text-muted)',
                    lineHeight: 1.4,
                  }}>
                    {breakdown.reasoning}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {job.closing && (
        <p style={{
          fontSize: '13px',
          color: 'var(--color-warning)',
          fontWeight: 600,
          marginBottom: 'var(--space-3)',
        }}>
          Closes {job.closing}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button
          variant="ghost"
          style={{ padding: 'var(--space-2) var(--space-3)', minHeight: '44px', fontSize: '13px' }}
          onClick={() => onSave(job)}
          disabled={savedIds.has(job.id)}
        >
          <Bookmark size={14} style={savedIds.has(job.id) ? { fill: 'var(--color-accent)' } : {}} />
          {savedIds.has(job.id) ? 'Saved' : 'Save'}
        </Button>
        {onAnalyze && (
          <Button
            variant="ghost"
            style={{ padding: 'var(--space-2) var(--space-3)', minHeight: '44px', fontSize: '13px' }}
            onClick={() => onAnalyze(job)}
          >
            <Sparkles size={14} /> Analyze
          </Button>
        )}
        {(job.apply_url || job.url) && (
          <a
            href={job.apply_url || job.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: "'Nunito', sans-serif",
              color: 'var(--color-accent)',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> View posting
          </a>
        )}
      </div>
    </Card>
  );
}


function WithinReachCard({ job, score, savedIds, onSave, onAnalyze, formatSalary }) {
  const [expanded, setExpanded] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdown = job.holt_breakdown;
  const delta = 70 - score;
  const jobGaps = job.holt_breakdown?.job_specific_gaps || [];

  const coachLabel = delta <= 5
    ? "You're almost there"
    : delta <= 12
      ? 'One skill away'
      : 'Strong foundation';

  return (
    <Card className="within-reach-card">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-2)',
      }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 'var(--space-2)' }}>
          <p style={{ fontWeight: 700, lineHeight: 1.3 }}>{job.title}</p>
          <p style={{
            color: 'var(--color-text-secondary)',
            fontSize: '13px',
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}>
            <Building2 size={13} />
            {job.department || job.company}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
          <Badge variant="warning">{score}% Holt</Badge>
          <SourceBadge source={job.source} />
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        color: 'var(--color-text-muted)',
        fontSize: '13px',
        marginBottom: 'var(--space-3)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <MapPin size={14} /> {job.location}
        </span>
        {formatSalary(job.salary_min, job.salary_max) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <DollarSign size={14} /> {formatSalary(job.salary_min, job.salary_max)}
          </span>
        )}
      </div>

      <div className="within-reach-progress">
        <div className="within-reach-progress__bar">
          <div className="within-reach-progress__fill" style={{ width: `${score}%` }} />
          <div className="within-reach-progress__target" style={{ left: '70%' }} />
        </div>
        <div className="within-reach-progress__labels">
          <span className="within-reach-progress__score">{score}%</span>
          <span className="within-reach-progress__delta">+{delta}% to 70%</span>
        </div>
      </div>

      <p style={{
        fontWeight: 600,
        fontSize: '13px',
        color: 'var(--color-warning)',
        marginBottom: 'var(--space-2)',
      }}>
        {coachLabel}
      </p>

      {breakdown && (
        <>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--color-accent)', fontFamily: "'Nunito', sans-serif",
              fontWeight: 600, fontSize: '13px', marginBottom: 'var(--space-2)',
            }}
          >
            {showBreakdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Score breakdown
          </button>
          {showBreakdown && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2) var(--space-4)',
              fontSize: '13px', marginBottom: 'var(--space-3)',
              padding: 'var(--space-2)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)',
            }}>
              {[
                ['Skills', breakdown.skills_match],
                ['Salary', breakdown.salary_alignment],
                ['Schedule', breakdown.schedule_fit],
                ['Experience', breakdown.experience_match],
                ['Location', breakdown.location_fit],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                    <span style={{ fontWeight: 700, color: scoreColor(val) }}>{val}</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--color-border)', borderRadius: '2px' }}>
                    <div style={{
                      height: '4px',
                      width: `${Math.max(0, Math.min(100, val || 0))}%`,
                      background: scoreColor(val),
                      borderRadius: '2px',
                      transition: 'width 300ms ease-out',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {jobGaps.length > 0 ? (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          {jobGaps.map((gap, i) => (
            <p key={i} style={{
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              paddingLeft: 'var(--space-3)',
              borderLeft: '2px solid var(--color-warning)',
              marginBottom: i < jobGaps.length - 1 ? 'var(--space-2)' : 0,
            }}>
              {gap}
            </p>
          ))}
        </div>
      ) : (
        <p style={{
          fontSize: '13px',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-3)',
          fontStyle: 'italic',
        }}>
          Close your skills gap to reach 70%
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <Button
          variant="ghost"
          style={{ padding: 'var(--space-2) var(--space-3)', minHeight: '44px', fontSize: '13px' }}
          onClick={() => onSave(job)}
          disabled={savedIds.has(job.id)}
        >
          <Bookmark size={14} style={savedIds.has(job.id) ? { fill: 'var(--color-accent)' } : {}} />
          {savedIds.has(job.id) ? 'Saved' : 'Save'}
        </Button>
        {onAnalyze && (
          <Button
            variant="ghost"
            style={{ padding: 'var(--space-2) var(--space-3)', minHeight: '44px', fontSize: '13px' }}
            onClick={() => onAnalyze(job)}
          >
            <Sparkles size={14} /> Analyze
          </Button>
        )}
        {(job.apply_url || job.url) && (
          <a
            href={job.apply_url || job.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: "'Nunito', sans-serif",
              color: 'var(--color-accent)',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> View posting
          </a>
        )}
      </div>
    </Card>
  );
}
