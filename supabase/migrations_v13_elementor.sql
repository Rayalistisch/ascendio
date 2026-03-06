-- =============================================
-- Ascendio v13 Migration
-- Elementor support: store raw Elementor JSON per post
-- so Ascendio can inject rewritten content back into
-- the correct text-editor widget instead of post_content.
-- =============================================

ALTER TABLE asc_wp_posts
  ADD COLUMN IF NOT EXISTS is_elementor boolean NOT NULL DEFAULT false;
ALTER TABLE asc_wp_posts
  ADD COLUMN IF NOT EXISTS elementor_data jsonb DEFAULT NULL;
