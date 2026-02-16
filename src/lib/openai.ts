import OpenAI from "openai";

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
  if (req.clusterContext) {
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
        .join("\n")}\nGebruik 1-2 van deze waar relevant.`;
    }
  } else if (req.existingPosts?.length) {
    internalLinksInstruction = `\n## INTERNAL LINKS:\nWhere naturally relevant, link to these existing articles:\n${req.existingPosts
      .slice(0, 15)
      .map(
        (p) =>
          `- <a href="${req.siteBaseUrl || ""}/${p.slug}">${p.title}</a>`
      )
      .join("\n")}\nUse 2-4 internal links where they genuinely add value.`;
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

  // Build preferred domains instruction
  let externalLinksInstruction = `\n## EXTERNAL LINKS:\nInclude 3-5 links to authoritative external sources. Use target="_blank" rel="noopener noreferrer".`;
  if (req.preferredDomains?.length) {
    const domainList = req.preferredDomains
      .map((d) => `- ${d.domain}${d.label ? ` (${d.label})` : ""}`)
      .join("\n");
    externalLinksInstruction = `\n## EXTERNAL LINKS:\nGebruik bij voorkeur deze autoritieve bronnen:\n${domainList}\nInclude 3-5 externe links totaal. Use target="_blank" rel="noopener noreferrer".`;
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
- 1500-2500 words in ${language}
- Use <h2 id="kebab-case-id"> for main sections${structureInstruction ? "" : " (4-6 sections)"}
- Use <h3 id="kebab-case-id"> for subsections where appropriate
- Use <p> tags for all paragraphs
- Use <ul>/<ol>/<li> for lists
- Use <table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table> where comparison data is relevant
- Use <blockquote> for key takeaways or expert quotes
- Do NOT include <h1> (WordPress handles the title)
- Do NOT include a Table of Contents (it is generated separately)
${structureInstruction}
## IMAGE PLACEHOLDERS:
Insert exactly 2-3 image markers in relevant locations:
<!-- IMAGE:brief description of what image should show -->

## VIDEO PLACEHOLDERS:
Insert exactly 1-2 YouTube search markers:
<!-- YOUTUBE:search query to find a relevant tutorial or explainer video -->
${internalLinksInstruction}
${externalLinksInstruction}
${styleInstruction}

## FAQ SECTION:
End with a FAQ section containing 3-5 relevant questions and concise answers.
Format as: <h2 id="veelgestelde-vragen">Veelgestelde vragen</h2> followed by <h3>Question?</h3><p>Answer</p> pairs.

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
  keywords?: string[]
): Promise<{ htmlContent: string; metaDescription: string }> {
  const client = getClient();
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
- Use <h3> for subsections within each <h2> block
- Include 4-6 main sections (h2) for proper structure
- Every paragraph must be wrapped in <p> tags
- Include bullet lists (<ul>/<li>) where appropriate
- Use <strong> and <em> for emphasis on key terms
- Use <blockquote> for key takeaways
- Include a FAQ section at the end with <h2> and <h3> question/answer pairs
- Content should be 1200-2000 words
${keywords?.length ? `- Optimize for these keywords: ${keywords.join(", ")}. Use the primary keyword in the first paragraph and naturally throughout.` : ""}

Return ONLY a JSON object with: { "htmlContent": "...", "metaDescription": "150-160 character meta description" }`,
      },
      {
        role: "user",
        content: `Instructions: ${userPrompt}\n\nCurrent content:\n${currentHtml}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(
    response.choices[0].message.content ||
      '{"htmlContent":"","metaDescription":""}'
  );
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
