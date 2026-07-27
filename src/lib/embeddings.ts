import OpenAI from "openai";

// text-embedding-3-small: 1536 dims, goedkoop, prima voor interne-link-relevantie.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

// Embeddings hebben een tokenlimiet; ~8000 chars is ruim veilig en scheelt kosten.
const MAX_INPUT_CHARS = 8000;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/** Embed één tekst. Geeft null terug als OpenAI niet geconfigureerd is. */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;
  const input = text.slice(0, MAX_INPUT_CHARS).trim();
  if (!input) return null;
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input });
  return res.data[0]?.embedding ?? null;
}

/**
 * Embed meerdere teksten in één call (OpenAI ondersteunt array-input).
 * Behoudt volgorde; geeft null terug bij ontbrekende configuratie.
 */
export async function embedBatch(texts: string[]): Promise<number[][] | null> {
  const client = getClient();
  if (!client) return null;
  const inputs = texts.map((t) => t.slice(0, MAX_INPUT_CHARS).trim() || " ");
  if (inputs.length === 0) return [];
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
