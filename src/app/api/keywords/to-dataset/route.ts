import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";

// POST /api/keywords/to-dataset
// Turn selected keyword opportunities into a programmatic dataset (one row per
// keyword, columns: keyword + intent). Bridges Laag 2 -> Laag 1.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "keyword_research");
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Upgrade naar Pro om keyword-onderzoek te gebruiken" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const { siteId, name, keywordIds } = (body ?? {}) as {
    siteId?: string;
    name?: string;
    keywordIds?: string[];
  };

  if (!siteId || !Array.isArray(keywordIds) || keywordIds.length === 0) {
    return NextResponse.json({ error: "siteId en keywords zijn verplicht" }, { status: 400 });
  }

  const { data: opps } = await supabase
    .from("asc_keyword_opportunities")
    .select("id, keyword, intent")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .in("id", keywordIds);

  if (!opps || opps.length === 0) {
    return NextResponse.json({ error: "Geen keywords gevonden" }, { status: 404 });
  }

  const { data: dataset, error: dsError } = await supabase
    .from("asc_datasets")
    .insert({
      user_id: user.id,
      site_id: siteId,
      name: (name && name.trim()) || "Keyword-set",
      columns: ["keyword", "intent"],
      row_count: opps.length,
    })
    .select("id")
    .single();

  if (dsError || !dataset) {
    return NextResponse.json({ error: dsError?.message ?? "Dataset aanmaken mislukt" }, { status: 500 });
  }

  const rows = opps.map((o, row_index) => ({
    dataset_id: dataset.id,
    user_id: user.id,
    data: { keyword: o.keyword, intent: o.intent ?? "" },
    row_index,
  }));

  const { error: rowsError } = await supabase.from("asc_dataset_rows").insert(rows);
  if (rowsError) {
    await supabase.from("asc_datasets").delete().eq("id", dataset.id);
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  // Mark these opportunities as used so they drop out of the active list.
  await supabase
    .from("asc_keyword_opportunities")
    .update({ status: "used", updated_at: new Date().toISOString() })
    .in("id", opps.map((o) => o.id));

  return NextResponse.json({ datasetId: dataset.id, rowCount: opps.length });
}
