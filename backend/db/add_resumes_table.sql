-- ============================================
-- Holt Resume Vault
-- Separate resumes table so resume text is a
-- first-class entity, not just an analyses snapshot.
-- Run in Supabase SQL Editor.
-- ============================================

CREATE TABLE IF NOT EXISTS resumes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id)
    ON DELETE CASCADE NOT NULL,
  label text NOT NULL DEFAULT '',
  content text NOT NULL,
  word_count integer,
  source_filename text,
  source_format text CHECK (
    source_format IN ('pdf', 'docx', 'pasted')
  ),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Only one default resume per user
CREATE UNIQUE INDEX IF NOT EXISTS one_default_per_user
  ON resumes (user_id)
  WHERE is_default = true;

-- Fast lookups by user, ordered most-recent first
CREATE INDEX IF NOT EXISTS idx_resumes_user_id
  ON resumes (user_id, created_at DESC);

-- ============================================
-- Row Level Security — users can only access their own rows
-- ============================================

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own resumes"
  ON resumes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own resumes"
  ON resumes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resumes"
  ON resumes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own resumes"
  ON resumes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Add resume_id FK to analyses
-- Nullable for backwards compatibility with existing rows
-- ============================================

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS resume_id uuid
  REFERENCES resumes(id) ON DELETE SET NULL;
