// Content refresh-detectie (Laag 4).
//
// Vergelijkt GSC page-metrics van de laatste periode met de vorige en markeert
// twee soorten refresh-kandidaten:
//   - 'decay' : pagina die significant klikken verloor t.o.v. de vorige periode.
//   - 'stuck' : pagina die net buiten de top-10 blijft hangen (positie ~8-20)
//               met vertoningen — een gerichte refresh kan hem over de streep duwen.

export interface PageMetric {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type RefreshReason = "decay" | "stuck";

export interface RefreshCandidate {
  url: string;
  reason: RefreshReason;
  clicksNow: number;
  clicksPrev: number;
  impressions: number;
  position: number;
  ctr: number;
  score: number;
}

export interface DetectOptions {
  /** Minimale klikken in de vorige periode om van "verval" te spreken. */
  decayMinPrevClicks?: number;
  /** Aandeel van vorige klikken waaronder het verval telt (0.6 = -40%). */
  decayDropRatio?: number;
  /** Positiegrenzen voor "stuck" (net buiten pagina 1). */
  stuckMinPosition?: number;
  stuckMaxPosition?: number;
  /** Minimale vertoningen om een stuck-pagina de moeite waard te maken. */
  stuckMinImpressions?: number;
}

/**
 * Detecteer refresh-kandidaten. Decay heeft voorrang op stuck: een pagina die
 * al verval vertoont wordt niet óók als stuck gemarkeerd.
 */
export function detectRefreshCandidates(
  current: PageMetric[],
  previous: PageMetric[],
  options?: DetectOptions
): RefreshCandidate[] {
  const decayMinPrevClicks = options?.decayMinPrevClicks ?? 10;
  const decayDropRatio = options?.decayDropRatio ?? 0.6;
  const stuckMinPosition = options?.stuckMinPosition ?? 8;
  const stuckMaxPosition = options?.stuckMaxPosition ?? 20;
  const stuckMinImpressions = options?.stuckMinImpressions ?? 50;

  const prevByUrl = new Map(previous.map((p) => [p.url, p]));
  const candidates: RefreshCandidate[] = [];

  for (const now of current) {
    const prev = prevByUrl.get(now.url);
    const clicksPrev = prev?.clicks ?? 0;

    // Decay: had eerder verkeer, is nu fors gedaald.
    if (clicksPrev >= decayMinPrevClicks && now.clicks <= clicksPrev * decayDropRatio) {
      candidates.push({
        url: now.url,
        reason: "decay",
        clicksNow: now.clicks,
        clicksPrev,
        impressions: now.impressions,
        position: Math.round(now.position * 10) / 10,
        ctr: now.ctr,
        score: clicksPrev - now.clicks, // grootste absolute daling eerst
      });
      continue;
    }

    // Stuck: hangt net buiten de top-10 met genoeg vertoningen.
    if (
      now.position >= stuckMinPosition &&
      now.position <= stuckMaxPosition &&
      now.impressions >= stuckMinImpressions
    ) {
      const proximity = (stuckMaxPosition - now.position) / (stuckMaxPosition - stuckMinPosition);
      const score = Math.round(proximity * Math.log10(now.impressions + 1) * 100) / 100;
      candidates.push({
        url: now.url,
        reason: "stuck",
        clicksNow: now.clicks,
        clicksPrev,
        impressions: now.impressions,
        position: Math.round(now.position * 10) / 10,
        ctr: now.ctr,
        score,
      });
    }
  }

  // Decay-kandidaten (verlies) bovenaan, daarna stuck op score.
  return candidates.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "decay" ? -1 : 1;
    return b.score - a.score;
  });
}
