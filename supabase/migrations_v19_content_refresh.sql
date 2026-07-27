-- ============================================================
-- Migration v19: Content refresh-loop (Laag 4)
-- Detecteert verval/stuck-pagina's via Google Search Console en zet ze in een
-- refresh-wachtrij. De refresh-worker herschrijft gericht (rewriteContentWithPrompt)
-- en werkt de WordPress-post bij (updatePost) — de optimalisatie-lus sluit.
-- ============================================================

CREATE TABLE IF NOT EXISTS asc_content_refresh_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id       uuid NOT NULL REFERENCES asc_sites(id) ON DELETE CASCADE,
  wp_post_id    integer NOT NULL,
  url           text NOT NULL,
  title         text,
  reason        text NOT NULL,               -- 'decay' | 'stuck'
  metrics       jsonb NOT NULL DEFAULT '{}'::jsonb, -- clicks_now/clicks_prev/position/impressions/ctr/top_queries
  score         numeric NOT NULL DEFAULT 0,  -- hoger = urgenter
  status        text NOT NULL DEFAULT 'pending', -- 'pending' | 'refreshing' | 'refreshed' | 'dismissed' | 'failed'
  error_message text,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  refreshed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, wp_post_id)
);

CREATE INDEX IF NOT EXISTS idx_asc_refresh_site ON asc_content_refresh_queue(site_id);
ALTER TABLE asc_content_refresh_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own refresh queue"
  ON asc_content_refresh_queue FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Wanneer we deze site voor het laatst op verval scanden (voor weekelijkse throttle in cron).
ALTER TABLE asc_search_console_connections
  ADD COLUMN IF NOT EXISTS last_refresh_scan_at timestamptz;
