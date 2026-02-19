import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQStashSignature } from "@/lib/qstash";
import { decrypt } from "@/lib/encryption";
import { fetchPage, fetchPost, updatePost, updateMedia } from "@/lib/wordpress";
import { rewriteContentWithPrompt, generateAltText } from "@/lib/openai";
import { checkCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { isIssueTypeAutoFixable } from "@/lib/seo-fix";

export const maxDuration = 60;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("upstash-signature");
  if (!(await verifyQStashSignature(sig, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { issueId, siteId, userId } = JSON.parse(rawBody);
  if (!issueId || !siteId || !userId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { data: issue } = await supabase
    .from("asc_scan_issues")
    .select("*")
    .eq("id", issueId)
    .eq("user_id", userId)
    .eq("site_id", siteId)
    .single();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("*")
    .eq("id", siteId)
    .eq("user_id", userId)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const creds = { baseUrl: site.wp_base_url, username: site.wp_username, appPassword: decrypt(site.wp_app_password_encrypted) };

  // Credit pre-check
  const creditCheck = await checkCredits(supabase, userId, CREDIT_COSTS.seo_fix);
  if (!creditCheck.enough) {
    return NextResponse.json({ error: "Onvoldoende credits" }, { status: 402 });
  }

  try {
    if (!issue.wp_post_id) throw new Error("No wp_post_id");
    if (!isIssueTypeAutoFixable(issue.issue_type)) {
      return NextResponse.json({ error: "Issue type not auto-fixable" }, { status: 400 });
    }

    let wpPost: Record<string, any> | null = null;
    let collection: "posts" | "pages" = "posts";

    try {
      wpPost = await fetchPost(creds, issue.wp_post_id);
    } catch {
      wpPost = await fetchPage(creds, issue.wp_post_id);
      collection = "pages";
    }

    if (!wpPost) throw new Error("WordPress item niet gevonden");

    const content = typeof wpPost.content === "object" ? wpPost.content.rendered : wpPost.content;
    const title = typeof wpPost.title === "object" ? wpPost.title.rendered : wpPost.title;

    switch (issue.issue_type) {
      case "missing_alt": {
        const altText = await generateAltText(title, title);
        if (wpPost.featured_media) await updateMedia(creds, wpPost.featured_media, { alt_text: altText });
        break;
      }
      case "missing_meta_description":
      case "thin_content":
      case "heading_hierarchy": {
        const prompts: Record<string, string> = {
          missing_meta_description: "Generate a compelling meta description for this content (150-160 chars)",
          thin_content: "Expand this content to at least 500 words while maintaining quality and relevance",
          heading_hierarchy: "Fix the heading hierarchy to use proper H2/H3 nesting without changing the meaning",
        };
        const result = await rewriteContentWithPrompt(content, prompts[issue.issue_type], undefined, site.tone_of_voice ?? null);
        await updatePost(creds, issue.wp_post_id, { content: result.htmlContent }, { collection });
        break;
      }
      default:
        return NextResponse.json({ error: "Issue type not auto-fixable" }, { status: 400 });
    }

    await supabase
      .from("asc_scan_issues")
      .update({ is_fixed: true, fixed_at: new Date().toISOString() })
      .eq("id", issueId)
      .eq("user_id", userId);

    // Update report fix count
    const { data: report } = await supabase.from("asc_scan_issues")
      .select("report_id")
      .eq("id", issueId)
      .eq("user_id", userId)
      .single();
    if (report) {
      const { count } = await supabase.from("asc_scan_issues")
        .select("id", { count: "exact", head: true })
        .eq("report_id", report.report_id)
        .eq("is_fixed", true);
      await supabase.from("asc_scan_reports").update({ issues_fixed: count || 0 }).eq("id", report.report_id);
    }

    // Deduct credits after successful fix
    await deductCredits(supabase, userId, "seo_fix", issueId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fix failed" }, { status: 500 });
  }
}
