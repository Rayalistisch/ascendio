-- Migration v25: verbreed wp_post_id van integer naar bigint
--
-- Shopify artikel-/pagina-ID's zijn veel groter dan de integer-limiet
-- (~2,1 miljard), waardoor het cachen/publiceren faalde met
-- "value out of range for type integer". Alle kolommen die een CMS-post-ID
-- opslaan worden verbreed naar bigint. Dit is een veilige widening
-- (geen dataverlies) en raakt WordPress-sites niet.
--
-- asc_runs.wp_post_id is al text (IBVision slaat daar een string-docid op) en
-- hoeft niet gewijzigd te worden.

ALTER TABLE asc_wp_posts             ALTER COLUMN wp_post_id       TYPE bigint;
ALTER TABLE asc_clusters             ALTER COLUMN pillar_wp_post_id TYPE bigint;
ALTER TABLE asc_cluster_topics       ALTER COLUMN wp_post_id       TYPE bigint;
ALTER TABLE asc_scan_issues          ALTER COLUMN wp_post_id       TYPE bigint;
ALTER TABLE asc_content_refresh_queue ALTER COLUMN wp_post_id      TYPE bigint;
ALTER TABLE asc_interlink_proposals  ALTER COLUMN wp_post_id       TYPE bigint;

-- Link-graaf-RPC gebruikt int voor param en return; die moeten mee naar bigint
-- omdat wp_post_id nu bigint is (anders faalt de return-cast op grote ID's).
-- Return-type wijzigen vereist eerst DROP.
DROP FUNCTION IF EXISTS match_asc_wp_posts(uuid, vector, int, int);

CREATE OR REPLACE FUNCTION match_asc_wp_posts(
  p_site_id uuid,
  p_query vector(1536),
  p_match_count int DEFAULT 8,
  p_exclude_wp_post_id bigint DEFAULT NULL
)
RETURNS TABLE (
  wp_post_id bigint,
  title text,
  slug text,
  url text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    wp.wp_post_id,
    wp.title,
    wp.slug,
    wp.url,
    1 - (wp.embedding <=> p_query) AS similarity
  FROM asc_wp_posts wp
  WHERE wp.site_id = p_site_id
    AND wp.status = 'publish'
    AND wp.embedding IS NOT NULL
    AND (p_exclude_wp_post_id IS NULL OR wp.wp_post_id <> p_exclude_wp_post_id)
  ORDER BY wp.embedding <=> p_query
  LIMIT p_match_count;
$$;
