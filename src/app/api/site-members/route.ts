import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["admin", "editor", "viewer"]);
const ALLOWED_STATUSES = new Set(["invited", "active", "disabled"]);

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requireOwnedSite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  siteId: string
): Promise<boolean> {
  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(site);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const ownsSite = await requireOwnedSite(supabase, user.id, siteId);
  if (!ownsSite) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("asc_site_members")
    .select(
      "id, site_id, member_email, role, status, invited_at, accepted_at, created_at, updated_at"
    )
    .eq("owner_user_id", user.id)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const siteId = String(body.siteId || "");
  const memberEmail = normalizeEmail(String(body.memberEmail || ""));
  const role = String(body.role || "editor");

  if (!siteId || !memberEmail || !role) {
    return NextResponse.json(
      { error: "Missing siteId, memberEmail or role" },
      { status: 400 }
    );
  }

  if (!isValidEmail(memberEmail)) {
    return NextResponse.json({ error: "Ongeldig e-mailadres" }, { status: 400 });
  }

  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Ongeldige rol" }, { status: 400 });
  }

  const ownsSite = await requireOwnedSite(supabase, user.id, siteId);
  if (!ownsSite) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("asc_site_members")
    .insert({
      owner_user_id: user.id,
      site_id: siteId,
      member_email: memberEmail,
      role,
      status: "invited",
      invited_by_user_id: user.id,
    })
    .select(
      "id, site_id, member_email, role, status, invited_at, accepted_at, created_at, updated_at"
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Deze gebruiker bestaat al in dit workspace-team" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const id = String(body.id || "");
  const role = body.role !== undefined ? String(body.role) : undefined;
  const status = body.status !== undefined ? String(body.status) : undefined;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (role === undefined && status === undefined) {
    return NextResponse.json(
      { error: "Niets om te updaten (role/status ontbreekt)" },
      { status: 400 }
    );
  }

  if (role !== undefined && !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Ongeldige rol" }, { status: 400 });
  }
  if (status !== undefined && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Ongeldige status" }, { status: 400 });
  }

  const updates: { updated_at: string; role?: string; status?: string } = {
    updated_at: new Date().toISOString(),
  };
  if (role !== undefined) updates.role = role;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from("asc_site_members")
    .update(updates)
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select(
      "id, site_id, member_email, role, status, invited_at, accepted_at, created_at, updated_at"
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lid niet gevonden" }, { status: 404 });

  return NextResponse.json({ member: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("asc_site_members")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
