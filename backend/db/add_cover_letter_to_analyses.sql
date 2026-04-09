-- Add cover_letter column to cache generated cover letters per analysis.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS cover_letter TEXT;
