// Deterministische interne-link-insertie.
//
// We laten de LLM NOOIT de HTML herschrijven (dat sloopt footer/styling/
// shortcodes). De LLM levert alleen ankerzin + doel-URL; deze functie wikkelt
// die exacte ankerzin in een <a> en laat de rest van de HTML byte-voor-byte
// ongemoeid.

export interface LinkSuggestion {
  anchor: string;
  url: string;
  title?: string;
}

export interface AppliedLink {
  anchor: string;
  url: string;
  title?: string;
}

const HEADING_OPEN = /^<h[1-6][\s>]/i;
const HEADING_CLOSE = /^<\/h[1-6]>/i;

/**
 * Wikkel de eerste ongelinkte, exacte voorkomens van elke ankerzin in een <a>.
 * - Alleen in tekstknopen (nooit binnen tags/attributen).
 * - Nooit binnen een bestaande <a> of binnen een kop (h1-h6).
 * - Eén link per doel-URL; dubbele URL's worden overgeslagen.
 * Retourneert de nieuwe HTML en welke links echt zijn toegevoegd.
 */
export function applyAnchorLinks(
  html: string,
  suggestions: LinkSuggestion[]
): { html: string; added: AppliedLink[] } {
  if (!html || suggestions.length === 0) return { html, added: [] };

  // Dedupe op URL; bewaar volgorde.
  const pending: LinkSuggestion[] = [];
  const seenUrl = new Set<string>();
  for (const s of suggestions) {
    const anchor = (s.anchor || "").trim();
    if (!anchor || !s.url || seenUrl.has(s.url)) continue;
    seenUrl.add(s.url);
    pending.push({ ...s, anchor });
  }
  if (pending.length === 0) return { html, added: [] };

  // Split in tokens: tags (<...>) en tekst ertussen — zo raken we tags nooit aan.
  const tokens = html.split(/(<[^>]+>)/);
  const added: AppliedLink[] = [];
  let anchorDepth = 0; // binnen <a>...</a>
  let headingDepth = 0; // binnen <h1-6>...</h6>

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;

    if (tok.startsWith("<")) {
      if (/^<a[\s>]/i.test(tok)) anchorDepth++;
      else if (/^<\/a>/i.test(tok)) anchorDepth = Math.max(0, anchorDepth - 1);
      else if (HEADING_OPEN.test(tok)) headingDepth++;
      else if (HEADING_CLOSE.test(tok)) headingDepth = Math.max(0, headingDepth - 1);
      continue;
    }

    // Tekstknoop — alleen linken buiten <a> en buiten koppen.
    if (anchorDepth > 0 || headingDepth > 0 || pending.length === 0) continue;

    for (let p = 0; p < pending.length; p++) {
      const sug = pending[p];
      const idx = tok.indexOf(sug.anchor);
      if (idx === -1) continue;

      const before = tok.slice(0, idx);
      const match = tok.slice(idx, idx + sug.anchor.length);
      const after = tok.slice(idx + sug.anchor.length);
      const safeUrl = sug.url.replace(/"/g, "&quot;");
      tokens[i] = `${before}<a href="${safeUrl}">${match}</a>${after}`;
      added.push({ anchor: sug.anchor, url: sug.url, title: sug.title });
      pending.splice(p, 1); // dit doel is nu gelinkt
      break; // max één link per tekstknoop-iteratie; volgende tekstknoop verder
    }
  }

  return { html: tokens.join(""), added };
}
