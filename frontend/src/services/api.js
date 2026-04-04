const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Upload a resume file and extract text via the backend.
 * Returns { text, filename }.
 */
export async function uploadResume(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/upload-resume`, {
    method: 'POST',
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
  const res = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
