import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class OfflineError extends Error {
  constructor() {
    super("You're offline — check your connection");
    this.name = 'OfflineError';
  }
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function fetchWithRetry(url, options = {}, retries = 1) {
  if (!navigator.onLine) throw new OfflineError();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);

      // 401 — session expired, force sign out
      if (res.status === 401) {
        await supabase.auth.signOut();
        window.location.href = '/login';
        throw new Error('Session expired — please sign in again');
      }

      // Don't retry client errors (4xx)
      if (!res.ok && res.status < 500) return res;

      // Retry server errors (5xx) if we have attempts left
      if (!res.ok && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      return res;
    } catch (err) {
      if (err.name === 'OfflineError' || err.message.includes('Session expired')) throw err;
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function apiRequest(url, options = {}) {
  const res = await fetchWithRetry(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Something went wrong');
  }
  return res.json();
}

/**
 * Upload a resume file and extract text via the backend.
 */
export async function uploadResume(file) {
  const headers = await authHeaders();
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest(`${API_URL}/upload-resume`, {
    method: 'POST',
    headers,
    body: formData,
  });
}

/**
 * Send a resume for AI analysis. Caller can supply EITHER raw text (which the
 * backend will auto-save into the vault), OR a resume_id from the vault, OR
 * neither (backend falls back to the default vault entry).
 */
export async function analyzeResume(resumeText, jobDescription, companyName = '', roleName = '', linkedinText = '', resumeId = null, { priorHoltScore, postingUrl } = {}) {
  const headers = await authHeaders();
  const payload = {
    resume: resumeText || '',
    resume_id: resumeId || undefined,
    job_description: jobDescription,
    company_name: companyName,
    role_name: roleName,
    linkedin_text: linkedinText,
  };
  if (priorHoltScore != null) payload.prior_holt_score = priorHoltScore;
  if (postingUrl) payload.posting_url = postingUrl;
  const res = await fetchWithRetry(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Analysis failed');
  }

  const data = await res.json();
  if (data.parsed) {
    return { ...data.parsed, analysis_id: data.analysis_id };
  }
  return parseAnalysisResult(data.result);
}

/* ============================================
   Analyses History
   ============================================ */

export async function listAnalyses() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/analyses`, { headers });
}

export async function getAnalysis(id) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/analyses/${id}`, { headers });
}

/* ============================================
   Application Tracker CRUD
   ============================================ */

export async function listApplications() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/applications`, { headers });
}

export async function createApplication(data) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

export async function updateApplication(id, data) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

export async function deleteApplication(id) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/applications/${id}`, {
    method: 'DELETE',
    headers,
  });
}

/* ============================================
   Job Search
   ============================================ */

export async function searchJobs({ keyword, location, salaryMin, salaryMax, remote, page }) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  if (location) params.set('location', location);
  if (salaryMin) params.set('salary_min', salaryMin);
  if (salaryMax) params.set('salary_max', salaryMax);
  if (remote) params.set('remote', 'true');
  if (page) params.set('page', page);

  return apiRequest(`${API_URL}/jobs/search?${params}`, { headers });
}

export async function generateInterviewPrep({ role, company, gaps, jobDescription }) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/interview-prep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      role,
      company: company || '',
      gaps: gaps || [],
      job_description: jobDescription || '',
    }),
  });
}

export async function searchAggregatedJobs({ keyword, location, page }) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  if (location) params.set('location', location);
  if (page) params.set('page', page);

  return apiRequest(`${API_URL}/jobs/aggregated?${params}`, { headers });
}

export async function searchUnifiedJobs({ keyword, location, remote }) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  if (location) params.set('location', location);
  if (remote) params.set('remote', 'true');

  return apiRequest(`${API_URL}/jobs/unified?${params}`, { headers });
}

export async function getScoringStatus() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/jobs/scoring-status`, { headers });
}

export async function getPrefetchStatus() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/jobs/prefetch-status`, { headers });
}

export async function getPrefetchJobs() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/jobs/prefetch`, { headers });
}

export async function searchUnifiedMulti({ keywords, location, remote }) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (keywords?.length) params.set('keywords', keywords.join(','));
  if (location) params.set('location', location);
  if (remote) params.set('remote', 'true');

  return apiRequest(`${API_URL}/jobs/unified-multi?${params}`, { headers });
}

export async function searchAdzunaJobs({ keyword, location, page }) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  if (location) params.set('location', location);
  if (page) params.set('page', page);

  return apiRequest(`${API_URL}/jobs/adzuna?${params}`, { headers });
}

export async function getSearchCache(cacheKey) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/jobs/cache?key=${encodeURIComponent(cacheKey)}`, { headers });
}

export async function saveSearchCache({ cacheKey, results, federalCount, privateCount }) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/jobs/cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      cache_key: cacheKey,
      results,
      federal_count: federalCount || 0,
      private_count: privateCount || 0,
    }),
  });
}

/* ============================================
   Activity / Dashboard
   ============================================ */

export async function checkBadges() {
  const headers = await authHeaders();
  try {
    return await apiRequest(`${API_URL}/profile/badges/check`, {
      method: 'POST',
      headers,
    });
  } catch {
    return { newly_earned: [] };
  }
}

export async function listBadges() {
  const headers = await authHeaders();
  try {
    return await apiRequest(`${API_URL}/profile/badges`, { headers });
  } catch {
    return [];
  }
}

/* ============================================
   Profile
   ============================================ */

export async function getProfile() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/profile`, { headers });
}

export async function updateProfile(data) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

export async function deleteAllData() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/profile/data`, {
    method: 'DELETE',
    headers,
  });
}

export async function getActivity() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/profile/activity`, { headers });
}

/* ============================================
   Resume Vault
   ============================================ */

export async function listResumes() {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/resumes`, { headers });
}

export async function getDefaultResume() {
  const headers = await authHeaders();
  // 404 means "no default" — caller treats it as null rather than throwing.
  const res = await fetchWithRetry(`${API_URL}/resumes/default`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load default resume');
  }
  return res.json();
}

/**
 * Create a new vault entry from an uploaded file OR pasted text.
 * Pass `file` (a File object) for uploads, or `content` for paste.
 */
export async function createResume({ file, content, label } = {}) {
  const headers = await authHeaders();
  const formData = new FormData();
  if (file) formData.append('file', file);
  if (content) formData.append('content', content);
  if (label) formData.append('label', label);

  return apiRequest(`${API_URL}/resumes`, {
    method: 'POST',
    headers,
    body: formData,
  });
}

export async function updateResume(id, data) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/resumes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

export async function deleteResume(id) {
  const headers = await authHeaders();
  return apiRequest(`${API_URL}/resumes/${id}`, {
    method: 'DELETE',
    headers,
  });
}

/**
 * Parse the raw text response from the AI into structured data.
 */
function parseAnalysisResult(raw) {
  const scoreMatch = raw.match(/MATCH SCORE:\s*(\d+)/i);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  const strengths = parseSection(raw, 'STRENGTHS');
  const gaps = parseSection(raw, 'GAPS');
  const recommendations = parseSection(raw, 'RECOMMENDATIONS');

  const summaryMatch = raw.match(/SUMMARY:\s*\n([\s\S]*?)$/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  return { score, strengths, gaps, recommendations, summary };
}

/**
 * Extract bullet points from a named section in the raw text.
 */
function parseSection(raw, sectionName) {
  const pattern = new RegExp(
    `${sectionName}:\\s*\\n([\\s\\S]*?)(?=\\n(?:STRENGTHS|GAPS|RECOMMENDATIONS|SUMMARY):|$)`,
    'i'
  );
  const match = raw.match(pattern);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}
