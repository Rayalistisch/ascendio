export interface ExternalPlagiarismInput {
  id: number;
  pageUrl: string;
  title: string;
  textContent: string;
}

export interface ExternalPlagiarismMatch {
  sourceUrl: string;
  sourceTitle: string;
  sourceSnippet: string;
  provider: "serper" | "duckduckgo";
  query: string;
  score: number;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  provider: "serper" | "duckduckgo";
}

interface QueryTask {
  pageId: number;
  query: string;
}

const EXTERNAL_CHECK_ENABLED =
  (process.env.PLAGIARISM_EXTERNAL_CHECK || "true").toLowerCase() !== "false";

const MAX_EXTERNAL_PAGES_PER_SCAN = 10;
const MAX_QUERIES_PER_PAGE = 2;
const MAX_RESULTS_PER_QUERY = 5;
const QUERY_TIMEOUT_MS = 4500;
const QUERY_CONCURRENCY = 3;
const MIN_WORDS_FOR_EXTERNAL_CHECK = 140;
const MIN_MATCH_SCORE = 42;

const STOPWORDS = new Set([
  "aan",
  "als",
  "bij",
  "dan",
  "dat",
  "de",
  "den",
  "der",
  "des",
  "die",
  "dit",
  "door",
  "een",
  "en",
  "er",
  "geen",
  "het",
  "hier",
  "hij",
  "hoe",
  "hun",
  "ik",
  "in",
  "is",
  "je",
  "kan",
  "kun",
  "maar",
  "met",
  "mijn",
  "na",
  "naar",
  "niet",
  "nog",
  "nu",
  "of",
  "om",
  "ons",
  "ook",
  "op",
  "over",
  "te",
  "tot",
  "uit",
  "van",
  "veel",
  "voor",
  "want",
  "was",
  "wat",
  "we",
  "wel",
  "wie",
  "wij",
  "wordt",
  "you",
  "your",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "are",
  "was",
  "were",
  "will",
  "can",
  "about",
  "have",
  "has",
  "had",
  "not",
  "but",
  "our",
  "out",
  "per",
  "via",
  "www",
]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function getHostFromUrl(rawUrl: string): string {
  try {
    return normalizeHost(new URL(rawUrl).hostname);
  } catch {
    return "";
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[^a-z0-9\u00c0-\u024f\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  if (!input) return [];
  return normalizeText(input)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function containsPhrase(queryTokens: string[], haystackNormalized: string, minWords = 6): boolean {
  if (queryTokens.length < minWords || !haystackNormalized) return false;
  const maxStart = queryTokens.length - minWords;
  for (let index = 0; index <= maxStart; index++) {
    const phrase = queryTokens.slice(index, index + minWords).join(" ");
    if (phrase.length > 0 && haystackNormalized.includes(phrase)) {
      return true;
    }
  }
  return false;
}

function scoreMatch(query: string, resultTitle: string, resultSnippet: string): number {
  const queryTokens = tokenize(query);
  const targetText = `${resultTitle} ${resultSnippet}`;
  const targetTokens = tokenize(targetText);
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

  const querySet = new Set(queryTokens);
  const targetSet = new Set(targetTokens);
  const intersection = [...querySet].filter((token) => targetSet.has(token)).length;
  const similarity = intersection / Math.max(querySet.size, targetSet.size);
  let score = Math.round(similarity * 100);

  const normalizedQuery = normalizeText(query);
  const normalizedTarget = normalizeText(targetText);

  if (normalizedQuery.length >= 45 && normalizedTarget.includes(normalizedQuery)) {
    score = Math.max(score, 88);
  }
  if (containsPhrase(queryTokens, normalizedTarget, 7)) {
    score = Math.max(score, 68);
  }
  if (containsPhrase(queryTokens, normalizedTarget, 6)) {
    score = Math.max(score, 56);
  }

  return Math.min(100, score);
}

function resolveDuckDuckGoRedirect(urlOrPath: string): string {
  const decoded = decodeHtmlEntities(urlOrPath);
  const candidate = decoded.startsWith("//")
    ? `https:${decoded}`
    : decoded.startsWith("/")
      ? `https://duckduckgo.com${decoded}`
      : decoded;

  try {
    const parsed = new URL(candidate);
    if (normalizeHost(parsed.hostname).includes("duckduckgo.com")) {
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return parsed.toString();
  } catch {
    return decoded;
  }
}

function isOwnDomain(url: string, ownHosts: Set<string>): boolean {
  const host = getHostFromUrl(url);
  if (!host) return false;
  for (const ownHost of ownHosts) {
    if (host === ownHost || host.endsWith(`.${ownHost}`) || ownHost.endsWith(`.${host}`)) {
      return true;
    }
  }
  return false;
}

function resolveSearchProvider(): "serper" | "duckduckgo" {
  const forcedProvider = (process.env.PLAGIARISM_EXTERNAL_PROVIDER || "auto").toLowerCase();
  const hasSerperKey = Boolean(process.env.SERPER_API_KEY);

  if (forcedProvider === "serper") {
    return hasSerperKey ? "serper" : "duckduckgo";
  }
  if (forcedProvider === "duckduckgo") {
    return "duckduckgo";
  }
  return hasSerperKey ? "serper" : "duckduckgo";
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWithSerper(query: string, excludeHosts: string[]): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  const exclusions = excludeHosts.slice(0, 2).map((host) => `-site:${host}`).join(" ");
  const q = `"${query.replace(/"/g, "")}" ${exclusions}`.trim();
  const response = await fetchWithTimeout(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q,
        num: MAX_RESULTS_PER_QUERY,
        gl: "nl",
        hl: "nl",
      }),
    },
    QUERY_TIMEOUT_MS
  );
  if (!response?.ok) return [];

  const payload = (await response.json().catch(() => null)) as
    | { organic?: Array<{ link?: string; title?: string; snippet?: string }> }
    | null;
  if (!payload?.organic || payload.organic.length === 0) return [];

  return payload.organic
    .map((item) => ({
      url: String(item.link || ""),
      title: String(item.title || ""),
      snippet: String(item.snippet || ""),
      provider: "serper" as const,
    }))
    .filter((item) => item.url.startsWith("http"))
    .slice(0, MAX_RESULTS_PER_QUERY);
}

async function searchWithDuckDuckGo(query: string, excludeHosts: string[]): Promise<SearchResult[]> {
  const exclusions = excludeHosts.slice(0, 2).map((host) => `-site:${host}`).join(" ");
  const q = `"${query.replace(/"/g, "")}" ${exclusions}`.trim();

  const response = await fetchWithTimeout(
    `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      method: "GET",
      headers: {
        Accept: "text/html",
      },
    },
    QUERY_TIMEOUT_MS
  );
  if (!response?.ok) return [];

  const html = await response.text();
  const results: SearchResult[] = [];

  const anchorRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null && results.length < MAX_RESULTS_PER_QUERY) {
    const href = resolveDuckDuckGoRedirect(match[1] || "");
    if (!href.startsWith("http")) continue;

    const title = stripHtml(match[2] || "");
    const localChunk = html.slice(match.index, match.index + 1500);
    const snippetMatch = localChunk.match(
      /<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i
    );
    const snippet = stripHtml((snippetMatch && snippetMatch[1]) || "");

    results.push({
      url: href,
      title,
      snippet,
      provider: "duckduckgo",
    });
  }

  return results;
}

async function searchWeb(query: string, excludeHosts: string[]): Promise<SearchResult[]> {
  const provider = resolveSearchProvider();
  if (provider === "serper") {
    const serperResults = await searchWithSerper(query, excludeHosts);
    if (serperResults.length > 0) return serperResults;
  }
  return searchWithDuckDuckGo(query, excludeHosts);
}

function extractQueries(textContent: string): string[] {
  const normalized = textContent.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const scored = sentences
    .map((sentence) => {
      const tokens = tokenize(sentence);
      return {
        sentence,
        score: new Set(tokens).size,
        wordCount: tokens.length,
      };
    })
    .filter((item) => item.wordCount >= 10 && item.sentence.length >= 85 && item.sentence.length <= 240)
    .sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const item of scored) {
    const clean = item.sentence.replace(/^["“”'`]+|["“”'`]+$/g, "");
    const key = normalizeText(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(clean);
    if (selected.length >= MAX_QUERIES_PER_PAGE) break;
  }

  if (selected.length < MAX_QUERIES_PER_PAGE) {
    const tokens = tokenize(normalized);
    for (let index = 0; index + 18 <= tokens.length && selected.length < MAX_QUERIES_PER_PAGE; index += 9) {
      const candidate = tokens.slice(index, index + 18).join(" ").trim();
      if (candidate.length < 85) continue;
      const key = normalizeText(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(candidate);
    }
  }

  return selected.slice(0, MAX_QUERIES_PER_PAGE);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function findExternalPlagiarismMatches(
  pages: ExternalPlagiarismInput[]
): Promise<Map<number, ExternalPlagiarismMatch[]>> {
  const matchesByPage = new Map<number, ExternalPlagiarismMatch[]>();
  for (const page of pages) {
    matchesByPage.set(page.id, []);
  }

  if (!EXTERNAL_CHECK_ENABLED || pages.length === 0) {
    return matchesByPage;
  }

  const ownHosts = new Set<string>();
  for (const page of pages) {
    const host = getHostFromUrl(page.pageUrl);
    if (host) ownHosts.add(host);
  }
  const excludeHosts = Array.from(ownHosts);

  const normalizedPages = pages
    .map((page) => {
      const text = page.textContent.replace(/\s+/g, " ").trim();
      const tokenCount = tokenize(text).length;
      return { ...page, text, tokenCount };
    })
    .filter((page) => page.tokenCount >= MIN_WORDS_FOR_EXTERNAL_CHECK)
    .sort((a, b) => b.tokenCount - a.tokenCount)
    .slice(0, MAX_EXTERNAL_PAGES_PER_SCAN);

  const tasks: QueryTask[] = [];
  for (const page of normalizedPages) {
    const queries = extractQueries(page.text);
    for (const query of queries) {
      tasks.push({ pageId: page.id, query });
    }
  }
  if (tasks.length === 0) return matchesByPage;

  const grouped = new Map<number, Map<string, ExternalPlagiarismMatch>>();
  for (const page of pages) {
    grouped.set(page.id, new Map<string, ExternalPlagiarismMatch>());
  }

  const taskResults = await mapWithConcurrency(tasks, QUERY_CONCURRENCY, async (task) => {
    const found = await searchWeb(task.query, excludeHosts);
    return { task, found };
  });

  for (const { task, found } of taskResults) {
    const pageMatches = grouped.get(task.pageId);
    if (!pageMatches) continue;

    for (const result of found) {
      if (!result.url || isOwnDomain(result.url, ownHosts)) continue;
      const resultHost = getHostFromUrl(result.url);
      if (!resultHost || resultHost.includes("duckduckgo.com")) continue;
      const score = scoreMatch(task.query, result.title, result.snippet);
      if (score < MIN_MATCH_SCORE) continue;

      const existing = pageMatches.get(result.url);
      if (existing && existing.score >= score) continue;

      pageMatches.set(result.url, {
        sourceUrl: result.url,
        sourceTitle: result.title || result.url,
        sourceSnippet: result.snippet || "",
        provider: result.provider,
        query: task.query,
        score,
      });
    }
  }

  for (const [pageId, byUrl] of grouped.entries()) {
    const ranked = Array.from(byUrl.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    matchesByPage.set(pageId, ranked);
  }

  return matchesByPage;
}
