-- Migration v12: IBVision CMS platform support
-- Adds platform field (default 'wordpress') and IBVision-specific credential columns.
-- All existing sites remain unaffected (platform defaults to 'wordpress').

ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'wordpress';
ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS ibvision_base_url text;
ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS ibvision_api_key_encrypted text;
ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS ibvision_url_prefix text DEFAULT '/';

-- wp_base_url and wp_username are WP-only; IBVision sites don't need them
ALTER TABLE asc_sites ALTER COLUMN wp_base_url DROP NOT NULL;
ALTER TABLE asc_sites ALTER COLUMN wp_username DROP NOT NULL;
ALTER TABLE asc_sites ALTER COLUMN wp_app_password_encrypted DROP NOT NULL;

-- Per-cluster URL prefix for IBVision (overrides site-level prefix)
ALTER TABLE asc_clusters ADD COLUMN IF NOT EXISTS ibvision_url_prefix text;

-- Per-cluster language override (overrides site default_language)
ALTER TABLE asc_clusters ADD COLUMN IF NOT EXISTS language text;
