-- ============================================
-- Holt — Add enriched profile columns
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- These columns support the profile enrichment hub features.
-- ============================================

-- Schedule & commute
alter table profiles add column if not exists schedule_preference text;
alter table profiles add column if not exists max_commute_miles integer;

-- Education & authorization
alter table profiles add column if not exists degree_status text;
alter table profiles add column if not exists work_authorization text;

-- Targeting
alter table profiles add column if not exists target_companies text;
alter table profiles add column if not exists dealbreakers jsonb;

-- Skills & enrichment
alter table profiles add column if not exists skills_extracted jsonb default '[]'::jsonb;
alter table profiles add column if not exists job_seeker_status text;
alter table profiles add column if not exists linkedin_text text;
alter table profiles add column if not exists about_me text;
