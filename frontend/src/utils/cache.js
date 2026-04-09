/**
 * Clears the Jobs screen recommendations and search caches from sessionStorage.
 * Call after any mutation that changes scoring context: resume upload, profile
 * update, or new analysis completion.
 */
export function clearRecommendationsCache() {
  try {
    sessionStorage.removeItem('holt_recommendations_cache');
    sessionStorage.removeItem('holt_jobs_search');
  } catch {
    // sessionStorage unavailable (private mode, etc.)
  }
}
