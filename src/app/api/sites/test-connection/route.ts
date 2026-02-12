import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testConnection } from "@/lib/wordpress";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { wpBaseUrl, wpUsername, wpAppPassword } = body;

  if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await testConnection({
    baseUrl: wpBaseUrl,
    username: wpUsername,
    appPassword: wpAppPassword,
  });

  return NextResponse.json(result);
}
