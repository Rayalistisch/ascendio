import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, embedBatch } from "@/lib/embeddings";

// Interne-link-graaf: embeddings op gecachte posts + semantische nearest-neighbor
// lookup, zodat interne links relevant én naar echte URL's wijzen.

export interface RelatedPost {
  wp_post_id: number;
  title: string;
  slug: string;
  url: string;
  similarity: number;
}

/** Tekst waarop een post wordt geëmbed: titel weegt zwaar, excerpt geeft context. */
export function buildEmbeddingInput(title: string, excerpt?: string | null): string {
  const t = (title || "").trim();
  const e = (excerpt || "").trim();
  return e ? `${t}\n\n${e}` : t;
}

/**
 * Semantisch dichtstbijzijnde gepubliceerde posts binnen een site, via de
 * pgvector-RPC. Geeft [] terug bij fouten of ontbrekende embeddings.
 */
export async function findRelatedPosts(
  supabase: SupabaseClient,
  siteId: string,
  queryEmbedding: number[],
  count = 8,
  excludeWpPostId?: number
): Promise<RelatedPost[]> {
  const { data, error } = await supabase.rpc("match_asc_wp_posts", {
    p_site_id: siteId,
    p_query: queryEmbedding as unknown as string,
    p_match_count: count,
    p_exclude_wp_post_id: excludeWpPostId ?? null,
  });
  if (error || !Array.isArray(data)) return [];
  return data as RelatedPost[];
}

/** Sla de embedding van één gecachte post op. */
export async function storePostEmbedding(
  supabase: SupabaseClient,
  siteId: string,
  wpPostId: number,
  embedding: number[]
): Promise<void> {
  await supabase
    .from("asc_wp_posts")
    .update({
      embedding: embedding as unknown as string,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq("site_id", siteId)
    .eq("wp_post_id", wpPostId);
}

/**
 * Embed cached posts that don't have an embedding yet. Bounded per call so it
 * stays cheap and time-safe; returns how many were embedded and how many
 * remain, so callers can loop or show progress.
 */
export async function backfillPostEmbeddings(
  supabase: SupabaseClient,
  siteId: string,
  limit = 50
): Promise<{ embedded: number; remaining: number }> {
  const { data: posts } = await supabase
    .from("asc_wp_posts")
    .select("wp_post_id, title, excerpt")
    .eq("site_id", siteId)
    .eq("status", "publish")
    .is("embedding", null)
    .limit(limit);

  if (!posts || posts.length === 0) return { embedded: 0, remaining: 0 };

  const inputs = posts.map((p) => buildEmbeddingInput(p.title, p.excerpt));
  const embeddings = await embedBatch(inputs);
  if (!embeddings) return { embedded: 0, remaining: posts.length };

  let embedded = 0;
  for (let i = 0; i < posts.length; i++) {
    const vec = embeddings[i];
    if (!vec) continue;
    await storePostEmbedding(supabase, siteId, posts[i].wp_post_id, vec);
    embedded++;
  }

  // How many still lack an embedding after this batch?
  const { count: remaining } = await supabase
    .from("asc_wp_posts")
    .select("wp_post_id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("status", "publish")
    .is("embedding", null);

  return { embedded, remaining: remaining ?? 0 };
}

/** Aantallen voor de UI: hoeveel posts hebben al een embedding. */
export async function embeddingStatus(
  supabase: SupabaseClient,
  siteId: string
): Promise<{ total: number; embedded: number }> {
  const [{ count: total }, { count: embedded }] = await Promise.all([
    supabase
      .from("asc_wp_posts")
      .select("wp_post_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("status", "publish"),
    supabase
      .from("asc_wp_posts")
      .select("wp_post_id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("status", "publish")
      .not("embedding", "is", null),
  ]);
  return { total: total ?? 0, embedded: embedded ?? 0 };
}

/**
 * Convenience: embed an arbitrary query (topic/title) and return the nearest
 * posts. Used by the worker to pick internal-link candidates for a new article.
 */
export async function findRelatedPostsForQuery(
  supabase: SupabaseClient,
  siteId: string,
  queryText: string,
  count = 12,
  excludeWpPostId?: number
): Promise<RelatedPost[]> {
  const embedding = await embedText(queryText);
  if (!embedding) return [];
  return findRelatedPosts(supabase, siteId, embedding, count, excludeWpPostId);
}
