-- =============================================
-- Ascendio v11 Migration
-- Per-post SEO editor generation settings
-- =============================================

alter table asc_wp_posts
  add column if not exists generation_settings jsonb not null default '{}'::jsonb;
