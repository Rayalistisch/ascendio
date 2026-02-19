import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueSeoFixJob } from "@/lib/qstash";
import { isIssueTypeAutoFixable } from "@/lib/seo-fix";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId } = await request.json();
  if (!issueId) return NextResponse.json({ error: "Missing issueId" }, { status: 400 });

  const { data: issue } = await supabase
    .from("asc_scan_issues")
    .select("id, site_id, issue_type")
    .eq("id", issueId)
    .eq("user_id", user.id)
    .single();

  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (!isIssueTypeAutoFixable(issue.issue_type)) {
    return NextResponse.json(
      { error: "Dit issue type kan niet automatisch worden gefixt" },
      { status: 400 }
    );
  }

  const { messageId } = await enqueueSeoFixJob({ issueId, siteId: issue.site_id, userId: user.id });
  return NextResponse.json({ messageId });
}
