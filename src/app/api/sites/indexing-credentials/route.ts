import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";

// GET — check if credentials are configured (never returns the actual key)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("google_indexing_credentials_encrypted")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();

  if (!site) return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });

  return NextResponse.json({ hasCredentials: !!site.google_indexing_credentials_encrypted });
}

// POST — save (or replace) service account JSON
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, serviceAccountJson } = body;
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  if (serviceAccountJson === null || serviceAccountJson === "") {
    // Remove credentials
    await supabase
      .from("asc_sites")
      .update({ google_indexing_credentials_encrypted: null })
      .eq("id", siteId)
      .eq("user_id", user.id);
    return NextResponse.json({ success: true });
  }

  // Validate JSON and required fields
  let parsed: Record<string, unknown>;
  try {
    parsed = typeof serviceAccountJson === "string"
      ? JSON.parse(serviceAccountJson)
      : serviceAccountJson;
  } catch {
    return NextResponse.json({ error: "Ongeldig JSON formaat" }, { status: 400 });
  }

  if (!parsed.client_email || !parsed.private_key) {
    return NextResponse.json(
      { error: "Service account JSON mist client_email of private_key" },
      { status: 400 }
    );
  }

  const encrypted = encrypt(JSON.stringify(parsed));

  const { error } = await supabase
    .from("asc_sites")
    .update({ google_indexing_credentials_encrypted: encrypted })
    .eq("id", siteId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
