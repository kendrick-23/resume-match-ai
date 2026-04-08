-- ============================================
-- Holt — activity_log: per-application context
-- Adds application_id + status columns so streak counting
-- and same-app deduplication can target real forward actions.
-- Run in Supabase SQL Editor.
-- ============================================

alter table if exists activity_log
  add column if not exists application_id uuid references applications(id) on delete cascade,
  add column if not exists status text;

create index if not exists idx_activity_log_user_action_created
  on activity_log(user_id, action_type, created_at desc);

create index if not exists idx_activity_log_user_application_created
  on activity_log(user_id, application_id, created_at desc);
