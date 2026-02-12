import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQStashSignature } from "@/lib/qstash";
import { decrypt } from "@/lib/encryption";
import { submitUrlForIndexing } from "@/lib/google-indexing";

export const maxDuration = 30;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("upstash-signature");
  if (!(await verifyQStashSignature(sig, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { requestId, siteId } = JSON.parse(rawBody);
  const supabase = createAdminClient();

  const { data: req } = await supabase.from("asc_indexing_requests").select("*").eq("id", requestId).single();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const { data: site } = await supabase.from("asc_sites").select("google_indexing_credentials_encrypted").eq("id", siteId).single();
  if (!site?.google_indexing_credentials_encrypted) {
    await supabase.from("asc_indexing_requests").update({ status: "failed", error_message: "No credentials" }).eq("id", requestId);
    return NextResponse.json({ error: "No credentials" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(site.google_indexing_credentials_encrypted));
  const result = await submitUrlForIndexing(req.url, credentials, req.request_type);

  if (result.success) {
    await supabase.from("asc_indexing_requests").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", requestId);
  } else {
    await supabase.from("asc_indexing_requests").update({ status: "failed", error_message: result.error }).eq("id", requestId);
  }

  return NextResponse.json(result);
}
