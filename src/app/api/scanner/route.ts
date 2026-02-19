import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueScanJob } from "@/lib/qstash";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data, error } = await supabase
    .from("asc_scan_reports")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId } = await request.json();
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: report, error } = await supabase
    .from("asc_scan_reports")
    .insert({ user_id: user.id, site_id: siteId, status: "running" })
    .select()
    .single();

  if (error || !report) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  try {
    await enqueueScanJob({ reportId: report.id, siteId, userId: user.id });
  } catch (enqueueError) {
    await supabase
      .from("asc_scan_reports")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", report.id)
      .eq("user_id", user.id);

    return NextResponse.json(
      {
        error:
          enqueueError instanceof Error
            ? `Scan kon niet worden ingepland: ${enqueueError.message}`
            : "Scan kon niet worden ingepland",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ report }, { status: 201 });
}
