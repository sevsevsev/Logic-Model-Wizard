export interface EmbeddingProvider {
  embed: (text: string) => Promise<number[] | null>;
}

export const NoopEmbeddingProvider: EmbeddingProvider = {
  async embed() {
    // Placeholder for pgvector-compatible embedding provider integration.
    return null;
  },
};

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function embedText(apiKey: string, text: string): Promise<number[] | null> {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const timeoutMs = parsePositiveInt(process.env.GEMINI_EMBED_TIMEOUT_MS, 8000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: {
            parts: [{ text: cleaned }],
          },
        }),
        signal: controller.signal,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[embedText] request failed after ${timeoutMs}ms timeout: ${message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = (await res.json()) as { error?: { message?: string } };
      detail = errBody.error?.message ?? "";
    } catch {
      // noop
    }
    // eslint-disable-next-line no-console
    console.warn(`[embedText] API error ${res.status}: ${res.statusText}${detail ? ` — ${detail}` : ""}`);
    return null;
  }
  const payload = (await res.json()) as GeminiEmbeddingResponse;
  const values = payload.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) return null;
  return values;
}
