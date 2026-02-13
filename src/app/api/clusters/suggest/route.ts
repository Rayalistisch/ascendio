import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestClusterTopics } from "@/lib/openai";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, pillarTopic, existingTopics } = body;

  if (!pillarTopic) {
    return NextResponse.json({ error: "Missing pillarTopic" }, { status: 400 });
  }

  // Get site language
  let language = "Dutch";
  if (siteId) {
    const { data: site } = await supabase
      .from("asc_sites")
      .select("default_language")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single();
    if (site?.default_language) language = site.default_language;
  }

  const suggestions = await suggestClusterTopics(pillarTopic, language, existingTopics);
  return NextResponse.json({ suggestions });
}
