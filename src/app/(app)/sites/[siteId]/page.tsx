import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  SiteDetailClient,
  type SiteInfo,
  type PreferredDomain,
  type ArticleTemplate,
} from "./site-detail-client";

const SITE_COLUMNS =
  "id, name, platform, wp_base_url, wp_username, shopify_shop_domain, status, default_language, tone_of_voice, acf_content_fields, sitemap_url, is_elementor_site, publish_as_draft, content_profile";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Alles parallel ophalen — geen client-waterfall meer.
  const [siteRes, domainsRes, templatesRes] = await Promise.all([
    supabase
      .from("asc_sites")
      .select(SITE_COLUMNS)
      .eq("id", siteId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("asc_preferred_domains")
      .select("*")
      .eq("user_id", user.id)
      .eq("site_id", siteId)
      .order("priority", { ascending: false }),
    supabase
      .from("asc_article_templates")
      .select("*")
      .eq("user_id", user.id)
      .eq("site_id", siteId)
      .order("created_at", { ascending: false }),
  ]);

  const site = siteRes.data as SiteInfo | null;

  if (!site) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Site niet gevonden.</p>
        <Button variant="outline" asChild>
          <Link href="/sites">Terug</Link>
        </Button>
      </div>
    );
  }

  return (
    <SiteDetailClient
      initialSite={site}
      initialDomains={(domainsRes.data as PreferredDomain[] | null) ?? []}
      initialTemplates={(templatesRes.data as ArticleTemplate[] | null) ?? []}
    />
  );
}
