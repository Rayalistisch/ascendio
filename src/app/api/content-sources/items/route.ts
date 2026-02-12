import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("sourceId");
  const unusedOnly = searchParams.get("unused") === "true";

  if (!sourceId) return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });

  let query = supabase
    .from("asc_source_items")
    .select("*")
    .eq("source_id", sourceId)
    .eq("user_id", user.id)
    .order("fetched_at", { ascending: false })
    .limit(50);

  if (unusedOnly) query = query.eq("is_used", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data });
}
