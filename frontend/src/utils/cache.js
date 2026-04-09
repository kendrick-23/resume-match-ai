/**
 * Clears the Jobs screen recommendations, search, and page-state caches from
 * sessionStorage. Call after any mutation that changes scoring context: resume
 * upload, profile update, or new analysis completion.
 */
export function clearRecommendationsCache() {
  try {
    sessionStorage.removeItem('holt_recommendations_cache');
    sessionStorage.removeItem('holt_jobs_search');
    sessionStorage.removeItem('holt_jobs_page_state');
  } catch {
    // sessionStorage unavailable (private mode, etc.)
  }
}
