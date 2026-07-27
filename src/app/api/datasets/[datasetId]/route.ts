import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/datasets/[datasetId] — dataset metadata + rows
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  const { datasetId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dataset } = await supabase
    .from("asc_datasets")
    .select("id, name, columns, row_count, site_id, created_at")
    .eq("id", datasetId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!dataset) return NextResponse.json({ error: "Dataset niet gevonden" }, { status: 404 });

  const { data: rows } = await supabase
    .from("asc_dataset_rows")
    .select("id, data, row_index")
    .eq("dataset_id", datasetId)
    .order("row_index", { ascending: true });

  return NextResponse.json({ dataset, rows: rows ?? [] });
}

// DELETE /api/datasets/[datasetId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  const { datasetId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block deletion while a programmatic cluster still references this dataset
  const { data: linkedCluster } = await supabase
    .from("asc_clusters")
    .select("id")
    .eq("dataset_id", datasetId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (linkedCluster) {
    return NextResponse.json(
      { error: "Dataset is in gebruik door een programmatic cluster" },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("asc_datasets")
    .delete()
    .eq("id", datasetId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
