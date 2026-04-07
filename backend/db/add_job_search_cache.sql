-- ============================================
-- Holt — Job search result cache
-- Run this in Supabase SQL Editor
-- Caches scored job results for 4 hours to avoid
-- repeat API + Haiku calls on the same search.
-- ============================================

CREATE TABLE IF NOT EXISTS job_search_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cache_key text NOT NULL,
  results jsonb NOT NULL,
  federal_count int DEFAULT 0,
  private_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(user_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_job_search_cache_user ON job_search_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_job_search_cache_key ON job_search_cache(user_id, cache_key);

ALTER TABLE job_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cache"
  ON job_search_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cache"
  ON job_search_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cache"
  ON job_search_cache FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cache"
  ON job_search_cache FOR DELETE
  USING (auth.uid() = user_id);
