import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkIndexingStatus } from "@/lib/google-indexing";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId } = await request.json();
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

  const { data: req } = await supabase
    .from("asc_indexing_requests")
    .select("*, asc_sites(google_indexing_credentials_encrypted)")
    .eq("id", requestId)
    .eq("user_id", user.id)
    .single();

  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const site = Array.isArray(req.asc_sites) ? req.asc_sites[0] : req.asc_sites as any;
  if (!site?.google_indexing_credentials_encrypted) {
    return NextResponse.json({ error: "No indexing credentials configured" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(site.google_indexing_credentials_encrypted));
  const status = await checkIndexingStatus(req.url, credentials);

  await supabase.from("asc_indexing_requests").update({ last_checked_at: new Date().toISOString() }).eq("id", requestId);

  return NextResponse.json(status);
}
