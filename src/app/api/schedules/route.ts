import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildRRule, getNextRunDate } from "@/lib/scheduler";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  let query = supabase
    .from("asc_schedules")
    .select("*, asc_sites(name, wp_base_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (siteId) query = query.eq("site_id", siteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedules: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { siteId, frequency, hour, minute, timezone } = body;

  if (!siteId || !frequency || hour === undefined || minute === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const tz = timezone || "Europe/Amsterdam";
  const rrule = buildRRule({ frequency, hour, minute, timezone: tz });
  const nextRun = getNextRunDate(rrule);

  const { data, error } = await supabase
    .from("asc_schedules")
    .insert({
      user_id: user.id,
      site_id: siteId,
      timezone: tz,
      rrule,
      is_enabled: true,
      next_run_at: nextRun?.toISOString() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedule: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, isEnabled, frequency, hour, minute, timezone } = body;

  if (!id) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

  const updates: Record<string, unknown> = {};

  if (isEnabled !== undefined) updates.is_enabled = isEnabled;

  if (frequency && hour !== undefined && minute !== undefined) {
    const tz = timezone || "Europe/Amsterdam";
    const rrule = buildRRule({ frequency, hour, minute, timezone: tz });
    const nextRun = getNextRunDate(rrule);
    updates.rrule = rrule;
    updates.timezone = tz;
    updates.next_run_at = nextRun?.toISOString() || null;
  }

  const { data, error } = await supabase
    .from("asc_schedules")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedule: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

  const { error } = await supabase
    .from("asc_schedules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
