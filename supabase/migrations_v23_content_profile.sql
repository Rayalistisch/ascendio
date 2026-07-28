-- ============================================================
-- Migration v23: Content-profiel per site
-- Ascendio detecteert uit een referentiepagina hoe content is opgebouwd
-- (ACF-blokken / standaard Gutenberg / klassieke HTML) en publiceert nieuwe
-- content in datzelfde formaat. Zo werkt het op elk thema, met of zonder ACF.
-- ============================================================

ALTER TABLE asc_sites
  ADD COLUMN IF NOT EXISTS content_profile jsonb DEFAULT NULL;
