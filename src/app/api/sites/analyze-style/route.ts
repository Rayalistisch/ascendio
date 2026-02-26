import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf(" ", maxChars);
  return text.slice(0, cut > 0 ? cut : maxChars) + "…";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const siteId = body?.siteId as string | undefined;

  if (!siteId) {
    return NextResponse.json({ error: "Geen siteId opgegeven" }, { status: 400 });
  }

  // Verify the site belongs to the user
  const { data: site } = await supabase
    .from("asc_sites")
    .select("id, name, default_language")
    .eq("id", siteId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!site) {
    return NextResponse.json({ error: "Site niet gevonden" }, { status: 404 });
  }

  // Fetch recent published posts with content
  const { data: posts } = await supabase
    .from("asc_wp_posts")
    .select("title, content, excerpt")
    .eq("site_id", siteId)
    .eq("user_id", user.id)
    .eq("status", "publish")
    .order("wp_modified_at", { ascending: false })
    .order("last_synced_at", { ascending: false })
    .limit(10);

  const usablePosts = (posts ?? [])
    .map((p) => {
      const raw = p.content || p.excerpt || "";
      const text = truncate(stripHtml(raw), 1200);
      return { title: p.title || "", text };
    })
    .filter((p) => p.title && p.text.length > 100);

  if (usablePosts.length < 2) {
    return NextResponse.json(
      { error: "Te weinig gecachede posts om stijl te analyseren. Synchroniseer eerst de site." },
      { status: 422 }
    );
  }

  const language = site.default_language || "Dutch";
  const siteName = site.name;

  const postsBlock = usablePosts
    .map((p, i) => `### Post ${i + 1}: ${p.title}\n${p.text}`)
    .join("\n\n");

  const systemPrompt = `Je bent een expert copywriter en stijlanalist. Analyseer de schrijfstijl van de gegeven blogposts van de website "${siteName}" en extraheer een nauwkeurig stijlprofiel in het ${language === "Dutch" || language === "nl" ? "Nederlands" : language}.

Return ONLY a JSON object (no markdown, no extra text) with exactly these fields:
{
  "tone": "Beknopte beschrijving van de tone of voice (1-2 zinnen)",
  "targetAudience": "Doelgroep op basis van de content (1-2 zinnen)",
  "exampleSentences": ["zin 1", "zin 2", "zin 3", "zin 4", "zin 5"],
  "brandGuidelines": "Opvallende stijlpatronen, woordkeuze of structuurgewoonten (2-4 zinnen)",
  "avoidWords": ["woord1", "woord2", "woord3"]
}

Richtlijnen:
- "tone": Omschrijf de toon (bijv. informatief maar laagdrempelig, direct, technisch maar toegankelijk)
- "targetAudience": Wie lijkt de doelgroep te zijn op basis van het taalgebruik en de onderwerpen
- "exampleSentences": Kies 5 echte zinnen uit de posts die de schrijfstijl goed representeren
- "brandGuidelines": Beschrijf opvallende patronen (bijv. woordkeuze, gebruik van voorbeelden, zinsopbouw, gebruik van jij/u)
- "avoidWords": Max 5-8 woorden of uitdrukkingen die NIET worden gebruikt of die juist vermeden lijken te worden`;

  const userPrompt = `Hier zijn de blogposts om te analyseren:\n\n${postsBlock}`;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw) as {
      tone?: string;
      targetAudience?: string;
      exampleSentences?: string[];
      brandGuidelines?: string;
      avoidWords?: string[];
    };

    // Strip out any example sentences that start with forbidden AI-cliché patterns
    const forbiddenPrefixes = [
      /^in (een|de|het) (wereld|huidige|dynamische|moderne|hedendaagse|digitale)/i,
      /^steeds meer/i,
      /^we leven in/i,
      /^nu meer dan ooit/i,
      /^in dit (artikel|blog|tijdperk|gids)/i,
      /^laten we/i,
      /^stel je voor/i,
      /^wist je dat/i,
    ];
    const rawSentences = Array.isArray(result.exampleSentences) ? result.exampleSentences : [];
    const cleanSentences = rawSentences.filter(
      (s) => typeof s === "string" && !forbiddenPrefixes.some((rx) => rx.test(s.trim()))
    );

    return NextResponse.json({
      tone: result.tone ?? "",
      targetAudience: result.targetAudience ?? "",
      exampleSentences: cleanSentences,
      brandGuidelines: result.brandGuidelines ?? "",
      avoidWords: Array.isArray(result.avoidWords) ? result.avoidWords : [],
      postsAnalyzed: usablePosts.length,
    });
  } catch (err) {
    console.error("[analyze-style] OpenAI error:", err);
    return NextResponse.json({ error: "Analyse mislukt" }, { status: 500 });
  }
}
