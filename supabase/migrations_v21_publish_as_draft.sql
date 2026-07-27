-- ============================================================
-- Migration v21: Concept-modus (publiceren als draft)
-- Wanneer aan, plaatst de worker content als WordPress-draft i.p.v. direct
-- live, zodat je hem eerst kunt controleren en daarna publiceren.
-- ============================================================

ALTER TABLE asc_sites
  ADD COLUMN IF NOT EXISTS publish_as_draft boolean NOT NULL DEFAULT false;
