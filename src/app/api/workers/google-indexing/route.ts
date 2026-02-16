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

  const { requestId, siteId, userId } = JSON.parse(rawBody);
  if (!requestId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { data: req } = await supabase
    .from("asc_indexing_requests")
    .select("*")
    .eq("id", requestId)
    .eq("user_id", userId)
    .single();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.site_id !== siteId) {
    return NextResponse.json({ error: "Request/site mismatch" }, { status: 400 });
  }

  const { data: site } = await supabase
    .from("asc_sites")
    .select("google_indexing_credentials_encrypted")
    .eq("id", siteId)
    .eq("user_id", userId)
    .single();
  if (!site?.google_indexing_credentials_encrypted) {
    await supabase
      .from("asc_indexing_requests")
      .update({ status: "failed", error_message: "No credentials" })
      .eq("id", requestId)
      .eq("user_id", userId);
    return NextResponse.json({ error: "No credentials" }, { status: 400 });
  }

  const credentials = JSON.parse(decrypt(site.google_indexing_credentials_encrypted));
  const result = await submitUrlForIndexing(req.url, credentials, req.request_type);

  if (result.success) {
    await supabase
      .from("asc_indexing_requests")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("user_id", userId);
  } else {
    await supabase
      .from("asc_indexing_requests")
      .update({ status: "failed", error_message: result.error })
      .eq("id", requestId)
      .eq("user_id", userId);
  }

  return NextResponse.json(result);
}
