import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  void request;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: report } = await supabase
    .from("asc_scan_reports")
    .select("*")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .single();

  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  void request;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: report } = await supabase
    .from("asc_scan_reports")
    .select("id")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("asc_scan_reports")
    .delete()
    .eq("id", reportId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
