-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- asc_sites table
create table asc_sites (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  wp_base_url text not null,
  wp_username text not null,
  wp_app_password_encrypted text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- asc_schedules table
create table asc_schedules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  timezone text not null default 'Europe/Amsterdam',
  rrule text not null,
  is_enabled boolean not null default true,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);

-- asc_runs table
create table asc_runs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  schedule_id uuid not null references asc_schedules(id) on delete cascade,
  status text not null default 'queued',
  topic text,
  wp_post_id text,
  wp_post_url text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- asc_run_logs table
create table asc_run_logs (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references asc_runs(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_asc_sites_user_id on asc_sites(user_id);
create index idx_asc_schedules_site_id on asc_schedules(site_id);
create index idx_asc_schedules_next_run on asc_schedules(next_run_at) where is_enabled = true;
create index idx_asc_runs_site_id on asc_runs(site_id);
create index idx_asc_runs_schedule_id on asc_runs(schedule_id);
create index idx_asc_run_logs_run_id on asc_run_logs(run_id);

-- RLS
alter table asc_sites enable row level security;
alter table asc_schedules enable row level security;
alter table asc_runs enable row level security;
alter table asc_run_logs enable row level security;

-- RLS Policies
create policy "Users can manage own sites" on asc_sites
  for all using (auth.uid() = user_id);

create policy "Users can manage own schedules" on asc_schedules
  for all using (auth.uid() = user_id);

create policy "Users can manage own runs" on asc_runs
  for all using (auth.uid() = user_id);

create policy "Users can view own run logs" on asc_run_logs
  for all using (
    run_id in (select id from asc_runs where user_id = auth.uid())
  );

-- Service role policy for workers (bypasses RLS with service role key)
