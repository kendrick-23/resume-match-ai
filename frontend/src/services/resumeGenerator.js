import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Generate an ATS-optimized resume for a given analysis.
 */
export async function generateResume(analysisId, linkedinText = '') {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/generate-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      analysis_id: analysisId,
      linkedin_text: linkedinText,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate resume');
  }
  return res.json();
}

/**
 * Retrieve a previously generated resume.
 */
export async function getGeneratedResume(analysisId) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/generate-resume/${analysisId}`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load generated resume');
  }
  return res.json();
}

/**
 * Simple markdown to structured sections parser for display.
 */
export function parseResumeMarkdown(md) {
  if (!md) return [];

  const sections = [];
  const lines = md.split('\n');
  let currentSection = null;

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const bullet = line.match(/^[-*] (.+)/);

    if (h1) {
      currentSection = { type: 'name', title: h1[1], content: [] };
      sections.push(currentSection);
    } else if (h2) {
      currentSection = { type: 'section', title: h2[1], content: [] };
      sections.push(currentSection);
    } else if (h3) {
      currentSection = { type: 'subsection', title: h3[1], content: [] };
      sections.push(currentSection);
    } else if (bullet && currentSection) {
      currentSection.content.push(bullet[1]);
    } else if (line.trim() && currentSection) {
      currentSection.content.push(line.trim());
    }
  }

  return sections;
}
