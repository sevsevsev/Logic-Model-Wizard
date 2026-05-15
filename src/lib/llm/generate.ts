type GeminiRole = "agent" | "chat" | "bootstrap" | "extraction";

interface GenerateContentResult {
  response: Response;
  model: string;
}

function parseModelList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function resolveModelChain(role: GeminiRole): string[] {
  const globalPrimary = process.env.GEMINI_PRIMARY_MODEL?.trim();
  const globalFallback = parseModelList(process.env.GEMINI_FALLBACK_MODELS);

  const roleEnv = {
    agent: {
      primary: process.env.GEMINI_AGENT_PRIMARY_MODEL?.trim(),
      fallback: parseModelList(process.env.GEMINI_AGENT_FALLBACK_MODELS),
    },
    chat: {
      primary: process.env.GEMINI_CHAT_PRIMARY_MODEL?.trim(),
      fallback: parseModelList(process.env.GEMINI_CHAT_FALLBACK_MODELS),
    },
    bootstrap: {
      primary: process.env.GEMINI_BOOTSTRAP_PRIMARY_MODEL?.trim(),
      fallback: parseModelList(process.env.GEMINI_BOOTSTRAP_FALLBACK_MODELS),
    },
    extraction: {
      primary: process.env.GEMINI_EXTRACTION_PRIMARY_MODEL?.trim(),
      fallback: parseModelList(process.env.GEMINI_EXTRACTION_FALLBACK_MODELS),
    },
  }[role];

  const chain = unique([
    roleEnv.primary || globalPrimary || "gemini-2.5-pro",
    ...(roleEnv.fallback.length > 0 ? roleEnv.fallback : globalFallback.length > 0 ? globalFallback : ["gemini-2.5-flash"]),
  ]);

  return chain.length > 0 ? chain : ["gemini-2.5-pro", "gemini-2.5-flash"];
}

function buildUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveRequestTimeoutMs(role: GeminiRole): number {
  const roleTimeouts: Record<GeminiRole, string | undefined> = {
    agent: process.env.GEMINI_AGENT_TIMEOUT_MS,
    chat: process.env.GEMINI_CHAT_TIMEOUT_MS,
    bootstrap: process.env.GEMINI_BOOTSTRAP_TIMEOUT_MS,
    extraction: process.env.GEMINI_EXTRACTION_TIMEOUT_MS,
  };

  return parsePositiveInt(roleTimeouts[role] ?? process.env.GEMINI_REQUEST_TIMEOUT_MS, 90000);
}

export async function generateGeminiContentWithFallback(
  apiKey: string,
  payload: unknown,
  role: GeminiRole
): Promise<GenerateContentResult> {
  const chain = resolveModelChain(role);
  const timeoutMs = resolveRequestTimeoutMs(role);

  let lastFailure: GenerateContentResult | null = null;
  let lastError: Error | null = null;

  for (const model of chain) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(buildUrl(model, apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      lastError = new Error(
        `[gemini:${role}] model '${model}' request failed after ${elapsedMs}ms (timeout ${timeoutMs}ms): ${message}`
      );
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      return { response, model };
    }

    lastFailure = { response, model };

    // Retry on quota/transient server failures by moving to next model.
    if (response.status === 429 || response.status >= 500) {
      continue;
    }

    // For non-retryable failures (4xx other than 429), fail fast.
    return { response, model };
  }

  if (lastFailure) return lastFailure;
  if (lastError) throw lastError;

  throw new Error("No Gemini models configured for generateContent call.");
}
