import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFeatureAccess } from "@/lib/billing";
import { backfillPostEmbeddings, embeddingStatus } from "@/lib/link-graph";

async function authAndSite(request: Request, siteId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const access = await checkFeatureAccess(supabase, user.id, "link_graph");
  if (!access.allowed) {
    return { error: NextResponse.json({ error: "Upgrade naar Pro om de link-graaf te gebruiken" }, { status: 403 }) };
  }
  if (!siteId) return { error: NextResponse.json({ error: "Missing siteId" }, { status: 400 }) };

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!site) return { error: NextResponse.json({ error: "Site niet gevonden" }, { status: 404 }) };

  return { supabase };
}

// GET /api/link-graph?siteId=... — hoeveel posts zijn al geïndexeerd
export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get("siteId");
  const ctx = await authAndSite(request, siteId);
  if (ctx.error) return ctx.error;

  const status = await embeddingStatus(ctx.supabase, siteId!);
  return NextResponse.json(status);
}

// POST /api/link-graph — embed één batch nog niet geïndexeerde posts
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const siteId = (body ?? {}).siteId as string | undefined;
  const ctx = await authAndSite(request, siteId ?? null);
  if (ctx.error) return ctx.error;

  const result = await backfillPostEmbeddings(ctx.supabase, siteId!, 50);
  return NextResponse.json(result);
}
