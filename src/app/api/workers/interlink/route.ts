import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQStashSignature } from "@/lib/qstash";
import { insertInternalLinks } from "@/lib/openai";
import { fetchPostRawContent } from "@/lib/wordpress";
import { decrypt } from "@/lib/encryption";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";

export const maxDuration = 120;

// Genereert één interne-link-voorstel voor een pagina binnen een cluster.
// Raakt WordPress NIET aan; slaat alleen het voorstel op ter review.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("upstash-signature");
  if (!(await verifyQStashSignature(sig, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { proposalId, siteId, userId } = JSON.parse(rawBody);
  if (!proposalId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: proposal } = await supabase
    .from("asc_interlink_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .single();
  if (!proposal) return NextResponse.json({ error: "Voorstel niet gevonden" }, { status: 404 });

  const fail = async (message: string) => {
    await supabase
      .from("asc_interlink_proposals")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("id", proposalId);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  const creditCheck = await checkCredits(supabase, userId, CREDIT_COSTS.interlink);
  if (!creditCheck.enough) return fail("Onvoldoende credits");

  // Elementor-detectie uit de cache.
  const { data: post } = await supabase
    .from("asc_wp_posts")
    .select("is_elementor")
    .eq("site_id", siteId)
    .eq("wp_post_id", proposal.wp_post_id)
    .maybeSingle();

  const { data: siteRow } = await supabase
    .from("asc_sites")
    .select("default_language, is_elementor_site, acf_content_fields, wp_base_url, wp_username, wp_app_password_encrypted")
    .eq("id", siteId)
    .maybeSingle();
  const siteInfo = siteRow;

  // Guard: bij Elementor/ACF-pagina's zit de zichtbare content niet in
  // post_content. Terugschrijven zou de builder-opmaak (footer/styling) slopen,
  // dus die slaan we bewust over tot er dedicated ondersteuning is.
  if (post?.is_elementor || siteInfo?.is_elementor_site || siteInfo?.acf_content_fields) {
    await supabase
      .from("asc_interlink_proposals")
      .update({
        status: "failed",
        error_message:
          "Interne links worden voor Elementor/ACF-pagina's nog niet ondersteund (zou de opmaak overschrijven).",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);
    return NextResponse.json({ ok: false, skipped: "elementor_or_acf" });
  }

  if (!siteInfo?.wp_app_password_encrypted) return fail("WordPress-gegevens ontbreken");

  // Haal de RUWE bron-content live op (nooit de gerenderde HTML terugschrijven).
  const creds = {
    baseUrl: siteInfo.wp_base_url,
    username: siteInfo.wp_username,
    appPassword: decrypt(siteInfo.wp_app_password_encrypted),
  };
  const rawResult = await fetchPostRawContent(creds, proposal.wp_post_id);
  if (!rawResult || !rawResult.raw.trim()) {
    return fail("Kon de brontekst van deze pagina niet ophalen");
  }
  const html = rawResult.raw;

  const targets: { url: string; title: string }[] = [];

  if (proposal.cluster_id) {
    const { data: cluster } = await supabase
      .from("asc_clusters")
      .select("pillar_wp_post_id, pillar_wp_post_url, pillar_topic")
      .eq("id", proposal.cluster_id)
      .maybeSingle();
    // Pillar eerst (als deze pagina niet zelf de pillar is).
    if (
      cluster?.pillar_wp_post_id &&
      cluster.pillar_wp_post_url &&
      cluster.pillar_wp_post_id !== proposal.wp_post_id
    ) {
      targets.push({ url: cluster.pillar_wp_post_url, title: cluster.pillar_topic });
    }
    const { data: topics } = await supabase
      .from("asc_cluster_topics")
      .select("title, wp_post_id, wp_post_url")
      .eq("cluster_id", proposal.cluster_id);
    for (const t of topics ?? []) {
      if (t.wp_post_url && t.wp_post_id !== proposal.wp_post_id) {
        targets.push({ url: t.wp_post_url, title: t.title });
      }
    }
  }

  if (targets.length === 0) {
    await supabase
      .from("asc_interlink_proposals")
      .update({
        status: "pending",
        proposed_html: html,
        added_links: [],
        error_message: "Geen doelpagina's om naar te linken",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);
    return NextResponse.json({ ok: true, addedLinks: 0 });
  }

  try {
    const result = await insertInternalLinks({
      html,
      targets: targets.slice(0, 6),
      language: siteInfo?.default_language || "Dutch",
      maxLinks: 3,
    });
    // Alleen credits als er daadwerkelijk links zijn toegevoegd.
    if (result.addedLinks.length > 0) {
      await deductCredits(supabase, userId, "interlink", proposalId);
    }
    await supabase
      .from("asc_interlink_proposals")
      .update({
        status: "pending",
        proposed_html: result.html,
        added_links: result.addedLinks,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);
    return NextResponse.json({ ok: true, addedLinks: result.addedLinks.length });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Genereren mislukt");
  }
}
