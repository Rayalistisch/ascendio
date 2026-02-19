import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueSeoFixJob } from "@/lib/qstash";
import { isIssueTypeAutoFixable } from "@/lib/seo-fix";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await request.json();
  if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });

  const { data: issues } = await supabase
    .from("asc_scan_issues")
    .select("id, site_id, issue_type")
    .eq("report_id", reportId)
    .eq("user_id", user.id)
    .eq("is_fixed", false);

  const eligibleIssues = (issues || []).filter((issue) =>
    isIssueTypeAutoFixable(issue.issue_type)
  );

  let enqueued = 0;
  for (const issue of eligibleIssues) {
    try {
      await enqueueSeoFixJob({ issueId: issue.id, siteId: issue.site_id, userId: user.id });
      enqueued++;
    } catch { /* skip */ }
  }

  const total = issues?.length || 0;
  return NextResponse.json({
    enqueued,
    total,
    eligible: eligibleIssues.length,
    skipped: Math.max(0, total - eligibleIssues.length),
  });
}
