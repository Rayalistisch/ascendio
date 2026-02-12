-- =============================================
-- Ascendio v2 Migration
-- Enhanced article generation, content sources,
-- SEO scanning, social media, Google indexing
-- =============================================

-- ============ MODIFY EXISTING TABLES ============

-- Add configuration columns to asc_sites
alter table asc_sites add column if not exists default_language text not null default 'Dutch';
alter table asc_sites add column if not exists social_webhook_url text;
alter table asc_sites add column if not exists social_auto_post boolean not null default false;
alter table asc_sites add column if not exists google_indexing_enabled boolean not null default false;
alter table asc_sites add column if not exists google_indexing_credentials_encrypted text;

-- Add tracking columns to asc_runs
alter table asc_runs add column if not exists source_item_id uuid;
alter table asc_runs add column if not exists article_title text;
alter table asc_runs add column if not exists meta_description text;
alter table asc_runs add column if not exists schema_markup jsonb;
alter table asc_runs add column if not exists internal_links_added integer default 0;
alter table asc_runs add column if not exists external_links_added integer default 0;
alter table asc_runs add column if not exists images_count integer default 1;

-- ============ NEW TABLES ============

-- Local cache of WordPress posts (for internal linking + SEO editor)
create table asc_wp_posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  wp_post_id integer not null,
  title text not null,
  slug text not null,
  url text not null,
  excerpt text,
  content text,
  status text not null default 'publish',
  categories jsonb default '[]',
  tags jsonb default '[]',
  featured_image_url text,
  meta_title text,
  meta_description text,
  schema_markup jsonb,
  seo_score integer,
  last_synced_at timestamptz not null default now(),
  wp_created_at timestamptz,
  wp_modified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(site_id, wp_post_id)
);

create index idx_asc_wp_posts_site on asc_wp_posts(site_id);
create index idx_asc_wp_posts_slug on asc_wp_posts(site_id, slug);
alter table asc_wp_posts enable row level security;
create policy "Users can manage own wp posts" on asc_wp_posts
  for all using (auth.uid() = user_id);

-- Content sources per site
create table asc_content_sources (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  source_type text not null,
  config jsonb not null default '{}',
  is_enabled boolean not null default true,
  last_fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_asc_content_sources_site on asc_content_sources(site_id);
alter table asc_content_sources enable row level security;
create policy "Users can manage own content sources" on asc_content_sources
  for all using (auth.uid() = user_id);

-- Fetched items from content sources
create table asc_source_items (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid not null references asc_content_sources(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text,
  title text not null,
  url text,
  summary text,
  raw_content text,
  is_used boolean not null default false,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(source_id, external_id)
);

create index idx_asc_source_items_source on asc_source_items(source_id);
create index idx_asc_source_items_unused on asc_source_items(site_id) where is_used = false;
alter table asc_source_items enable row level security;
create policy "Users can manage own source items" on asc_source_items
  for all using (auth.uid() = user_id);

-- Add foreign key from asc_runs to asc_source_items
alter table asc_runs add constraint fk_asc_runs_source_item
  foreign key (source_item_id) references asc_source_items(id) on delete set null;

-- Site scan reports
create table asc_scan_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  status text not null default 'running',
  pages_scanned integer default 0,
  issues_found integer default 0,
  issues_fixed integer default 0,
  summary jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_asc_scan_reports_site on asc_scan_reports(site_id);
alter table asc_scan_reports enable row level security;
create policy "Users can manage own scan reports" on asc_scan_reports
  for all using (auth.uid() = user_id);

-- Individual SEO issues
create table asc_scan_issues (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid not null references asc_scan_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  wp_post_id integer,
  page_url text not null,
  issue_type text not null,
  severity text not null default 'warning',
  description text not null,
  current_value text,
  suggested_fix text,
  is_fixed boolean not null default false,
  fixed_at timestamptz,
  auto_fixable boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_asc_scan_issues_report on asc_scan_issues(report_id);
create index idx_asc_scan_issues_unfixed on asc_scan_issues(site_id) where is_fixed = false;
alter table asc_scan_issues enable row level security;
create policy "Users can manage own scan issues" on asc_scan_issues
  for all using (auth.uid() = user_id);

-- Social media post queue
create table asc_social_posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  run_id uuid references asc_runs(id) on delete set null,
  wp_post_url text not null,
  article_title text not null,
  platform text not null default 'generic',
  copy text not null,
  image_url text,
  status text not null default 'pending',
  webhook_url text,
  posted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_asc_social_posts_run on asc_social_posts(run_id);
alter table asc_social_posts enable row level security;
create policy "Users can manage own social posts" on asc_social_posts
  for all using (auth.uid() = user_id);

-- Google indexing request tracking
create table asc_indexing_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  run_id uuid references asc_runs(id) on delete set null,
  url text not null,
  request_type text not null default 'URL_UPDATED',
  status text not null default 'pending',
  submitted_at timestamptz,
  last_checked_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_asc_indexing_requests_site on asc_indexing_requests(site_id);
alter table asc_indexing_requests enable row level security;
create policy "Users can manage own indexing requests" on asc_indexing_requests
  for all using (auth.uid() = user_id);
