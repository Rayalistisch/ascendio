export interface IBVisionCredentials {
  baseUrl: string;    // e.g. https://dgrubber.local.ibvision.nl
  apiKey: string;     // decrypted API key
  urlPrefix: string;  // e.g. "/" or "/seo/"
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildIBVisionUrl(prefix: string, title: string): string {
  const normalizedPrefix = prefix.replace(/\/+$/, "") || "";
  const slug = slugify(title);
  return `${normalizedPrefix}/${slug}`;
}

export function mapLanguage(lang: string): "NL" | "DE" | "EN" {
  const normalized = lang.toLowerCase();
  if (normalized === "german" || normalized === "de") return "DE";
  if (normalized === "english" || normalized === "en") return "EN";
  return "NL"; // default: Dutch
}

function stripImagePlaceholders(html: string): string {
  return html.replace(/<!--\s*IMAGE:[^>]*-->/gi, "");
}

function stripYoutubePlaceholders(html: string): string {
  return html.replace(/<!--\s*YOUTUBE:[^>]*-->/gi, "");
}

export interface IBVisionPublishResult {
  docid: string;
  url: string;
  testUrl: string;
}

export async function publishContent(
  creds: IBVisionCredentials,
  params: {
    title: string;
    htmlContent: string;
    language: string;
    slug: string;
  }
): Promise<IBVisionPublishResult> {
  const urlPath = buildIBVisionUrl(creds.urlPrefix, params.slug || params.title);
  const language = mapLanguage(params.language);

  // Strip placeholders and prepend title as h1
  const cleanHtml = stripYoutubePlaceholders(stripImagePlaceholders(params.htmlContent));
  const content = `<h1>${params.title}</h1>\n${cleanHtml}`;

  const endpoint = `${creds.baseUrl.replace(/\/+$/, "")}/api/v1/seocontent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-API-Key": creds.apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      url: urlPath,
      publish: true,
      language,
      content,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`IBVision publish mislukt: ${response.status} ${body}`);
  }

  const data = await response.json();
  const result = data?.result;

  if (!result?.docid) {
    throw new Error(`IBVision gaf onverwacht antwoord: ${JSON.stringify(data)}`);
  }

  return {
    docid: String(result.docid),
    url: result.url || urlPath,
    testUrl: result.test || `${creds.baseUrl}${result.qs || ""}`,
  };
}
