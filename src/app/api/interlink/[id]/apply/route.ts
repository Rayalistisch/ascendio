import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { updatePost } from "@/lib/wordpress";

// POST /api/interlink/[id]/apply — publiceer het voorstel live naar WordPress
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: proposal } = await supabase
    .from("asc_interlink_proposals")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Voorstel niet gevonden" }, { status: 404 });
  if (proposal.status !== "pending") {
    return NextResponse.json({ error: "Voorstel is niet klaar om te publiceren" }, { status: 400 });
  }
  if (!proposal.proposed_html) {
    return NextResponse.json({ error: "Geen voorgestelde content" }, { status: 400 });
  }
  if (!Array.isArray(proposal.added_links) || proposal.added_links.length === 0) {
    return NextResponse.json({ error: "Geen links om te publiceren" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("wp_base_url, wp_username, wp_app_password_encrypted")
    .eq("id", proposal.site_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site?.wp_app_password_encrypted) {
    return NextResponse.json({ error: "WordPress-gegevens ontbreken" }, { status: 400 });
  }

  const creds = {
    baseUrl: site.wp_base_url,
    username: site.wp_username,
    appPassword: decrypt(site.wp_app_password_encrypted),
  };
  const wpPostId = Number(proposal.wp_post_id);

  // Probeer posts, val terug op pages.
  try {
    await updatePost(creds, wpPostId, { content: proposal.proposed_html }, { collection: "posts" });
  } catch {
    try {
      await updatePost(creds, wpPostId, { content: proposal.proposed_html }, { collection: "pages" });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Publiceren mislukt" },
        { status: 502 }
      );
    }
  }

  await supabase
    .from("asc_wp_posts")
    .update({ content: proposal.proposed_html, last_synced_at: new Date().toISOString() })
    .eq("site_id", proposal.site_id)
    .eq("wp_post_id", wpPostId);

  await supabase
    .from("asc_interlink_proposals")
    .update({ status: "applied", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
