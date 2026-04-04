-- ============================================
-- Holt — Application Tracker Table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================

-- Applications table
create table if not exists applications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  company text not null,
  role text not null,
  status text not null default 'Saved',
  notes text default '',
  url text default '',
  match_score integer,
  applied_date date,
  created_at timestamp with time zone default now() not null
);

-- Index for fast user lookups
create index if not exists idx_applications_user_id on applications(user_id);

-- ============================================
-- Row Level Security — users can only access their own rows
-- ============================================

alter table applications enable row level security;

-- SELECT: users can read their own applications
create policy "Users can read own applications"
  on applications for select
  using (auth.uid() = user_id);

-- INSERT: users can create their own applications
create policy "Users can create own applications"
  on applications for insert
  with check (auth.uid() = user_id);

-- UPDATE: users can update their own applications
create policy "Users can update own applications"
  on applications for update
  using (auth.uid() = user_id);

-- DELETE: users can delete their own applications
create policy "Users can delete own applications"
  on applications for delete
  using (auth.uid() = user_id);
