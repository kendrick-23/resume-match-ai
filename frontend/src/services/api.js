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
 * Send extracted resume text + job description for AI analysis.
 */
export async function analyzeResume(resumeText, jobDescription, companyName = '', roleName = '', linkedinText = '') {
  const headers = await authHeaders();
  const res = await fetchWithRetry(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      resume: resumeText,
      job_description: jobDescription,
      company_name: companyName,
      role_name: roleName,
      linkedin_text: linkedinText,
    }),
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
