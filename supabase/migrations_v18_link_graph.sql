-- ============================================================
-- Migration v18: Interne-link-graaf (Laag 3)
-- Embeddings op gecachte posts (pgvector) + similarity-RPC, zodat interne
-- links semantisch gekozen worden i.p.v. door de LLM te laten gokken uit een
-- lijst recente titels. Werkt uniform voor editorial en programmatic pagina's.
--
-- text-embedding-3-small levert 1536 dimensies.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE asc_wp_posts
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- Cosine-afstand index (HNSW). Nulls worden overgeslagen, dus veilig op een
-- tabel met bestaande rijen zonder embedding.
CREATE INDEX IF NOT EXISTS idx_asc_wp_posts_embedding
  ON asc_wp_posts USING hnsw (embedding vector_cosine_ops);

-- Semantisch dichtstbijzijnde gepubliceerde posts binnen één site.
-- SECURITY INVOKER (default): voor user-calls geldt RLS; de worker gebruikt de
-- service-role client en omzeilt RLS zoals overal.
CREATE OR REPLACE FUNCTION match_asc_wp_posts(
  p_site_id uuid,
  p_query vector(1536),
  p_match_count int DEFAULT 8,
  p_exclude_wp_post_id int DEFAULT NULL
)
RETURNS TABLE (
  wp_post_id int,
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
