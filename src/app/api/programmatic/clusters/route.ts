import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { normalizeGenerationSettings } from "@/lib/generation-settings";
import { extractVariables } from "@/lib/programmatic";

// POST /api/programmatic/clusters
// Create a programmatic cluster: a dataset + {{variabelen}} patterns that the
// existing generation worker turns into one unique page per row.
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
  const {
    siteId,
    name,
    datasetId,
    titlePattern,
    slugPattern,
    topicPattern,
    templateId,
    contentType,
    generationSettings,
    language,
  } = (body ?? {}) as Record<string, unknown>;

  if (!siteId || !name || !datasetId || !titlePattern) {
    return NextResponse.json(
      { error: "siteId, naam, dataset en titel-patroon zijn verplicht" },
      { status: 400 }
    );
  }

  // Verify the dataset belongs to the user and the site
  const { data: dataset } = await supabase
    .from("asc_datasets")
    .select("id, columns, site_id")
    .eq("id", datasetId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!dataset) return NextResponse.json({ error: "Dataset niet gevonden" }, { status: 404 });
  if (dataset.site_id !== siteId) {
    return NextResponse.json({ error: "Dataset hoort niet bij deze site" }, { status: 400 });
  }

  // Every variable used in the patterns must exist as a dataset column
  const columns: string[] = Array.isArray(dataset.columns) ? (dataset.columns as string[]) : [];
  const usedVars = extractVariables(
    [titlePattern, slugPattern ?? "", topicPattern ?? ""].map(String).join(" ")
  );
  const missing = usedVars.filter((v) => !columns.includes(v));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Onbekende kolommen in patroon: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    site_id: siteId,
    name,
    // pillar_* columns are NOT NULL / used by the shared model; for a
    // programmatic cluster there is no editorial pillar, so mirror the name.
    pillar_topic: name,
    pillar_keywords: [],
    mode: "programmatic",
    dataset_id: datasetId,
    title_pattern: titlePattern,
    slug_pattern: slugPattern || null,
    topic_pattern: topicPattern || null,
    template_id: templateId || null,
    content_type: contentType || "posts",
    language: language || null,
    status: "draft",
  };
  if (generationSettings !== undefined) {
    insertPayload.generation_settings = normalizeGenerationSettings(generationSettings);
  }

  const { data, error } = await supabase
    .from("asc_clusters")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clusterId: data.id }, { status: 201 });
}
