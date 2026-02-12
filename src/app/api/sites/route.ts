import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("asc_sites")
    .select("id, name, wp_base_url, wp_username, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sites: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, wpBaseUrl, wpUsername, wpAppPassword } = body;

  if (!name || !wpBaseUrl || !wpUsername || !wpAppPassword) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const encryptedPassword = encrypt(wpAppPassword);

  const { data, error } = await supabase
    .from("asc_sites")
    .insert({
      user_id: user.id,
      name,
      wp_base_url: wpBaseUrl.replace(/\/+$/, ""),
      wp_username: wpUsername,
      wp_app_password_encrypted: encryptedPassword,
      status: "active",
    })
    .select("id, name, wp_base_url, wp_username, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ site: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("id");
  if (!siteId) return NextResponse.json({ error: "Missing site id" }, { status: 400 });

  const { error } = await supabase
    .from("asc_sites")
    .delete()
    .eq("id", siteId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
