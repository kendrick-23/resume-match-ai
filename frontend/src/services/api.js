import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Upload a resume file and extract text via the backend.
 * Returns { text, filename }.
 */
export async function uploadResume(file) {
  const headers = await authHeaders();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/upload-resume`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to upload resume');
  }

  return res.json();
}

/**
 * Send extracted resume text + job description for AI analysis.
 * Returns parsed { score, strengths, gaps, recommendations, summary }.
 */
export async function analyzeResume(resumeText, jobDescription) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      resume: resumeText,
      job_description: jobDescription,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Analysis failed');
  }

  const data = await res.json();
  return parseAnalysisResult(data.result);
}

/* ============================================
   Application Tracker CRUD
   ============================================ */

export async function listApplications() {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/applications`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load applications');
  }
  return res.json();
}

export async function createApplication(data) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create application');
  }
  return res.json();
}

export async function updateApplication(id, data) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update application');
  }
  return res.json();
}

export async function deleteApplication(id) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/applications/${id}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete application');
  }
  return res.json();
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

  const res = await fetch(`${API_URL}/jobs/search?${params}`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Job search failed');
  }
  return res.json();
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
