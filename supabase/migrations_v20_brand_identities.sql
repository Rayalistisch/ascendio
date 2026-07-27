-- ============================================================
-- Migration v20: Brand identities
-- Herbruikbare merkidentiteiten: scan een website en haal automatisch
-- naam, tagline, kleuren, logo, fonts en merkstem op. Koppelbaar aan
-- meerdere sites; de merkstem vult de tone_of_voice van de site.
-- ============================================================

CREATE TABLE IF NOT EXISTS asc_brand_identities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  website_url    text,
  language       text,
  -- Identity
  business_name  text,
  tagline        text,
  description    text,
  -- Visual
  primary_color  text,
  secondary_color text,
  accent_color   text,
  logo_url       text,
  heading_font   text,
  body_font      text,
  -- Voice (zelfde vorm als asc_sites.tone_of_voice)
  tone_of_voice  jsonb,
  -- Scan-metadata
  scan_status    text NOT NULL DEFAULT 'none', -- 'none' | 'scanning' | 'succeeded' | 'failed'
  scan_error     text,
  scanned_pages  jsonb NOT NULL DEFAULT '[]'::jsonb,
  html_bytes     integer,
  scanned_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asc_brand_identities_user ON asc_brand_identities(user_id);
ALTER TABLE asc_brand_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own brand identities"
  ON asc_brand_identities FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Koppeling site -> brand identity (optioneel)
ALTER TABLE asc_sites
  ADD COLUMN IF NOT EXISTS brand_identity_id uuid REFERENCES asc_brand_identities(id) ON DELETE SET NULL;
