import OpenAI from "openai";
import {
  normalizeGenerationSettings,
  type GenerationSettings,
} from "@/lib/generation-settings";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface GeneratedArticle {
  topic: string;
  title: string;
  metaDescription: string;
  htmlContent: string;
}

export async function generateArticle(
  niche: string,
  language: string = "Dutch"
): Promise<GeneratedArticle> {
  const topicResponse = await getClient().chat.completions.create({
    model: "gpt-4o",
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content: `You are a professional blog strategist. Generate a unique, SEO-optimized blog topic for the niche: "${niche}". Respond in ${language}. Return ONLY a JSON object with: { "topic": "...", "title": "..." }`,
      },
      {
        role: "user",
        content: `Generate a fresh blog topic for the niche "${niche}" in ${language}. The topic should be specific, actionable, and search-friendly.`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const topicData = JSON.parse(topicResponse.choices[0].message.content || "{}");
  const { topic, title } = topicData;

  const articleResponse = await getClient().chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are a professional ${language} blog writer. Write well-structured, engaging blog articles with proper HTML formatting. Use H2 and H3 headings, paragraphs, bullet lists where appropriate. Do NOT include an H1 tag (WordPress handles the title). Write in ${language}. Return ONLY a JSON object with: { "metaDescription": "...", "htmlContent": "..." }`,
      },
      {
        role: "user",
        content: `Write a complete blog article about: "${topic}" with title "${title}".
Requirements:
- 1200-1800 words
- Use <h2> and <h3> for structure
- Use <p> tags for paragraphs
- Use <ul>/<li> for lists where appropriate
- Include an engaging introduction
- Include a conclusion
- SEO-optimized
- Meta description: 150-160 characters
- Language: ${language}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const articleData = JSON.parse(articleResponse.choices[0].message.content || "{}");

  return {
    topic,
    title,
    metaDescription: articleData.metaDescription,
    htmlContent: articleData.htmlContent,
  };
}

export async function generateFeaturedImage(
  topic: string,
  title: string
): Promise<Buffer> {
  const response = await getClient().images.generate({
    model: "dall-e-3",
    prompt: `Create a professional, clean, modern blog featured image for an article titled "${title}" about "${topic}". The image should be visually appealing, minimal, and suitable for a professional blog. No text in the image.`,
    n: 1,
    size: "1792x1024",
    quality: "standard",
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error("No image URL returned from OpenAI");

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error("Failed to download generated image");

  const arrayBuffer = await imageResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ===== NEW INTERFACES =====

export interface TocEntry {
  level: number;
  text: string;
  id: string;
}

export interface StructureTemplateSection {
  type: "h2" | "h3" | "paragraph" | "bullets" | "numbered" | "faq" | "table" | "top5" | "top10" | "blockquote" | "stats" | "pros_cons" | "cta" | "tldr" | "image" | "video";
  label: string;
  instruction: string;
}

export interface ClusterContext {
  pillarTopic: string;
  pillarUrl?: string;
  pillarSlug?: string;
  siblingArticles: { slug: string; title: string; url?: string }[];
  isPillarArticle: boolean;
}

export interface EnhancedArticleRequest {
  niche: string;
  language?: string;
  sourceContent?: string;
  sourceTitle?: string;
  existingPosts?: { slug: string; title: string }[];
  styleReferences?: { title: string; textSample: string }[];
  siteBaseUrl?: string;
  targetKeywords?: string[];
  structureTemplate?: { sections: StructureTemplateSection[] };
  clusterContext?: ClusterContext;
  preferredDomains?: { domain: string; label?: string }[];
  forcedTopic?: string;
  forcedTitle?: string;
  existingSitemapUrls?: Array<{ url: string; title?: string }>;
  toneOfVoice?: ToneOfVoice | null;
  generationSettings?: GenerationSettings;
}

export interface EnhancedArticle {
  topic: string;
  title: string;
  metaDescription: string;
  htmlContent: string;
  tableOfContents: TocEntry[];
  internalLinksUsed: string[];
  externalLinksUsed: string[];
  schemaMarkup: object;
  faqItems: { question: string; answer: string }[];
  imageMarkers: string[];
  youtubeMarkers: string[];
}

export type EnhancedArticleDraft = Pick<
  EnhancedArticle,
  | "metaDescription"
  | "htmlContent"
  | "tableOfContents"
  | "internalLinksUsed"
  | "externalLinksUsed"
  | "faqItems"
  | "imageMarkers"
  | "youtubeMarkers"
>;

export interface ToneOfVoice {
  tone?: string;
  targetAudience?: string;
  avoidWords?: string[];
  exampleSentences?: string[];
  brandGuidelines?: string;
}

function buildToneOfVoiceInstruction(tov: ToneOfVoice | null | undefined): string {
  if (!tov) return "";

  const parts: string[] = [];

  if (tov.tone) {
    parts.push(`- Tone of voice: ${tov.tone}`);
  }
  if (tov.targetAudience) {
    parts.push(`- Doelgroep: ${tov.targetAudience}`);
  }
  if (tov.avoidWords?.length) {
    parts.push(`- Vermijd deze woorden/zinnen: ${tov.avoidWords.join(", ")}`);
  }
  if (tov.exampleSentences?.length) {
    const examples = tov.exampleSentences
      .slice(0, 5)
      .map((s, i) => `  ${i + 1}. "${s}"`)
      .join("\n");
    parts.push(`- Schrijf in de stijl van deze voorbeeldzinnen:\n${examples}`);
  }
  if (tov.brandGuidelines) {
    parts.push(`- Merkrichtlijnen: ${tov.brandGuidelines}`);
  }

  if (parts.length === 0) return "";

  return `\n## SCHRIJFSTIJL / TONE OF VOICE (VERPLICHT):\nPas de volgende schrijfstijl-instructies toe op ALLE gegenereerde content:\n${parts.join("\n")}`;
}

export interface HumanizeArticleRequest {
  language?: string;
  topic: string;
  title: string;
  targetKeywords?: string[];
  toneOfVoice?: ToneOfVoice | null;
  draft: EnhancedArticleDraft;
  avoidOverlapSnippets?: string[];
  mode?: "auto" | "aggressive";
}

export interface ClusterSuggestionContext {
  pillarDescription?: string;
  pillarKeywords?: string[];
  pillarContent?: string;
  pillarContentTitle?: string;
}

interface InternalLinkCandidate {
  url: string;
  title: string;
  ref: string;
}

function normalizeUrlForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.replace(/\/+$/, "").toLowerCase();
  }
}

function extractHrefValues(html: string): string[] {
  const matches = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
  return Array.from(matches, (m) => m[1]);
}

function htmlHasHref(html: string, targetUrl: string): boolean {
  const target = normalizeUrlForCompare(targetUrl);
  return extractHrefValues(html).some((href) => normalizeUrlForCompare(href) === target);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildClusterLinkCandidates(req: EnhancedArticleRequest): InternalLinkCandidate[] {
  if (!req.clusterContext) return [];

  const siteBaseUrl = req.siteBaseUrl?.replace(/\/+$/, "");
  const candidates: InternalLinkCandidate[] = [];
  const ctx = req.clusterContext;

  if (!ctx.isPillarArticle && ctx.pillarUrl) {
    candidates.push({
      url: ctx.pillarUrl,
      title: ctx.pillarTopic,
      ref: ctx.pillarUrl,
    });
  }

  for (const article of ctx.siblingArticles) {
    const resolvedUrl = article.url || (siteBaseUrl && article.slug ? `${siteBaseUrl}/${article.slug}` : "");
    if (!resolvedUrl) continue;
    candidates.push({
      url: resolvedUrl,
      title: article.title,
      ref: article.slug || resolvedUrl,
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalizeUrlForCompare(candidate.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureClusterInternalLinks(
  htmlContent: string,
  req: EnhancedArticleRequest
): { htmlContent: string; addedRefs: string[] } {
  const generationSettings = normalizeGenerationSettings(req.generationSettings);
  if (!generationSettings.internalLinking.enabled) {
    return { htmlContent, addedRefs: [] };
  }

  const candidates = buildClusterLinkCandidates(req);
  if (candidates.length === 0) return { htmlContent, addedRefs: [] };

  const missing = candidates.filter((candidate) => !htmlHasHref(htmlContent, candidate.url));
  if (missing.length === 0) return { htmlContent, addedRefs: [] };

  const heading = req.clusterContext?.isPillarArticle
    ? "Cluster artikelen"
    : "Gerelateerde cluster artikelen";
  const listItems = missing
    .map((candidate) => `<li><a href="${candidate.url}">${escapeHtml(candidate.title)}</a></li>`)
    .join("");

  const separator = htmlContent.trim() ? "\n" : "";
  const linkedHtml = `${htmlContent}${separator}<h2 id="gerelateerde-cluster-artikelen">${heading}</h2><ul>${listItems}</ul>`;

  return {
    htmlContent: linkedHtml,
    addedRefs: missing.map((candidate) => candidate.ref),
  };
}

interface ArticleDepthMetrics {
  wordCount: number;
  h2Count: number;
  h3Count: number;
  listCount: number;
  tableCount: number;
  blockquoteCount: number;
}

function stripHtmlForCount(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function countTagOccurrences(html: string, tagName: string): number {
  const regex = new RegExp(`<${tagName}\\b`, "gi");
  return (html.match(regex) || []).length;
}

function getArticleDepthMetrics(htmlContent: string): ArticleDepthMetrics {
  const cleaned = stripHtmlForCount(htmlContent);
  const wordCount = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0;
  return {
    wordCount,
    h2Count: countTagOccurrences(htmlContent, "h2"),
    h3Count: countTagOccurrences(htmlContent, "h3"),
    listCount: countTagOccurrences(htmlContent, "ul") + countTagOccurrences(htmlContent, "ol"),
    tableCount: countTagOccurrences(htmlContent, "table"),
    blockquoteCount: countTagOccurrences(htmlContent, "blockquote"),
  };
}

interface DepthRequirements {
  minWordCount: number;
  minH2: number;
  minH3: number;
  minStructuredBlocks: number;
}

function getDepthFailureReasons(
  metrics: ArticleDepthMetrics,
  requirements: DepthRequirements
): string[] {
  const reasons: string[] = [];
  if (metrics.wordCount < requirements.minWordCount) {
    reasons.push(
      `te weinig woorden (${metrics.wordCount}, minimum ${requirements.minWordCount})`
    );
  }
  if (metrics.h2Count < requirements.minH2) {
    reasons.push(
      `te weinig H2 secties (${metrics.h2Count}, minimum ${requirements.minH2})`
    );
  }
  if (metrics.h3Count < requirements.minH3) {
    reasons.push(
      `te weinig H3 subsecties (${metrics.h3Count}, minimum ${requirements.minH3})`
    );
  }
  if (
    requirements.minStructuredBlocks > 0 &&
    metrics.listCount + metrics.tableCount < requirements.minStructuredBlocks
  ) {
    reasons.push(
      `te weinig lijst/tabel blokken (${metrics.listCount + metrics.tableCount}, minimum ${requirements.minStructuredBlocks})`
    );
  }
  return reasons;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFaqItems(
  value: unknown
): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const node = item as Record<string, unknown>;
      const question = String(node.question || "").trim();
      const answer = String(node.answer || "").trim();
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((item): item is { question: string; answer: string } => Boolean(item));
}

function normalizeTocEntries(value: unknown): TocEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const node = item as Record<string, unknown>;
      const text = String(node.text || "").trim();
      const id = String(node.id || "").trim();
      const levelRaw =
        typeof node.level === "number"
          ? node.level
          : Number.parseInt(String(node.level || "2"), 10);
      const level = Number.isFinite(levelRaw) ? levelRaw : 2;
      if (!text || !id || level < 2 || level > 6) return null;
      return { text, id, level };
    })
    .filter((item): item is TocEntry => Boolean(item));
}

// ===== NEW FUNCTIONS =====

/**
 * Two-stage enhanced article generation.
 * Stage 1: GPT-4o generates topic + title (derived from sourceContent if provided).
 * Stage 2: GPT-4o generates a full article with rich HTML, image/video placeholders,
 * internal/external links, FAQ section, and SEO optimization.
 */
export async function generateEnhancedArticle(
  req: EnhancedArticleRequest
): Promise<EnhancedArticle> {
  const client = getClient();
  const language = req.language || "Dutch";
  const generationSettings = normalizeGenerationSettings(req.generationSettings);
  const targetWordCount = generationSettings.structure.targetWordCount;
  const minWordCount = Math.max(900, targetWordCount - 250);
  const maxWordCount = Math.min(3500, targetWordCount + 350);
  const minH2 = generationSettings.structure.minH2;
  const minH3 = generationSettings.structure.minH3;
  const faqCount = generationSettings.structure.faqCount;
  const headingCaseInstruction =
    generationSettings.formatting.headingLetterCase === "title_case"
      ? "Use title case for H2/H3 headings."
      : generationSettings.formatting.headingLetterCase === "sentence_case"
        ? "Use sentence case for H2/H3 headings."
        : "Keep heading casing context-aware and natural.";
  const knowledgeInstruction =
    generationSettings.knowledge.mode === "use_sources"
      ? "Base key claims primarily on provided source material and avoid unsupported assumptions."
      : generationSettings.knowledge.mode === "no_extra"
        ? "Do not rely on external sources or web citations; use only provided context and general evergreen guidance."
        : "Use up-to-date best practices and practical context where relevant.";
  const inlineImageTarget = generationSettings.images.inlineImageCount;
  const youtubeTarget =
    generationSettings.images.youtubeEnabled
      ? generationSettings.images.youtubeCount
      : 0;

  // Stage 1: Topic generation (skip if forced from cluster)
  let topic: string;
  let title: string;
  let keywords: string[];

  if (req.forcedTopic && req.forcedTitle) {
    topic = req.forcedTopic;
    title = req.forcedTitle;
    keywords = req.targetKeywords || [];
  } else {
    const topicPrompt = req.sourceContent
      ? `Based on this source content, generate a unique blog topic:\n\nSource: "${req.sourceTitle || ""}"\n${req.sourceContent.substring(0, 2000)}\n\nGenerate a fresh angle for the niche "${req.niche}" in ${language}.`
      : req.forcedTopic
        ? `Generate a compelling blog title for this topic: "${req.forcedTopic}" in the niche "${req.niche}" in ${language}.`
        : `Generate a fresh blog topic for the niche "${req.niche}" in ${language}. The topic should be specific, actionable, and search-friendly.`;

    const topicResponse = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: `You are a professional blog strategist. Respond in ${language}. Return ONLY a JSON object with: { "topic": "...", "title": "...", "targetKeywords": ["keyword1", "keyword2", "keyword3"] }`,
        },
        { role: "user", content: topicPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const topicData = JSON.parse(
      topicResponse.choices[0].message.content || "{}"
    );
    topic = req.forcedTopic || topicData.topic;
    title = topicData.title;
    keywords = req.targetKeywords?.length
      ? req.targetKeywords
      : topicData.targetKeywords || [];
  }

  // Build internal links instruction (cluster-aware)
  let internalLinksInstruction = "";
  if (!generationSettings.internalLinking.enabled) {
    internalLinksInstruction =
      "\n## INTERNAL LINKS:\nVoeg geen interne links toe in dit artikel.";
  } else if (req.clusterContext) {
    const ctx = req.clusterContext;
    if (ctx.isPillarArticle) {
      const siblingLinks = ctx.siblingArticles
        .map((a) => `- <a href="${a.url || `${req.siteBaseUrl || ""}/${a.slug}`}">${a.title}</a>`)
        .join("\n");
      internalLinksInstruction = siblingLinks
        ? `\n## CLUSTER INTERNAL LINKS (VERPLICHT):\nDit is het PILLAR artikel over "${ctx.pillarTopic}". Link naar AL deze supporting artikelen:\n${siblingLinks}`
        : "";
    } else {
      const pillarLink = ctx.pillarUrl
        ? `\nLink TERUG naar het pillar artikel:\n- <a href="${ctx.pillarUrl}">${ctx.pillarTopic}</a>`
        : "";
      const siblingLinks = ctx.siblingArticles
        .map((a) => `- <a href="${a.url || `${req.siteBaseUrl || ""}/${a.slug}`}">${a.title}</a>`)
        .join("\n");
      internalLinksInstruction = `\n## CLUSTER INTERNAL LINKS (HOGE PRIORITEIT):\nDit artikel hoort bij het topic cluster "${ctx.pillarTopic}".${pillarLink}${siblingLinks ? `\nLink ook naar deze gerelateerde cluster artikelen:\n${siblingLinks}` : ""}`;
    }
    // Also add non-cluster posts as secondary links
    const nonClusterPosts = req.existingPosts?.slice(0, 8);
    if (nonClusterPosts?.length) {
      internalLinksInstruction += `\n\n## OVERIGE INTERNE LINKS (LAGERE PRIORITEIT):\n${nonClusterPosts
        .map((p) => `- <a href="${req.siteBaseUrl || ""}/${p.slug}">${p.title}</a>`)
        .join("\n")}\nRichtlijn: ongeveer ${generationSettings.internalLinking.linksPerH2} interne links per H2 waar relevant.`;
    }
  } else if (req.existingPosts?.length) {
    const targetInternalLinks = Math.max(
      1,
      Math.min(12, generationSettings.internalLinking.linksPerH2 * minH2)
    );
    internalLinksInstruction = `\n## INTERNAL LINKS:\nWhere naturally relevant, link to these existing articles:\n${req.existingPosts
      .slice(0, 15)
      .map(
        (p) =>
          `- <a href="${req.siteBaseUrl || ""}/${p.slug}">${p.title}</a>`
      )
      .join("\n")}\nGebruik ongeveer ${targetInternalLinks} interne links in totaal waar dat echt waarde toevoegt.`;
  }

  // Add existing sitemap URLs for linking to existing site content
  if (generationSettings.internalLinking.enabled && req.existingSitemapUrls?.length) {
    const relevant = req.existingSitemapUrls.slice(0, 15);
    internalLinksInstruction += `\n\n## BESTAANDE SITE PAGINA'S:\nDeze pagina's bestaan al op de site. Link waar relevant naar deze pagina's:\n${relevant
      .map((u) => `- ${u.url}${u.title ? ` (${u.title})` : ""}`)
      .join("\n")}`;
  }

  // Build structure template instruction
  let structureInstruction = "";
  if (req.structureTemplate?.sections?.length) {
    const typeLabels: Record<string, string> = {
      h2: "H2 heading", h3: "H3 subheading", paragraph: "Paragraaf (<p>)",
      bullets: "Bullet list (<ul>/<li>)", numbered: "Genummerde lijst (<ol>/<li>)",
      faq: "FAQ sectie (<h3>vraag</h3><p>antwoord</p>)", table: "Tabel (<table>)",
      top5: "Top 5 lijst", top10: "Top 10 lijst", blockquote: "Blockquote (<blockquote>)",
      stats: "Statistieken/cijfers blok", pros_cons: "Voordelen & Nadelen",
      cta: "Call-to-action blok", tldr: "TL;DR samenvatting",
      image: "Afbeelding placeholder (<!-- IMAGE:... -->)", video: "Video placeholder (<!-- YOUTUBE:... -->)",
    };
    const sectionLines = req.structureTemplate.sections.map((s, i) => {
      const tag = typeLabels[s.type] || s.type;
      return `\n${i + 1}. **${s.label}** — Type: ${tag}\n   Instructie: ${s.instruction}`;
    }).join("");
    structureInstruction = `\n## ARTIKELSTRUCTUUR (VERPLICHT):\nVolg exact deze structuur en volgorde:${sectionLines}\n`;
  }

  const formattingInstruction = `\n## FORMATTING STYLE:
- ${headingCaseInstruction}
- ${generationSettings.formatting.bold ? "Gebruik <strong> voor echt belangrijke kernwoorden." : "Gebruik zo min mogelijk <strong>; alleen bij uitzonderlijke nadruk."}
- ${generationSettings.formatting.italics ? "Gebruik <em> subtiel voor nuance waar nodig." : "Gebruik geen <em> tenzij absoluut nodig."}
- ${generationSettings.formatting.tables ? "Gebruik tabellen wanneer vergelijking of samenvatting nuttig is." : "Gebruik geen tabellen; gebruik tekst of lijsten."}
- ${generationSettings.formatting.quotes ? "Gebruik <blockquote> voor tips of kerninzichten." : "Vermijd <blockquote>."}
- ${generationSettings.formatting.lists ? "Gebruik <ul>/<ol> voor scanbare stappen en samenvattingen." : "Gebruik nauwelijks lijsten; schrijf vooral in lopende tekst."}`;

  const minStructuredBlocks =
    generationSettings.formatting.lists || generationSettings.formatting.tables
      ? 2
      : 0;
  const depthInstruction = `\n## INHOUDSDIEPTE (VERPLICHT):
- Schrijf geen oppervlakkige samenvatting, maar een volledig en praktisch artikel.
- Bouw logische flow op: probleem/context -> analyse -> aanpak/stappenplan -> praktijkvoorbeelden -> valkuilen -> checklist -> conclusie.
- Gebruik minimaal ${minH2} H2-secties en minimaal ${minH3} H3-subsecties.
- ${minStructuredBlocks > 0 ? `Gebruik in minimaal ${minStructuredBlocks} secties een lijst (<ul>/<ol>) of tabel (<table>).` : "Gebruik waar relevant duidelijke tekststructuur zonder verplichte lijst/tabelblokken."}
- Maak uitleg concreet met voorbeelden, trade-offs en duidelijke aanbevelingen.
- Vermijd herhaling en algemene vage zinnen.`;

  // Build preferred domains instruction
  let externalLinksInstruction = "";
  if (!generationSettings.externalLinking.enabled) {
    externalLinksInstruction = `\n## EXTERNAL LINKS:\nGebruik geen externe links in dit artikel.`;
  } else if (req.preferredDomains?.length) {
    const domainList = req.preferredDomains
      .map((d) => `- ${d.domain}${d.label ? ` (${d.label})` : ""}`)
      .join("\n");
    externalLinksInstruction = `\n## EXTERNAL LINKS:\nGebruik bij voorkeur deze autoritieve bronnen:\n${domainList}\nGebruik ongeveer ${generationSettings.externalLinking.linksPerArticle} externe links totaal. Use target="_blank" rel="noopener noreferrer".`;
  } else {
    externalLinksInstruction = `\n## EXTERNAL LINKS:\nInclude around ${generationSettings.externalLinking.linksPerArticle} links to authoritative external sources. Use target="_blank" rel="noopener noreferrer".`;
  }

  // Build writing style instruction from recent published posts
  let styleInstruction = "";
  if (req.styleReferences?.length) {
    const styleSamples = req.styleReferences
      .slice(0, 3)
      .map((sample, index) => (
        `\nVoorbeeld ${index + 1}:\nTitel: ${sample.title}\nFragment: "${sample.textSample}"`
      ))
      .join("\n");

    styleInstruction = `\n## SCHRIJFSTIJL REFERENTIE (BELANGRIJK):\nGebruik deze recente site-fragmenten als stijlreferentie voor toon, ritme, woordkeuze en mate van formaliteit.${styleSamples}\nSchrijf nieuw en origineel; kopieer geen zinnen letterlijk.`;
  }

  // Build explicit tone of voice instruction from site settings
  const toneInstruction = buildToneOfVoiceInstruction(req.toneOfVoice);

  // Stage 2: Full enhanced article
  const articleResponse = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are a professional ${language} blog writer and SEO specialist. Write comprehensive, engaging, well-structured blog articles.`,
      },
      {
        role: "user",
        content: `Write a complete blog article about: "${topic}" with title "${title}".

## FORMAT REQUIREMENTS:
- ${minWordCount}-${maxWordCount} words in ${language}
- Use <h2 id="kebab-case-id"> for main sections${structureInstruction ? "" : ` (minimum ${minH2} sections)`}
- Use <h3 id="kebab-case-id"> for subsections where appropriate
- Use <p> tags for all paragraphs
- ${generationSettings.formatting.lists ? "Use <ul>/<ol>/<li> for lists where practical." : "Avoid lists unless strictly needed."}
- ${generationSettings.formatting.tables ? "Use <table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table> where comparison data is relevant." : "Do not use <table> elements."}
- ${generationSettings.formatting.quotes ? "Use <blockquote> for key takeaways or expert quotes." : "Avoid <blockquote> elements."}
- Do NOT include <h1> (WordPress handles the title)
- Do NOT include a Table of Contents (it is generated separately)
${structureInstruction}
${formattingInstruction}
## KNOWLEDGE MODE:
${knowledgeInstruction}
## IMAGE PLACEHOLDERS:
${inlineImageTarget > 0
  ? `Insert exactly ${inlineImageTarget} image marker${inlineImageTarget > 1 ? "s" : ""} in relevant locations:`
  : "Do not insert IMAGE markers."}
<!-- IMAGE:brief description of what image should show -->

## VIDEO PLACEHOLDERS:
${youtubeTarget > 0
  ? `Insert exactly ${youtubeTarget} YouTube search marker${youtubeTarget > 1 ? "s" : ""}:`
  : "Do not insert YOUTUBE markers."}
<!-- YOUTUBE:search query to find a relevant tutorial or explainer video -->
${internalLinksInstruction}
${externalLinksInstruction}
${styleInstruction}
${toneInstruction}
${depthInstruction}

## FAQ SECTION:
${faqCount > 0
  ? `End with a FAQ section containing exactly ${faqCount} relevant questions and concise answers.\nFormat as: <h2 id="veelgestelde-vragen">Veelgestelde vragen</h2> followed by <h3>Question?</h3><p>Answer</p> pairs.`
  : "Do not include a FAQ section."}

## SEO OPTIMIZATION:
${keywords.length ? `Optimize for these keywords: ${keywords.join(", ")}` : "Optimize for relevant search terms"}
- Use primary keyword in first paragraph
- Use keywords naturally throughout
- Meta description: 150-160 characters, includes primary keyword

Return ONLY a JSON object with:
{
  "metaDescription": "...",
  "htmlContent": "full HTML content...",
  "tableOfContents": [{"level": 2, "text": "Section Title", "id": "section-slug"}],
  "internalLinksUsed": ["slug1", "slug2"],
  "externalLinksUsed": ["https://example.com"],
  "faqItems": [{"question": "...", "answer": "..."}],
  "imageMarkers": ["description1", "description2"],
  "youtubeMarkers": ["search query 1"]
}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const articleData = JSON.parse(
    articleResponse.choices[0].message.content || "{}"
  );
  const initialHtml =
    typeof articleData.htmlContent === "string" ? articleData.htmlContent : "";
  const depthMetrics = getArticleDepthMetrics(initialHtml);
  const depthRequirements: DepthRequirements = {
    minWordCount,
    minH2,
    minH3,
    minStructuredBlocks,
  };
  const depthFailures = getDepthFailureReasons(depthMetrics, depthRequirements);

  if (depthFailures.length > 0) {
    const depthReason = depthFailures.join("; ");
    const expansionResponse = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content: `You are a senior ${language} long-form editor. Expand and enrich the article so it becomes significantly more comprehensive while staying accurate and readable.`,
        },
        {
          role: "user",
          content: `Verbeter dit artikel grondig: het is nu te summier (${depthReason}).

## HOU VAST:
- Titel en onderwerp
- Focus op ${keywords.length ? keywords.join(", ") : "de relevante zoekintentie"}
- Interne/externe links en placeholders voor afbeeldingen/video
- Geen <h1>, wel correcte HTML met <h2>/<h3>/<p>/<ul>/<ol>/<table>/<blockquote>

## VERPLICHT:
- Minimaal ${depthRequirements.minWordCount} woorden
- Minimaal ${depthRequirements.minH2} H2 en minimaal ${depthRequirements.minH3} H3
- ${depthRequirements.minStructuredBlocks > 0 ? `Minimaal ${depthRequirements.minStructuredBlocks} lijst/tabelblokken.` : "Geen verplichte lijst/tabelblokken."}
- Praktische diepgang: context, aanpak, voorbeelden, valkuilen, checklist, conclusie
${toneInstruction}

Huidige title: "${title}"
Huidige meta description: "${articleData.metaDescription || ""}"

Huidige HTML:
${initialHtml}

Geef alleen JSON terug met:
{
  "metaDescription": "...",
  "htmlContent": "...",
  "tableOfContents": [{"level": 2, "text": "...", "id": "..."}],
  "internalLinksUsed": ["slug1"],
  "externalLinksUsed": ["https://example.com"],
  "faqItems": [{"question": "...", "answer": "..."}],
  "imageMarkers": ["..."],
  "youtubeMarkers": ["..."]
}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const expandedData = JSON.parse(expansionResponse.choices[0].message.content || "{}");
    if (typeof expandedData.metaDescription === "string" && expandedData.metaDescription.trim()) {
      articleData.metaDescription = expandedData.metaDescription;
    }
    if (typeof expandedData.htmlContent === "string" && expandedData.htmlContent.trim()) {
      articleData.htmlContent = expandedData.htmlContent;
    }
    if (Array.isArray(expandedData.tableOfContents)) {
      articleData.tableOfContents = expandedData.tableOfContents;
    }
    if (Array.isArray(expandedData.internalLinksUsed)) {
      articleData.internalLinksUsed = expandedData.internalLinksUsed;
    }
    if (Array.isArray(expandedData.externalLinksUsed)) {
      articleData.externalLinksUsed = expandedData.externalLinksUsed;
    }
    if (Array.isArray(expandedData.faqItems)) {
      articleData.faqItems = expandedData.faqItems;
    }
    if (Array.isArray(expandedData.imageMarkers)) {
      articleData.imageMarkers = expandedData.imageMarkers;
    }
    if (Array.isArray(expandedData.youtubeMarkers)) {
      articleData.youtubeMarkers = expandedData.youtubeMarkers;
    }
  }

  const originalHtmlContent =
    typeof articleData.htmlContent === "string" ? articleData.htmlContent : "";
  const linkEnforcement = ensureClusterInternalLinks(originalHtmlContent, req);
  const modelLinksUsed = Array.isArray(articleData.internalLinksUsed)
    ? articleData.internalLinksUsed
    : [];
  const internalLinksUsed = Array.from(
    new Set([...modelLinksUsed, ...linkEnforcement.addedRefs])
  );

  // Generate Article schema markup
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: articleData.metaDescription,
    articleBody: topic,
  };

  // Add FAQ schema if faqItems exist
  const faqSchema = articleData.faqItems?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: articleData.faqItems.map(
          (item: { question: string; answer: string }) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })
        ),
      }
    : null;

  return {
    topic,
    title,
    metaDescription: articleData.metaDescription,
    htmlContent: linkEnforcement.htmlContent,
    tableOfContents: articleData.tableOfContents || [],
    internalLinksUsed,
    externalLinksUsed: articleData.externalLinksUsed || [],
    schemaMarkup: faqSchema ? [schemaMarkup, faqSchema] : schemaMarkup,
    faqItems: articleData.faqItems || [],
    imageMarkers: articleData.imageMarkers || [],
    youtubeMarkers: articleData.youtubeMarkers || [],
  };
}

export async function humanizeArticleDraft(
  req: HumanizeArticleRequest
): Promise<EnhancedArticleDraft> {
  const client = getClient();
  const language = req.language || "Dutch";
  const mode = req.mode || "auto";
  const keywordNote = req.targetKeywords?.length
    ? `\n- Behoud SEO focus op: ${req.targetKeywords.join(", ")}`
    : "";
  const overlapNote = req.avoidOverlapSnippets?.length
    ? `\n## VERMIJD OVERLAP (ZEER BELANGRIJK):\nHerschrijf zodat onderstaande fragmenten NIET dicht benaderd worden:\n${req.avoidOverlapSnippets
      .slice(0, 4)
      .map((snippet, index) => `${index + 1}. "${snippet.substring(0, 260)}"`)
      .join("\n")}`
    : "";
  const toneNote = buildToneOfVoiceInstruction(req.toneOfVoice);

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: mode === "aggressive" ? 0.75 : 0.62,
    messages: [
      {
        role: "system",
        content: `You are a senior ${language} editor. Rewrite content so it sounds natural, specific, and human-written while preserving factual correctness and SEO intent. Do not use generic filler language.`,
      },
      {
        role: "user",
        content: `Herschrijf dit artikel naar een natuurlijkere, menselijkere schrijfstijl met meer variatie in ritme, woordkeuze en zinslengte.

## DOEL:
- Unieke formulering met duidelijk eigen invalshoek
- Minder "AI-achtig" (geen clichés, geen repetitieve patronen)
- Inhoudelijk gelijkwaardig of beter
${keywordNote}

## STRUCTUUR DIE MOET BLIJVEN:
- Geldige HTML (<h2>/<h3>/<p>/<ul>/<ol>/<table>/<blockquote>)
- GEEN <h1>
- FAQ-sectie aanwezig
- Behoud bestaande interne/externe links (hrefs)
- Behoud alle image/video markers (<!-- IMAGE:... --> en <!-- YOUTUBE:... -->)
- Behoud heading id-attributen voor TOC anchors
${overlapNote}
${toneNote}

Titel: "${req.title}"
Onderwerp: "${req.topic}"
Huidige meta description: "${req.draft.metaDescription}"

Huidige HTML:
${req.draft.htmlContent}

Geef ALLEEN JSON terug met:
{
  "metaDescription": "...",
  "htmlContent": "...",
  "tableOfContents": [{"level": 2, "text": "...", "id": "..."}],
  "internalLinksUsed": ["..."],
  "externalLinksUsed": ["..."],
  "faqItems": [{"question": "...", "answer": "..."}],
  "imageMarkers": ["..."],
  "youtubeMarkers": ["..."]
}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const data = JSON.parse(response.choices[0].message.content || "{}") as Record<string, unknown>;

  const htmlContent =
    typeof data.htmlContent === "string" && data.htmlContent.trim()
      ? data.htmlContent
      : req.draft.htmlContent;

  const metaDescription =
    typeof data.metaDescription === "string" && data.metaDescription.trim()
      ? data.metaDescription
      : req.draft.metaDescription;

  const tableOfContents = normalizeTocEntries(data.tableOfContents);
  const internalLinksUsed = normalizeStringArray(data.internalLinksUsed);
  const externalLinksUsed = normalizeStringArray(data.externalLinksUsed);
  const faqItems = normalizeFaqItems(data.faqItems);
  const imageMarkers = normalizeStringArray(data.imageMarkers);
  const youtubeMarkers = normalizeStringArray(data.youtubeMarkers);

  return {
    metaDescription,
    htmlContent,
    tableOfContents:
      tableOfContents.length > 0 ? tableOfContents : req.draft.tableOfContents,
    internalLinksUsed:
      internalLinksUsed.length > 0 ? internalLinksUsed : req.draft.internalLinksUsed,
    externalLinksUsed:
      externalLinksUsed.length > 0 ? externalLinksUsed : req.draft.externalLinksUsed,
    faqItems: faqItems.length > 0 ? faqItems : req.draft.faqItems,
    imageMarkers:
      imageMarkers.length > 0 ? imageMarkers : req.draft.imageMarkers,
    youtubeMarkers:
      youtubeMarkers.length > 0 ? youtubeMarkers : req.draft.youtubeMarkers,
  };
}

/**
 * Generate a contextual in-article image using DALL-E 3.
 * Produces a smaller, informative illustration suited for inline placement.
 */
export async function generateInArticleImage(
  topic: string,
  sectionHeading: string,
  articleContext: string
): Promise<Buffer> {
  const client = getClient();
  const response = await client.images.generate({
    model: "dall-e-3",
    prompt: `Create a clean, professional illustration for a blog section about "${sectionHeading}" in an article about "${topic}". Context: ${articleContext.substring(0, 200)}. The image should be informative, minimal, modern, and suitable for a professional blog. No text in the image.`,
    n: 1,
    size: "1024x1024",
    quality: "standard",
  });
  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error("No image URL returned from OpenAI");
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error("Failed to download generated image");
  const arrayBuffer = await imageResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate engaging social media copy from an article.
 * Supports platform-specific formatting for twitter, linkedin, facebook, or generic.
 */
export async function generateSocialCopy(
  articleTitle: string,
  articleExcerpt: string,
  platform: string = "generic"
): Promise<string> {
  const client = getClient();
  const platformInstructions: Record<string, string> = {
    generic:
      "Write a short, engaging social media post (2-3 sentences). Include relevant emojis.",
    twitter:
      "Write a tweet (max 280 characters). Include 2-3 relevant hashtags.",
    linkedin:
      "Write a professional LinkedIn post (3-4 sentences). Include a call to action.",
    facebook:
      "Write an engaging Facebook post (2-3 sentences). Conversational tone.",
  };
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content: `You are a social media expert. ${platformInstructions[platform] || platformInstructions.generic} Language: Dutch.`,
      },
      {
        role: "user",
        content: `Write a social media post for this article:\nTitle: ${articleTitle}\nExcerpt: ${articleExcerpt}\n\nReturn ONLY the post text, nothing else.`,
      },
    ],
  });
  return response.choices[0].message.content || "";
}

/**
 * Rewrite existing HTML content according to custom user instructions.
 * Optionally optimizes for provided keywords.
 */
export async function rewriteContentWithPrompt(
  currentHtml: string,
  userPrompt: string,
  keywords?: string[],
  toneOfVoice?: ToneOfVoice | null,
  generationSettings?: GenerationSettings
): Promise<{ htmlContent: string; metaDescription: string; metaTitle: string }> {
  const client = getClient();
  const settings = normalizeGenerationSettings(generationSettings);
  const toneInstruction = buildToneOfVoiceInstruction(toneOfVoice);
  const targetWordCount = settings.structure.targetWordCount;
  const minWordCount = Math.max(900, targetWordCount - 300);
  const maxWordCount = Math.min(3200, targetWordCount + 300);
  const headingCaseInstruction =
    settings.formatting.headingLetterCase === "title_case"
      ? "Gebruik natuurlijke sentence case in headings; zet niet elk woord met een hoofdletter."
      : settings.formatting.headingLetterCase === "sentence_case"
      ? "Gebruik sentence case in headings."
      : "Behoud natuurlijke heading-casing op basis van context.";
  const knowledgeInstruction =
    settings.knowledge.mode === "use_sources"
      ? "Baseer de herschrijving primair op de bestaande content en vermijd nieuwe claims."
      : settings.knowledge.mode === "no_extra"
      ? "Voeg geen externe feiten of webcontext toe buiten de huidige content."
      : "Je mag actuele webkennis gebruiken als dat de kwaliteit verhoogt, maar alleen feitelijk en relevant.";
  const formattingInstruction = [
    settings.formatting.bold
      ? "Gebruik <strong> voor kerntermen."
      : "Gebruik nauwelijks <strong>.",
    settings.formatting.italics
      ? "Gebruik <em> subtiel voor nuance."
      : "Vermijd <em>.",
    settings.formatting.tables
      ? "Gebruik <table> bij vergelijkingen."
      : "Gebruik geen <table>.",
    settings.formatting.quotes
      ? "Gebruik <blockquote> voor tips/kerninzichten."
      : "Gebruik geen <blockquote>.",
    settings.formatting.lists
      ? "Gebruik <ul>/<ol> voor scanbaarheid."
      : "Beperk lijsten; focus op lopende tekst.",
  ].join("\n- ");
  const linkInstruction = [
    settings.internalLinking.enabled
      ? `Voeg ongeveer ${Math.max(
          settings.internalLinking.linksPerH2,
          0
        )} interne links per H2 toe waar logisch.`
      : "Voeg geen nieuwe interne links toe.",
    settings.externalLinking.enabled
      ? `Voeg ongeveer ${Math.max(
          settings.externalLinking.linksPerArticle,
          0
        )} externe autoritatieve links toe waar relevant.`
      : "Voeg geen externe links toe.",
  ].join("\n- ");
  const imageMarkerInstruction =
    settings.images.inlineImageCount > 0
      ? `Insert exactly ${settings.images.inlineImageCount} inline image marker${settings.images.inlineImageCount > 1 ? "s" : ""} in context using this exact format: <!-- IMAGE:short contextual caption -->.`
      : "Do not include IMAGE markers.";
  const youtubeMarkerInstruction =
    settings.images.youtubeEnabled && settings.images.youtubeCount > 0
      ? `Insert exactly ${settings.images.youtubeCount} YouTube marker${settings.images.youtubeCount > 1 ? "s" : ""} in context using this exact format: <!-- YOUTUBE:search query -->.`
      : "Do not include YOUTUBE markers.";
  const h3Instruction =
    settings.structure.minH3 > 0
      ? `Use at least ${settings.structure.minH3} <h3> subsections in total where relevant.`
      : "Use <h3> only when it improves readability.";
  const faqInstruction =
    settings.structure.faqCount > 0
      ? `Include a FAQ section at the end with <h2> and ${settings.structure.faqCount} <h3> question/answer pairs.`
      : "Do not include a FAQ section unless the user's instruction explicitly asks for it.";
  const antiAiInstruction = `Schrijf concreet en menselijk:
- Verboden openingszinnen/clichés: "In de wereld van...", "In dit artikel...", "Laten we eens...", "In het huidige digitale landschap...", "De sleutel tot...".
- Vermijd lege marketingtaal en overbodige opvulzinnen.
- Gebruik directe taal, specifieke voorbeelden en korte, natuurlijke zinnen.`;
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are an expert SEO content editor. Rewrite the provided HTML content according to the user's instructions.

## OUTPUT FORMAT REQUIREMENTS:
- Use proper HTML tags: <h2>, <h3> for headings (NO <h1>), <p> for paragraphs, <ul>/<ol>/<li> for lists
- Every section must have a clear <h2> heading
- ${h3Instruction}
- Include at least ${settings.structure.minH2} main sections (h2) for proper structure
- Every paragraph must be wrapped in <p> tags
- ${faqInstruction}
- Content should be ${minWordCount}-${maxWordCount} words (target ${targetWordCount})
- ${headingCaseInstruction}
- ${knowledgeInstruction}
- ${formattingInstruction}
- ${linkInstruction}
- ${imageMarkerInstruction}
- ${youtubeMarkerInstruction}
- ${antiAiInstruction}
- Write naturally and uniquely; avoid repetitive AI phrasing and preserve factual consistency.
${keywords?.length ? `- Optimize for these keywords: ${keywords.join(", ")}. Use the primary keyword in the first paragraph and naturally throughout.` : ""}
${toneInstruction}

Return ONLY a JSON object with: { "htmlContent": "...", "metaDescription": "150-160 character meta description", "metaTitle": "SEO title 45-60 chars" }`,
      },
      {
        role: "user",
        content: `Instructions: ${userPrompt}\n\nCurrent content:\n${currentHtml}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  const raw = JSON.parse(
    response.choices[0].message.content ||
      '{"htmlContent":"","metaDescription":"","metaTitle":""}'
  ) as Record<string, unknown>;

  return {
    htmlContent: typeof raw.htmlContent === "string" ? raw.htmlContent : "",
    metaDescription:
      typeof raw.metaDescription === "string" ? raw.metaDescription : "",
    metaTitle: typeof raw.metaTitle === "string" ? raw.metaTitle : "",
  };
}

/**
 * Generate SEO-optimized alt text for an image given its context and article title.
 */
export async function generateAltText(
  imageContext: string,
  articleTitle: string
): Promise<string> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "Generate a concise, descriptive alt text for an image (max 125 characters). The alt text should be helpful for accessibility and SEO. Return ONLY the alt text, nothing else.",
      },
      {
        role: "user",
        content: `Article: "${articleTitle}"\nImage context: ${imageContext}`,
      },
    ],
  });
  return response.choices[0].message.content?.trim() || "";
}

/**
 * Analyze HTML content and return an SEO score, issues list, suggestions,
 * and optimized title/description recommendations.
 */
export async function analyzeContentSEO(
  htmlContent: string,
  title: string,
  metaDescription: string,
  targetKeywords?: string[]
): Promise<{
  score: number;
  issues: { type: string; message: string; severity: string }[];
  suggestions: string[];
  optimizedTitle: string;
  optimizedDescription: string;
}> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are an SEO expert. Analyze the provided content and return a detailed SEO assessment. Return ONLY a JSON object with: { "score": 0-100, "issues": [{"type": "...", "message": "...", "severity": "critical|warning|info"}], "suggestions": ["..."], "optimizedTitle": "...", "optimizedDescription": "150-160 chars" }`,
      },
      {
        role: "user",
        content: `Title: ${title}\nMeta Description: ${metaDescription}\n${targetKeywords?.length ? `Target Keywords: ${targetKeywords.join(", ")}` : ""}\n\nContent:\n${htmlContent.substring(0, 8000)}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(
    response.choices[0].message.content ||
      '{"score":0,"issues":[],"suggestions":[],"optimizedTitle":"","optimizedDescription":""}'
  );
}

/**
 * Generate structured data (JSON-LD) for Article, FAQ, or HowTo schema types.
 * Article and FAQ are generated deterministically; HowTo uses AI.
 */
export async function generateSchemaMarkup(
  type: "Article" | "FAQ" | "HowTo",
  data: Record<string, unknown>
): Promise<object> {
  // For Article and FAQ we can generate deterministically
  if (type === "Article") {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: data.title,
      description: data.description,
      image: data.imageUrl,
      datePublished: data.datePublished,
      dateModified: data.dateModified,
      author: {
        "@type": "Organization",
        name: data.authorName || "Ascendio",
      },
    };
  }
  if (type === "FAQ" && Array.isArray(data.items)) {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: data.items.map((item: Record<string, string>) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    };
  }
  // For HowTo, use AI
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "Generate a valid HowTo schema.org JSON-LD object. Return ONLY a JSON object with the schema.",
      },
      {
        role: "user",
        content: `Generate HowTo schema for: ${JSON.stringify(data)}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content || "{}");
}

/**
 * Suggest supporting subtopics for an SEO topic cluster.
 */
export async function suggestClusterTopics(
  pillarTopic: string,
  language: string = "Dutch",
  existingTopics?: string[],
  context?: ClusterSuggestionContext
): Promise<Array<{ title: string; description: string; keywords: string[] }>> {
  const client = getClient();
  const existingNote = existingTopics?.length
    ? `\nBestaande subtopics (suggereer deze NIET opnieuw): ${existingTopics.join(", ")}`
    : "";
  const descriptionNote = context?.pillarDescription?.trim()
    ? `\nPillar beschrijving: "${context.pillarDescription.trim()}"`
    : "";
  const keywordNote = context?.pillarKeywords?.length
    ? `\nPillar zoekwoorden: ${context.pillarKeywords.join(", ")}`
    : "";
  const contentNote = context?.pillarContent?.trim()
    ? `\nPillar content excerpt${context.pillarContentTitle ? ` (${context.pillarContentTitle})` : ""}: "${context.pillarContent.substring(0, 2500)}"`
    : "";

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content: `You are an SEO topic cluster strategist. Given a pillar topic (and optional pillar context), suggest 5-8 supporting subtopics that would form an effective SEO topic cluster. Use the provided context to avoid overlap with the pillar page and to cover missing user intents. Each subtopic should be specific enough for a standalone article but clearly related to the pillar. Respond in ${language}. Return ONLY a JSON object with: { "suggestions": [{ "title": "...", "description": "brief description", "keywords": ["kw1", "kw2"] }] }`,
      },
      {
        role: "user",
        content: `Pillar topic: "${pillarTopic}"${existingNote}${descriptionNote}${keywordNote}${contentNote}\n\nSuggest supporting subtopics for this SEO cluster.`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const data = JSON.parse(response.choices[0].message.content || '{"suggestions":[]}');
  return data.suggestions || [];
}
