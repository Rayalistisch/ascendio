import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { fetchAllPages } from "@/lib/wordpress";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("wp_base_url, wp_username, wp_app_password_encrypted")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();

  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  const creds = {
    baseUrl: site.wp_base_url,
    username: site.wp_username,
    appPassword: decrypt(site.wp_app_password_encrypted),
  };

  const pages = await fetchAllPages(creds, {
    fields: ["id", "title", "link", "slug", "parent"],
    perPage: 100,
    maxPages: 5,
    timeoutMs: 10000,
  });

  const result = pages.map((p) => ({
    wp_post_id: p.id as number,
    title: (p.title as { rendered: string })?.rendered ?? p.slug ?? String(p.id),
    url: p.link as string,
    parent: p.parent as number,
  }));

  return NextResponse.json({ pages: result });
}
