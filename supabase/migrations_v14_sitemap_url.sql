-- =============================================
-- Ascendio v14 Migration
-- Custom sitemap URL per site
-- Allows overriding the auto-detected sitemap location,
-- e.g. to point directly to post-sitemap.xml instead of the full index
-- =============================================

ALTER TABLE asc_sites
  ADD COLUMN IF NOT EXISTS sitemap_url text;
