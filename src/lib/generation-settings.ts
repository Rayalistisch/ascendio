export type KnowledgeMode = "connect_web" | "use_sources" | "no_extra";
export type HeadingLetterCase = "title_case" | "sentence_case" | "keep";

export interface GenerationSettings {
  details: {
    focusKeyword: string;
    includeKeywords: string[];
  };
  knowledge: {
    mode: KnowledgeMode;
  };
  formatting: {
    bold: boolean;
    italics: boolean;
    tables: boolean;
    quotes: boolean;
    lists: boolean;
    headingLetterCase: HeadingLetterCase;
  };
  structure: {
    targetWordCount: number;
    minH2: number;
    minH3: number;
    faqCount: number;
  };
  internalLinking: {
    enabled: boolean;
    linksPerH2: number;
  };
  externalLinking: {
    enabled: boolean;
    linksPerArticle: number;
  };
  images: {
    featuredEnabled: boolean;
    inlineImageCount: number;
    youtubeEnabled: boolean;
    youtubeCount: number;
  };
}

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  details: {
    focusKeyword: "",
    includeKeywords: [],
  },
  knowledge: {
    mode: "connect_web",
  },
  formatting: {
    bold: true,
    italics: true,
    tables: true,
    quotes: true,
    lists: true,
    headingLetterCase: "sentence_case",
  },
  structure: {
    targetWordCount: 1700,
    minH2: 6,
    minH3: 4,
    faqCount: 4,
  },
  internalLinking: {
    enabled: true,
    linksPerH2: 1,
  },
  externalLinking: {
    enabled: true,
    linksPerArticle: 3,
  },
  images: {
    featuredEnabled: true,
    inlineImageCount: 1,
    youtubeEnabled: true,
    youtubeCount: 1,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    next.push(clean);
    if (next.length >= 15) break;
  }
  return next;
}

function asMode(value: unknown, fallback: KnowledgeMode): KnowledgeMode {
  return value === "connect_web" || value === "use_sources" || value === "no_extra"
    ? value
    : fallback;
}

function asHeadingCase(value: unknown, fallback: HeadingLetterCase): HeadingLetterCase {
  return value === "title_case" || value === "sentence_case" || value === "keep"
    ? value
    : fallback;
}

export function normalizeGenerationSettings(
  value: unknown
): GenerationSettings {
  const defaults = DEFAULT_GENERATION_SETTINGS;
  if (!value || typeof value !== "object") return defaults;

  const node = value as Record<string, unknown>;
  const details = (node.details as Record<string, unknown> | undefined) ?? {};
  const knowledge = (node.knowledge as Record<string, unknown> | undefined) ?? {};
  const formatting = (node.formatting as Record<string, unknown> | undefined) ?? {};
  const structure = (node.structure as Record<string, unknown> | undefined) ?? {};
  const internal = (node.internalLinking as Record<string, unknown> | undefined) ?? {};
  const external = (node.externalLinking as Record<string, unknown> | undefined) ?? {};
  const images = (node.images as Record<string, unknown> | undefined) ?? {};

  return {
    details: {
      focusKeyword: asString(details.focusKeyword, defaults.details.focusKeyword),
      includeKeywords: asStringArray(details.includeKeywords, defaults.details.includeKeywords),
    },
    knowledge: {
      mode: asMode(knowledge.mode, defaults.knowledge.mode),
    },
    formatting: {
      bold: asBoolean(formatting.bold, defaults.formatting.bold),
      italics: asBoolean(formatting.italics, defaults.formatting.italics),
      tables: asBoolean(formatting.tables, defaults.formatting.tables),
      quotes: asBoolean(formatting.quotes, defaults.formatting.quotes),
      lists: asBoolean(formatting.lists, defaults.formatting.lists),
      headingLetterCase: asHeadingCase(
        formatting.headingLetterCase,
        defaults.formatting.headingLetterCase
      ),
    },
    structure: {
      targetWordCount: clamp(
        Number(structure.targetWordCount ?? defaults.structure.targetWordCount),
        900,
        3500
      ),
      minH2: clamp(Number(structure.minH2 ?? defaults.structure.minH2), 3, 10),
      minH3: clamp(Number(structure.minH3 ?? defaults.structure.minH3), 0, 12),
      faqCount: clamp(Number(structure.faqCount ?? defaults.structure.faqCount), 0, 8),
    },
    internalLinking: {
      enabled: asBoolean(internal.enabled, defaults.internalLinking.enabled),
      linksPerH2: clamp(
        Number(internal.linksPerH2 ?? defaults.internalLinking.linksPerH2),
        0,
        4
      ),
    },
    externalLinking: {
      enabled: asBoolean(external.enabled, defaults.externalLinking.enabled),
      linksPerArticle: clamp(
        Number(external.linksPerArticle ?? defaults.externalLinking.linksPerArticle),
        0,
        8
      ),
    },
    images: {
      featuredEnabled: asBoolean(images.featuredEnabled, defaults.images.featuredEnabled),
      inlineImageCount: clamp(
        Number(images.inlineImageCount ?? defaults.images.inlineImageCount),
        0,
        3
      ),
      youtubeEnabled: asBoolean(images.youtubeEnabled, defaults.images.youtubeEnabled),
      youtubeCount: clamp(
        Number(images.youtubeCount ?? defaults.images.youtubeCount),
        0,
        3
      ),
    },
  };
}
