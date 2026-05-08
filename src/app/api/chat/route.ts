import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/chat/prompt";
import {
  buildCompiledStatement as guardrailBuildCompiledStatement,
  hasConcreteImpactMarker as guardrailHasConcreteImpactMarker,
  inferNextRequiredIntent,
  isExplicitImpactAcceptance as guardrailIsExplicitImpactAcceptance,
  looksSpecificGeography as guardrailLooksSpecificGeography,
  looksSpecificPopulation as guardrailLooksSpecificPopulation,
} from "@/lib/chat/guardrails";
import {
  assertIntentWithLatestUserEvidence,
  buildContextCoverageSummary,
} from "@/lib/chat/agenticContext";
import { executeAgenticTurn } from "@/lib/agent/executeTurn";
import type { LogicModel } from "@/store/useLogicModelStore";
import type { ChatMessage } from "@/store/useLogicModelStore";

// ---------------------------------------------------------------------------
// System prompt — encodes all spec rules
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = buildSystemPrompt();
const CHAT_INTENT_DEBUG = process.env.DEBUG_CHAT_INTENT === "true";
const DEBUG_AGENTIC_CONTEXT = process.env.DEBUG_AGENTIC_CONTEXT === "true";
const ENABLE_RESPONSE_CHIPS = process.env.ENABLE_RESPONSE_CHIPS === "true";
const ENABLE_AGENTIC_TURN = process.env.ENABLE_AGENTIC_TURN === "true";
const AGENTIC_DUAL_RUN = process.env.AGENTIC_DUAL_RUN === "true";

const PATCH_EXTRACTION_PROMPT = `You are a strict JSON extraction engine.

Task:
- Read the latest user message and current model snapshot.
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
    "quality_fidelity": {
      "fidelity": ["string"],
      "quality": ["string"]
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
- Never infer user confirmation from assistant phrasing.
- If nothing changed, return {}.`;

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
  const geographyCandidates: string[] = [];
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
    /(?:for|with|to)\s+((?:k-?12|middle school|high school|elementary)\s+students?)/i,
    /\bto\s+([^.!?]*(?:students?|youth|young adults?|adults?|participants?))/i,
    /\b([0-9]{1,2}(?:st|nd|rd|th)\s+graders?)\b/i,
  ];

  const geographyRegexes = [
    /\b(?:in|across|throughout|within|at|serving)\s+((?:north|south|west|east|northeast|northwest|southeast|southwest)\s+philadelphia|philadelphia(?:,\s*pa)?|[a-z\s]+county|[a-z\s]+school\s+district|center\s+city|kensington|fishtown|germantown|south\s+philly|north\s+philly|west\s+philly|zip\s*\d{5}(?:-\d{4})?)/i,
    /\b(citywide|statewide|region(?:al)?|district-wide|neighborhood-level)\b/i,
    /\b(?:zip(?:\s+code)?\s*)?(\d{5}(?:-\d{4})?)\b/i,
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

    for (const rx of geographyRegexes) {
      const match = normalized.match(rx);
      if (match?.[1]) {
        const candidate = match[1].trim().replace(/[.,;:]+$/g, "");
        if (candidate.length > 1) geographyCandidates.push(candidate);
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
    patch.intended_impact = {
      ...(patch.intended_impact ?? {}),
      population,
       geography: patch.intended_impact?.geography ?? "",
       long_term_goal: patch.intended_impact?.long_term_goal ?? "",
       compiled_statement: patch.intended_impact?.compiled_statement ?? "",
};
  }

  if (geographyCandidates.length > 0) {
    const geography = dedupeStrings(geographyCandidates)[0];
    patch.intended_impact = {
      ...(patch.intended_impact ?? {}),
      population: patch.intended_impact?.population ?? "",
      geography,
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
       quality_fidelity: patch.implementation?.quality_fidelity ?? { fidelity: [], quality: [] },
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
       quality_fidelity: patch.implementation?.quality_fidelity ?? { fidelity: [], quality: [] },
},
  };
}

async function extractModelPatchFallback({
  apiKey,
  history,
  userMessage,
  modelSnapshot,
}: {
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
  modelSnapshot?: LogicModel;
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
              model_snapshot: modelSnapshot,
              latest_user_message: userMessage,
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

  const modelSnapshot = isLogicModelShape(model) ? model : undefined;

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

  let dualRunAgenticResult: Awaited<ReturnType<typeof executeAgenticTurn>> = null;
  if (!ENABLE_AGENTIC_TURN && AGENTIC_DUAL_RUN) {
    try {
      dualRunAgenticResult = await executeAgenticTurn({
        apiKey,
        userMessage: message.trim(),
        history: safeHistory,
        modelSnapshot,
      });
    } catch {
      dualRunAgenticResult = null;
    }
  }

  if (ENABLE_AGENTIC_TURN) {
    try {
      const agentic = await executeAgenticTurn({
        apiKey,
        userMessage: message.trim(),
        history: safeHistory,
        modelSnapshot,
      });

      if (agentic) {
        let modelPatch = agentic.modelPatch;

        // Agentic mode should preserve user-provided facts with the same resilience as legacy mode.
        if (!modelPatch) {
          modelPatch = await extractModelPatchFallback({
            apiKey,
            history: safeHistory,
            userMessage: message.trim(),
            modelSnapshot,
          });
        }

        try {
          const heuristicPatch = buildHeuristicNarrativePatch(message.trim());
          modelPatch = mergeModelPatchPreferPrimary(modelPatch, heuristicPatch);
        } catch {
          // Heuristic extraction failed — proceed with AI patch only
        }

        modelPatch = normalizeMergedActivityPatch(modelPatch);
        modelPatch = enforceCompiledStatementAcceptance(modelPatch, modelSnapshot, message.trim());

        let reply = agentic.reply;
        let questionIntent = normalizeQuestionIntent(agentic.questionIntent);

        if (shouldRequestImpactSpecificity(modelPatch)) {
          if (modelPatch) {
            const { intended_impact: _omit, ...remainingPatch } = modelPatch;
            modelPatch = remainingPatch;
          }
          reply = "Let's make that impact statement more specific. What exact long-term difference should we be able to point to in 10 years (for example, sustained school progression, credential completion, stable employment, stable housing, improved health, or reduced justice-system involvement)?";
          questionIntent = "impact_specificity";
        }

        const patchedSnapshot = applyPatchToSnapshot(modelSnapshot, modelPatch);

        if (shouldSkipPopulationFocusProbe(reply, message.trim(), patchedSnapshot)) {
          reply = "Thanks — that already sounds specific enough for who you reach.\n\nIf your program succeeds in 10 years, what concrete long-term change should we expect to see for that population?";
          questionIntent = "impact_aspiration";
        }

        const impactDraftReadiness = inferImpactDraftReadiness(
          modelSnapshot,
          safeHistory,
          message.trim()
        );

        if (!impactDraftReadiness.ready && shouldBlockImpactDraft(reply, questionIntent, modelPatch)) {
          if (modelPatch?.intended_impact) {
            const { intended_impact: _omit, ...remainingPatch } = modelPatch;
            modelPatch = remainingPatch;
          }

          questionIntent = impactDraftReadiness.missingIntent;
          reply = buildImpactMissingFollowUp(impactDraftReadiness.missingIntent);
        }

        const normalizedIntent = normalizeQuestionIntent(questionIntent);
        let stateIntent = inferIntentFromModelState(patchedSnapshot);
        stateIntent = assertIntentWithLatestUserEvidence(stateIntent, message.trim(), patchedSnapshot);
        const deterministic = enforceDeterministicPhaseQuestion(
          reply,
          normalizedIntent,
          stateIntent
        );

        const contextText = [
          ...safeHistory.map((msg) => msg.content),
          message.trim(),
          deterministic.reply,
        ].join("\n");

        const intentResolution = resolveQuickReplyIntent(
          deterministic.reply,
          deterministic.questionIntent
        );

        const quickReplies = ENABLE_RESPONSE_CHIPS
          ? detectQuickReplies(intentResolution.intent, contextText, message.trim())
          : undefined;

        if (DEBUG_AGENTIC_CONTEXT) {
          console.info("[agentic-context-coverage]", {
            mode: "agentic",
            summary: buildContextCoverageSummary(message.trim(), modelPatch),
          });
        }

        return NextResponse.json({
          reply: deterministic.reply,
          modelPatch,
          quickReplies,
        });
      }
    } catch {
      // Fall through to legacy pipeline when agentic mode fails.
    }
  }

  // Build Gemini contents array from chat history
  const impactDraftReadiness = inferImpactDraftReadiness(
    modelSnapshot,
    safeHistory,
    message.trim()
  );

  const modelContextText = modelSnapshot
    ? `\n\n[Current Logic Model Snapshot]\n${JSON.stringify(modelSnapshot)}`
    : "";

  const impactReadinessText = buildImpactReadinessInstruction(impactDraftReadiness);

  const contents = [
    ...safeHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    { role: "user", parts: [{ text: `${message.trim()}${modelContextText}${impactReadinessText}` }] },
  ];

  const geminiPayload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
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

  // Split coaching reply from hidden tags
  const intentMatch = rawText.match(/<question_intent>([\s\S]*?)<\/question_intent>/);
  const patchMatch = rawText.match(/<model_patch>([\s\S]*?)<\/model_patch>/);
  let questionIntent = normalizeQuestionIntent(intentMatch?.[1]);
  let reply = rawText
    .replace(/<question_intent>[\s\S]*?<\/question_intent>/g, "")
    .replace(/<model_patch>[\s\S]*?<\/model_patch>/g, "")
    .trim();

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
      modelSnapshot,
    });
  }

  try {
    const heuristicPatch = buildHeuristicNarrativePatch(message.trim());
    modelPatch = mergeModelPatchPreferPrimary(modelPatch, heuristicPatch);
  } catch {
    // Heuristic extraction failed — proceed with AI patch only
  }

  modelPatch = normalizeMergedActivityPatch(modelPatch);
  modelPatch = enforceCompiledStatementAcceptance(modelPatch, modelSnapshot, message.trim());

  if (shouldRequestImpactSpecificity(modelPatch)) {
    if (modelPatch) {
      const { intended_impact: _omit, ...remainingPatch } = modelPatch;
      modelPatch = remainingPatch;
    }
    reply = "Let's make that impact statement more specific. What exact long-term difference should we be able to point to in 10 years (for example, sustained school progression, credential completion, stable employment, stable housing, improved health, or reduced justice-system involvement)?";
    questionIntent = "impact_specificity";
  }

  const patchedSnapshot = applyPatchToSnapshot(modelSnapshot, modelPatch);

  if (shouldSkipPopulationFocusProbe(reply, message.trim(), patchedSnapshot)) {
    reply = "Thanks — that already sounds specific enough for who you reach.\n\nIf your program succeeds in 10 years, what concrete long-term change should we expect to see for that population?";
    questionIntent = "impact_aspiration";
  }

  if (!impactDraftReadiness.ready && shouldBlockImpactDraft(reply, questionIntent, modelPatch)) {
    if (modelPatch?.intended_impact) {
      const { intended_impact: _omit, ...remainingPatch } = modelPatch;
      modelPatch = remainingPatch;
    }

    questionIntent = impactDraftReadiness.missingIntent;
    reply = buildImpactMissingFollowUp(impactDraftReadiness.missingIntent);
  }

  let stateIntent = inferIntentFromModelState(patchedSnapshot);
  stateIntent = assertIntentWithLatestUserEvidence(stateIntent, message.trim(), patchedSnapshot);
  const deterministic = enforceDeterministicPhaseQuestion(reply, questionIntent, stateIntent);
  reply = deterministic.reply;
  questionIntent = deterministic.questionIntent;

  const contextText = [
    ...safeHistory.map((msg) => msg.content),
    message.trim(),
    reply,
  ].join("\n");

  const intentResolution = resolveQuickReplyIntent(reply, questionIntent);
  const quickReplies = ENABLE_RESPONSE_CHIPS
    ? detectQuickReplies(intentResolution.intent, contextText, message.trim())
    : undefined;

  if (DEBUG_AGENTIC_CONTEXT) {
    console.info("[agentic-context-coverage]", {
      mode: "legacy",
      summary: buildContextCoverageSummary(message.trim(), modelPatch),
    });
  }

  if (CHAT_INTENT_DEBUG) {
    console.info("[chat-intent]", {
      explicitIntent: questionIntent ?? null,
      stateIntent: stateIntent ?? null,
      fallbackIntent: intentResolution.fallbackIntent ?? null,
      chosenIntent: intentResolution.intent ?? null,
      source: intentResolution.source,
      quickReplyCount: quickReplies?.length ?? 0,
      responseChipsEnabled: ENABLE_RESPONSE_CHIPS,
      impactDraftReadiness,
    });

    if (AGENTIC_DUAL_RUN) {
      console.info("[agentic-dual-run]", {
        enabled: Boolean(dualRunAgenticResult),
        agenticReplyPreview: dualRunAgenticResult?.reply?.slice(0, 220) ?? null,
        legacyReplyPreview: reply.slice(0, 220),
        agenticIntent: dualRunAgenticResult?.questionIntent ?? null,
        legacyIntent: questionIntent ?? null,
      });
    }
  }

  return NextResponse.json({ reply, modelPatch, quickReplies });
}

// ---------------------------------------------------------------------------
// Quick-reply detection — maps assistant question type to suggested responses
// ---------------------------------------------------------------------------

interface QuickReply {
  label: string;
  value: string;
  action?: "send" | "open-input" | "prefill";
}

type QuestionIntent =
  | "impact_aspiration"
  | "impact_change_type"
  | "impact_specificity"
  | "impact_review"
  | "long_term_help"
  | "geography"
  | "population_focus"
  | "resources"
  | "activities"
  | "outputs_metrics"
  | "quality_evidence"
  | "outcomes_review"
  | "section_refine";

type ParsedQuestionIntent = QuestionIntent | "none";

function normalizeQuestionIntent(raw: string | undefined): ParsedQuestionIntent | undefined {
  const normalized = raw?.trim().toLowerCase();
  switch (normalized) {
    case "impact_aspiration":
    case "impact_change_type":
    case "impact_specificity":
    case "impact_review":
    case "long_term_help":
    case "geography":
    case "population_focus":
    case "resources":
    case "activities":
    case "outputs_metrics":
    case "quality_evidence":
    case "outcomes_review":
    case "section_refine":
    case "none":
      return normalized;
    default:
      return undefined;
  }
}

function getQuestionFocusText(reply: string): { text: string; hasQuestion: boolean } {
  const normalized = reply.trim();
  if (!normalized) return { text: "", hasQuestion: false };

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const paragraph = paragraphs[index];
    if (!paragraph.includes("?")) continue;

    const questionMatches = paragraph.match(/[^?]*\?/g);
    if (questionMatches && questionMatches.length > 0) {
      return {
        text: questionMatches[questionMatches.length - 1].trim(),
        hasQuestion: true,
      };
    }
  }

  return { text: paragraphs[paragraphs.length - 1] ?? "", hasQuestion: false };
}

const INTENT_QUESTION_PATTERNS: Record<QuestionIntent, RegExp[]> = {
  impact_aspiration: [
    /(in\s+10\s+years|ten\s+years|want\s+to\s+be\s+true|ultimate\s+change|what\s+would\s+be\s+different)/i,
  ],
  impact_change_type: [
    /(mainly\s+about\s+how\s+they\s+think|think\s+or\s+feel|what\s+they(?:'|’)re\s+able\s+to\s+do|actual\s+conditions\s+of\s+their\s+life|employment,?\s+housing,?\s+or\s+health)/i,
  ],
  impact_specificity: [
    /(to\s+make\s+this\s+specific|what\s+exact\s+difference|point\s+to\s+in\s+10\s+years|graduat|persist|stable\s+employment|justice-system)/i,
  ],
  impact_review: [
    /(does\s+that\s+capture|does\s+this\s+capture|better\s+capture|capture\s+your\s+(?:intent|goal|ultimate\s+goal)|is\s+this\s+(?:right|accurate)|revise\s+the\s+impact\s+statement|adjust\s+the\s+wording|does\s+this\s+statement\s+capture|does\s+this\s+resonate|does\s+this\s+reflect|does\s+it\s+capture|desired\s+long-term\s+impact)/i,
  ],
  long_term_help: [
    /(walk\s+me\s+through|what\s+a\s+long-term\s+goal\s+looks\s+like|help\s+me\s+develop\s+.*long-term)/i,
  ],
  geography: [
    /(where\s+do\s+you\s+serve|which\s+neighborhood|citywide|zip\s+codes?|geograph)/i,
  ],
  population_focus: [
    /(particular\s+subset|specific\s+group|who\s+exactly\s+do\s+you\s+serve|which\s+students\s+specifically)/i,
  ],
  resources: [
    /(key\s+resources|staff,?\s+volunteers?,?\s+partners?|funding|technology|equipment|inputs)/i,
  ],
  activities: [
    /(typical\s+week|what\s+does\s+your\s+team\s+actually\s+do|core\s+activities)/i,
  ],
  outputs_metrics: [
    /(how\s+would\s+you\s+count|unit\s+of\s+measure|participants|sessions|attendance|hours\s+of\s+service|outputs?)/i,
  ],
  quality_evidence: [
    /(quality|fidelity|satisfaction|retention|how\s+well\s+implemented)/i,
  ],
  outcomes_review: [
    /(short-term|medium-term|long-term|what\s+should\s+they\s+know|doing\s+differently|condition\s+change)/i,
  ],
  section_refine: [
    /(which\s+section\s+.*work\s+on|what\s+should\s+we\s+work\s+on\s+next|which\s+part\s+to\s+refine|look\s+complete)/i,
  ],
};

function isIntentCompatibleWithQuestion(intent: QuestionIntent, questionText: string): boolean {
  const patterns = INTENT_QUESTION_PATTERNS[intent];
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => pattern.test(questionText));
}

const POPULATION_FOCUS_PROBE_REGEX =
  /(particular subset|specific group|particular group|subgroup|specific schools|backgrounds?|circumstances?|confirm who you reach)/i;

function looksSpecificPopulation(text: string): boolean {
  return guardrailLooksSpecificPopulation(text);
}

function looksSpecificGeography(text: string): boolean {
  return guardrailLooksSpecificGeography(text);
}

function shouldSkipPopulationFocusProbe(
  reply: string,
  userMessage: string,
  modelSnapshot?: LogicModel
): boolean {
  if (!POPULATION_FOCUS_PROBE_REGEX.test(reply)) return false;

  const userSpecific = looksSpecificPopulation(userMessage) && looksSpecificGeography(userMessage);
  if (userSpecific) return true;

  if (!modelSnapshot) return false;
  const population = modelSnapshot.intended_impact.population ?? "";
  const geography = modelSnapshot.intended_impact.geography ?? "";

  return looksSpecificPopulation(population) && looksSpecificGeography(geography);
}

function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

interface ImpactDraftReadiness {
  ready: boolean;
  populationKnown: boolean;
  geographyKnown: boolean;
  concreteOutcomeKnown: boolean;
  missingIntent?: QuestionIntent;
}

function hasConcreteImpactMarker(text: string): boolean {
  return guardrailHasConcreteImpactMarker(text);
}

function inferImpactDraftReadiness(
  modelSnapshot: LogicModel | undefined,
  safeHistory: ChatMessage[],
  latestUserMessage: string
): ImpactDraftReadiness {
  const latestMessage = latestUserMessage.trim();
  const historyUserText = safeHistory
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");

  const contextText = `${historyUserText}\n${latestMessage}`;
  const modelPopulation = modelSnapshot?.intended_impact.population ?? "";
  const modelGeography = modelSnapshot?.intended_impact.geography ?? "";
  const modelOutcome = `${modelSnapshot?.intended_impact.long_term_goal ?? ""} ${
    modelSnapshot?.intended_impact.compiled_statement ?? ""
  }`;

  const populationKnown =
    (isNonEmpty(modelPopulation) && looksSpecificPopulation(modelPopulation)) ||
    looksSpecificPopulation(contextText);
  const geographyKnown =
    (isNonEmpty(modelGeography) && looksSpecificGeography(modelGeography)) ||
    looksSpecificGeography(contextText);
  const concreteOutcomeKnown =
    hasConcreteImpactMarker(modelOutcome) || hasConcreteImpactMarker(contextText);

  const ready = populationKnown && geographyKnown && concreteOutcomeKnown;

  if (ready) {
    return { ready, populationKnown, geographyKnown, concreteOutcomeKnown };
  }

  const missingIntent = !populationKnown
    ? "population_focus"
    : !geographyKnown
      ? "geography"
      : "impact_specificity";

  return {
    ready,
    populationKnown,
    geographyKnown,
    concreteOutcomeKnown,
    missingIntent,
  };
}

function buildImpactReadinessInstruction(readiness: ImpactDraftReadiness): string {
  if (readiness.ready) {
    return `\n\n[Impact Draft Readiness]\nready: yes\nYou may propose a one-sentence draft intended impact statement, then confirm it with the user.`;
  }

  const missing = [];
  if (!readiness.populationKnown) missing.push("specific population");
  if (!readiness.geographyKnown) missing.push("specific geography");
  if (!readiness.concreteOutcomeKnown) missing.push("concrete long-term marker");

  return `\n\n[Impact Draft Readiness]\nready: no\nmissing: ${missing.join(", ")}\nDo NOT draft an intended impact statement yet. Ask one focused follow-up question only for the next missing item.`;
}

function shouldBlockImpactDraft(
  reply: string,
  questionIntent: ParsedQuestionIntent | undefined,
  modelPatch: Partial<LogicModel> | null
): boolean {
  if (questionIntent === "impact_review") return true;
  if (modelPatch?.intended_impact && Object.keys(modelPatch.intended_impact).length > 0) return true;

  return /(draft\s+(?:intended\s+)?impact|does\s+that\s+capture|capture\s+your\s+intent|revise\s+the\s+impact\s+statement)/i.test(
    reply
  );
}

function buildImpactMissingFollowUp(missingIntent: QuestionIntent | undefined): string {
  switch (missingIntent) {
    case "population_focus":
      return "Before I draft an impact statement, who exactly is the primary population you serve?";
    case "geography":
      return "Before I draft an impact statement, what specific geography should we anchor it to (for example, citywide, neighborhoods, or specific schools)?";
    case "impact_specificity":
    default:
      return "Before I draft an impact statement, what exact long-term difference should we be able to point to in 10 years (for example: sustained school progression, credential completion, stable employment, stable housing, improved health, or reduced justice-system involvement)?";
  }
}

function isExplicitImpactAcceptance(text: string): boolean {
  return guardrailIsExplicitImpactAcceptance(text);
}

function buildCompiledStatement(population: string, geography: string, longTermGoal: string): string | undefined {
  return guardrailBuildCompiledStatement(population, geography, longTermGoal);
}

function enforceCompiledStatementAcceptance(
  modelPatch: Partial<LogicModel> | null,
  modelSnapshot: LogicModel | undefined,
  latestUserMessage: string
): Partial<LogicModel> | null {
  if (!modelPatch?.intended_impact) return modelPatch;

  const accepted = isExplicitImpactAcceptance(latestUserMessage);
  if (!accepted) {
    if ("compiled_statement" in modelPatch.intended_impact) {
      modelPatch.intended_impact.compiled_statement = "";
    }
    if (Object.keys(modelPatch.intended_impact).length === 0) {
      delete modelPatch.intended_impact;
    }
    return modelPatch;
  }

  if (modelPatch.intended_impact.compiled_statement?.trim()) {
    return modelPatch;
  }

  const population =
    modelPatch.intended_impact.population ?? modelSnapshot?.intended_impact.population ?? "";
  const geography =
    modelPatch.intended_impact.geography ?? modelSnapshot?.intended_impact.geography ?? "";
  const longTermGoal =
    modelPatch.intended_impact.long_term_goal ?? modelSnapshot?.intended_impact.long_term_goal ?? "";

  const compiled = buildCompiledStatement(population, geography, longTermGoal);
  if (compiled) {
    modelPatch.intended_impact.compiled_statement = compiled;
  }

  return modelPatch;
}

function isLogicModelShape(value: unknown): value is LogicModel {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;

  const intended = v.intended_impact as Record<string, unknown> | undefined;
  const implementation = v.implementation as Record<string, unknown> | undefined;
  const outcomes = v.outcomes as Record<string, unknown> | undefined;

  if (!intended || !implementation || !outcomes) return false;
  if (!Array.isArray(v.stakeholders)) return false;

  const resources = implementation.resources as Record<string, unknown> | undefined;
  const activities = implementation.activities;
  if (!resources || !Array.isArray(activities)) return false;

  return (
    typeof intended.population === "string" &&
    typeof intended.geography === "string" &&
    typeof intended.long_term_goal === "string" &&
    typeof intended.compiled_statement === "string" &&
    Array.isArray(resources.human) &&
    Array.isArray(resources.material) &&
    Array.isArray(resources.financial) &&
    Array.isArray(resources.knowledge) &&
    Array.isArray(outcomes.short_term) &&
    Array.isArray(outcomes.medium_term) &&
    Array.isArray(outcomes.long_term)
  );
}

function inferIntentFromModelState(
  model: LogicModel | undefined
): ReturnType<typeof inferNextRequiredIntent> {
  return inferNextRequiredIntent(model);
}

/**
 * Returns a new model snapshot with the patch applied so that
 * `inferIntentFromModelState` sees this turn's extracted data rather than
 * the stale client-sent snapshot. This prevents the bot from re-asking a
 * question the user just answered in the same turn.
 */
function applyPatchToSnapshot(
  snapshot: LogicModel | undefined,
  patch: Partial<LogicModel> | null
): LogicModel | undefined {
  if (!snapshot || !patch) return snapshot;
  return {
    ...snapshot,
    intended_impact: patch.intended_impact
      ? { ...snapshot.intended_impact, ...patch.intended_impact }
      : snapshot.intended_impact,
    stakeholders: patch.stakeholders ?? snapshot.stakeholders,
    implementation: patch.implementation
      ? { ...snapshot.implementation, ...patch.implementation }
      : snapshot.implementation,
    outcomes: patch.outcomes
      ? { ...snapshot.outcomes, ...patch.outcomes }
      : snapshot.outcomes,
  };
}

function buildCanonicalQuestionForIntent(intent: QuestionIntent): string | undefined {
  switch (intent) {
    case "population_focus":
      return "Who exactly is the primary population your program serves?";
    case "geography":
      return "What specific geography should anchor this logic model (for example, citywide, neighborhoods, or specific sites)?";
    case "impact_specificity":
      return "If your program succeeds in 10 years, what concrete long-term change should we expect to see for that population?";
    case "resources":
      return "What are the key resources needed to run this program (people, materials, funding, and expertise)?";
    case "activities":
      return "What are the main activity categories your team delivers in a typical cycle?";
    case "outputs_metrics":
      return "How will you count whether those activities happened (for example participants reached, sessions delivered, or hours)?";
    case "outcomes_review":
      return "What is one short-term knowledge change, one medium-term behavior change, and one long-term condition change you expect?";
    case "quality_evidence":
      return "How will you track implementation fidelity and delivery quality as activities are delivered?";
    case "section_refine":
      return "Which section would you like to refine next: impact, resources, activities, outputs, or outcomes?";
    default:
      return undefined;
  }
}

function enforceDeterministicPhaseQuestion(
  reply: string,
  questionIntent: ParsedQuestionIntent | undefined,
  stateIntent: QuestionIntent | undefined
): { reply: string; questionIntent: ParsedQuestionIntent | undefined } {
  if (!stateIntent) {
    return { reply, questionIntent };
  }

  const canonicalQuestion = buildCanonicalQuestionForIntent(stateIntent);
  if (!canonicalQuestion) {
    return { reply, questionIntent };
  }

  const focus = getQuestionFocusText(reply);
  const explicitCompatible =
    questionIntent && questionIntent !== "none"
      ? isIntentCompatibleWithQuestion(questionIntent, focus.text)
      : false;

  if (focus.hasQuestion && explicitCompatible && questionIntent === stateIntent) {
    return { reply, questionIntent };
  }

  return {
    reply: canonicalQuestion,
    questionIntent: stateIntent,
  };
}

function shouldRequestImpactSpecificity(modelPatch: Partial<LogicModel> | null): boolean {
  const impact = modelPatch?.intended_impact;
  if (!impact) return false;

  const candidate = `${impact.compiled_statement ?? ""} ${impact.long_term_goal ?? ""}`.trim();
  if (!candidate) return false;

  const hasConcreteMarker = hasConcreteImpactMarker(candidate);

  const genericSignal = /(better outcomes|opportunity awareness|improved lives|better lives|positive change|thrive|successful futures|be successful|wellbeing|well-being|economic opportunities)/i.test(
    candidate
  );

  return genericSignal && !hasConcreteMarker;
}

function getQuickRepliesForIntent(intent: QuestionIntent): QuickReply[] | undefined {
  const ALWAYS_TYPE: QuickReply = {
    label: "I want to type my own answer",
    value: "__type__",
    action: "open-input",
  };

  switch (intent) {
    case "impact_aspiration":
      return [
        { label: "HS graduation + postsecondary", value: "In 10 years, we want more of our students to graduate high school and persist in postsecondary education." },
        { label: "Career pathway + living-wage jobs", value: "In 10 years, we want more of our students to enter stable, living-wage career pathways." },
        { label: "Reduced justice involvement", value: "In 10 years, we want fewer of our students to be involved in the justice system and more to have safe, stable futures." },
        { label: "Stronger wellbeing and stability", value: "In 10 years, we want our students to have stronger wellbeing, supportive relationships, and stable life conditions." },
        ALWAYS_TYPE,
      ];
    case "impact_change_type":
      return [
        { label: "How they think or feel", value: "It's mainly a shift in how they think or feel — mindset, confidence, sense of possibility." },
        { label: "What they're able to do", value: "It's mainly about what they're able to do — skills, behaviors, actions they take." },
        { label: "Their life circumstances", value: "It's mainly about their actual circumstances — employment, housing, health, safety." },
        { label: "All of these", value: "It's a combination — mindset, behavior, and real life conditions." },
        ALWAYS_TYPE,
      ];
    case "impact_specificity":
      return [
        { label: "Regular attendance", value: "Specifically, we expect more participants to attend school consistently and stay engaged over time." },
        { label: "On-time school progress", value: "Specifically, we expect more participants to progress through school on time and avoid repeating grades." },
        { label: "Stable wellbeing", value: "Specifically, we expect more participants to experience stronger mental health, stable housing, and supportive long-term relationships." },
        { label: "Reduced justice involvement", value: "Specifically, we expect fewer participants to be involved in the justice system and more to experience lasting safety and stability." },
        { label: "Name a different marker", value: "A more concrete long-term marker we want to see is ...", action: "prefill" },
        ALWAYS_TYPE,
      ];
    case "impact_review":
      return [
        { label: "That captures it", value: "Yes, that captures it." },
        { label: "Make it more specific", value: "Can you make this impact statement more specific and concrete?" },
        { label: "Adjust the wording", value: "I'd revise the impact statement this way: ", action: "prefill" },
        { label: "Not quite", value: "Not quite — here's what we're aiming for instead: ", action: "prefill" },
        ALWAYS_TYPE,
      ];
    case "long_term_help":
      return [
        { label: "Walk me through it", value: "Can you walk me through what a long-term goal looks like for a program like ours?" },
        { label: "Skip for now", value: "Let's skip the long-term goal for now and come back to it." },
        ALWAYS_TYPE,
      ];
    case "geography":
      return [
        { label: "Name neighborhoods or ZIP codes", value: "We serve these neighborhoods/ZIP codes: ", action: "prefill" },
        { label: "Philadelphia citywide", value: "We serve youth across Philadelphia citywide." },
        { label: "Specific schools", value: "We serve students in these schools: ", action: "prefill" },
        { label: "Not sure yet", value: "We haven't defined the geography yet." },
        ALWAYS_TYPE,
      ];
    case "population_focus":
      return [
        { label: "All students in that population", value: "We serve the general student population described — no narrower focus group." },
        { label: "A particular group of students", value: "We focus especially on students who ...", action: "prefill" },
        { label: "Not sure yet", value: "We haven't defined a particular group yet." },
        ALWAYS_TYPE,
      ];
    case "resources":
      return [
        { label: "Let me describe them", value: "Our key resources include ...", action: "prefill" },
        { label: "We have staff only", value: "Our main resource is paid staff." },
        { label: "Skip for now", value: "Let's skip resources for now." },
        ALWAYS_TYPE,
      ];
    case "activities":
      return [
        { label: "Let me describe them", value: "Our team mainly ...", action: "prefill" },
        { label: "Skip for now", value: "Let's skip activities for now." },
        ALWAYS_TYPE,
      ];
    case "outputs_metrics":
      return [
        { label: "# of Participants", value: "We will track number of participants reached." },
        { label: "# of Sessions", value: "We will track number of sessions delivered." },
        { label: "Attendance Rate", value: "We will track attendance rate over time." },
        { label: "Hours of Service", value: "We will track total hours of service delivered." },
        { label: "Add another output metric", value: "Additional output metrics to track: ", action: "prefill" },
        ALWAYS_TYPE,
      ];
    case "quality_evidence":
      return [
        { label: "Satisfaction Surveys", value: "We will use satisfaction surveys to assess program quality." },
        { label: "Post-program Interviews", value: "We will use post-program interviews to assess program quality." },
        { label: "Retention Rate", value: "We will monitor retention rate as a quality signal." },
        { label: "Implementation Fidelity", value: "We will monitor implementation fidelity to core program components." },
        { label: "Add another quality measure", value: "Additional quality/fidelity measures: ", action: "prefill" },
        ALWAYS_TYPE,
      ];
    case "outcomes_review":
      return [
        { label: "Sounds right, move on", value: "The outcomes you've drafted look right — let's move on." },
        { label: "I want to refine them", value: "I'd like to refine these outcomes: ", action: "prefill" },
        { label: "Explain the levels", value: "Can you explain the difference between short, medium, and long-term outcomes?" },
        ALWAYS_TYPE,
      ];
    case "section_refine":
      return [
        { label: "Activities", value: "I want to refine the activities section." },
        { label: "Outputs", value: "I want to refine the outputs section." },
        { label: "Outcomes", value: "I want to refine the outcomes section." },
        { label: "Resources", value: "I want to refine the resources section." },
        { label: "Looks good", value: "The model looks good to me." },
        ALWAYS_TYPE,
      ];
    default:
      return undefined;
  }
}

function ensureTypeQuickReply(replies: QuickReply[]): QuickReply[] {
  const hasTypeReply = replies.some(
    (reply) => reply.value === "__type__" || reply.action === "open-input"
  );

  if (hasTypeReply) {
    return replies;
  }

  return [
    ...replies,
    {
      label: "I want to type my own answer",
      value: "__type__",
      action: "open-input",
    },
  ];
}

function detectQuickReplyIntent(reply: string): QuestionIntent | undefined {
  if (/(work on|refine|improve|tighten|revise|edit).*(impact statement|intended impact)|(impact statement|intended impact).*(refine|improve|tighten|revise|edit|wording|better capture)|does\s+this\s+statement\s+better\s+capture/i.test(reply)) {
    return "impact_review";
  }

  if (/(what do you want to be true|isn't true today|want to be true about their lives)/i.test(reply)) {
    return "impact_aspiration";
  }

  if (/(mainly about how they think|what they.re able to do|conditions of their life|employment.*housing.*health)/i.test(reply)) {
    return "impact_change_type";
  }

  if (/(to make this specific|what exact difference|be able to point to in 10 years|graduating high school|persisting in college|reduced justice-system involvement)/i.test(reply)) {
    return "impact_specificity";
  }

  if (/(here.s a draft|draft.*intended impact|does that capture|capture.*intent)/i.test(reply)) {
    return "impact_review";
  }

  if (/(10 years|ten years|long.term goal|if.*succeed|what would be different|ultimate change|working to achieve)/i.test(reply)) {
    return "long_term_help";
  }

  if (/(neighborhood|part of the city|citywide|region|borough|district|where.*operate|serve.*area)/i.test(reply) && /\?/.test(reply)) {
    return "geography";
  }

  if (/(particular subset|specific group|particular group|background|circumstance|subgroup|who (exactly|specifically) (do you|does your)|what makes this group)/i.test(reply) && /\?/.test(reply)) {
    return "population_focus";
  }

  if (/(typical week|what does your team|what.*activities|walk me through)/i.test(reply)) {
    return "activities";
  }

  if (/(how would you count|unit of measure|participants|sessions|materials|outputs?|track.*deliver|attendance|hours of service)/i.test(reply)) {
    return "outputs_metrics";
  }

  if (/(program quality|fidelity|satisfaction|interviews?|retention|how well implemented|quality measures)/i.test(reply)) {
    return "quality_evidence";
  }

  if (/(resource|staff|volunteer|partner|funding|curriculum|technology|equipment|inputs?)/i.test(reply) && /(what|who|how|tell me|describe)/i.test(reply)) {
    return "resources";
  }

  if (/(short.term|medium.term|what.*know|what.*doing differently|knowledge change|behavior change|condition change|what.*expect)/i.test(reply)) {
    return "outcomes_review";
  }

  if (/(refine|which section|what.*next|anything.*add|look complete)/i.test(reply)) {
    return "section_refine";
  }

  return undefined;
}

function inferPopulationStage(
  contextText: string
): "elementary" | "secondary" | "adult" | undefined {
  if (/(k\s*[-–]?\s*(?:5|5th)|k\s*(?:through|to)\s*5|k-5th\s+grade|elementary|grades?\s*k\s*[-–]?\s*5|5-11\s+years?\s+old|children|kids)/i.test(contextText)) {
    return "elementary";
  }

  if (/(middle\s+school|high\s+school|teen|teens|adolescent|grades?\s*6\s*[-–]?\s*12|young\s+adults?)/i.test(contextText)) {
    return "secondary";
  }

  if (/(adult|adults|parents|caregivers|families|workers|employees)/i.test(contextText)) {
    return "adult";
  }

  return undefined;
}

function hasLiteracyCue(contextText: string): boolean {
  return /(literacy|reading|read\s+on\s+grade\s+level|grade-level\s+literacy|reading\s+on\s+grade\s+level|stay\s+on\s+track\s+in\s+school)/i.test(
    contextText
  );
}

function mergeQuickReplySets(baseReplies: QuickReply[], injected: QuickReply[]): QuickReply[] {
  if (injected.length === 0) {
    return baseReplies;
  }

  const typeReplies = baseReplies.filter(
    (reply) => reply.value === "__type__" || reply.action === "open-input"
  );
  const standardReplies = baseReplies.filter(
    (reply) => reply.value !== "__type__" && reply.action !== "open-input"
  );

  const seen = new Set<string>();
  const merged: QuickReply[] = [];

  for (const reply of [...injected, ...standardReplies]) {
    const key = `${reply.label}::${reply.value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(reply);
  }

  return [...merged, ...typeReplies];
}

function injectContextualQuickReplies(
  intent: QuestionIntent,
  baseReplies: QuickReply[],
  contextText: string,
  latestUserMessage: string
): QuickReply[] {
  const context = contextText.toLowerCase();
  const stage = inferPopulationStage(contextText);
  const latestUser = latestUserMessage.toLowerCase();
  const injected: QuickReply[] = [];

  if (intent === "impact_aspiration") {
    if (hasLiteracyCue(contextText)) {
      injected.push(
        {
          label: "Read on grade level",
          value: "In 10 years, we want more of our students to read on grade level and stay on track academically.",
        },
        {
          label: "Stay on track through school",
          value: "In 10 years, we want more of our students to stay on track through school and remain positioned to graduate.",
        }
      );
    }

    if (
      stage === "elementary" &&
      !/(career|workforce|employment|job|jobs|living-wage|wage)/i.test(latestUser)
    ) {
      const filtered = baseReplies.filter(
        (reply) => reply.label !== "Career pathway + living-wage jobs"
      );
      return mergeQuickReplySets(filtered, injected);
    }
  }

  if (intent === "impact_specificity") {
    if (stage === "elementary") {
      injected.push(
        {
          label: "Reading/math at grade level",
          value: "Specifically, we expect more students to read and do math at grade level.",
        },
        {
          label: "Strong attendance habits",
          value: "Specifically, we expect more students to attend school regularly and stay engaged in class.",
        }
      );
    } else if (stage === "secondary" || /(postsecondary|college|career|workforce)/i.test(context)) {
      injected.push(
        {
          label: "HS graduation",
          value: "Specifically, we expect more students to graduate high school on time.",
        },
        {
          label: "Postsecondary persistence",
          value: "Specifically, we expect more students to persist in college or credential programs.",
        },
        {
          label: "Stable employment",
          value: "Specifically, we expect more participants to secure stable employment with upward career mobility.",
        }
      );
    }
  }

  if (intent === "geography") {
    if (/(geocod|parcel|site|land development|watershed)/i.test(context)) {
      injected.push({ label: "Site-specific", value: "Our program is site-specific." });
      injected.push({ label: "Regional watershed", value: "Our program operates across a regional watershed." });
    }
  }

  if (intent === "resources") {
    if (/(contractor|consultant)/i.test(context)) {
      injected.push({ label: "External consultants", value: "We rely on external consultants." });
    }
    if (/(ai|llm|api|python|etl|data pipeline|dashboard|technical)/i.test(context)) {
      injected.push({ label: "Technical leads", value: "Technical leads are a key human resource." });
      injected.push({ label: "API credits", value: "API credits are a required material/financial resource." });
    }
  }

  if (intent === "outputs_metrics" && /(dashboard|analytics|engagement|product usage)/i.test(context)) {
    injected.push({ label: "User engagement metrics", value: "We will track user engagement metrics." });
    injected.push({ label: "Data refresh frequency", value: "We will track data refresh frequency." });
  }

  if (intent === "quality_evidence" && /(logic model|framework fidelity|implementation model)/i.test(context)) {
    injected.push({ label: "Framework fidelity", value: "We will monitor fidelity to our logic model framework." });
  }

  return mergeQuickReplySets(baseReplies, injected);
}

function resolveQuickReplyIntent(
  reply: string,
  explicitIntent?: ParsedQuestionIntent
): {
  intent?: QuestionIntent;
  fallbackIntent?: QuestionIntent;
  source:
    | "explicit"
    | "explicit-none"
    | "forced-review"
    | "fallback"
    | "fallback-overrode-explicit"
    | "suppressed-mismatch"
    | "none";
} {
  if (explicitIntent === "none") {
    return { intent: undefined, fallbackIntent: undefined, source: "explicit-none" };
  }

  const questionFocus = getQuestionFocusText(reply);
  const fallbackIntent = detectQuickReplyIntent(questionFocus.text);

  if (!questionFocus.hasQuestion) {
    return {
      intent: undefined,
      fallbackIntent,
      source: "none",
    };
  }

  if (isIntentCompatibleWithQuestion("impact_review", questionFocus.text)) {
    return {
      intent: "impact_review",
      fallbackIntent,
      source: "forced-review",
    };
  }

  const explicitCompatible = explicitIntent
    ? isIntentCompatibleWithQuestion(explicitIntent, questionFocus.text)
    : false;

  if (explicitIntent && explicitCompatible) {
    return { intent: explicitIntent, fallbackIntent, source: "explicit" };
  }

  if (explicitIntent && !explicitCompatible) {
    if (fallbackIntent && isIntentCompatibleWithQuestion(fallbackIntent, questionFocus.text)) {
      return {
        intent: fallbackIntent,
        fallbackIntent,
        source: "fallback-overrode-explicit",
      };
    }

    return {
      intent: undefined,
      fallbackIntent,
      source: "suppressed-mismatch",
    };
  }

  if (fallbackIntent && isIntentCompatibleWithQuestion(fallbackIntent, questionFocus.text)) {
    return { intent: fallbackIntent, fallbackIntent, source: "fallback" };
  }

  return {
    intent: undefined,
    fallbackIntent,
    source: "none",
  };
}

function detectQuickReplies(
  intent: QuestionIntent | undefined,
  contextText: string,
  latestUserMessage: string
): QuickReply[] | undefined {
  if (!intent) return undefined;
  const baseReplies = getQuickRepliesForIntent(intent);
  if (!baseReplies) return undefined;
  const contextualReplies = injectContextualQuickReplies(
    intent,
    baseReplies,
    contextText,
    latestUserMessage
  );
  return ensureTypeQuickReply(contextualReplies);
}

