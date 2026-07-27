import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/interlink?clusterId=... — lijst interne-link-voorstellen
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clusterId = new URL(request.url).searchParams.get("clusterId");
  if (!clusterId) return NextResponse.json({ error: "Missing clusterId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_interlink_proposals")
    .select("id, wp_post_id, url, title, added_links, status, error_message, updated_at")
    .eq("user_id", user.id)
    .eq("cluster_id", clusterId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}
