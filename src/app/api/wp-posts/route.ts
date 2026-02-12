import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const search = searchParams.get("search");

  if (!siteId) {
    return NextResponse.json(
      { error: "Missing siteId parameter" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("asc_wp_posts")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .order("wp_modified_at", { ascending: false });

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data });
}
