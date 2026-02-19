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
  "werd",
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

const SHINGLE_SIZE = 5;

function decodeCommonEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function stripHtmlToPlainText(html: string): string {
  return decodeCommonEntities(html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function buildShingles(tokens: string[], size = SHINGLE_SIZE): Set<string> {
  const result = new Set<string>();
  if (tokens.length < size) return result;
  for (let index = 0; index <= tokens.length - size; index++) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

function getIntersectionSize(left: Set<string>, right: Set<string>): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let count = 0;
  for (const item of small) {
    if (large.has(item)) count++;
  }
  return count;
}

export interface ContentSimilarity {
  jaccard: number;
  containment: number;
  score: number;
}

export function calculateSimilarity(leftText: string, rightText: string): ContentSimilarity {
  const leftTokens = tokenize(leftText);
  const rightTokens = tokenize(rightText);

  if (leftTokens.length < SHINGLE_SIZE || rightTokens.length < SHINGLE_SIZE) {
    return { jaccard: 0, containment: 0, score: 0 };
  }

  const leftShingles = buildShingles(leftTokens);
  const rightShingles = buildShingles(rightTokens);
  if (leftShingles.size === 0 || rightShingles.size === 0) {
    return { jaccard: 0, containment: 0, score: 0 };
  }

  const intersection = getIntersectionSize(leftShingles, rightShingles);
  if (intersection === 0) return { jaccard: 0, containment: 0, score: 0 };

  const union = leftShingles.size + rightShingles.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const containment = intersection / Math.min(leftShingles.size, rightShingles.size);
  return {
    jaccard,
    containment,
    score: Math.round(Math.max(jaccard, containment) * 100),
  };
}

export interface SimilarityCandidate {
  title: string;
  url?: string;
  text: string;
}

export interface SimilarityMatch {
  title: string;
  url?: string;
  score: number;
  jaccard: number;
  containment: number;
  snippet: string;
}

function buildSnippet(text: string, maxChars = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const slice = clean.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim()}...`;
}

export function findTopSimilarityMatches(
  candidateText: string,
  candidates: SimilarityCandidate[],
  minScore = 1,
  limit = 3
): SimilarityMatch[] {
  if (!candidateText.trim() || candidates.length === 0) return [];

  const matches = candidates
    .map((candidate) => {
      const similarity = calculateSimilarity(candidateText, candidate.text);
      return {
        title: candidate.title,
        url: candidate.url,
        score: similarity.score,
        jaccard: similarity.jaccard,
        containment: similarity.containment,
        snippet: buildSnippet(candidate.text),
      };
    })
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return matches;
}
