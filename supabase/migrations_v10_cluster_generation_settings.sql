-- =============================================
-- Ascendio v10 Migration
-- Per-cluster SEO article generation settings
-- =============================================

alter table asc_clusters
  add column if not exists generation_settings jsonb not null default '{}'::jsonb;

