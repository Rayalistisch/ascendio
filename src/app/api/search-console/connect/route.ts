import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildSearchConsoleAuthUrl,
  createSearchConsoleOAuthState,
} from "@/lib/google-search-console";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const state = createSearchConsoleOAuthState({
    userId: user.id,
    siteId,
  });

  try {
    const authUrl = buildSearchConsoleAuthUrl(state);
    return NextResponse.json({ authUrl });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Search Console configuratie ontbreekt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
