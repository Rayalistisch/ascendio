// Content-profiel: leer uit een referentiepagina hoe een site content opbouwt,
// en serialiseer nieuwe content in datzelfde formaat.
//
// Drie formaten:
//  - 'acf'       : ACF Blocks (custom blokken met veldsleutels, HTML in data)
//  - 'gutenberg' : standaard core-blokken (wp:paragraph, wp:heading, ...)
//  - 'classic'   : platte HTML in post_content
//
// Zo werkt publiceren op elk thema, met of zonder ACF.

export interface AcfHeaderProfile {
  block: string;
  contentAttr: string;
  contentField: string;
  imageAttr?: string;
  imageField?: string;
  themeAttr?: string;
  themeField?: string;
  theme?: string;
  showMetaAttr?: string;
  showMetaField?: string;
}

export interface ContentProfile {
  format: "acf" | "gutenberg" | "classic";
  detectedFrom?: string;
  acf?: {
    contentBlock: string;
    contentAttr: string;
    contentField: string;
    header?: AcfHeaderProfile;
  };
  headingClasses?: { h2?: string; h3?: string; lead?: boolean };
}

export interface ArticleForSerialize {
  title: string;
  bodyHtml: string;
  intro?: string;
  featuredImageId?: number | null;
}

// ── Escaping (zoals Gutenberg/ACF de block-comment-JSON opslaat) ──
function escForAcf(html: string): string {
  let s = JSON.stringify(html);
  s = s.slice(1, -1);
  s = s.replace(/&/g, "\\u0026").replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  s = s.replace(/\\"/g, "\\u0022");
  return s;
}

function unescapeUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ── Detectie ──

interface RawAcfBlock {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

function extractAcfBlocks(raw: string): RawAcfBlock[] {
  // Block-comments eindigen op ' /-->'; de escaped content bevat nooit '-->'.
  const re = /<!--\s*wp:(acf\/[\w-]+)\s+([\s\S]*?)\s*\/-->/g;
  const blocks: RawAcfBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    try {
      const json = JSON.parse(unescapeUnicode(m[2]));
      if (json && json.data) blocks.push({ name: json.name || m[1], data: json.data });
    } catch {
      // sla onparseerbare blocks over
    }
  }
  return blocks;
}

/** Vind in een ACF-datablok het veld dat de body-HTML bevat (langste HTML-string). */
function findHtmlField(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
): { attr: string; field: string } | null {
  let best: { attr: string; field: string; len: number } | null = null;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_")) continue;
    if (typeof value !== "string" || !value.includes("<")) continue;
    const fieldKey = data[`_${key}`];
    if (typeof fieldKey !== "string") continue;
    if (!best || value.length > best.len) best = { attr: key, field: fieldKey, len: value.length };
  }
  return best ? { attr: best.attr, field: best.field } : null;
}

function detectHeadingClasses(html: string): ContentProfile["headingClasses"] {
  const h2 = html.match(/<h2[^>]*class="([^"]+)"/i)?.[1];
  const h3 = html.match(/<h3[^>]*class="([^"]+)"/i)?.[1];
  const lead = /<p[^>]*class="[^"]*\blead\b[^"]*"/i.test(html);
  return { h2, h3, lead };
}

export function detectContentProfile(raw: string, detectedFrom?: string): ContentProfile {
  const acfBlocks = extractAcfBlocks(raw);

  if (acfBlocks.length > 0) {
    // Body-contentblok = het blok dat het vaakst voorkomt met een grote HTML-body.
    const contentCandidates = acfBlocks
      .map((b) => ({ block: b, html: findHtmlField(b.data) }))
      .filter((c) => c.html);

    // Kies het contentblok: meest voorkomende blocknaam met HTML-veld.
    const counts = new Map<string, number>();
    for (const c of contentCandidates) counts.set(c.block.name, (counts.get(c.block.name) ?? 0) + 1);
    const contentBlockName =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? contentCandidates[0]?.block.name;

    const contentSample = contentCandidates.find((c) => c.block.name === contentBlockName);
    const contentField = contentSample?.html;

    // Header-blok: naam bevat 'header', of heeft een image- + theme-achtig veld.
    let header: AcfHeaderProfile | undefined;
    const headerBlock = acfBlocks.find(
      (b) =>
        /header/i.test(b.name) ||
        (findHtmlField(b.data) && ("image" in b.data || "theme" in b.data))
    );
    if (headerBlock) {
      const hHtml = findHtmlField(headerBlock.data);
      if (hHtml) {
        const imageAttr = Object.keys(headerBlock.data).find(
          (k) => !k.startsWith("_") && /image/i.test(k)
        );
        const themeAttr = Object.keys(headerBlock.data).find(
          (k) => !k.startsWith("_") && /theme/i.test(k)
        );
        const showMetaAttr = Object.keys(headerBlock.data).find(
          (k) => !k.startsWith("_") && /(show_entry_meta|meta)/i.test(k)
        );
        header = {
          block: headerBlock.name,
          contentAttr: hHtml.attr,
          contentField: hHtml.field,
          imageAttr,
          imageField: imageAttr ? headerBlock.data[`_${imageAttr}`] : undefined,
          themeAttr,
          themeField: themeAttr ? headerBlock.data[`_${themeAttr}`] : undefined,
          theme: themeAttr ? String(headerBlock.data[themeAttr] || "") : undefined,
          showMetaAttr,
          showMetaField: showMetaAttr ? headerBlock.data[`_${showMetaAttr}`] : undefined,
        };
      }
    }

    if (contentField && contentBlockName) {
      return {
        format: "acf",
        detectedFrom,
        acf: {
          contentBlock: contentBlockName,
          contentAttr: contentField.attr,
          contentField: contentField.field,
          header,
        },
        headingClasses: detectHeadingClasses(contentSample?.block.data[contentField.attr] || ""),
      };
    }
  }

  // Standaard Gutenberg core-blokken?
  if (/<!--\s*wp:(paragraph|heading|list|image|core\/)/.test(raw)) {
    return { format: "gutenberg", detectedFrom };
  }

  return { format: "classic", detectedFrom };
}

// ── Serialisatie ──

function acfBlock(name: string, data: Record<string, string>): string {
  const dataJson = Object.entries(data)
    .map(([k, v]) => `"${k}":"${v.startsWith("field_") || v === "" || /^\d+$/.test(v) ? v : escForAcf(v)}"`)
    .join(",");
  return `<!-- wp:${name} {"name":"${name}","data":{${dataJson}},"align":"","mode":"edit"} /-->`;
}

function applyHeadingClasses(html: string, hc?: ContentProfile["headingClasses"]): string {
  if (!hc) return html;
  let out = html;
  if (hc.h2) out = out.replace(/<h2>/g, `<h2 class="${hc.h2}">`);
  if (hc.h3) out = out.replace(/<h3>/g, `<h3 class="${hc.h3}">`);
  return out;
}

function splitByH2(html: string): string[] {
  const parts = html.split(/(?=<h2\b)/i).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [html];
}

function htmlToGutenberg(html: string): string {
  const re = /<(h[1-6]|p|ul|ol|figure|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const el = m[0];
    if (/^h[1-6]$/.test(tag)) {
      blocks.push(`<!-- wp:heading {"level":${tag[1]}} -->\n${el}\n<!-- /wp:heading -->`);
    } else if (tag === "p") {
      blocks.push(`<!-- wp:paragraph -->\n${el}\n<!-- /wp:paragraph -->`);
    } else if (tag === "ul") {
      blocks.push(`<!-- wp:list -->\n${el}\n<!-- /wp:list -->`);
    } else if (tag === "ol") {
      blocks.push(`<!-- wp:list {"ordered":true} -->\n${el}\n<!-- /wp:list -->`);
    } else if (tag === "blockquote") {
      blocks.push(`<!-- wp:quote -->\n${el}\n<!-- /wp:quote -->`);
    } else {
      blocks.push(`<!-- wp:html -->\n${el}\n<!-- /wp:html -->`);
    }
  }
  return blocks.length > 0 ? blocks.join("\n\n") : `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;
}

/** Zet een artikel om naar post_content in het formaat van het profiel. */
export function serializeToProfile(profile: ContentProfile, article: ArticleForSerialize): string {
  const CR = "\r\n";

  if (profile.format === "acf" && profile.acf) {
    const { contentBlock, contentAttr, contentField, header } = profile.acf;
    const hc = profile.headingClasses;
    const out: string[] = [];

    if (header) {
      const h1class = "display";
      const headerHtml =
        `<h1 class="${h1class}">${article.title}</h1>` +
        (article.intro ? CR + article.intro : "");
      const data: Record<string, string> = {
        [header.contentAttr]: headerHtml,
        [`_${header.contentAttr}`]: header.contentField,
      };
      if (header.imageAttr) {
        data[header.imageAttr] = article.featuredImageId ? String(article.featuredImageId) : "";
        data[`_${header.imageAttr}`] = header.imageField || "";
      }
      if (header.themeAttr) {
        data[header.themeAttr] = header.theme || "dark";
        data[`_${header.themeAttr}`] = header.themeField || "";
      }
      if (header.showMetaAttr) {
        data[header.showMetaAttr] = "1";
        data[`_${header.showMetaAttr}`] = header.showMetaField || "";
      }
      out.push(acfBlock(header.block, data));
    }

    // Titel staat al in de hero-header → verwijder een dubbele H1 uit de body.
    const rawBody = header ? article.bodyHtml.replace(/<h1[\s\S]*?<\/h1>/i, "") : article.bodyHtml;
    const body = applyHeadingClasses(rawBody, hc);
    for (const section of splitByH2(body)) {
      out.push(
        acfBlock(contentBlock, {
          [contentAttr]: section,
          [`_${contentAttr}`]: contentField,
        })
      );
    }
    return out.join(CR + CR);
  }

  if (profile.format === "gutenberg") {
    return htmlToGutenberg(article.bodyHtml);
  }

  // classic
  return article.bodyHtml;
}

/** Korte, leesbare samenvatting van een profiel voor de UI. */
export function describeProfile(profile: ContentProfile): string {
  if (profile.format === "acf") {
    const parts = [`ACF-blokken (contentblok: ${profile.acf?.contentBlock})`];
    if (profile.acf?.header) parts.push(`hero: ${profile.acf.header.block}`);
    return parts.join(", ");
  }
  if (profile.format === "gutenberg") return "Standaard Gutenberg-blokken";
  return "Klassieke HTML";
}
