import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUS = new Set(["new", "saved", "used", "dismissed"]);

// PATCH /api/keywords/[id] — update opportunity status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const status = (body ?? {}).status as string | undefined;
  if (!status || !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: "Ongeldige status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("asc_keyword_opportunities")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/keywords/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("asc_keyword_opportunities")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
