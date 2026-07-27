// Keyword research (Laag 2).
//
// Twee databronnen:
//  1. Serper (Google SERP) — top-10 titels, People-Also-Ask, gerelateerde
//     zoekopdrachten. Reikt de intentie en long-tail aan.
//  2. Google Search Console — page-2 "quick wins": queries waar de site al
//     vertoningen op heeft maar net buiten de top-10 staat.
//
// Zoekvolume/difficulty komen van een optionele, verwisselbare metrics-provider
// (DataForSEO/Keywords Everywhere) achter één adapter — standaard leeg (null),
// zodat de rest werkt zonder betaalde volume-API.

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export interface KeywordResearch {
  keyword: string;
  intent: SearchIntent;
  serpTitles: string[];
  paa: string[];
  related: string[];
  volume: number | null;
  difficulty: number | null;
}

export interface GscOpportunity {
  keyword: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  gapScore: number;
}

const SERPER_ENDPOINT = "https://google.serper.dev/search";
const QUERY_TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Heuristic intent classification for Dutch/English seeds. Cheap and good
 * enough to sort opportunities; a metrics/LLM pass can refine later.
 */
export function classifyIntent(keyword: string): SearchIntent {
  const k = keyword.toLowerCase();
  const has = (words: string[]) => words.some((w) => k.includes(w));

  if (has(["kopen", "prijs", "prijzen", "kosten", "offerte", "bestellen", "goedkoop", "aanbieding", "korting", "huren", "boeken", "buy", "price", "cost", "cheap", "order"])) {
    return "transactional";
  }
  if (has(["beste", "review", "reviews", "vergelijk", "vergelijken", "top ", "top10", "top 10", " vs ", "alternatief", "alternatieven", "ervaring", "best ", "compare"])) {
    return "commercial";
  }
  if (has(["wat is", "hoe ", "waarom", "wanneer", "gids", "handleiding", "tips", "uitleg", "betekenis", "voorbeeld", "how ", "what is", "why", "guide"])) {
    return "informational";
  }
  // Short brand-like single tokens lean navigational; otherwise informational.
  return k.split(/\s+/).length <= 1 ? "navigational" : "informational";
}

/**
 * Run one Serper query for a seed keyword and extract SERP context.
 * Returns null when Serper isn't configured or the call fails, so callers
 * can degrade gracefully.
 */
export async function serperResearch(
  keyword: string
): Promise<{ serpTitles: string[]; paa: string[]; related: string[] } | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  const response = await fetchWithTimeout(
    SERPER_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: keyword, gl: "nl", hl: "nl", num: 10 }),
    },
    QUERY_TIMEOUT_MS
  );
  if (!response?.ok) return null;

  const payload = (await response.json().catch(() => null)) as {
    organic?: Array<{ title?: string }>;
    peopleAlsoAsk?: Array<{ question?: string }>;
    relatedSearches?: Array<{ query?: string }>;
  } | null;
  if (!payload) return null;

  const serpTitles = (payload.organic ?? [])
    .map((o) => String(o.title || "").trim())
    .filter(Boolean)
    .slice(0, 10);
  const paa = (payload.peopleAlsoAsk ?? [])
    .map((p) => String(p.question || "").trim())
    .filter(Boolean);
  const related = (payload.relatedSearches ?? [])
    .map((r) => String(r.query || "").trim())
    .filter(Boolean);

  return { serpTitles, paa, related };
}

/**
 * Optional, pluggable volume/difficulty provider. No provider configured yet,
 * so this returns nulls — the adapter exists so DataForSEO/Keywords Everywhere
 * can be dropped in later without touching callers.
 */
export async function getKeywordMetrics(
  keywords: string[]
): Promise<Map<string, { volume: number | null; difficulty: number | null }>> {
  const result = new Map<string, { volume: number | null; difficulty: number | null }>();
  for (const k of keywords) result.set(k, { volume: null, difficulty: null });
  // Future: branch on process.env.KEYWORD_METRICS_PROVIDER and enrich the map.
  return result;
}

/**
 * Full research for one seed: SERP context + intent + (optional) metrics.
 */
export async function researchKeyword(keyword: string): Promise<KeywordResearch> {
  const clean = keyword.trim();
  const [serp, metrics] = await Promise.all([
    serperResearch(clean),
    getKeywordMetrics([clean]),
  ]);
  const m = metrics.get(clean) ?? { volume: null, difficulty: null };
  return {
    keyword: clean,
    intent: classifyIntent(clean),
    serpTitles: serp?.serpTitles ?? [],
    paa: serp?.paa ?? [],
    related: serp?.related ?? [],
    volume: m.volume,
    difficulty: m.difficulty,
  };
}

/**
 * Turn raw GSC query rows into ranked "quick win" opportunities: queries that
 * already earn impressions but sit just outside the top-10 (roughly positions
 * 8–30). Those are the cheapest rankings to improve with a refresh/new page.
 *
 * gapScore rewards high impressions and a position close to page 1.
 */
export function gscQuickWins(
  rows: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
  options?: { minImpressions?: number; minPosition?: number; maxPosition?: number }
): GscOpportunity[] {
  const minImpressions = options?.minImpressions ?? 20;
  const minPosition = options?.minPosition ?? 7.5;
  const maxPosition = options?.maxPosition ?? 30;

  return rows
    .filter(
      (r) =>
        r.query &&
        r.impressions >= minImpressions &&
        r.position >= minPosition &&
        r.position <= maxPosition
    )
    .map((r) => {
      // Closeness to page 1 (position 10 -> ~0, further away -> lower),
      // weighted by log-impressions so big-volume near-misses rank first.
      const proximity = Math.max(0, maxPosition - r.position) / (maxPosition - minPosition);
      const volumeWeight = Math.log10(r.impressions + 1);
      const gapScore = Math.round(proximity * volumeWeight * 100) / 100;
      return {
        keyword: r.query,
        position: Math.round(r.position * 10) / 10,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        gapScore,
      };
    })
    .sort((a, b) => b.gapScore - a.gapScore);
}
