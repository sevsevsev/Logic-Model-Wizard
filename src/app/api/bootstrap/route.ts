import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "module";
import mammoth from "mammoth";
import type { BootstrapExtractionResponse, BootstrapSuggestion } from "@/lib/bootstrap/types";
import { generateGeminiContentWithFallback } from "@/lib/llm/generate";
import { ingestUserDocument } from "@/lib/rag/userIngest";

const require = createRequire(import.meta.url);
const PDFParser = require("pdf2json");

export const runtime = "nodejs";

const MAX_FILES = 1;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = 4 * 1024 * 1024;
const MAX_COMBINED_CHARS = 60000;
const MAX_SUGGESTIONS = 16;
const MAX_CRITIQUE_ITEMS = 20;
const ENABLE_BOOTSTRAP_INLINE_DOC_PRIMARY =
  process.env.ENABLE_BOOTSTRAP_INLINE_DOC_PRIMARY === "true";
const ENABLE_BOOTSTRAP_CRITIQUE = process.env.ENABLE_BOOTSTRAP_CRITIQUE !== "false";

const EXTRACTION_PROMPT = `You extract draft logic-model suggestions from uploaded program documents.

Return strict JSON only — no markdown, no extra text:
{
  "summary": "string (1-2 sentences)",
  "suggestions": [
    {
      "id": "string",
      "label": "string (≤6 words)",
      "path": "one of: stakeholders, intended_impact.population, intended_impact.geography, intended_impact.long_term_goal, intended_impact.compiled_statement, implementation.resources.human, implementation.resources.material, implementation.resources.financial, implementation.resources.knowledge, implementation.activities, outcomes.short_term, outcomes.medium_term, outcomes.long_term",
      "value": "string OR string[] OR activities[] OR outcomes[]",
      "confidence": 0.0,
      "rationale": "≤12 words",
      "evidence": "≤10-word quote",
      "sourceFile": "string"
    }
  ]
}

Rules:
- Max ${MAX_SUGGESTIONS} suggestions total. Prioritize coverage first: intended_impact.compiled_statement and implementation.activities should be included when evidence exists.
- Add a stakeholders suggestion when distinct stakeholder groups are named (students, teachers, families, schools, etc.).
- For intended_impact.* paths, value must be a single string (never an array).
- Merge related items into one suggestion (e.g., all human resources in one array).
- String array values: keep each item ≤8 words.
- activities value: array of {"item":"verb phrase", "category"?:"optional grouping label", "actions":string[],"outputs":Array<string|{"text":"string","category"?:"optional grouping label"}],"stakeholderLabels"?:string[]}; max 4 activity objects, max 3 actions each.
- outcomes value: array of {"statement":"string","stakeholderLabels"?:string[]}. Use stakeholderLabels when an outcome is specific to one stakeholder group.
- Outcome levels: short_term=knowledge/awareness/skills (<1yr), medium_term=behavior change (1-2yr), long_term=status/condition (2+yr).
- Only include fields grounded in the source. Omit fields with no evidence.`;

const TARGETED_MISSING_FIELDS_PROMPT = `You are filling missing logic-model fields from the same document text.

Return strict JSON only with this shape:
{
  "summary": "string (<= 1 sentence)",
  "suggestions": [
    {
      "id": "string",
      "label": "string",
      "path": "intended_impact.compiled_statement OR implementation.activities",
      "value": "string OR activities[]",
      "confidence": 0.0,
      "rationale": "short string",
      "evidence": "short quote",
      "sourceFile": "string"
    }
  ]
}

Rules:
- Return only paths explicitly requested by the user message.
- If requested path is not evidenced, omit it.
- For implementation.activities, include outputs when source text indicates outputs/deliverables and include stakeholderLabels when relevant. Use item as the primary activity text; category is optional.
- Keep concise and evidence-grounded.`;

const MINIMUM_SUGGESTIONS_PROMPT = `You are rescuing an extraction that returned no suggestions.

Return strict JSON only with this shape:
{
  "summary": "string (<= 2 sentences)",
  "suggestions": [
    {
      "id": "string",
      "label": "string",
      "path": "one of: intended_impact.compiled_statement, implementation.activities, implementation.resources.human, implementation.resources.material, implementation.resources.financial, implementation.resources.knowledge, outcomes.short_term, outcomes.medium_term, outcomes.long_term",
      "value": "string OR string[] OR activities[] OR outcomes[]",
      "confidence": 0.0,
      "rationale": "short string",
      "evidence": "short quote",
      "sourceFile": "string"
    }
  ]
}

Rules:
- Return 1 to 6 suggestions from explicit evidence in the text.
- Prefer intended_impact.compiled_statement and implementation.activities when possible.
- If evidence is sparse, provide at least one conservative suggestion with confidence <= 0.55.
- Keep values concise and schema-compatible.`;

const CRITIQUE_SUGGESTIONS_PROMPT = `You evaluate extracted logic-model suggestions for practical quality.

Return strict JSON only:
{
  "critiques": [
    {
      "id": "string",
      "path": "string",
      "label": "string",
      "qualityRating": "Strong|Adequate|Weak",
      "critique": "<=20 words"
    }
  ]
}

Rules:
- Score quality, not truth certainty.
- Strong: concrete, specific, and aligned to logic model conventions.
- Adequate: usable but could be sharper.
- Weak: vague, mismatched level, or likely misclassified.
- Keep critiques concise and actionable.`;

function normalizeDocumentText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    // Keep line breaks so headings and bullet-like rows survive.
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Handle common markdown-wrapped JSON responses.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const unfenced = fenced?.[1]?.trim() || trimmed;

  // Try extracting the outer-most JSON object if extra text is present.
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return unfenced.slice(firstBrace, lastBrace + 1).trim();
  }

  return unfenced;
}

function parseExtractionResponse(raw: string): BootstrapExtractionResponse {
  const jsonCandidate = extractJsonCandidate(raw);
  if (!jsonCandidate) {
    throw new Error("Empty model output.");
  }

  try {
    return JSON.parse(jsonCandidate) as BootstrapExtractionResponse;
  } catch {
    // Fallback: remove trailing commas that occasionally appear in model JSON.
    const noTrailingCommas = jsonCandidate.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(noTrailingCommas) as BootstrapExtractionResponse;
  }
}

function parseCritiqueResponse(raw: string): {
  critiques: Array<{
    id?: string;
    path?: string;
    label?: string;
    qualityRating?: unknown;
    critique?: unknown;
  }>;
} {
  const jsonCandidate = extractJsonCandidate(raw);
  if (!jsonCandidate) {
    return { critiques: [] };
  }

  try {
    const parsed = JSON.parse(jsonCandidate) as {
      critiques?: Array<{
        id?: string;
        path?: string;
        label?: string;
        qualityRating?: unknown;
        critique?: unknown;
      }>;
    };
    return {
      critiques: Array.isArray(parsed.critiques) ? parsed.critiques : [],
    };
  } catch {
    const noTrailingCommas = jsonCandidate.replace(/,\s*([}\]])/g, "$1");
    const parsed = JSON.parse(noTrailingCommas) as {
      critiques?: Array<{
        id?: string;
        path?: string;
        label?: string;
        qualityRating?: unknown;
        critique?: unknown;
      }>;
    };
    return {
      critiques: Array.isArray(parsed.critiques) ? parsed.critiques : [],
    };
  }
}

function normalizeSuggestions(suggestions: unknown): BootstrapSuggestion[] {
  if (!Array.isArray(suggestions)) return [];

  return suggestions.slice(0, MAX_SUGGESTIONS).map((s, idx) => {
    const suggestion = s as Partial<BootstrapSuggestion>;
    return {
      ...suggestion,
      id: typeof suggestion.id === "string" && suggestion.id ? suggestion.id : `s-${idx + 1}`,
      confidence:
        typeof suggestion.confidence === "number"
          ? Math.max(0, Math.min(1, suggestion.confidence))
          : 0.5,
      qualityRating:
        suggestion.qualityRating === "Strong" ||
        suggestion.qualityRating === "Adequate" ||
        suggestion.qualityRating === "Weak"
          ? suggestion.qualityRating
          : undefined,
      critique: typeof suggestion.critique === "string" ? suggestion.critique : undefined,
    } as BootstrapSuggestion;
  });
}

function normalizeQualityRating(raw: unknown): "Strong" | "Adequate" | "Weak" {
  if (raw === "Strong" || raw === "Adequate" || raw === "Weak") {
    return raw;
  }
  return "Adequate";
}

function mergeSuggestionCritiques(
  suggestions: BootstrapSuggestion[],
  critiques: Array<{
    id?: string;
    path?: string;
    label?: string;
    qualityRating?: unknown;
    critique?: unknown;
  }>
): BootstrapSuggestion[] {
  return suggestions.map((suggestion) => {
    const match = critiques.find((critique) => {
      if (typeof critique.id === "string" && critique.id === suggestion.id) return true;
      if (
        typeof critique.path === "string" &&
        typeof critique.label === "string" &&
        critique.path === suggestion.path &&
        critique.label.toLowerCase().trim() === suggestion.label.toLowerCase().trim()
      ) {
        return true;
      }
      return false;
    });

    if (!match) return suggestion;

    return {
      ...suggestion,
      qualityRating: normalizeQualityRating(match.qualityRating),
      critique:
        typeof match.critique === "string" && match.critique.trim().length > 0
          ? match.critique.trim()
          : suggestion.critique,
    };
  });
}

function hasPath(suggestions: BootstrapSuggestion[], path: BootstrapSuggestion["path"]): boolean {
  return suggestions.some((s) => s.path === path);
}

function looksLikeMeaningfulText(text: string): boolean {
  if (!text) return false;

  const alphaWords = text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  return alphaWords.length >= 20 && lines.length >= 4;
}

async function extractPdfTextWithPdf2json(bytes: Buffer): Promise<string> {
  return await new Promise((resolve, reject) => {
    const parser = new PDFParser(null, (err: any) => {
      if (err) {
        reject(new Error(`Failed to parse PDF: ${err.message || err}`));
      }
    });

    parser.on("pdfParser_dataError", (err: any) => {
      reject(new Error(`PDF parsing error: ${err.message || err}`));
    });

    parser.on("pdfParser_dataReady", () => {
      try {
        const rawText = parser.getRawTextContent();
        resolve(normalizeDocumentText(rawText));
      } catch (e) {
        reject(e);
      }
    });

    parser.parseBuffer(bytes);
  });
}

async function extractTextFromFile(file: File): Promise<string> {
  const filename = file.name.toLowerCase();
  const mime = file.type;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error(`File ${file.name} exceeds size limit.`);
  }

  // Parse PDF using pdf2json
  if (mime === "application/pdf" || filename.endsWith(".pdf")) {
    try {
      const textFromPdf2json = await extractPdfTextWithPdf2json(bytes);

      if (!textFromPdf2json.trim()) {
        throw new Error(
          "No extractable text found in PDF. The file may be image-based, encrypted, or use unsupported fonts."
        );
      }

      return textFromPdf2json;
    } catch (error) {
      throw new Error(
        `Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Parse DOCX using mammoth
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer: bytes });
      return normalizeDocumentText(result.value || "");
    } catch (error) {
      throw new Error(
        `Failed to parse DOCX: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Fallback for txt/markdown/csv and other text-like uploads
  return normalizeDocumentText(bytes.toString("utf8"));
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const requestUserId = req.headers.get("x-user-id")?.trim() || undefined;
  if (!apiKey) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) {
    return NextResponse.json(
      {
        error:
          "Upload is too large. Please keep total file size under 4 MB or split into smaller files.",
      },
      { status: 413 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
  }

  const rawFiles = formData.getAll("files");
  const files = rawFiles.filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Please upload at least one file." }, { status: 400 });
  }

  if (files.length !== MAX_FILES) {
    return NextResponse.json(
      { error: "Please upload exactly one file." },
      { status: 400 }
    );
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_MULTIPART_BODY_BYTES) {
    return NextResponse.json(
      {
        error:
          "Upload is too large. Please keep total file size under 4 MB or split into smaller files.",
      },
      { status: 413 }
    );
  }

  try {
    const extracted = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        text: await extractTextFromFile(file),
      }))
    );

    const nonEmpty = extracted.filter((d) => d.text.length > 0);
    if (nonEmpty.length === 0) {
      return NextResponse.json(
        { error: "No readable text found in uploaded files." },
        { status: 400 }
      );
    }

    // Optional user-scoped ingestion: uploaded documents become retrievable context
    // in future chat turns for this collaborator.
    if (requestUserId) {
      for (const doc of nonEmpty) {
        try {
          await ingestUserDocument({
            userId: requestUserId,
            fileName: doc.name,
            text: doc.text,
          });
        } catch {
          // Do not fail bootstrap suggestions if vector ingestion fails.
        }
      }
    }

    const combinedAlphaWords = nonEmpty
      .map((d) => d.text)
      .join("\n")
      .match(/[A-Za-z][A-Za-z'-]{2,}/g)?.length ?? 0;
    const lowTextSignal = combinedAlphaWords < 20;

    let combined = nonEmpty
      .map((d) => `FILE: ${d.name}\nCONTENT:\n${d.text}`)
      .join("\n\n---\n\n");

    if (combined.length > MAX_COMBINED_CHARS) {
      combined = combined.slice(0, MAX_COMBINED_CHARS);
    }

    const likelyDocumentFiles = files.filter(
      (f) =>
        f.type === "application/pdf" ||
        f.name.toLowerCase().endsWith(".pdf") ||
        f.name.toLowerCase().endsWith(".docx")
    );

    const inlineDocumentParts: Array<{ inlineData: { mimeType: string; data: string } }> = await Promise.all(
      likelyDocumentFiles.slice(0, 2).map(async (f) => {
        const fileBytes = Buffer.from(await f.arrayBuffer());
        return {
          inlineData: {
            mimeType:
              f.type ||
              (f.name.toLowerCase().endsWith(".docx")
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "application/pdf"),
            data: fileBytes.toString("base64"),
          },
        };
      })
    );

    const useInlineAsPrimary =
      inlineDocumentParts.length > 0 &&
      (lowTextSignal || ENABLE_BOOTSTRAP_INLINE_DOC_PRIMARY);

    const primaryUserParts = useInlineAsPrimary
      ? [
          {
            text:
              "Read the attached program document directly and extract logic model suggestions. Use the text excerpt as secondary support.",
          },
          {
            text: `TEXT EXCERPT:\n${combined.slice(0, 12000)}`,
          },
          ...inlineDocumentParts,
        ]
      : [{ text: combined }];

    const payload = {
      system_instruction: { parts: [{ text: EXTRACTION_PROMPT }] },
      contents: [{ role: "user", parts: primaryUserParts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    };

    const { response: geminiRes } = await generateGeminiContentWithFallback(
      apiKey,
      payload,
      "bootstrap"
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return NextResponse.json({ error: errText }, { status: geminiRes.status });
    }

    const geminiData = await geminiRes.json();
    const candidate = geminiData.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const rawText = parts
      .map((part: { text?: string }) => (typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim();

    let parsed: BootstrapExtractionResponse;
    try {
      parsed = parseExtractionResponse(rawText);
    } catch {
      if (finishReason === "MAX_TOKENS") {
        return NextResponse.json(
          {
            error:
              "Extraction output was truncated. Please try fewer files or a shorter document.",
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { error: "Could not parse extraction output." },
        { status: 502 }
      );
    }

    let safeSuggestions = normalizeSuggestions(parsed.suggestions);

    // Recovery pass: if key fields are missing, ask specifically for those fields.
    const missingPaths: Array<BootstrapSuggestion["path"]> = [];
    if (!hasPath(safeSuggestions, "intended_impact.compiled_statement")) {
      missingPaths.push("intended_impact.compiled_statement");
    }
    if (!hasPath(safeSuggestions, "implementation.activities")) {
      missingPaths.push("implementation.activities");
    }

    if (missingPaths.length > 0) {
      const secondPayload = {
        system_instruction: { parts: [{ text: TARGETED_MISSING_FIELDS_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Requested paths: ${missingPaths.join(", ")}\n\n${combined}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      };

      const { response: secondRes } = await generateGeminiContentWithFallback(
        apiKey,
        secondPayload,
        "bootstrap"
      );

      if (secondRes.ok) {
        const secondData = await secondRes.json();
        const secondCandidate = secondData.candidates?.[0];
        const secondParts = Array.isArray(secondCandidate?.content?.parts)
          ? secondCandidate.content.parts
          : [];
        const secondRawText = secondParts
          .map((part: { text?: string }) => (typeof part.text === "string" ? part.text : ""))
          .join("\n")
          .trim();

        try {
          const secondParsed = parseExtractionResponse(secondRawText);
          const secondSuggestions = normalizeSuggestions(secondParsed.suggestions).filter((s) =>
            missingPaths.includes(s.path)
          );

          for (const path of missingPaths) {
            if (hasPath(safeSuggestions, path)) continue;
            const recovered = secondSuggestions.find((s) => s.path === path);
            if (recovered) safeSuggestions.push(recovered);
          }

          safeSuggestions = safeSuggestions.slice(0, MAX_SUGGESTIONS);
        } catch {
          // Keep first-pass results if recovery parse fails.
        }
      }
    }

    // Final rescue pass for documents that parsed but yielded no structured suggestions.
    if (safeSuggestions.length === 0) {
      const rescuePayload = {
        system_instruction: { parts: [{ text: MINIMUM_SUGGESTIONS_PROMPT }] },
        contents: [
          {
            role: "user",
            parts:
              lowTextSignal && inlineDocumentParts.length > 0
                ? [
                    {
                      text:
                        "Rescue extraction from the attached program document. If plain text seems sparse, infer structure from headings/tables in the file.",
                    },
                    ...inlineDocumentParts,
                  ]
                : [{ text: combined }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      };

      const { response: rescueRes } = await generateGeminiContentWithFallback(
        apiKey,
        rescuePayload,
        "bootstrap"
      );

      if (rescueRes.ok) {
        const rescueData = await rescueRes.json();
        const rescueCandidate = rescueData.candidates?.[0];
        const rescueParts = Array.isArray(rescueCandidate?.content?.parts)
          ? rescueCandidate.content.parts
          : [];
        const rescueRawText = rescueParts
          .map((part: { text?: string }) => (typeof part.text === "string" ? part.text : ""))
          .join("\n")
          .trim();

        try {
          const rescueParsed = parseExtractionResponse(rescueRawText);
          const rescueSuggestions = normalizeSuggestions(rescueParsed.suggestions);
          if (rescueSuggestions.length > 0) {
            safeSuggestions = rescueSuggestions.slice(0, MAX_SUGGESTIONS);
            if (!parsed.summary && rescueParsed.summary) {
              parsed.summary = rescueParsed.summary;
            }
          }
        } catch {
          // Keep existing empty suggestions if rescue parse fails.
        }
      }
    }

    if (ENABLE_BOOTSTRAP_CRITIQUE && safeSuggestions.length > 0) {
      const critiquePayload = {
        system_instruction: { parts: [{ text: CRITIQUE_SUGGESTIONS_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify({
                  suggestions: safeSuggestions.slice(0, MAX_CRITIQUE_ITEMS),
                }),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      };

      const { response: critiqueRes } = await generateGeminiContentWithFallback(
        apiKey,
        critiquePayload,
        "bootstrap"
      );

      if (critiqueRes.ok) {
        try {
          const critiqueData = await critiqueRes.json();
          const critiqueRawText: string =
            critiqueData.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => (typeof part.text === "string" ? part.text : ""))
              .join("\n")
              .trim() ?? "";

          const parsedCritique = parseCritiqueResponse(critiqueRawText);
          if (parsedCritique.critiques.length > 0) {
            safeSuggestions = mergeSuggestionCritiques(safeSuggestions, parsedCritique.critiques);
          }
        } catch {
          // Keep suggestions unchanged if critique parsing fails.
        }
      }
    }

    return NextResponse.json({
      summary: parsed.summary || "We extracted draft suggestions from your files.",
      suggestions: safeSuggestions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
