-- ============================================================
-- Migration v8: Cluster content type (posts/pages) + sitemap cache
-- ============================================================

-- 1. Add content_type to clusters (configurable per cluster)
ALTER TABLE asc_clusters
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'pages';

-- Set existing published clusters to 'posts' for backward compatibility
UPDATE asc_clusters SET content_type = 'posts'
WHERE pillar_wp_post_id IS NOT NULL;

-- 2. Sitemap URL cache for overlap detection
CREATE TABLE IF NOT EXISTS asc_sitemap_urls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES asc_sites(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url           text NOT NULL,
  title         text,
  last_modified timestamptz,
  scraped_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, url)
);

CREATE INDEX IF NOT EXISTS idx_sitemap_urls_site ON asc_sitemap_urls(site_id);

ALTER TABLE asc_sitemap_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sitemap urls"
  ON asc_sitemap_urls FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);
