-- ============================================================
-- Migration v17: Keyword research (Laag 2)
-- Echte keyword-opportunities uit Serper (SERP/PAA/related) en
-- Google Search Console (page-2 quick wins). Voedt zowel editorial
-- clusters als programmatic datasets.
-- ============================================================

CREATE TABLE IF NOT EXISTS asc_keyword_opportunities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id      uuid NOT NULL REFERENCES asc_sites(id) ON DELETE CASCADE,
  keyword      text NOT NULL,
  source       text NOT NULL DEFAULT 'serper', -- 'serper' | 'gsc' | 'manual'
  intent       text,                            -- 'informational' | 'commercial' | 'transactional' | 'navigational'
  volume       integer,                         -- maandelijks zoekvolume (null tot metrics-provider gekoppeld)
  difficulty   integer,                         -- 0-100 (null tot metrics-provider gekoppeld)
  -- GSC-signalen (alleen gevuld bij source = 'gsc')
  position     numeric,
  impressions  integer,
  clicks       integer,
  ctr          numeric,
  gap_score    numeric,                         -- hoger = betere quick win
  -- Serper-context
  paa          jsonb NOT NULL DEFAULT '[]'::jsonb, -- People Also Ask vragen
  related      jsonb NOT NULL DEFAULT '[]'::jsonb, -- gerelateerde zoekopdrachten
  serp_titles  jsonb NOT NULL DEFAULT '[]'::jsonb, -- top-10 organische titels
  status       text NOT NULL DEFAULT 'new',      -- 'new' | 'saved' | 'used' | 'dismissed'
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_asc_keyword_opps_site ON asc_keyword_opportunities(site_id);
ALTER TABLE asc_keyword_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own keyword opportunities"
  ON asc_keyword_opportunities FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
