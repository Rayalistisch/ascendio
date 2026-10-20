import { createClient } from "@/lib/supabase/server";
import { RunsClient, type Run } from "./runs-client";

export default async function RunsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let runs: Run[] = [];
  if (user) {
    const { data } = await supabase
      .from("asc_runs")
      .select("*, asc_sites(name), asc_run_logs(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    runs = (data as Run[] | null) ?? [];
  }

  return <RunsClient initialRuns={runs} />;
}
