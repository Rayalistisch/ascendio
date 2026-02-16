import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQStashSignature } from "@/lib/qstash";
import { decrypt } from "@/lib/encryption";
import { fetchAllPosts } from "@/lib/wordpress";
import { scanSite } from "@/lib/site-scanner";

export const maxDuration = 300;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("upstash-signature");
  if (!(await verifyQStashSignature(sig, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { reportId, siteId, userId } = JSON.parse(rawBody);
  if (!reportId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  const supabase = createAdminClient();

  try {
    const { data: report } = await supabase
      .from("asc_scan_reports")
      .select("id, site_id, user_id")
      .eq("id", reportId)
      .eq("user_id", userId)
      .single();
    if (!report) throw new Error("Report not found");
    if (report.site_id !== siteId) throw new Error("Report/site mismatch");

    const { data: site } = await supabase
      .from("asc_sites")
      .select("*")
      .eq("id", siteId)
      .eq("user_id", userId)
      .single();
    if (!site) throw new Error("Site not found");

    const creds = { baseUrl: site.wp_base_url, username: site.wp_username, appPassword: decrypt(site.wp_app_password_encrypted) };
    const posts = await fetchAllPosts(creds);
    const result = await scanSite(posts);

    for (const issue of result.issues) {
      await supabase.from("asc_scan_issues").insert({
        report_id: reportId,
        user_id: userId,
        site_id: siteId,
        wp_post_id: issue.wpPostId ?? null,
        page_url: issue.pageUrl,
        issue_type: issue.issueType,
        severity: issue.severity,
        description: issue.description,
        current_value: issue.currentValue || null,
        suggested_fix: issue.suggestedFix || null,
        auto_fixable: issue.autoFixable,
      });
    }

    await supabase.from("asc_scan_reports").update({
      status: "completed",
      pages_scanned: result.pagesScanned,
      issues_found: result.issues.length,
      finished_at: new Date().toISOString(),
    }).eq("id", reportId).eq("user_id", userId);

    return NextResponse.json({ success: true, pagesScanned: result.pagesScanned, issuesFound: result.issues.length });
  } catch (err) {
    await supabase.from("asc_scan_reports").update({
      status: "failed",
      finished_at: new Date().toISOString(),
    }).eq("id", reportId).eq("user_id", userId);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scan failed" }, { status: 500 });
  }
}
