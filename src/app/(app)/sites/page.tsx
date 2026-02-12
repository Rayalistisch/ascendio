import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function SitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: sites } = await supabase
    .from("asc_sites")
    .select("id, name, wp_base_url, wp_username, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const siteList = (sites ?? []) as Array<{
    id: string;
    name: string;
    wp_base_url: string;
    wp_username: string;
    status: string;
    created_at: string;
  }>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sites</h1>
          <p className="text-muted-foreground mt-1">
            Beheer je WordPress-koppelingen.
          </p>
        </div>
        <Link
          href="/sites/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Site toevoegen
        </Link>
      </div>

      {/* Sites grid or empty state */}
      {siteList.length === 0 ? (
        <div className="rounded-xl border bg-card p-16 text-center">
          <div className="mx-auto max-w-sm space-y-3">
            <p className="text-lg font-medium">Geen sites gevonden</p>
            <p className="text-sm text-muted-foreground">
              Voeg je eerste WordPress-site toe om te beginnen met het
              automatisch publiceren van AI-gegenereerde blogartikelen.
            </p>
            <Link
              href="/sites/new"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Eerste site toevoegen
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {siteList.map((site) => (
            <Link
              key={site.id}
              href={`/sites/${site.id}`}
              className="group rounded-xl border bg-card p-6 shadow-sm transition-colors hover:bg-accent/50"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold tracking-tight group-hover:text-primary transition-colors">
                  {site.name}
                </h3>
                <Badge
                  variant={site.status === "active" ? "outline" : "secondary"}
                  className={
                    site.status === "active"
                      ? "border-green-500 text-green-600"
                      : ""
                  }
                >
                  {site.status === "active" ? "Actief" : "Inactief"}
                </Badge>
              </div>

              <p className="mt-3 text-sm text-muted-foreground truncate">
                {site.wp_base_url}
              </p>

              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Aangemaakt op {formatDate(site.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
