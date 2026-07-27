// Brand-scan: haalt merkidentiteit uit een website via HTML + gelinkte CSS.
// Geen headless browser — puur fetch + regex, dus geen extra infra. Werkt voor
// de meeste sites; niet pixel-perfect. De merkstem-analyse gebeurt apart via de LLM.

import { analyzeBrandVoice, type BrandVoiceAnalysis } from "@/lib/openai";

const FETCH_TIMEOUT_MS = 9000;
const MAX_CSS_FILES = 3;
const MAX_CSS_BYTES = 300_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; AscendioBot/1.0; +https://ascendio.app)";

export interface BrandScanResult {
  websiteUrl: string;
  language: string | null;
  businessName: string | null;
  tagline: string | null;
  description: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  /** Platte tekst voor de LLM-merkstemanalyse. */
  pageText: string;
  scannedPages: string[];
  htmlBytes: number;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/css,*/*" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAttr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function metaContent(html: string, nameOrProp: string): string | null {
  // matcht zowel name= als property= in willekeurige attribuutvolgorde
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${nameOrProp}["']`,
    "i"
  );
  return matchAttr(html, re) || matchAttr(html, alt);
}

function normalizeHex(input: string): string | null {
  let hex = input.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 244 && min > 244) return true; // bijna wit
  if (max < 18) return true; // bijna zwart
  return max - min < 16; // bijna grijs
}

/** Verzamel hex-/rgb-kleuren uit CSS/HTML met frequentie. */
function collectColors(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (hex: string | null) => {
    if (!hex) return;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };

  const hexRe = /#[0-9a-fA-F]{3,6}\b/g;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(text)) !== null) add(normalizeHex(m[0]));

  const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;
  while ((m = rgbRe.exec(text)) !== null) {
    add(normalizeHex(rgbToHex(+m[1], +m[2], +m[3])));
  }
  return counts;
}

function pickBrandColors(
  counts: Map<string, number>,
  themeColor: string | null
): { primary: string | null; secondary: string | null; accent: string | null } {
  const ranked = [...counts.entries()]
    .filter(([hex]) => !isNeutral(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  const themed = themeColor ? normalizeHex(themeColor) : null;
  // Zet theme-color vooraan als primaire kleur.
  const ordered = themed ? [themed, ...ranked.filter((h) => h !== themed)] : ranked;

  return {
    primary: ordered[0] ?? null,
    secondary: ordered[1] ?? null,
    accent: ordered[2] ?? null,
  };
}

function extractCssUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const re = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  const reAlt = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi;
  let m: RegExpExecArray | null;
  for (const rx of [re, reAlt]) {
    while ((m = rx.exec(html)) !== null) {
      try {
        urls.push(new URL(m[1], baseUrl).href);
      } catch {
        // skip invalid
      }
    }
  }
  return [...new Set(urls)];
}

function extractFonts(
  html: string,
  cssText: string
): { heading: string | null; body: string | null } {
  // 1) Google Fonts links
  const gfRe = /fonts\.googleapis\.com\/css2?\?([^"']+)/gi;
  const families: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = gfRe.exec(html)) !== null) {
    const params = m[1];
    const famRe = /family=([^&:]+)/gi;
    let fm: RegExpExecArray | null;
    while ((fm = famRe.exec(params)) !== null) {
      families.push(decodeURIComponent(fm[1]).replace(/\+/g, " ").trim());
    }
  }
  if (families.length > 0) {
    return { heading: families[0] ?? null, body: families[1] ?? families[0] ?? null };
  }

  // 2) font-family declaraties uit CSS
  const ffRe = /font-family\s*:\s*([^;}"']+)/gi;
  const named: string[] = [];
  while ((m = ffRe.exec(cssText)) !== null) {
    const first = m[1].split(",")[0].replace(/["']/g, "").trim();
    const generic = ["inherit", "sans-serif", "serif", "monospace", "system-ui", "-apple-system"];
    if (first && !generic.includes(first.toLowerCase())) named.push(first);
  }
  const unique = [...new Set(named)];
  return { heading: unique[0] ?? null, body: unique[1] ?? unique[0] ?? null };
}

function findLogo(html: string, baseUrl: string): string | null {
  const abs = (u: string) => {
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return null;
    }
  };
  // 1) <img> met "logo" in src/alt/class
  const imgRe = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    if (/logo/i.test(tag)) {
      const src = matchAttr(tag, /src=["']([^"']+)["']/i);
      if (src) return abs(src);
    }
  }
  // 2) apple-touch-icon
  const apple = matchAttr(html, /<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i);
  if (apple) return abs(apple);
  // 3) og:image
  const og = metaContent(html, "og:image");
  if (og) return abs(og);
  // 4) favicon
  const icon = matchAttr(html, /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i);
  if (icon) return abs(icon);
  return null;
}

/** Scan één website en extraheer de merkidentiteit (zonder LLM-merkstem). */
export async function scanBrandIdentity(rawUrl: string): Promise<BrandScanResult | null> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let baseUrl: string;
  try {
    baseUrl = new URL(url).href;
  } catch {
    return null;
  }

  const html = await fetchText(baseUrl);
  if (!html) return null;

  const lang = matchAttr(html, /<html[^>]+lang=["']([^"']+)["']/i);
  const title = matchAttr(html, /<title[^>]*>([^<]+)<\/title>/i);
  const description = metaContent(html, "description") || metaContent(html, "og:description");
  const ogTitle = metaContent(html, "og:title");
  const ogSiteName = metaContent(html, "og:site_name");
  const themeColor = metaContent(html, "theme-color");
  const h1 = matchAttr(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

  // CSS ophalen (gebufferd) voor kleuren + fonts.
  const cssUrls = extractCssUrls(html, baseUrl).slice(0, MAX_CSS_FILES);
  const cssTexts = await Promise.all(cssUrls.map((u) => fetchText(u)));
  const inlineStyles = (html.match(/<style[\s\S]*?<\/style>/gi) || []).join(" ");
  const cssText =
    (inlineStyles + " " + cssTexts.filter(Boolean).join(" ")).slice(0, MAX_CSS_BYTES);

  const colors = collectColors(html + " " + cssText);
  const { primary, secondary, accent } = pickBrandColors(colors, themeColor);
  const { heading, body } = extractFonts(html, cssText);
  const logoUrl = findLogo(html, baseUrl);

  const bodyText = stripTags(html).slice(0, 6000);
  const pageText = [
    title && `Titel: ${title}`,
    description && `Omschrijving: ${description}`,
    h1 && `H1: ${stripTags(h1)}`,
    `Content: ${bodyText}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    websiteUrl: baseUrl,
    language: lang ? lang.split("-")[0] : null,
    businessName: ogSiteName || ogTitle || title || null,
    tagline: description || null,
    description: description || null,
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: accent,
    logoUrl,
    headingFont: heading,
    bodyFont: body,
    pageText,
    scannedPages: [baseUrl],
    htmlBytes: Buffer.byteLength(html, "utf8"),
  };
}

export interface FullBrandScan {
  scan: BrandScanResult;
  voice: BrandVoiceAnalysis | null;
}

/** Scan een website én analyseer de merkstem via de LLM. */
export async function fullBrandScan(
  url: string,
  language?: string
): Promise<FullBrandScan | null> {
  const scan = await scanBrandIdentity(url);
  if (!scan) return null;
  let voice: BrandVoiceAnalysis | null = null;
  try {
    voice = await analyzeBrandVoice({
      text: scan.pageText,
      language: language || scan.language || undefined,
    });
  } catch {
    // Merkstem is optioneel; visuele scan blijft bruikbaar.
  }
  return { scan, voice };
}
