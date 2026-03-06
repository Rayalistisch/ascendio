-- =============================================
-- Ascendio v13 Migration
-- ACF (Advanced Custom Fields) support
-- Comma-separated list of ACF field names that contain the main
-- article content, e.g. "solution_inner_info,solution_inner_info1"
-- =============================================

ALTER TABLE asc_sites
  ADD COLUMN IF NOT EXISTS acf_content_fields text;
