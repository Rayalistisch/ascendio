import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import {
  querySearchConsoleRows,
  refreshSearchConsoleAccessToken,
} from "@/lib/google-search-console";

interface MetricSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchConsoleRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function sumMetrics(rows: SearchConsoleRow[]): MetricSummary {
  const clicks = rows.reduce((acc, row) => acc + row.clicks, 0);
  const impressions = rows.reduce((acc, row) => acc + row.impressions, 0);
  const weightedPosition = rows.reduce(
    (acc, row) => acc + row.position * row.impressions,
    0
  );

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

function getPercentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function getChangeText(metric: string, delta: number | null, reverse = false): string {
  if (delta === null) return `${metric}: geen vergelijkbare data in vorige periode.`;
  const normalized = reverse ? -delta : delta;
  const direction = normalized >= 0 ? "gestegen" : "gedaald";
  return `${metric} is ${direction} met ${Math.abs(normalized).toFixed(1)}% t.o.v. vorige periode.`;
}

function buildInsights(input: {
  current: MetricSummary;
  previous: MetricSummary;
  topQueries: SearchConsoleRow[];
  topPages: SearchConsoleRow[];
}): string[] {
  const insights: string[] = [];
  const clicksDelta = getPercentDelta(input.current.clicks, input.previous.clicks);
  const impressionsDelta = getPercentDelta(
    input.current.impressions,
    input.previous.impressions
  );
  const ctrDelta = getPercentDelta(input.current.ctr, input.previous.ctr);
  const positionDelta = getPercentDelta(input.current.position, input.previous.position);

  insights.push(getChangeText("Clicks", clicksDelta));
  insights.push(getChangeText("Impressions", impressionsDelta));
  insights.push(getChangeText("CTR", ctrDelta));
  insights.push(getChangeText("Gemiddelde positie", positionDelta, true));

  const bestQuery = input.topQueries[0];
  if (bestQuery?.keys?.[0]) {
    insights.push(
      `Top query: "${bestQuery.keys[0]}" met ${bestQuery.clicks} clicks en ${bestQuery.impressions} impressions.`
    );
  }

  const bestPage = input.topPages[0];
  if (bestPage?.keys?.[0]) {
    insights.push(
      `Top pagina: ${bestPage.keys[0]} met ${bestPage.clicks} clicks (CTR ${(bestPage.ctr * 100).toFixed(2)}%).`
    );
  }

  const queryOpportunity = input.topQueries.find(
    (row) => row.impressions >= 100 && row.ctr < 0.02 && row.position <= 20
  );
  if (queryOpportunity?.keys?.[0]) {
    insights.push(
      `Kans: query "${queryOpportunity.keys[0]}" heeft ${queryOpportunity.impressions} impressions maar lage CTR (${(
        queryOpportunity.ctr * 100
      ).toFixed(2)}%). Optimaliseer title/meta voor deze intentie.`
    );
  }

  return insights;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const requestedDays = Number(searchParams.get("days") || "28");
  const days = clamp(Number.isFinite(requestedDays) ? requestedDays : 28, 7, 90);

  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const { data: site } = await supabase
    .from("asc_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const { data: connection } = await supabase
    .from("asc_search_console_connections")
    .select("property_url, refresh_token_encrypted")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.property_url || !connection.refresh_token_encrypted) {
    return NextResponse.json(
      { error: "Search Console is niet gekoppeld voor deze site" },
      { status: 400 }
    );
  }

  try {
    const refreshToken = decrypt(connection.refresh_token_encrypted);
    const token = await refreshSearchConsoleAccessToken(refreshToken);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));

    const prevEndDate = new Date(startDate);
    prevEndDate.setDate(startDate.getDate() - 1);
    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevEndDate.getDate() - (days - 1));

    const [currentDaily, previousDaily, topQueriesRows, topPagesRows] =
      await Promise.all([
        querySearchConsoleRows({
          accessToken: token.access_token,
          propertyUrl: connection.property_url,
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ["date"],
          rowLimit: 120,
        }),
        querySearchConsoleRows({
          accessToken: token.access_token,
          propertyUrl: connection.property_url,
          startDate: formatDate(prevStartDate),
          endDate: formatDate(prevEndDate),
          dimensions: ["date"],
          rowLimit: 120,
        }),
        querySearchConsoleRows({
          accessToken: token.access_token,
          propertyUrl: connection.property_url,
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ["query"],
          rowLimit: 20,
        }),
        querySearchConsoleRows({
          accessToken: token.access_token,
          propertyUrl: connection.property_url,
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ["page"],
          rowLimit: 20,
        }),
      ]);

    const currentSummary = sumMetrics(currentDaily);
    const previousSummary = sumMetrics(previousDaily);

    const insights = buildInsights({
      current: currentSummary,
      previous: previousSummary,
      topQueries: topQueriesRows,
      topPages: topPagesRows,
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      propertyUrl: connection.property_url,
      period: {
        days,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        previousStartDate: formatDate(prevStartDate),
        previousEndDate: formatDate(prevEndDate),
      },
      summary: {
        current: currentSummary,
        previous: previousSummary,
        delta: {
          clicks: getPercentDelta(currentSummary.clicks, previousSummary.clicks),
          impressions: getPercentDelta(
            currentSummary.impressions,
            previousSummary.impressions
          ),
          ctr: getPercentDelta(currentSummary.ctr, previousSummary.ctr),
          position: getPercentDelta(
            currentSummary.position,
            previousSummary.position
          ),
        },
      },
      insights,
      topQueries: topQueriesRows.map((row) => ({
        query: row.keys[0] || "",
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
      topPages: topPagesRows.map((row) => ({
        page: row.keys[0] || "",
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Rapportage ophalen uit Search Console mislukt",
      },
      { status: 500 }
    );
  }
}
