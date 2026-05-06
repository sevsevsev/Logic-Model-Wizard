import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/chat/prompt";
import type { LogicModel } from "@/store/useLogicModelStore";
import type { ChatMessage } from "@/store/useLogicModelStore";

// ---------------------------------------------------------------------------
// System prompt — encodes all spec rules
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = buildSystemPrompt();

const PATCH_EXTRACTION_PROMPT = `You are a strict JSON extraction engine.

Task:
- Read the provided conversation context.
- Extract ONLY the logic model fields that were newly provided or refined in the latest turn.
- Return JSON only. No prose, no markdown, no code fences.

Schema:
{
  "stakeholders": [
    { "id": "string", "label": "string", "type": "string" }
  ],
  "intended_impact": {
    "population": "string",
    "geography": "string",
    "long_term_goal": "string",
    "compiled_statement": "string"
  },
  "implementation": {
    "resources": {
      "human": ["string"],
      "material": ["string"],
      "financial": ["string"],
      "knowledge": ["string"]
    },
    "activities": [
      {
        "item": "string",
        "category": "string",
        "actions": ["string"],
        "outputs": [{ "text": "string", "category": "string" }],
        "stakeholderLabels": ["string"]
      }
    ]
  },
  "outcomes": {
    "short_term": [{ "statement": "string", "stakeholderLabels": ["string"] }],
    "medium_term": [{ "statement": "string", "stakeholderLabels": ["string"] }],
    "long_term": [{ "statement": "string", "stakeholderLabels": ["string"] }]
  }
}

Rules:
- Omit unchanged fields entirely.
- Omit empty strings/arrays.
- If nothing changed, return {}.
- CRITICAL: Never set compiled_statement or long_term_goal unless the user has explicitly confirmed or accepted a complete drafted impact statement in this exact turn. Answering a population question, subgroup question, or geography question does NOT justify setting these fields. Leave them out entirely in those cases.`;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

function normalizeSentence(sentence: string): string {
  return sentence
    .replace(/^our program\s+/i, "")
    .replace(/^we\s+/i, "")
    .replace(/^students\s+should\s+/i, "students should ")
    .trim();
}

function simplifyPopulation(raw: string): string {
  return raw
    .replace(/^the\s+/i, "")
    .replace(/\s+in\s+.+$/i, "")
    .replace(/\s+through\s+.+$/i, "")
    .replace(/\s+with\s+.+$/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

function makeStakeholder(label: string): { id: string; label: string } {
  const clean = label.trim();
  const id = clean
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "stakeholder";
  return { id, label: clean };
}

function addOutcome(
  bucket: Array<{ statement: string; stakeholderLabels?: string[] }>,
  statement: string,
  stakeholderLabels?: string[]
) {
  const clean = statement.trim().replace(/[.]+$/g, "");
  if (!clean) return;
  if (bucket.some((entry) => entry.statement.toLowerCase() === clean.toLowerCase())) return;
  bucket.push({
    statement: clean,
    stakeholderLabels: stakeholderLabels && stakeholderLabels.length > 0 ? stakeholderLabels : [],
  });
}

function appendOutputToMatchingActivity(
  activities: Array<{
    item: string;
    category?: string;
    actions: string[];
    outputs: Array<{ text: string; category?: string }>;
    stakeholderLabels?: string[];
  }>,
  outputText: string,
  matcher: (activity: {
    item: string;
    category?: string;
    actions: string[];
    outputs: Array<{ text: string; category?: string }>;
    stakeholderLabels?: string[];
  }) => boolean
): boolean {
  const target = [...activities].reverse().find(matcher);
  if (!target) return false;

  if (!target.outputs.some((output) => output.text.toLowerCase() === outputText.toLowerCase())) {
    target.outputs.push({ text: outputText });
  }

  return true;
}

function buildHeuristicNarrativePatch(userMessage: string): Partial<LogicModel> | null {
  const text = userMessage.trim();
  if (!text) return null;

  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;

  const populationCandidates: string[] = [];
  const stakeholderLabels: string[] = [];
  const activities: Array<{
    item: string;
    category?: string;
    actions: string[];
    outputs: Array<{ text: string; category?: string }>;
    stakeholderLabels?: string[];
  }> = [];
  const shortOutcomes: Array<{ statement: string; stakeholderLabels?: string[] }> = [];
  const mediumOutcomes: Array<{ statement: string; stakeholderLabels?: string[] }> = [];
  const longOutcomes: Array<{ statement: string; stakeholderLabels?: string[] }> = [];

  const populationRegexes = [
    /(?:enrolls?|serves?|supports?|targets?|works with)\s+([^.!?]+)/i,
    /(?:for|with)\s+((?:k-?12|middle school|high school|elementary)\s+students?)/i,
    /\b([0-9]{1,2}(?:st|nd|rd|th)\s+graders?)\b/i,
  ];

  const outputRegex = /\b(\d+\s+(?:lessons?|sessions?|classes?|participants?|students?)[^.,;]*)/i;

  for (const sentence of sentences) {
    const normalized = normalizeSentence(sentence);

    for (const rx of populationRegexes) {
      const match = normalized.match(rx);
      if (match?.[1]) {
        const candidate = simplifyPopulation(match[1]);
        if (candidate.length > 2) populationCandidates.push(candidate);
      }
    }

    if (/\bstudents?\b/i.test(normalized)) stakeholderLabels.push("Students");
    if (/\bteachers?|educators?\b/i.test(normalized)) stakeholderLabels.push("Teachers");
    if (/\bclass(?:es)?\b/i.test(normalized)) stakeholderLabels.push("Classrooms");

    if (/(enroll|recruit|admit)/i.test(normalized)) {
      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: [],
        stakeholderLabels: ["Students"],
      });
    }

    if (/(push into classrooms|deliver|offer|provide).*(lessons?|curriculum|sessions?)/i.test(normalized)) {
      const outputs: Array<{ text: string }> = [];
      const outputMatch = normalized.match(outputRegex);
      if (outputMatch?.[1]) {
        outputs.push({ text: outputMatch[1].trim() });
      }

      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs,
        stakeholderLabels: ["Students", "Classrooms"],
      });
    }

    if (/(\bgoal is to\b|\btarget\b).*(\d+\s+(?:lessons?|sessions?|classes?))/i.test(normalized)) {
      const outputMatch = normalized.match(outputRegex);
      const outputText = outputMatch?.[1]?.trim();

      if (
        outputText &&
        appendOutputToMatchingActivity(
          activities,
          outputText,
          (activity) =>
            activity.actions.some((action) => /(lessons?|sessions?|curriculum|classrooms?)/i.test(action))
        )
      ) {
        continue;
      }

      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: outputText ? [{ text: outputText }] : [],
        stakeholderLabels: ["Students", "Classrooms"],
      });
    }

    // Split compound outcome sentences at common conjunctions before classifying
    // so "X and Y" becomes two separate clauses that can land in different levels.
    const outcomeClauses = normalized
      .split(/\s+and\s+(?=(?:have|ideas?|knowledge|skills?|ability|sense|plans?|steps?)\b)/i)
      .map((c) => c.trim())
      .filter(Boolean);

    for (const clause of outcomeClauses) {
      // Short-term: knowledge / awareness changes
      if (/(clearer sense|awareness|knowledge|understand|options|ideas? about)/i.test(clause)) {
        addOutcome(shortOutcomes, clause, ["Students"]);
        continue;
      }

      // Medium-term: behavior / planning / skill changes
      if (/(prepare themselves|have ideas|plan|take steps|behavior|apply|develop skills)/i.test(clause)) {
        addOutcome(mediumOutcomes, clause, ["Students"]);
        continue;
      }

      // Long-term: condition / status changes — require employment/economic/life-condition words,
      // not just "career" (which appears in career-awareness sentences)
      if (/(employment|economic|self.suffic|stability|life condition|social mobility)/i.test(clause) && /(will|should)/i.test(clause)) {
        addOutcome(longOutcomes, clause, ["Students"]);
      }
    }
  }

  const dedupedStakeholders = dedupeStrings(stakeholderLabels).map(makeStakeholder);
  const dedupedActivities = activities.filter(
    (activity, index, arr) => {
      const key = (activity.actions[0] ?? activity.item).toLowerCase();
      return arr.findIndex((candidate) =>
        (candidate.actions[0] ?? candidate.item).toLowerCase() === key
      ) === index;
    }
  );

  const patch: Partial<LogicModel> = {};

  if (populationCandidates.length > 0) {
    const population = dedupeStrings(populationCandidates)[0];
    // Only extract population — never auto-generate compiled_statement or long_term_goal.
    // Those must come from the guided impact elicitation flow and explicit user confirmation.
    patch.intended_impact = {
      ...(patch.intended_impact ?? {}),
      population,
      geography: patch.intended_impact?.geography ?? "",
      long_term_goal: patch.intended_impact?.long_term_goal ?? "",
      compiled_statement: patch.intended_impact?.compiled_statement ?? "",
    };
  }

  if (dedupedStakeholders.length > 0) {
    patch.stakeholders = dedupedStakeholders;
  }

  if (dedupedActivities.length > 0) {
    patch.implementation = {
      ...(patch.implementation ?? {}),
      activities: dedupedActivities,
       resources: patch.implementation?.resources ?? { human: [], material: [], financial: [], knowledge: [] },
    };
  }

  if (shortOutcomes.length > 0 || mediumOutcomes.length > 0 || longOutcomes.length > 0) {
    patch.outcomes = {
      short_term: shortOutcomes,
      medium_term: mediumOutcomes,
      long_term: longOutcomes,
    };
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function mergeModelPatchPreferPrimary(
  primary: Partial<LogicModel> | null,
  fallback: Partial<LogicModel> | null
): Partial<LogicModel> | null {
  if (!primary) return fallback;
  if (!fallback) return primary;

  const merged: Partial<LogicModel> = { ...primary };

  if (fallback.intended_impact) {
    merged.intended_impact = {
      ...(fallback.intended_impact ?? {}),
      ...(merged.intended_impact ?? {}),
    };
  }

  if ((merged.stakeholders?.length ?? 0) === 0 && (fallback.stakeholders?.length ?? 0) > 0) {
    merged.stakeholders = fallback.stakeholders;
  }

  if (fallback.implementation) {
    merged.implementation ??= {} as LogicModel["implementation"];
    if (
      (merged.implementation.activities?.length ?? 0) === 0 &&
      (fallback.implementation.activities?.length ?? 0) > 0
    ) {
      merged.implementation.activities = fallback.implementation.activities;
    }
  }

  if (fallback.outcomes) {
    merged.outcomes ??= { short_term: [], medium_term: [], long_term: [] };

    if ((merged.outcomes.short_term?.length ?? 0) === 0 && fallback.outcomes.short_term?.length) {
      merged.outcomes.short_term = fallback.outcomes.short_term;
    }
    if ((merged.outcomes.medium_term?.length ?? 0) === 0 && fallback.outcomes.medium_term?.length) {
      merged.outcomes.medium_term = fallback.outcomes.medium_term;
    }
    if ((merged.outcomes.long_term?.length ?? 0) === 0 && fallback.outcomes.long_term?.length) {
      merged.outcomes.long_term = fallback.outcomes.long_term;
    }
  }

  return merged;
}

function normalizeMergedActivityPatch(
  patch: Partial<LogicModel> | null
): Partial<LogicModel> | null {
  const activities = patch?.implementation?.activities;
  if (!patch || !Array.isArray(activities) || activities.length === 0) {
    return patch;
  }

  const dosageRegex = /\b\d+\s+(?:lessons?|sessions?|classes?|participants?|students?)[^.,;]*/i;
  const deliveryRegex = /(push into classrooms|deliver|offer|provide).*(lessons?|curriculum|sessions?)|(lessons? throughout the year)/i;
  const dosageOnlyRegex = /(goal is to|target|aim is to).*(lessons?|sessions?|classes?)/i;

  const normalizedActivities: NonNullable<NonNullable<Partial<LogicModel>["implementation"]>["activities"]> = [];

  for (const activity of activities) {
    const actionTexts = Array.isArray(activity.actions) ? activity.actions : [];
    const outputs = Array.isArray(activity.outputs) ? [...activity.outputs] : [];
    const combinedText = [activity.item, ...actionTexts]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ")
      .toLowerCase();

    const explicitDosageOutput = outputs.find((output) => dosageRegex.test(output.text));
    const inferredDosageOutput = combinedText.match(dosageRegex)?.[0]?.trim();
    const dosageText = explicitDosageOutput?.text ?? inferredDosageOutput;

    if (dosageText && dosageOnlyRegex.test(combinedText)) {
      const deliveryActivity = [...normalizedActivities]
        .reverse()
        .find((candidate) => {
          const candidateText = [candidate.item, ...(candidate.actions ?? [])]
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .join(" ");
          return deliveryRegex.test(candidateText);
        });

      if (deliveryActivity) {
        deliveryActivity.outputs ??= [];
        if (!deliveryActivity.outputs.some((output) => output.text.toLowerCase() === dosageText.toLowerCase())) {
          deliveryActivity.outputs.push({ text: dosageText });
        }
        continue;
      }
    }

    normalizedActivities.push({
      ...activity,
      outputs,
    });
  }

  return {
    ...patch,
    implementation: {
      ...patch.implementation,
      activities: normalizedActivities,
       resources: patch.implementation?.resources ?? { human: [], material: [], financial: [], knowledge: [] },
    },
  };
}

async function extractModelPatchFallback({
  apiKey,
  history,
  userMessage,
  assistantReply,
}: {
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
  assistantReply: string;
}): Promise<Partial<LogicModel> | null> {
  const extractionPayload = {
    system_instruction: { parts: [{ text: PATCH_EXTRACTION_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              history,
              latest_user_message: userMessage,
              latest_assistant_reply: assistantReply,
            }),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  };

  const extractionRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extractionPayload),
    }
  );

  if (!extractionRes.ok) {
    return null;
  }

  const extractionData = await extractionRes.json();
  const extractionText: string =
    extractionData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!extractionText.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(extractionText) as Partial<LogicModel>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (Object.keys(parsed).length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration." },
      { status: 500 }
    );
  }

  // --- Input validation (OWASP: Improper Input Validation) ----------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { message, history, model } = body as { message?: unknown; history?: unknown; model?: unknown };

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message must be a non-empty string." }, { status: 400 });
  }

  // Limit message length to prevent abuse / runaway token costs
  if (message.length > 4000) {
    return NextResponse.json({ error: "message exceeds maximum length." }, { status: 400 });
  }

  if (!Array.isArray(history)) {
    return NextResponse.json({ error: "history must be an array." }, { status: 400 });
  }

  // Cap history depth to prevent token-stuffing attacks
  const safeHistory = (history as ChatMessage[])
    .slice(-40)
    .filter(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    );
  // -------------------------------------------------------------------------

  // Build Gemini contents array from chat history
  const contents = [
    ...safeHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    { role: "user", parts: [{ text: message.trim() }] },
  ];

  const geminiPayload = {
    system_instruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildModelStateContext(model)}` }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  };

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return NextResponse.json({ error: errText }, { status: geminiRes.status });
  }

  const geminiData = await geminiRes.json();
  const rawText: string =
    geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Split coaching reply from hidden JSON patch
  const patchMatch = rawText.match(/<model_patch>([\s\S]*?)<\/model_patch>/);
  let reply = rawText.replace(/<model_patch>[\s\S]*?<\/model_patch>/g, "").trim();

  let modelPatch: Partial<LogicModel> | null = null;
  if (patchMatch?.[1]) {
    try {
      modelPatch = JSON.parse(patchMatch[1].trim());
    } catch {
      // Malformed patch — ignore, don't crash
    }
  }

  // Fallback path: if the model did not emit <model_patch> tags,
  // run a strict extraction pass so the Logic Mirror still updates.
  if (!modelPatch) {
    modelPatch = await extractModelPatchFallback({
      apiKey,
      history: safeHistory,
      userMessage: message.trim(),
      assistantReply: reply,
    });
  }

  try {
    const heuristicPatch = buildHeuristicNarrativePatch(message.trim());
    modelPatch = mergeModelPatchPreferPrimary(modelPatch, heuristicPatch);
  } catch {
    // Heuristic extraction failed — proceed with AI patch only
  }

  modelPatch = normalizeMergedActivityPatch(modelPatch);

  // Guard: strip compiled_statement from the patch unless the user just confirmed an
  // impact statement (impact_post_confirm chip) OR the model already has one (refinement).
  // This prevents the extraction LLM and heuristics from prematurely populating the field.
  if (modelPatch?.intended_impact?.compiled_statement) {
    const existingStatement = (model as Partial<LogicModel> | null)?.intended_impact?.compiled_statement;
    const userConfirmed = classifyFlowFromUserMessage(message.trim()) === "impact_post_confirm";
    if (!existingStatement && !userConfirmed) {
      // Blank the prematurely generated statement; keep the field present to satisfy IntendedImpact type.
      modelPatch = { ...modelPatch, intended_impact: { ...modelPatch.intended_impact, compiled_statement: '' } };
    }
  }

  if (shouldRequestImpactSpecificity(modelPatch)) {
    if (modelPatch) {
      const { intended_impact: _omit, ...remainingPatch } = modelPatch;
      modelPatch = remainingPatch;
    }
    reply = `${reply}\n\nLet's make that impact statement more specific. What exact difference should we be able to point to in 10 years (for example: high school graduation, postsecondary persistence, stable employment, or reduced justice-system involvement)?`;
  }

  const quickReplies = detectQuickReplies(reply, message.trim());

  return NextResponse.json({ reply, modelPatch, quickReplies });
}

// ---------------------------------------------------------------------------
// Quick-reply detection — maps assistant question type to suggested responses
// ---------------------------------------------------------------------------

interface QuickReply {
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Model state context — injected into system prompt each turn so the bot
// always knows what has already been captured and avoids re-asking.
// ---------------------------------------------------------------------------
function buildModelStateContext(model: unknown): string {
  if (!model || typeof model !== "object") return "";
  const m = model as Partial<LogicModel>;
  const impact = m.intended_impact;
  const impl = m.implementation;
  const outcomes = m.outcomes;

  const lines: string[] = [
    "================================================================================",
    "CURRENT LOGIC MODEL STATE — do not re-ask for information already captured here",
    "================================================================================",
    `Population: ${impact?.population || "(not yet defined)"}`,
    `Geography: ${impact?.geography || "(not yet defined)"}`,
    `Long-term goal: ${impact?.long_term_goal || "(not yet defined)"}`,
    `Impact statement: ${impact?.compiled_statement || "(not yet defined)"}`,
  ];

  const activities = impl?.activities ?? [];
  lines.push(
    activities.length > 0
      ? `Activities: ${activities.map((a) => a.actions?.[0] ?? a.item).join("; ")}`
      : "Activities: (none yet)"
  );

  const shortCount = outcomes?.short_term?.length ?? 0;
  const midCount = outcomes?.medium_term?.length ?? 0;
  const longCount = outcomes?.long_term?.length ?? 0;
  lines.push(`Outcomes: ${shortCount} short-term, ${midCount} medium-term, ${longCount} long-term`);

  return lines.join("\n");
}

function shouldRequestImpactSpecificity(modelPatch: Partial<LogicModel> | null): boolean {
  const impact = modelPatch?.intended_impact;
  if (!impact) return false;

  const candidate = `${impact.compiled_statement ?? ""} ${impact.long_term_goal ?? ""}`.trim();
  if (!candidate) return false;

  const hasConcreteMarker = /(graduate|graduation|postsecondary|college|credential|employment|job|wage|income|housing|homeless|justice|incarcer|arrest|violence|safety|health|mental health|attendance|absenteeism|reading level|grade level)/i.test(
    candidate
  );

  const genericSignal = /(better outcomes|opportunity awareness|improved lives|better lives|positive change|thrive|successful futures|be successful|wellbeing|well-being|economic opportunities)/i.test(
    candidate
  );

  return genericSignal && !hasConcreteMarker;
}

function detectQuickReplies(reply: string, userMessage: string): QuickReply[] | undefined {
  // Primary: classify from the user's own message — chip values are controlled
  // strings so this is reliable and avoids cross-stage keyword collisions.
  const stateFromUser = classifyFlowFromUserMessage(userMessage);
  if (stateFromUser && stateFromUser !== "general") {
    const chips = getChipsForState(stateFromUser);
    return chips.length > 0 ? chips : undefined;
  }

  // Secondary: fall back to reply-text matching for free-text user turns.
  const stateFromReply = classifyFlowFromReply(reply);
  if (stateFromReply) {
    const chips = getChipsForState(stateFromReply);
    return chips.length > 0 ? chips : undefined;
  }

  return undefined;
}

// Maps known chip values (controlled strings) to named flow states.
function classifyFlowFromUserMessage(userMsg: string): FlowState | null {
  if (/walk me through what a long.term goal looks like/i.test(userMsg))
    return "impact_aspiration";

  if (/In 10 years, we want|want them to (have|live|achieve|be more connected)/i.test(userMsg))
    return "impact_nature_of_change";

  if (/It.s mainly (a shift|about what they|about their actual)|It.s a combination/i.test(userMsg))
    return "impact_specificity_probe";

  if (/Specifically, we expect/i.test(userMsg))
    return "impact_draft_review";

  if (/Yes, that captures it/i.test(userMsg))
    return "impact_post_confirm";

  if (/Can you make this impact statement more specific|Close, but I.d like to adjust the wording|Not quite — let me try/i.test(userMsg))
    return "impact_draft_review";

  if (/skip the long.term goal for now/i.test(userMsg))
    return "general";

  if (/We serve these neighborhoods|We serve youth across Philadelphia|We serve students in these schools|We haven.t defined the geography/i.test(userMsg))
    return "general";

  return null;
}

// Classifies the bot's reply text — used only when the user typed freely.
function classifyFlowFromReply(reply: string): FlowState | null {
  if (/(what do you want to be true|isn.t true today|want to be true about their lives)/i.test(reply))
    return "impact_aspiration";

  if (/(mainly about how they think|what they.re able to do|conditions of their life|employment.*housing.*health)/i.test(reply))
    return "impact_nature_of_change";

  if (/(to make this specific|what exact difference|be able to point to in 10 years|graduating high school|persisting in college)/i.test(reply))
    return "impact_specificity_probe";

  if (/(here.s a draft|draft.*intended impact|does that capture|capture.*intent)/i.test(reply))
    return "impact_draft_review";

  // General long-term intro — only if none of the guided steps matched.
  if (/(10 years|ten years|long.term goal|if.*succeed|what would be different|ultimate change|working to achieve)/i.test(reply))
    return "impact_intro";

  if (/(neighborhood|part of the city|citywide|region|borough|district|where.*operate|serve.*area)/i.test(reply) && /\?/.test(reply))
    return "geography";

  if (/(particular subset|specific group|background|circumstance|subgroup|who (exactly|specifically) (do you|does your))/i.test(reply))
    return "population_subgroup";

  if (/(resource|staff|volunteer|partner|funding|curriculum|technology|equipment|materials)/i.test(reply) && /(what|who|how|tell me|describe)/i.test(reply))
    return "resources";

  if (/(typical week|what does your team|what.*activities)/i.test(reply))
    return "activities";

  if (/(short.term|medium.term|what.*know|what.*doing differently|knowledge change|behavior change|condition change)/i.test(reply))
    return "outcomes";

  if (/(refine|which section|what.*next|anything.*add|look complete)/i.test(reply))
    return "section_refinement";

  return null;
}

type FlowState =
  | "impact_aspiration"
  | "impact_nature_of_change"
  | "impact_specificity_probe"
  | "impact_draft_review"
  | "impact_post_confirm"
  | "impact_intro"
  | "geography"
  | "population_subgroup"
  | "resources"
  | "activities"
  | "outcomes"
  | "section_refinement"
  | "general";

function getChipsForState(state: FlowState): QuickReply[] {
  const T: QuickReply = { label: "I want to type my own answer", value: "__type__" };

  switch (state) {
    case "impact_aspiration":
      return [
        { label: "HS graduation + postsecondary", value: "In 10 years, we want more of our students to graduate high school and persist in postsecondary education." },
        { label: "Career pathway + living-wage jobs", value: "In 10 years, we want more of our students to enter stable, living-wage career pathways." },
        { label: "Reduced justice involvement", value: "In 10 years, we want fewer of our students to be involved in the justice system and more to have safe, stable futures." },
        { label: "Stronger wellbeing and stability", value: "In 10 years, we want our students to have stronger wellbeing, supportive relationships, and stable life conditions." },
        T,
      ];
    case "impact_nature_of_change":
      return [
        { label: "How they think or feel", value: "It's mainly a shift in how they think or feel — mindset, confidence, sense of possibility." },
        { label: "What they're able to do", value: "It's mainly about what they're able to do — skills, behaviors, actions they take." },
        { label: "Their life circumstances", value: "It's mainly about their actual circumstances — employment, housing, health, safety." },
        { label: "All of these", value: "It's a combination — mindset, behavior, and real life conditions." },
        T,
      ];
    case "impact_specificity_probe":
      return [
        { label: "Education milestones", value: "Specifically, we expect more students to graduate high school on time and persist in college or credential programs." },
        { label: "Workforce milestones", value: "Specifically, we expect more students to secure stable employment with upward career mobility." },
        { label: "Safety and justice milestones", value: "Specifically, we expect lower justice-system involvement and stronger personal and community safety outcomes." },
        { label: "Wellbeing milestones", value: "Specifically, we expect stronger mental health, stable housing, and supportive long-term relationships." },
        T,
      ];
    case "impact_draft_review":
      return [
        { label: "That captures it", value: "Yes, that captures it." },
        { label: "Make it more specific", value: "Can you make this impact statement more specific and concrete?" },
        { label: "Adjust the wording", value: "Close, but I'd like to adjust the wording." },
        { label: "Not quite", value: "Not quite — let me try to describe it differently." },
        T,
      ];
    case "impact_intro":
      return [
        { label: "Walk me through it", value: "Can you walk me through what a long-term goal looks like for a program like ours?" },
        { label: "Skip for now", value: "Let's skip the long-term goal for now and come back to it." },
        T,
      ];
    case "geography":
      return [
        { label: "Name neighborhoods or ZIP codes", value: "We serve these neighborhoods/ZIP codes: " },
        { label: "Philadelphia citywide", value: "We serve youth across Philadelphia citywide." },
        { label: "Specific schools", value: "We serve students in these schools: " },
        { label: "Not sure yet", value: "We haven't defined the geography yet." },
        T,
      ];
    case "population_subgroup":
      return [
        { label: "No particular subgroup", value: "We serve the general population described — no specific subgroup." },
        { label: "Yes, a specific subgroup", value: "Yes, we focus on a specific subgroup." },
        { label: "Not sure yet", value: "We haven't defined a specific subgroup yet." },
        T,
      ];
    case "resources":
      return [
        { label: "Let me describe them", value: "I'll describe our key resources." },
        { label: "We have staff only", value: "Our main resource is paid staff." },
        { label: "Skip for now", value: "Let's skip resources for now." },
        T,
      ];
    case "activities":
      return [
        { label: "Let me describe them", value: "I'll walk through our main activities." },
        { label: "Skip for now", value: "Let's skip activities for now." },
        T,
      ];
    case "outcomes":
      return [
        { label: "Sounds right, move on", value: "The outcomes you've drafted look right — let's move on." },
        { label: "I want to refine them", value: "I'd like to refine the outcome statements." },
        { label: "Explain the levels", value: "Can you explain the difference between short, medium, and long-term outcomes?" },
        T,
      ];
    case "section_refinement":
      return [
        { label: "Activities", value: "I want to refine the activities section." },
        { label: "Outputs", value: "I want to refine the outputs section." },
        { label: "Outcomes", value: "I want to refine the outcomes section." },
        { label: "Resources", value: "I want to refine the resources section." },
        { label: "Looks good", value: "The model looks good to me." },
      ];
    default:
      return [];
  }
}

