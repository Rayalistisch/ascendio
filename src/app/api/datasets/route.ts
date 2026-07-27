import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { parseCsv } from "@/lib/programmatic";

// Hard cap on rows per dataset for the MVP — protects the DB and keeps
// bulk generation batches sane. Raise once batching/throttling is proven.
const MAX_ROWS = 2000;

// GET /api/datasets?siteId=... — list datasets for a site
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = new URL(request.url).searchParams.get("siteId");
  let query = supabase
    .from("asc_datasets")
    .select("id, name, columns, row_count, site_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (siteId) query = query.eq("site_id", siteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ datasets: data ?? [] });
}

// POST /api/datasets — create a dataset from CSV text or explicit columns+rows
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(supabase, user.id, "programmatic");
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Upgrade naar Pro om programmatic SEO te gebruiken" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const { siteId, name, csv } = body as {
    siteId?: string;
    name?: string;
    csv?: string;
    columns?: string[];
    rows?: Record<string, string>[];
  };

  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  // Verify the user owns the site
  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  // Resolve columns + rows from either CSV text or explicit arrays
  let columns: string[];
  let rows: Record<string, string>[];
  if (typeof csv === "string" && csv.trim()) {
    const parsed = parseCsv(csv);
    columns = parsed.columns;
    rows = parsed.rows;
  } else if (Array.isArray(body.columns) && Array.isArray(body.rows)) {
    columns = body.columns.map((c: unknown) => String(c).trim()).filter(Boolean);
    rows = body.rows;
  } else {
    return NextResponse.json({ error: "Geen CSV of rijen aangeleverd" }, { status: 400 });
  }

  if (columns.length === 0) {
    return NextResponse.json({ error: "Geen kolommen gevonden" }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Geen datarijen gevonden" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Maximaal ${MAX_ROWS} rijen per dataset (${rows.length} aangeleverd)` },
      { status: 400 }
    );
  }

  const { data: dataset, error: dsError } = await supabase
    .from("asc_datasets")
    .insert({
      user_id: user.id,
      site_id: siteId,
      name: (name && name.trim()) || "Naamloze dataset",
      columns,
      row_count: rows.length,
    })
    .select("id")
    .single();

  if (dsError || !dataset) {
    return NextResponse.json({ error: dsError?.message ?? "Aanmaken mislukt" }, { status: 500 });
  }

  const rowRecords = rows.map((data, row_index) => ({
    dataset_id: dataset.id,
    user_id: user.id,
    data,
    row_index,
  }));

  const { error: rowsError } = await supabase.from("asc_dataset_rows").insert(rowRecords);
  if (rowsError) {
    // Roll back the dataset so we don't leave an empty shell
    await supabase.from("asc_datasets").delete().eq("id", dataset.id);
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  return NextResponse.json({ id: dataset.id, columns, rowCount: rows.length });
}
