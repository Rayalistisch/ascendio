import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueIndexingJob } from "@/lib/qstash";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_indexing_requests")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId, url, requestType } = await request.json();
  if (!siteId || !url) return NextResponse.json({ error: "Missing siteId or url" }, { status: 400 });

  const { data: req, error } = await supabase
    .from("asc_indexing_requests")
    .insert({
      user_id: user.id,
      site_id: siteId,
      url,
      request_type: requestType || "URL_UPDATED",
      status: "pending",
    })
    .select()
    .single();

  if (error || !req) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  await enqueueIndexingJob({ requestId: req.id, siteId, userId: user.id });
  return NextResponse.json({ request: req }, { status: 201 });
}
