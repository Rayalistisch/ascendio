import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQStashSignature } from "@/lib/qstash";
import { decrypt } from "@/lib/encryption";
import { fetchPost, fetchPage, updatePost } from "@/lib/wordpress";
import { rewriteContentWithPrompt } from "@/lib/openai";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { embedText } from "@/lib/embeddings";
import { buildEmbeddingInput, storePostEmbedding } from "@/lib/link-graph";

export const maxDuration = 120;

// Refreshes a single underperforming page: rewrite its content with a
// decay/stuck-aware prompt, push the update to WordPress, refresh the cache
// (and its embedding so the link-graaf stays current).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("upstash-signature");
  if (!(await verifyQStashSignature(sig, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { refreshId, siteId, userId } = JSON.parse(rawBody);
  if (!refreshId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from("asc_content_refresh_queue")
    .select("*")
    .eq("id", refreshId)
    .eq("user_id", userId)
    .eq("site_id", siteId)
    .single();
  if (!item) return NextResponse.json({ error: "Refresh item not found" }, { status: 404 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("*")
    .eq("id", siteId)
    .eq("user_id", userId)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const creditCheck = await checkCredits(supabase, userId, CREDIT_COSTS.content_rewrite);
  if (!creditCheck.enough) {
    await supabase
      .from("asc_content_refresh_queue")
      .update({ status: "failed", error_message: "Onvoldoende credits", updated_at: new Date().toISOString() })
      .eq("id", refreshId);
    return NextResponse.json({ error: "Onvoldoende credits" }, { status: 402 });
  }

  const creds = {
    baseUrl: site.wp_base_url,
    username: site.wp_username,
    appPassword: decrypt(site.wp_app_password_encrypted),
  };

  try {
    // Resolve the live post (try posts, fall back to pages).
    let wpPost: Record<string, unknown> | null = null;
    let collection: "posts" | "pages" = "posts";
    try {
      wpPost = await fetchPost(creds, item.wp_post_id);
    } catch {
      wpPost = await fetchPage(creds, item.wp_post_id);
      collection = "pages";
    }
    if (!wpPost) throw new Error("WordPress-post niet gevonden");

    const currentHtml =
      typeof (wpPost.content as { rendered?: string })?.rendered === "string"
        ? (wpPost.content as { rendered: string }).rendered
        : String((wpPost as { content?: string }).content ?? "");
    if (!currentHtml.trim()) throw new Error("Geen bestaande content om te verversen");

    const metrics = (item.metrics ?? {}) as {
      top_queries?: string[];
      position?: number;
    };
    const underperformingQueries = Array.isArray(metrics.top_queries)
      ? metrics.top_queries.slice(0, 8)
      : [];

    const refreshPrompt =
      item.reason === "decay"
        ? "Dit artikel verliest verkeer. Actualiseer verouderde informatie, cijfers en jaartallen, verwijder gedateerde passages, en versterk de secties die de zoekintentie het beste bedienen. Voeg waar nuttig een recente, concrete invalshoek toe. Behoud de structuur en interne links."
        : "Dit artikel blijft net buiten de top-10 hangen. Verdiep de dekking van de zoekintentie, beantwoord aanvullende deelvragen expliciet, verbeter koppen en scanbaarheid, en versterk de relevantie voor de onderstaande zoekwoorden zonder keyword stuffing.";

    const result = await rewriteContentWithPrompt(
      currentHtml,
      refreshPrompt,
      underperformingQueries.length > 0 ? underperformingQueries : undefined,
      site.tone_of_voice ?? null,
      undefined,
      site.language || undefined
    );

    await updatePost(
      creds,
      item.wp_post_id,
      { content: result.htmlContent },
      { collection }
    );

    await deductCredits(supabase, userId, "content_rewrite", refreshId);

    // Refresh cache + embedding so the link-graaf reflects the new content.
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(buildEmbeddingInput(item.title || "", result.metaDescription));
    } catch {
      // non-fatal
    }
    await supabase
      .from("asc_wp_posts")
      .update({
        content: result.htmlContent,
        meta_description: result.metaDescription,
        last_synced_at: new Date().toISOString(),
        wp_modified_at: new Date().toISOString(),
      })
      .eq("site_id", siteId)
      .eq("wp_post_id", item.wp_post_id);
    if (embedding) await storePostEmbedding(supabase, siteId, item.wp_post_id, embedding);

    await supabase
      .from("asc_content_refresh_queue")
      .update({ status: "refreshed", refreshed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", refreshId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh mislukt";
    await supabase
      .from("asc_content_refresh_queue")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("id", refreshId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
