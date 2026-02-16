-- =============================================
-- Ascendio v5 Migration
-- Google Search Console OAuth connections
-- =============================================

create table if not exists asc_search_console_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  google_account_email text,
  property_url text,
  refresh_token_encrypted text not null,
  scopes text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, user_id)
);

create index if not exists idx_asc_search_console_connections_site
  on asc_search_console_connections(site_id);

alter table asc_search_console_connections enable row level security;

create policy "Users can manage own search console connections"
  on asc_search_console_connections
  for all using (auth.uid() = user_id);
