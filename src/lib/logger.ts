import { SupabaseClient } from "@supabase/supabase-js";

export async function logStep(
  supabase: SupabaseClient,
  runId: string,
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await supabase.from("asc_run_logs").insert({
    run_id: runId,
    level,
    message,
    meta: meta || null,
  });
}
