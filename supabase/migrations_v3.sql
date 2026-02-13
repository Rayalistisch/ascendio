-- =============================================
-- Ascendio v3 Migration
-- Article templates, SEO clusters, preferred domains
-- =============================================

-- ============ MODIFY EXISTING TABLES ============

-- Allow cluster-based runs without a schedule
alter table asc_runs alter column schedule_id drop not null;

-- Track cluster/template context on runs
alter table asc_runs add column if not exists cluster_id uuid;
alter table asc_runs add column if not exists cluster_topic_id uuid;
alter table asc_runs add column if not exists template_id uuid;

-- ============ NEW TABLES ============

-- Per-site article structure templates
create table asc_article_templates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  structure jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_asc_article_templates_site on asc_article_templates(site_id);
create unique index idx_asc_article_templates_default on asc_article_templates(site_id) where is_default = true;
alter table asc_article_templates enable row level security;
create policy "Users can manage own article templates" on asc_article_templates
  for all using (auth.uid() = user_id);

-- SEO topic clusters
create table asc_clusters (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  name text not null,
  pillar_topic text not null,
  pillar_description text,
  pillar_keywords text[] default '{}',
  pillar_wp_post_id integer,
  pillar_wp_post_url text,
  pillar_run_id uuid,
  status text not null default 'draft',
  template_id uuid references asc_article_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_asc_clusters_site on asc_clusters(site_id);
alter table asc_clusters enable row level security;
create policy "Users can manage own clusters" on asc_clusters
  for all using (auth.uid() = user_id);

-- Supporting subtopics within a cluster
create table asc_cluster_topics (
  id uuid primary key default uuid_generate_v4(),
  cluster_id uuid not null references asc_clusters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  target_keywords text[] default '{}',
  sort_order integer not null default 0,
  status text not null default 'pending',
  wp_post_id integer,
  wp_post_url text,
  run_id uuid references asc_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_asc_cluster_topics_cluster on asc_cluster_topics(cluster_id);
alter table asc_cluster_topics enable row level security;
create policy "Users can manage own cluster topics" on asc_cluster_topics
  for all using (auth.uid() = user_id);

-- Per-site preferred external link domains
create table asc_preferred_domains (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references asc_sites(id) on delete cascade,
  domain text not null,
  label text,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  unique(site_id, domain)
);

create index idx_asc_preferred_domains_site on asc_preferred_domains(site_id);
alter table asc_preferred_domains enable row level security;
create policy "Users can manage own preferred domains" on asc_preferred_domains
  for all using (auth.uid() = user_id);

-- Add foreign keys for the new run columns
alter table asc_runs add constraint fk_runs_cluster foreign key (cluster_id) references asc_clusters(id) on delete set null;
alter table asc_runs add constraint fk_runs_cluster_topic foreign key (cluster_topic_id) references asc_cluster_topics(id) on delete set null;
alter table asc_runs add constraint fk_runs_template foreign key (template_id) references asc_article_templates(id) on delete set null;
