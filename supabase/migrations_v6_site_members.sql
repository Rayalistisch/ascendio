-- =============================================
-- Ascendio v6 Migration
-- Workspace/site members with role management
-- =============================================

create table if not exists asc_site_members (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  member_email text not null,
  role text not null default 'editor',
  status text not null default 'invited',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, member_email),
  constraint asc_site_members_role_check check (role in ('admin', 'editor', 'viewer')),
  constraint asc_site_members_status_check check (status in ('invited', 'active', 'disabled'))
);

create index if not exists idx_asc_site_members_site
  on asc_site_members(site_id);

create index if not exists idx_asc_site_members_owner
  on asc_site_members(owner_user_id);

alter table asc_site_members enable row level security;

create policy "Owners can manage own site members"
  on asc_site_members
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
