-- ============================================================
-- Migration v9: Per-site tone of voice / knowledge base
-- ============================================================

ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS tone_of_voice jsonb DEFAULT NULL;
