import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueSourceFetchJob } from "@/lib/qstash";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { sourceId } = body;

  if (!sourceId) {
    return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  }

  // Fetch the source and verify ownership
  const { data: source, error } = await supabase
    .from("asc_content_sources")
    .select("id, site_id, source_type, is_enabled")
    .eq("id", sourceId)
    .eq("user_id", user.id)
    .single();

  if (error || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  if (!source.is_enabled) {
    return NextResponse.json({ error: "Source is disabled" }, { status: 400 });
  }

  // Enqueue fetch job via QStash
  const { messageId } = await enqueueSourceFetchJob({
    sourceId: source.id,
    siteId: source.site_id,
    userId: user.id,
  });

  return NextResponse.json({ messageId, sourceId: source.id });
}
