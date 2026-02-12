import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId");
  const issueType = searchParams.get("type");
  const severity = searchParams.get("severity");
  const unfixed = searchParams.get("unfixed") === "true";

  if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });

  let query = supabase
    .from("asc_scan_issues")
    .select("*")
    .eq("report_id", reportId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (issueType) query = query.eq("issue_type", issueType);
  if (severity) query = query.eq("severity", severity);
  if (unfixed) query = query.eq("is_fixed", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ issues: data });
}
