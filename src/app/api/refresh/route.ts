import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";

// GET /api/refresh?siteId=... — list the refresh queue for a site
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "content_refresh");
  if (!access.allowed) {
    return NextResponse.json({ error: "Upgrade naar Pro om de refresh-loop te gebruiken" }, { status: 403 });
  }

  const siteId = new URL(request.url).searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_content_refresh_queue")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .neq("status", "dismissed")
    .order("status", { ascending: true })
    .order("score", { ascending: false })
    .order("detected_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
