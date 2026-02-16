import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  let query = supabase
    .from("asc_runs")
    .select("*, asc_sites(name), asc_run_logs(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (siteId) query = query.eq("site_id", siteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runs: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let statuses: string[] = ["failed", "running"];
  try {
    const body = await request.json();
    if (Array.isArray(body?.statuses) && body.statuses.length > 0) {
      statuses = body.statuses;
    }
  } catch {
    // Use default statuses when no body is provided.
  }

  const allowedStatuses = new Set(["queued", "running", "failed", "published"]);
  const sanitizedStatuses = Array.from(
    new Set(statuses.filter((status) => allowedStatuses.has(status)))
  );

  if (sanitizedStatuses.length === 0) {
    return NextResponse.json({ error: "No valid statuses provided" }, { status: 400 });
  }

  const { data: deletedRuns, error } = await supabase
    .from("asc_runs")
    .delete()
    .eq("user_id", user.id)
    .in("status", sanitizedStatuses)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    deleted: deletedRuns?.length ?? 0,
    statuses: sanitizedStatuses,
  });
}
