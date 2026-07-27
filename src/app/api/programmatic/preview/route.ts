import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { checkBulkCredits, CREDIT_COSTS } from "@/lib/credits";
import { previewTopics } from "@/lib/programmatic";

// POST /api/programmatic/preview
// Body: { datasetId, titlePattern, slugPattern?, topicPattern? }
// Returns a sample of resolved topics + how many rows resolve cleanly and
// the credit cost, so the wizard can show it before committing.
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
  const { datasetId, titlePattern, slugPattern, topicPattern } = (body ?? {}) as {
    datasetId?: string;
    titlePattern?: string;
    slugPattern?: string;
    topicPattern?: string;
  };

  if (!datasetId || !titlePattern) {
    return NextResponse.json({ error: "datasetId en titelPatroon zijn verplicht" }, { status: 400 });
  }

  const { data: dataset } = await supabase
    .from("asc_datasets")
    .select("id, columns")
    .eq("id", datasetId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!dataset) return NextResponse.json({ error: "Dataset niet gevonden" }, { status: 404 });

  const { data: rows } = await supabase
    .from("asc_dataset_rows")
    .select("data")
    .eq("dataset_id", datasetId)
    .order("row_index", { ascending: true });

  const allRows = (rows ?? []).map((r) => r.data as Record<string, string>);
  const patterns = { titlePattern, slugPattern, topicPattern };

  // Resolve every row to count clean vs. broken, but only return a sample.
  const full = previewTopics(patterns, allRows);
  const validCount = full.filter((p) => !p.error).length;
  const errorCount = full.length - validCount;
  const firstError = full.find((p) => p.error)?.error;

  const preflight = await checkBulkCredits(supabase, user.id, "programmatic_page", validCount);

  return NextResponse.json({
    columns: dataset.columns,
    totalRows: full.length,
    validCount,
    errorCount,
    firstError,
    sample: full.slice(0, 10),
    costPerPage: CREDIT_COSTS.programmatic_page,
    totalCost: validCount * CREDIT_COSTS.programmatic_page,
    creditsRemaining: preflight.remaining,
    affordable: preflight.affordable,
    enoughForAll: preflight.enoughForAll,
  });
}
