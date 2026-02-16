export type SchemaIssueSeverity = "critical" | "warning" | "info";

export interface SchemaIssue {
  severity: SchemaIssueSeverity;
  message: string;
  suggestion?: string;
}

export interface SchemaEntity {
  index: number;
  types: string[];
  keys: string[];
  fieldCount: number;
}

export interface SchemaAuditPage {
  id: string;
  wpPostId: number | null;
  title: string;
  slug: string;
  url: string;
  schemaCount: number;
  schemaTypes: string[];
  malformedBlockCount: number;
  coverageScore: number;
  entities: SchemaEntity[];
  issues: SchemaIssue[];
}

interface JsonLdNode {
  [key: string]: unknown;
}

const JSON_LD_SCRIPT_REGEX =
  /<script\b[^>]*type=["'][^"']*application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;

function decodeCommonEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = JSON_LD_SCRIPT_REGEX.exec(html)) !== null) {
    const block = (match[1] || "").trim();
    if (block) blocks.push(block);
  }

  return blocks;
}

function getTypes(node: JsonLdNode): string[] {
  const rawType = node["@type"];
  if (typeof rawType === "string") return [rawType];
  if (Array.isArray(rawType)) {
    return rawType.filter((value): value is string => typeof value === "string");
  }
  return [];
}

function normalizeParsedNode(parsed: unknown): JsonLdNode[] {
  if (!parsed) return [];

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const normalized: JsonLdNode[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const obj = entry as JsonLdNode;
    const graph = obj["@graph"];

    if (Array.isArray(graph)) {
      for (const node of graph) {
        if (node && typeof node === "object") {
          normalized.push(node as JsonLdNode);
        }
      }
      continue;
    }

    normalized.push(obj);
  }

  return normalized;
}

function buildEntitySummary(nodes: JsonLdNode[]): SchemaEntity[] {
  return nodes.map((node, index) => {
    const keys = Object.keys(node);
    return {
      index: index + 1,
      types: getTypes(node),
      keys,
      fieldCount: keys.length,
    };
  });
}

function createIssue(
  severity: SchemaIssueSeverity,
  message: string,
  suggestion?: string
): SchemaIssue {
  return { severity, message, suggestion };
}

function dedupeIssues(issues: SchemaIssue[]): SchemaIssue[] {
  const seen = new Set<string>();
  const deduped: SchemaIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.severity}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function evaluateNodes(nodes: JsonLdNode[]): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const lowerTypes = nodes.flatMap((node) => getTypes(node).map((type) => type.toLowerCase()));

  for (const node of nodes) {
    const types = getTypes(node);

    if (!node["@context"]) {
      issues.push(
        createIssue(
          "info",
          "Een JSON-LD entity mist @context.",
          "Gebruik altijd '@context': 'https://schema.org'."
        )
      );
    }

    if (types.length === 0) {
      issues.push(
        createIssue(
          "critical",
          "Een JSON-LD entity mist @type.",
          "Voeg per entity een geldig schema.org @type toe."
        )
      );
      continue;
    }

    const isArticleType = types.some((type) =>
      ["Article", "BlogPosting", "NewsArticle"].includes(type)
    );
    if (isArticleType) {
      if (!node.headline) {
        issues.push(
          createIssue(
            "warning",
            "Article/BlogPosting mist headline.",
            "Voeg 'headline' toe voor betere rich results interpretatie."
          )
        );
      }
      if (!node.description) {
        issues.push(
          createIssue(
            "warning",
            "Article/BlogPosting mist description.",
            "Voeg een korte, relevante description toe."
          )
        );
      }
      if (!node.image) {
        issues.push(
          createIssue(
            "warning",
            "Article/BlogPosting mist image.",
            "Gebruik een absolute image URL in het schema."
          )
        );
      }
      if (!node.author) {
        issues.push(
          createIssue(
            "warning",
            "Article/BlogPosting mist author.",
            "Vul author in als Person of Organization."
          )
        );
      }
      if (!node.datePublished) {
        issues.push(
          createIssue(
            "warning",
            "Article/BlogPosting mist datePublished.",
            "Voeg datePublished toe in ISO-8601 formaat."
          )
        );
      }
      if (!node.dateModified) {
        issues.push(
          createIssue(
            "info",
            "Article/BlogPosting mist dateModified.",
            "Voeg dateModified toe zodat updates zichtbaar zijn."
          )
        );
      }
      if (!node.mainEntityOfPage) {
        issues.push(
          createIssue(
            "info",
            "Article/BlogPosting mist mainEntityOfPage.",
            "Verwijs mainEntityOfPage naar de canonieke URL van de pagina."
          )
        );
      }
    }

    if (types.includes("FAQPage")) {
      const mainEntity = node.mainEntity;
      if (!Array.isArray(mainEntity) || mainEntity.length === 0) {
        issues.push(
          createIssue(
            "warning",
            "FAQPage heeft geen geldige mainEntity vragenlijst.",
            "Gebruik mainEntity met Question/Answer items."
          )
        );
      }
    }

    if (types.includes("BreadcrumbList")) {
      const items = node.itemListElement;
      if (!Array.isArray(items) || items.length === 0) {
        issues.push(
          createIssue(
            "warning",
            "BreadcrumbList mist itemListElement entries.",
            "Voeg breadcrumb items toe met position, name en item URL."
          )
        );
      }
    }

    if (types.includes("Product")) {
      if (!node.offers) {
        issues.push(
          createIssue(
            "info",
            "Product schema mist offers.",
            "Voeg offers (price, priceCurrency, availability) toe indien relevant."
          )
        );
      }
    }
  }

  if (!lowerTypes.includes("breadcrumblist")) {
    issues.push(
      createIssue(
        "info",
        "Geen BreadcrumbList gevonden op deze pagina.",
        "Overweeg BreadcrumbList toe te voegen voor navigatiestructuur."
      )
    );
  }

  return dedupeIssues(issues);
}

function computeScore(schemaCount: number, malformedCount: number, issues: SchemaIssue[]): number {
  if (schemaCount === 0) return 0;

  let score = 100;
  score -= malformedCount * 15;

  for (const issue of issues) {
    if (issue.severity === "critical") score -= 20;
    if (issue.severity === "warning") score -= 8;
    if (issue.severity === "info") score -= 3;
  }

  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}

export function auditSchemaForPost(post: {
  id: string;
  wp_post_id: number | null;
  title: string | null;
  slug: string | null;
  url: string | null;
  content: string | null;
  excerpt?: string | null;
}): SchemaAuditPage {
  const html = post.content || post.excerpt || "";
  const blocks = extractJsonLdBlocks(html);

  const nodes: JsonLdNode[] = [];
  let malformedBlockCount = 0;

  for (const block of blocks) {
    const cleaned = block.replace(/<!--/g, "").replace(/-->/g, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      try {
        parsed = JSON.parse(decodeCommonEntities(cleaned));
      } catch {
        malformedBlockCount++;
        continue;
      }
    }

    nodes.push(...normalizeParsedNode(parsed));
  }

  const schemaTypes = Array.from(
    new Set(nodes.flatMap((node) => getTypes(node)))
  ).sort((a, b) => a.localeCompare(b));

  const issues: SchemaIssue[] = [];

  if (blocks.length === 0) {
    issues.push(
      createIssue(
        "critical",
        "Geen JSON-LD schema markup gevonden op deze pagina.",
        "Voeg minimaal Article, WebPage of een ander passend schema.org type toe."
      )
    );
  }

  if (malformedBlockCount > 0) {
    issues.push(
      createIssue(
        "warning",
        `${malformedBlockCount} JSON-LD blok(ken) konden niet worden geparsed.`,
        "Controleer of alle schema scripts valide JSON bevatten."
      )
    );
  }

  issues.push(...evaluateNodes(nodes));

  const dedupedIssues = dedupeIssues(issues);

  return {
    id: post.id,
    wpPostId: post.wp_post_id,
    title: post.title || "Onbekende pagina",
    slug: post.slug || "",
    url: post.url || "",
    schemaCount: nodes.length,
    schemaTypes,
    malformedBlockCount,
    coverageScore: computeScore(nodes.length, malformedBlockCount, dedupedIssues),
    entities: buildEntitySummary(nodes),
    issues: dedupedIssues,
  };
}
