-- =============================================
-- Ascendio v15 Migration
-- Site-level Elementor toggle
-- When enabled, all posts from this site are treated as Elementor posts:
-- sync stores elementor_data, publish injects via _elementor_data meta
-- instead of updating post_content (which Elementor ignores).
-- =============================================

ALTER TABLE asc_sites
  ADD COLUMN IF NOT EXISTS is_elementor_site boolean NOT NULL DEFAULT false;
