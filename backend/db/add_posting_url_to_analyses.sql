-- Add posting_url to analyses so Results can link back to the original job posting.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS posting_url TEXT;
