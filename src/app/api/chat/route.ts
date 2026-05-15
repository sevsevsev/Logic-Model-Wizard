import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/chat/prompt";
import {
  buildCompiledStatement as guardrailBuildCompiledStatement,
  deriveImpactFacetState,
  hasConcreteImpactMarker as guardrailHasConcreteImpactMarker,
  inferNextRequiredIntent,
  looksSpecificGeography as guardrailLooksSpecificGeography,
  looksSpecificPopulation as guardrailLooksSpecificPopulation,
} from "@/lib/chat/guardrails";
import {
  assertIntentWithLatestUserEvidence,
} from "@/lib/chat/agenticContext";
import {
  applyGroundedReplyFallback,
  buildConflictClarificationPrompt,
  buildEvidenceLedgerFromTurn,
  buildSectionScopedMemoryContext,
  computeSectionReadiness,
  createEmptyClaimMemory,
  detectContextConflicts,
  isClaimMemoryState,
  type LogicSection,
  updateClaimMemoryFromTurn,
} from "@/lib/chat/orchestration";
import { applyCompiledStatementPolicy } from "@/lib/chat/impactAcceptance";
import { applyImpactAcceptanceFromReply } from "@/lib/chat/impactAcceptance";
import { enforceImpactDraftAcknowledgement } from "@/lib/chat/impactDraftReply";
import { classifyIntakeSignals, looksLikeBroadProgramFrame } from "@/lib/chat/intakeSignals";

import { generateGeminiContentWithFallback } from "@/lib/llm/generate";
import { runConversationalTurn } from "@/lib/chat/conversationalPipeline";

import { normalizeTranscript } from "@/lib/chat/transcript";
import type { AgentRevisionLifecycle } from "@/lib/agent/types";
import type { LogicModel } from "@/store/useLogicModelStore";
import type { ChatMessage } from "@/store/useLogicModelStore";
import type { ConversationFocusLock } from "@/store/useLogicModelStore";

// ---------------------------------------------------------------------------
// System prompt — encodes all spec rules
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = buildSystemPrompt();
const CHAT_INTENT_DEBUG = process.env.DEBUG_CHAT_INTENT === "true";
const DEBUG_AGENTIC_CONTEXT = process.env.DEBUG_AGENTIC_CONTEXT === "true";
const ENABLE_RESPONSE_CHIPS = process.env.ENABLE_RESPONSE_CHIPS === "true";
const ENABLE_STRICT_SECTION_PATCH_CONTRACT = process.env.ENABLE_STRICT_SECTION_PATCH_CONTRACT === "true";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function captureDurationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

const LEGACY_RETRIEVAL_TOP_K = parsePositiveInt(process.env.RAG_LEGACY_TOP_K, 8);

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
    "outputs_metrics": ["string"],
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

Critical Extraction Rules:

1. ACTIVITIES vs OUTCOMES DISTINCTION:
   - Activities: Describe WHAT YOU DO. Verbs: hold, run, deliver, offer, provide, conduct, meet, teach, mentor, coach, connect, facilitate, lead, organize.
   - Outcomes: Describe WHAT CHANGES for participants. Verbs: expect, want, hope, aim, intend; often preceded by temporal markers.
   - NEVER place activities in outcomes or vice versa.

2. TEMPORAL OUTCOME CLASSIFICATION:
   - Short-term (immediate changes in knowledge/awareness): "immediately", "right away", "day one", "first session", "knowledge", "awareness", "understanding", "skills", "confidence", "sense of"
   - Medium-term (behavior/engagement changes within weeks-months): "within weeks", "within 3 months", "within a semester", "behavior", "engagement", "attendance", "participation", "grades", "performance"
   - Long-term (condition/status changes in 1+ years): "within 2 years", "10 years", "graduation", "employment", "career", "educational trajectory", "persistence"
   - When temporal markers are present in outcomes text, ALWAYS map to the corresponding bucket.

3. SENTENCE CHUNKING FOR MIXED CONTENT:
   - When one sentence contains both activity and outcome language (e.g., "We run workshops. After 3 months, we expect better attendance."):
     a) Split at sentence boundaries (periods/exclamation/question marks).
     b) Classify each chunk independently.
     c) Activity chunks → implementation.activities. Outcome chunks → outcomes[time_bucket].
   - Never merge activity and outcome content into a single field.

4. GENERAL RULES:
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

function normalizeNarrativeText(text: string): string {
  return text
    .normalize("NFKC")
    // Common copy/paste artifact: private-use glyph replacing ligatures such as "ti".
    .replace(/([A-Za-z])[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]([A-Za-z])/gu, "$1ti$2")
    .replace(/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const simplified = raw
    .replace(/^the\s+/i, "")
    .replace(/\s+in\s+.+$/i, "")
    .replace(/\s+through\s+.+$/i, "")
    .replace(/\s+with\s+.+$/i, "")
    // Strip purpose/goal clauses like "students to help them build SEL skills..."
    .replace(/\s+to\s+(?:help|build|develop|support|ensure|improve|prepare|enable)\b.+$/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();

  // Normalize inverted phrasing like "students in middle school" to "middle school students".
  const invertedMatch = simplified.match(/^students?\s+in\s+((?:k-?12|middle school|high school|elementary)(?:\s+school)?)$/i);
  if (invertedMatch?.[1]) {
    return `${invertedMatch[1].trim()} students`;
  }

  return simplified;
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

// ---------------------------------------------------------------------------
// Resource heuristic extractor — classify user-provided items into buckets
// ---------------------------------------------------------------------------

const RESOURCE_BUCKET_PATTERNS: Record<
  "human" | "material" | "financial" | "knowledge",
  RegExp[]
> = {
  human: [
    /\b(volunteers?)\b/i,
    /\b((?:program\s+)?staff)\b/i,
    /\b(mentors?)\b/i,
    /\b(facilitators?)\b/i,
    /\b(coordinators?)\b/i,
    /\b(directors?)\b/i,
    /\b(social\s+workers?)\b/i,
    /\b(counselors?)\b/i,
    /\b(case\s+managers?)\b/i,
    /\b(teachers?)\b/i,
    /\b(coaches?)\b/i,
    /\b(interns?)\b/i,
    /\b(therapists?)\b/i,
    /\b(nurses?)\b/i,
    /\b(partners?)\b/i,
    /\b(peer\s+(?:mentors?|leaders?|support))\b/i,
    /\b(community\s+(?:members?|leaders?))\b/i,
    /\b(service\s+providers?)\b/i,
    /\b(administrators?)\b/i,
    /\b(instructors?)\b/i,
    /\b(specialists?)\b/i,
  ],
  material: [
    /\b(curriculum(?:\s+materials?)?)\b/i,
    /\b(materials?)\b/i,
    /\b(supplies)\b/i,
    /\b(equipment)\b/i,
    /\b(technology)\b/i,
    /\b(computers?|devices?|tablets?|laptops?)\b/i,
    /\b(books?|workbooks?|textbooks?|handouts?)\b/i,
    /\b(space|facilities?|office|classroom)\b/i,
    /\b(vehicles?|vans?|transport(?:ation)?)\b/i,
    /\b(software)\b/i,
    /\b(printed\s+materials?|brochures?)\b/i,
    /\b(physical\s+resources?)\b/i,
  ],
  financial: [
    /\b(funding|funds?)\b/i,
    /\b(grants?)\b/i,
    /\b(donations?)\b/i,
    /\b(budget)\b/i,
    /\b(stipends?)\b/i,
    /\b(fees?)\b/i,
    /\b(revenue)\b/i,
    /\b(money|dollars?)\b/i,
    /\b(foundation\s+support)\b/i,
    /\b(endowment)\b/i,
    /\b(contracts?)\b/i,
    /\b(government\s+(?:funding|contracts?))\b/i,
    /\b(government\s+funding|state\s+funding|federal\s+funding)\b/i,
    /\b(philanthropic\s+support|charitable\s+giving)\b/i,
  ],
  knowledge: [
    /\b(training)\b/i,
    /\b(expertise)\b/i,
    /\b(skills?)\b/i,
    /\b(experience)\b/i,
    /\b(knowledge)\b/i,
    /\b(credentials?|certifications?)\b/i,
    /\b(research|data)\b/i,
    /\b(best\s+practices?)\b/i,
    /\b(curriculum\s+expertise)\b/i,
    /\b(evidence[\s-]based\s+(?:model|practice|approach|curriculum))\b/i,
    /\b(professional\s+development)\b/i,
  ],
};

function classifyResourceItem(
  raw: string
): { bucket: "human" | "material" | "financial" | "knowledge"; label: string } | null {
  // Normalize: strip leading filler words
  const normalized = raw
    .replace(/^(and|or|also|plus|including)\s+/i, "")
    .replace(/^(we|our program|the program)\s+(need|have|use|rely on|depend on|utilize)\s+/i, "")
    .replace(/^(we|our program)\s+/i, "")
    .replace(/^(need|have|use)\s+/i, "")
    .replace(/[.,;:!?]+$/, "")
    .trim();

  if (!normalized || normalized.length > 80) return null;

  const buckets: Array<"human" | "material" | "financial" | "knowledge"> = [
    "human", "material", "financial", "knowledge",
  ];
  for (const bucket of buckets) {
    for (const pattern of RESOURCE_BUCKET_PATTERNS[bucket]) {
      if (pattern.test(normalized)) {
        // Capitalize first letter for display
        const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        return { bucket, label };
      }
    }
  }
  return null;
}

function extractResourcesHeuristic(text: string): {
  human: string[];
  material: string[];
  financial: string[];
  knowledge: string[];
} | null {
  // Split by sentence then by comma/semicolon to get candidate items
  const rawItems: string[] = [];
  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    const parts = sentence.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
    rawItems.push(...parts);
  }

  const human: string[] = [];
  const material: string[] = [];
  const financial: string[] = [];
  const knowledge: string[] = [];

  for (const raw of rawItems) {
    const classified = classifyResourceItem(raw);
    if (!classified) continue;
    switch (classified.bucket) {
      case "human": human.push(classified.label); break;
      case "material": material.push(classified.label); break;
      case "financial": financial.push(classified.label); break;
      case "knowledge": knowledge.push(classified.label); break;
    }
  }

  if (!human.length && !material.length && !financial.length && !knowledge.length) {
    return null;
  }

  return {
    human: dedupeStrings(human),
    material: dedupeStrings(material),
    financial: dedupeStrings(financial),
    knowledge: dedupeStrings(knowledge),
  };
}

// ---------------------------------------------------------------------------
// Loop detection — identifies when the same phase question was asked N+ times
// without progress, so the route can switch to a targeted follow-up.
// ---------------------------------------------------------------------------

function detectRepeatPhaseLoop(
  history: ChatMessage[],
  stateIntent: string,
  lookback = 6,
  threshold = 2
): boolean {
  const questionPatterns: Record<string, RegExp> = {
    resources: /\b(key resources|resources needed|people[,.]?\s*materials?|funding|expertise)\b/i,
    activities: /\b(activities|what do(?:es)? your (program|team) do|key (activities|services))\b/i,
    outputs_metrics: /\b(outputs?|metrics?|how many|number of)\b/i,
    quality_evidence: /\b(quality|fidelity|how do you (know|ensure|measure quality))\b/i,
    outcomes_review: /\b(outcomes?|what change|what difference)\b/i,
  };

  const pattern = questionPatterns[stateIntent];
  if (!pattern) return false;

  const recentAssistant = history
    .slice(-lookback)
    .filter((m) => m.role === "assistant" && pattern.test(m.content));

  return recentAssistant.length >= threshold;
}

function buildResourcesLoopFollowUp(
  existingResources: LogicModel["implementation"]["resources"] | undefined,
  userMessage: string
): string {
  const messageResources = extractResourcesHeuristic(userMessage);
  const captured = {
    human: dedupeStrings([...(existingResources?.human ?? []), ...(messageResources?.human ?? [])]),
    material: dedupeStrings([...(existingResources?.material ?? []), ...(messageResources?.material ?? [])]),
    financial: dedupeStrings([...(existingResources?.financial ?? []), ...(messageResources?.financial ?? [])]),
    knowledge: dedupeStrings([...(existingResources?.knowledge ?? []), ...(messageResources?.knowledge ?? [])]),
  };

  // Determine which buckets are still empty
  const missing: string[] = [];
  if (!captured.material.length) missing.push("materials or equipment");
  if (!captured.financial.length) missing.push("funding sources");
  if (!captured.knowledge.length) missing.push("expertise or training");
  if (!captured.human.length) missing.push("the people involved");

  const humanList = captured.human.length
    ? `**People:** ${captured.human.join(", ")}`
    : null;
  const matList = captured.material.length
    ? `**Materials:** ${captured.material.join(", ")}`
    : null;
  const finList = captured.financial.length
    ? `**Funding:** ${captured.financial.join(", ")}`
    : null;
  const knowList = captured.knowledge.length
    ? `**Expertise:** ${captured.knowledge.join(", ")}`
    : null;

  const capturedLines = [humanList, matList, finList, knowList].filter(Boolean);

  if (capturedLines.length > 0) {
    const capturedSummary = capturedLines.join("\n");
    if (missing.length === 0) {
      return `Got it — here's what I've captured so far:\n\n${capturedSummary}\n\nWhat are the main activities your team delivers in a typical cycle?`;
    }
    return `Got it — I've captured:\n\n${capturedSummary}\n\nDo you also have any ${missing.slice(0, 2).join(" or ")} to add? It's fine if not — just share what applies.`;
  }

  // Nothing captured yet — ask more specifically
  return `No worries if you don't have all of this yet. Let's start simple: who are the main people involved in running the program (staff, volunteers, or partners)?`;
}

function hasResourceEntries(resources: LogicModel["implementation"]["resources"] | undefined): boolean {
  return Boolean(
    (resources?.human?.length ?? 0) > 0 ||
      (resources?.material?.length ?? 0) > 0 ||
      (resources?.financial?.length ?? 0) > 0 ||
      (resources?.knowledge?.length ?? 0) > 0
  );
}

function applyResourcesTurnHeuristic(
  patch: Partial<LogicModel> | null,
  userMessage: string,
  responseDomain: QuestionIntent | undefined,
  existingResources?: LogicModel["implementation"]["resources"]
): Partial<LogicModel> | null {
  if (responseDomain !== "resources") return patch;
  const patchResources = patch?.implementation?.resources;
  const extracted = extractResourcesHeuristic(userMessage);
  const mergedResources = {
    human: dedupeStrings([
      ...(existingResources?.human ?? []),
      ...(patchResources?.human ?? []),
      ...(extracted?.human ?? []),
    ]),
    material: dedupeStrings([
      ...(existingResources?.material ?? []),
      ...(patchResources?.material ?? []),
      ...(extracted?.material ?? []),
    ]),
    financial: dedupeStrings([
      ...(existingResources?.financial ?? []),
      ...(patchResources?.financial ?? []),
      ...(extracted?.financial ?? []),
    ]),
    knowledge: dedupeStrings([
      ...(existingResources?.knowledge ?? []),
      ...(patchResources?.knowledge ?? []),
      ...(extracted?.knowledge ?? []),
    ]),
  };

  if (!hasResourceEntries(mergedResources)) return patch;

  return {
    ...(patch ?? {}),
    implementation: {
      ...(patch?.implementation ?? {}),
      resources: mergedResources,
      activities: patch?.implementation?.activities ?? [],
      outputs_metrics: patch?.implementation?.outputs_metrics ?? [],
      quality_fidelity: patch?.implementation?.quality_fidelity ?? { fidelity: [], quality: [] },
    },
  };
}

function applyActivitiesTurnHeuristic(
  patch: Partial<LogicModel> | null,
  userMessage: string,
  responseDomain: QuestionIntent | undefined
): Partial<LogicModel> | null {
  if (responseDomain !== "activities") return patch;
  if (looksLikeBroadProgramFrame(userMessage)) return patch;
  if (Array.isArray(patch?.implementation?.activities) && patch.implementation.activities.length > 0) {
    return patch;
  }

  const action = userMessage.trim().replace(/[.]+$/g, "");
  if (!action) return patch;

  return {
    ...(patch ?? {}),
    implementation: {
      resources: patch?.implementation?.resources ?? { human: [], material: [], financial: [], knowledge: [] },
      activities: [{ item: "__ungrouped__", actions: [action], outputs: [] }],
      outputs_metrics: patch?.implementation?.outputs_metrics ?? [],
      quality_fidelity: patch?.implementation?.quality_fidelity ?? { fidelity: [], quality: [] },
    },
  };
}

function applyQualityTurnHeuristic(
  patch: Partial<LogicModel> | null,
  userMessage: string,
  responseDomain: QuestionIntent | undefined
): Partial<LogicModel> | null {
  if (responseDomain !== "quality_evidence") return patch;

  const currentQuality = patch?.implementation?.quality_fidelity?.quality ?? [];
  const currentFidelity = patch?.implementation?.quality_fidelity?.fidelity ?? [];
  if (currentQuality.length > 0 || currentFidelity.length > 0) return patch;

  const text = userMessage.trim().replace(/[.]+$/g, "");
  if (!text) return patch;

  const quality: string[] = [];
  const fidelity: string[] = [];

  if (/\bquality\b|standard|background checks?|training|participant\s+satisfaction/i.test(text)) {
    quality.push(text);
  }
  if (/\bfidelity\b|checklist|manual|handbook|adherence/i.test(text)) {
    fidelity.push(text);
  }

  if (quality.length === 0 && fidelity.length === 0) {
    quality.push(text);
  }

  return {
    ...(patch ?? {}),
    implementation: {
      resources: patch?.implementation?.resources ?? { human: [], material: [], financial: [], knowledge: [] },
      activities: patch?.implementation?.activities ?? [],
      outputs_metrics: patch?.implementation?.outputs_metrics ?? [],
      quality_fidelity: {
        quality: dedupeStrings(quality),
        fidelity: dedupeStrings(fidelity),
      },
    },
  };
}

function applyOutcomesTurnHeuristic(
  patch: Partial<LogicModel> | null,
  userMessage: string,
  responseDomain: QuestionIntent | undefined
): Partial<LogicModel> | null {
  if (responseDomain !== "outcomes_review") return patch;

  const hasOutcomes = Boolean(
    (patch?.outcomes?.short_term?.length ?? 0) > 0 ||
      (patch?.outcomes?.medium_term?.length ?? 0) > 0 ||
      (patch?.outcomes?.long_term?.length ?? 0) > 0
  );
  if (hasOutcomes) return patch;

  const text = userMessage.trim();
  if (!text) return patch;

  const short_term: Array<{ statement: string; stakeholderLabels?: string[] }> = [];
  const medium_term: Array<{ statement: string; stakeholderLabels?: string[] }> = [];
  const long_term: Array<{ statement: string; stakeholderLabels?: string[] }> = [];

  const short = text.match(/\bshort\s*term\b[:,\-]?\s*([^\.]+(?:\.[^\.]+)*)/i)?.[1];
  const medium = text.match(/\bmedium\s*term\b[:,\-]?\s*([^\.]+(?:\.[^\.]+)*)/i)?.[1];
  const long = text.match(/\blong\s*term\b[:,\-]?\s*([^\.]+(?:\.[^\.]+)*)/i)?.[1];

  if (short?.trim()) short_term.push({ statement: short.trim().replace(/[.]+$/g, ""), stakeholderLabels: ["Students"] });
  if (medium?.trim()) medium_term.push({ statement: medium.trim().replace(/[.]+$/g, ""), stakeholderLabels: ["Students"] });
  if (long?.trim()) long_term.push({ statement: long.trim().replace(/[.]+$/g, ""), stakeholderLabels: ["Students"] });

  if (short_term.length === 0 && medium_term.length === 0 && long_term.length === 0) {
    if (/\b(succeed|success|do\s+better|thrive|improve)\b/i.test(text) && !/\b(short|medium|long)[-\s]?term\b/i.test(text)) {
      return patch;
    }
    long_term.push({ statement: text.replace(/[.]+$/g, ""), stakeholderLabels: ["Students"] });
  }

  return {
    ...(patch ?? {}),
    outcomes: {
      short_term,
      medium_term,
      long_term,
    },
  };
}

function hasOutcomeEntries(outcomes: Partial<LogicModel["outcomes"]> | undefined): boolean {
  return Boolean(
    (outcomes?.short_term?.length ?? 0) > 0 ||
      (outcomes?.medium_term?.length ?? 0) > 0 ||
      (outcomes?.long_term?.length ?? 0) > 0
  );
}

function isOutcomesPatchTooVague(outcomes: Partial<LogicModel["outcomes"]> | undefined): boolean {
  if (!outcomes) return true;

  const statements = [
    ...(outcomes.short_term ?? []).map((entry) => String(entry.statement ?? "")),
    ...(outcomes.medium_term ?? []).map((entry) => String(entry.statement ?? "")),
    ...(outcomes.long_term ?? []).map((entry) => String(entry.statement ?? "")),
  ]
    .join(" ")
    .trim();

  if (!statements) return true;

  const genericOnly = /\b(succeed|success|do\s+better|thrive|improve)\b/i.test(statements);
  const hasConcreteCue =
    /\b(short|medium|long)[-\s]?term\b/i.test(statements) ||
    /\b(acceptance|enrollment|credential|graduat|attendance|retention|employment|housing|produce|lbs?|percentage|%)\b/i.test(
      statements
    );

  return genericOnly && !hasConcreteCue;
}

function looksVagueActivityDescription(userMessage: string): boolean {
  const text = userMessage.trim().toLowerCase();
  if (!text) return true;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hasStructuredDetail = /\b(for\s+\d+\s+hours?|\d+\s*(?:x|times?)\s*(?:a|per)\s*week|weekly|bi-weekly|daily|students?\s+meet|sessions?)\b/i.test(
    text
  );

  if (hasStructuredDetail) return false;
  return wordCount < 9;
}

function isGenericOutcomeUserMessage(userMessage: string): boolean {
  const text = userMessage.trim();
  if (!text) return false;

  const generic = /\b(succeed|success|do\s+better|thrive|improve)\b/i.test(text);
  const hasHorizon = /\b(short|medium|long)[-\s]?term\b/i.test(text);
  return generic && !hasHorizon;
}

function buildHeuristicNarrativePatch(userMessage: string): Partial<LogicModel> | null {
  const text = normalizeNarrativeText(userMessage);
  if (!text) return null;

  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;

  const populationCandidates: string[] = [];
  const geographyCandidates: string[] = [];
  const longTermGoalCandidates: string[] = [];
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
  const qualitySignals: string[] = [];
  const fidelitySignals: string[] = [];

  const populationRegexes = [
    /(?:enrolls?|serves?|supports?|targets?|works with)\s+([^.!?]+)/i,
    /(?:for|with|to)\s+((?:k-?12|middle school|high school|elementary)\s+students?)/i,
    /\b(students?\s+in\s+(?:k-?12|middle school|high school|elementary)(?:\s+school)?)\b/i,
    /\bto\s+([^.!?]*(?:students?|youth|young adults?|adults?|participants?))/i,
    /\b((?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+grad(?:e|ers?))\b/i,
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

    const longTermGoalMatch = normalized.match(/\b(?:our\s+goal\s+is|goal\s+is|long[-\s]?term\s+goal\s+is|our\s+mission\s+is\s+to|mission\s+is\s+to|theory\s+of\s+change\s*:\s*|we\s+want\s+to|we\s+aim\s+to|we\s+hope\s+to|so\s+that)\s+(.+)$/i);
    if (longTermGoalMatch?.[1]) {
      const goalCandidate = longTermGoalMatch[1].trim().replace(/[.]+$/g, "");
      if (goalCandidate.length > 8) {
        longTermGoalCandidates.push(goalCandidate);
      }
    }

    if (/\bstudents?\b/i.test(normalized)) stakeholderLabels.push("Students");
    if (/\bchildren\b/i.test(normalized)) stakeholderLabels.push("Children");
    if (/\byouth\b/i.test(normalized)) stakeholderLabels.push("Youth");
    if (/\bfamil(?:y|ies)\b/i.test(normalized)) stakeholderLabels.push("Families");
    if (/\bteachers?|educators?\b/i.test(normalized)) stakeholderLabels.push("Teachers");
    if (/\bclass(?:es)?\b/i.test(normalized)) stakeholderLabels.push("Classrooms");

    if (/\bchildren\b/i.test(normalized) && /\byouth\b/i.test(normalized)) {
      populationCandidates.push("children and youth");
    }

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

    if (
      /\b(deliver|delivers|delivered|provides?|offers?)\b.*\b(music|dance|arts?|learning\s+experiences?|programming)\b/i.test(normalized) &&
      !activities.some((a) => a.actions[0]?.toLowerCase() === normalized.toLowerCase())
    ) {
      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: [],
        stakeholderLabels: ["Students", "Children", "Youth"],
      });
    }

    // Expanded activity patterns: general program delivery verbs
    if (
      /\b(run|hold|host|facilitate|conduct|lead|manage)\b.*(program|workshop|session|class|group|meeting|event|camp|club)/i.test(normalized) &&
      !activities.some((a) => a.actions[0]?.toLowerCase() === normalized.toLowerCase())
    ) {
      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: [],
      });
    }

    if (
      /\b(run|hold|host|facilitate|conduct|lead|manage)\b.*(programs?|workshops?|sessions?|classes?|groups?|meetings?|events?|camps?|clubs?|distribution\s+stands?)\b/i.test(normalized) &&
      !activities.some((a) => a.actions[0]?.toLowerCase() === normalized.toLowerCase())
    ) {
      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: [],
      });
    }

    if (
      /\b(meet|meets|meeting|mentor|mentoring|check\s*in)\b/i.test(normalized) &&
      !activities.some((a) => a.actions[0]?.toLowerCase() === normalized.toLowerCase())
    ) {
      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: [],
      });
    }

    if (
      /\b(offer|provide)\b.*(tutoring|coaching|mentoring|training|counseling|therapy|support|advising|job\s+prep|college\s+prep)/i.test(normalized) &&
      !activities.some((a) => a.actions[0]?.toLowerCase() === normalized.toLowerCase())
    ) {
      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: [],
      });
    }

    if (
      /\b(connect|link|refer)\b.*(students?|participants?|youth|families?|clients?).*(to|with)\b.*(services?|resources?|support|agency|provider)/i.test(normalized) &&
      !activities.some((a) => a.actions[0]?.toLowerCase() === normalized.toLowerCase())
    ) {
      activities.push({
        item: "__ungrouped__",
        actions: [normalized.replace(/[.]+$/g, "")],
        outputs: [],
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
      // CRITICAL: Skip activity-describing clauses to prevent activities from being misclassified as outcomes
      if (
        /\b(?:hold|run|deliver|offer|provide|conduct|lead|teach|mentor|coach|meet|connect|facilitate|organize|host)\b/i.test(clause) ||
        /\b(?:sessions?|workshops?|classes?|meetings?|programs?|activities?|activities|trainings?|courses?)\b/i.test(clause) ||
        /\b(?:focus(?:es|ed|ing)?|designed|aimed|intended)\s+(?:on|to|at)\s+(?:skill|training|learning|development|instruction)\b/i.test(clause)
      ) {
        continue; // Skip this clause — it's an activity description, not an outcome
      }

      const shortMatch = clause.match(/\bshort\s*term\b[:,\-]?\s*(.+)$/i);
      if (shortMatch?.[1]) {
        addOutcome(shortOutcomes, shortMatch[1], ["Students"]);
        continue;
      }

      const mediumMatch = clause.match(/\bmedium\s*term\b[:,\-]?\s*(.+)$/i);
      if (mediumMatch?.[1]) {
        addOutcome(mediumOutcomes, mediumMatch[1], ["Students"]);
        continue;
      }

      const longMatch = clause.match(/\blong\s*term\b[:,\-]?\s*(.+)$/i);
      if (longMatch?.[1]) {
        addOutcome(longOutcomes, longMatch[1], ["Students"]);
        continue;
      }

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

      // Medium-term: social-emotional and school environment shifts.
      if (/(self[-\s]?efficacy|social[-\s]?emotional|SEL|classroom\s+climate|school\s+culture|family\s+engagement)/i.test(clause)) {
        addOutcome(mediumOutcomes, clause, ["Students", "Families"]);
        continue;
      }

      // Long-term: condition / status changes — require employment/economic/life-condition words,
      // not just "career" (which appears in career-awareness sentences)
      if (/(employment|economic|self.suffic|stability|life condition|social mobility)/i.test(clause) && /(will|should)/i.test(clause)) {
        addOutcome(longOutcomes, clause, ["Students"]);
      }

      if (/(safer|vibrant\s+communit(?:y|ies)|arts\s+learning.*embedded|daily\s+life)/i.test(clause)) {
        addOutcome(longOutcomes, clause, ["Students", "Families", "Community"]);
      }
    }

    const qualityParen = normalized.match(/([^.!?;]+)\(\s*quality\s*\)/i);
    if (qualityParen?.[1]) {
      qualitySignals.push(qualityParen[1].trim().replace(/[.]+$/g, ""));
    }

    const fidelityParen = normalized.match(/([^.!?;]+)\(\s*fidelity\s*\)/i);
    if (fidelityParen?.[1]) {
      fidelitySignals.push(fidelityParen[1].trim().replace(/[.]+$/g, ""));
    }

    if (/(\bquality\b|organic-only|standards?|background checks?|participant\s+satisfaction)/i.test(normalized)) {
      qualitySignals.push(normalized.replace(/[.]+$/g, ""));
    }

    if (/(\bfidelity\b|checklist|manual|adherence|as\s+designed|handbook)/i.test(normalized)) {
      fidelitySignals.push(normalized.replace(/[.]+$/g, ""));
    }
  }

  const broadProgramFrame = looksLikeBroadProgramFrame(text);

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
    // Reject candidates that are too long to plausibly be a population description.
    // Long strings are typically goal sentences mis-matched by the regex.
    const validPopulationCandidates = dedupeStrings(populationCandidates).filter(
      (c) =>
        c.length <= 60 &&
        // Avoid role fragments like "as mentors" from sentences such as
        // "volunteers serve as mentors" being mistaken for target populations.
        !/^as\s+(mentors?|volunteers?|staff|coaches?)\b/i.test(c) &&
        !/^(mentors?|volunteers?|staff|coaches?)$/i.test(c)
    );
    if (validPopulationCandidates.length > 0) {
      const population = validPopulationCandidates[0];
      const base = (patch.intended_impact ?? {}) as Partial<LogicModel["intended_impact"]>;
      patch.intended_impact = { ...base, population } as LogicModel["intended_impact"];
    }
  }

  if (geographyCandidates.length > 0) {
    const geography = dedupeStrings(geographyCandidates)[0];
    const base = (patch.intended_impact ?? {}) as Partial<LogicModel["intended_impact"]>;
    patch.intended_impact = { ...base, geography } as LogicModel["intended_impact"];
  }

  if (longTermGoalCandidates.length > 0) {
    const long_term_goal = dedupeStrings(longTermGoalCandidates)[0];
    const base = (patch.intended_impact ?? {}) as Partial<LogicModel["intended_impact"]>;
    patch.intended_impact = { ...base, long_term_goal } as LogicModel["intended_impact"];
  }

  if (dedupedStakeholders.length > 0) {
    patch.stakeholders = dedupedStakeholders;
  }

  // Extract resources from heuristic patterns — works independently of activity extraction
  const heuristicResources = extractResourcesHeuristic(text);
  if (heuristicResources) {
    patch.implementation = {
      resources: {
        human: heuristicResources.human,
        material: heuristicResources.material,
        financial: heuristicResources.financial,
        knowledge: heuristicResources.knowledge,
      },
      activities: patch.implementation?.activities ?? [],
      quality_fidelity: patch.implementation?.quality_fidelity ?? { fidelity: [], quality: [] },
    };
  } else if (dedupedActivities.length > 0 && !broadProgramFrame) {
    patch.implementation = {
      resources: patch.implementation?.resources ?? { human: [], material: [], financial: [], knowledge: [] },
      activities: dedupedActivities,
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

  const nextQuality = dedupeStrings(qualitySignals);
  const nextFidelity = dedupeStrings(fidelitySignals);
  if (nextQuality.length > 0 || nextFidelity.length > 0) {
    patch.implementation = {
      resources: patch.implementation?.resources ?? { human: [], material: [], financial: [], knowledge: [] },
      activities: patch.implementation?.activities ?? [],
      quality_fidelity: {
        quality: nextQuality,
        fidelity: nextFidelity,
      },
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
    if (
      (merged.implementation.outputs_metrics?.length ?? 0) === 0 &&
      (fallback.implementation.outputs_metrics?.length ?? 0) > 0
    ) {
      merged.implementation.outputs_metrics = fallback.implementation.outputs_metrics;
    }
    // Merge resources bucket-by-bucket: prefer primary when non-empty, fill from fallback otherwise
    if (fallback.implementation.resources) {
      const primary = merged.implementation.resources ?? { human: [], material: [], financial: [], knowledge: [] };
      const fallbackRes = fallback.implementation.resources;
      merged.implementation.resources = {
        human: (primary.human?.length ?? 0) > 0 ? primary.human : (fallbackRes.human ?? []),
        material: (primary.material?.length ?? 0) > 0 ? primary.material : (fallbackRes.material ?? []),
        financial: (primary.financial?.length ?? 0) > 0 ? primary.financial : (fallbackRes.financial ?? []),
        knowledge: (primary.knowledge?.length ?? 0) > 0 ? primary.knowledge : (fallbackRes.knowledge ?? []),
      };
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

  for (const rawActivity of activities) {
    if (!rawActivity || typeof rawActivity !== "object") {
      continue;
    }

    const activity = rawActivity as {
      item?: unknown;
      category?: unknown;
      actions?: unknown;
      outputs?: unknown;
      stakeholderLabels?: unknown;
    };

    const item = typeof activity.item === "string" ? activity.item : "";
    const actionTexts = Array.isArray(activity.actions)
      ? activity.actions.filter((value): value is string => typeof value === "string")
      : [];
    const outputs = Array.isArray(activity.outputs)
      ? activity.outputs
          .filter((value): value is { text: string; category?: string } => {
            if (!value || typeof value !== "object") return false;
            const output = value as Record<string, unknown>;
            return typeof output.text === "string";
          })
          .map((output) => ({
            text: output.text,
            category: output.category,
          }))
      : [];

    const combinedText = [item, ...actionTexts]
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
      item,
      category: undefined,
      actions: actionTexts,
      outputs: outputs.map((output) => ({ text: output.text })),
    });
  }

  return {
    ...patch,
    implementation: {
      resources: patch.implementation?.resources ?? { human: [], material: [], financial: [], knowledge: [] },
      activities: normalizedActivities,
      outputs_metrics: patch.implementation?.outputs_metrics ?? [],
      quality_fidelity: patch.implementation?.quality_fidelity ?? { fidelity: [], quality: [] },
    },
  };
}

async function extractModelPatchFallback({
  apiKey,
  history,
  userMessage,
  modelSnapshot,
  memoryContext,
}: {
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
  modelSnapshot?: LogicModel;
  memoryContext?: string;
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
              retained_facts_context: memoryContext ?? "",
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

  const { response: extractionRes } = await generateGeminiContentWithFallback(
    apiKey,
    extractionPayload,
    "extraction"
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
// Post-Population Validation — diagnose and fix placement issues after model is populated
// Prevents heuristic churn by letting Gemini validate the full model state once it's sufficiently populated
// ---------------------------------------------------------------------------

interface ModelQualityIssue {
  hasIssues: boolean;
  issues: string[];
  activitiesInOutcomes: string[];
  unclassifiedOutcomes: string[];
}

/**
 * Lightweight detector (heuristic-only) — identifies potential placement errors
 * Does NOT call LLM; just flags suspected issues for later validation.
 */
function detectModelQualityIssues(model: LogicModel): ModelQualityIssue {
  const issues: string[] = [];
  const activitiesInOutcomes: string[] = [];
  const unclassifiedOutcomes: string[] = [];

  const activityVerbs =
    /\b(hold|run|deliver|offer|provide|teach|mentor|coach|meet|conduct|lead|organize|facilitate|host|deliver)\b/i;

  // Check outcomes for activity language
  for (const outcomeList of [
    model.outcomes?.short_term ?? [],
    model.outcomes?.medium_term ?? [],
    model.outcomes?.long_term ?? [],
  ]) {
    for (const item of outcomeList) {
      const text = item.statement.toLowerCase();
      if (activityVerbs.test(text)) {
        issues.push("Activity verb detected in outcome statement");
        activitiesInOutcomes.push(item.statement);
      }
      // Flag outcomes that lack temporal markers or expectation language
      if (!/\b(expect|want|hope|intend|aim|should|will)\b/i.test(text)) {
        unclassifiedOutcomes.push(item.statement);
      }
    }
  }

  return {
    hasIssues: issues.length > 0,
    issues,
    activitiesInOutcomes,
    unclassifiedOutcomes,
  };
}

/**
 * Check if model has enough data to warrant validation
 * Only validate when model is sufficiently populated to avoid churn on partial states.
 */
function isModelSufficientlyPopulated(model: LogicModel | undefined): boolean {
  if (!model) return false;

  const hasActivities = (model.implementation?.activities?.length ?? 0) > 0;
  const hasOutcomes =
    (model.outcomes?.short_term?.length ?? 0) +
      (model.outcomes?.medium_term?.length ?? 0) +
      (model.outcomes?.long_term?.length ?? 0) >=
    1;
  const hasImpact =
    !!(model.intended_impact?.population && model.intended_impact?.geography) ||
    !!(model.intended_impact?.long_term_goal);

  // Require at least activities + outcomes + some impact
  return hasActivities && hasOutcomes && hasImpact;
}

/**
 * Gemini-based validation — diagnose and fix placement issues on the full model.
 * Only called when model is sufficiently populated AND issues are detected.
 */
async function validateAndFixModelPlacement({
  apiKey,
  model,
  issues,
  userMessage,
}: {
  apiKey: string;
  model: LogicModel;
  issues: ModelQualityIssue;
  userMessage: string;
}): Promise<LogicModel> {
  const validationPrompt = `You are a logic model validator. Analyze this populated model for placement errors and fix them.

Current Model:
${JSON.stringify(model, null, 2)}

Detected Potential Issues:
${issues.issues.map((i) => `- ${i}`).join("\n")}

Recent User Message: "${userMessage}"

Tasks:
1. If activities appear in outcomes sections, move them to implementation.activities
2. Reclassify outcomes into correct temporal buckets based on temporal language:
   - short_term: immediate, right away, knowledge, awareness, skills, confidence
   - medium_term: weeks, months, behavior, engagement, attendance, participation
   - long_term: years, graduation, employment, career, persistence
3. Ensure resource buckets (human, material, financial, knowledge) are correctly assigned
4. Return ONLY the corrected model as valid JSON. No explanations.`;

  const validationPayload = {
    system: [
      {
        text: "You are a precise logic model validator. Return only valid JSON in application/json format.",
      },
    ],
    contents: [
      {
        role: "user" as const,
        parts: [{ text: validationPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 3000,
      responseMimeType: "application/json",
    },
  };

  try {
    const { response } = await generateGeminiContentWithFallback(apiKey, validationPayload, "extraction");

    if (!response.ok) {
      console.error("Validation failed with status:", response.status);
      return model;
    }

    const responseData = await response.json();
    const content = responseData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!content) {
      console.error("Validation returned empty content");
      return model;
    }

    // Extract JSON if wrapped in markdown code fences
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/```\n?([\s\S]*?)\n?```/);
    const jsonString = jsonMatch?.[1] ?? content;

    const corrected = JSON.parse(jsonString);
    if (isLogicModelShape(corrected)) {
      return corrected;
    }
  } catch (err) {
    console.error("Model validation failed, returning original:", err);
  }

  // Return original model if validation fails
  return model;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const stageTimings: Record<string, number> = {};
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

  const { message, history, model, revisionLifecycle, retentionMemory, focusLock } = body as {
    message?: unknown;
    history?: unknown;
    model?: unknown;
    revisionLifecycle?: unknown;
    retentionMemory?: unknown;
    focusLock?: unknown;
    transcript?: unknown;
  };

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message must be a non-empty string." }, { status: 400 });
  }

  // Limit message length to prevent abuse / runaway token costs
  if (message.length > 4000) {
    return NextResponse.json({ error: "message exceeds maximum length." }, { status: 400 });
  }

  if (history !== undefined && !Array.isArray(history)) {
    return NextResponse.json({ error: "history must be an array." }, { status: 400 });
  }

  const modelSnapshot = isLogicModelShape(model) ? model : undefined;
  const safeRevisionLifecycle: AgentRevisionLifecycle | undefined = isRevisionLifecycleShape(revisionLifecycle)
    ? revisionLifecycle
    : undefined;
  const safeRetentionMemory = isClaimMemoryState(retentionMemory)
    ? retentionMemory
    : createEmptyClaimMemory();
  const safeFocusLock = isConversationFocusLockShape(focusLock) ? focusLock : null;
  const requestUserId = req.headers.get("x-user-id")?.trim() || undefined;

  // Cap history depth to prevent token-stuffing attacks
  const safeHistory = ((Array.isArray(history) ? history : []) as ChatMessage[])
    .slice(-40)
    .filter(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    );
  const responseDomain = inferUserResponseDomainFromHistory(safeHistory);
  const effectiveResponseDomain = inferEffectiveResponseDomain(
    responseDomain,
    message.trim(),
    safeHistory
  );

  // --- Minimal Conversational Pipeline (only execution path) ----------------
  // Natural dialogue: one follow-up at a time, no schema forcing, retrieval as support.
  const incomingTranscript = (body as { transcript?: unknown }).transcript;
  const transcriptFromHistory = {
    turns: safeHistory.map((entry) => ({
      role: entry.role,
      content: entry.content,
      timestamp: entry.timestamp,
    })),
    questionsAsked: [],
    topicsCovered: [],
  };

  const normalizedTranscript = normalizeTranscript(incomingTranscript ?? transcriptFromHistory);
  
  try {
    const readinessStartedAt = Date.now();
    const readinessBeforeTurn = computeSectionReadiness(modelSnapshot);
    stageTimings.readinessBeforeTurnMs = captureDurationMs(readinessStartedAt);
    const resolvedFocusLock = resolveFocusLockBeforeTurn({
      currentLock: safeFocusLock,
      userMessage: message.trim(),
      turnIndex: safeHistory.length + 1,
    });
    const focusSection = resolvedFocusLock?.section ?? readinessBeforeTurn.nextSection;
    const memoryContextStartedAt = Date.now();
    const retainedFactsContext = buildSectionScopedMemoryContext(safeRetentionMemory, focusSection);
    stageTimings.memoryContextMs = captureDurationMs(memoryContextStartedAt);

    const conversationalStartedAt = Date.now();
    const conversational = await runConversationalTurn({
      apiKey,
      message: message.trim(),
      transcript: normalizedTranscript,
      topK: LEGACY_RETRIEVAL_TOP_K,
      retainedFactsContext,
      sectionFocus: focusSection,
      modelSnapshot,
    });
    stageTimings.conversationalTurnMs = captureDurationMs(conversationalStartedAt);

    const patchAcceptanceStartedAt = Date.now();
    const acceptedPatch = applyImpactAcceptanceFromReply(
      conversational.analysis.model,
      modelSnapshot,
      message.trim(),
      conversational.reply
    );
    stageTimings.patchAcceptanceMs = captureDurationMs(patchAcceptanceStartedAt);

    const compiledPolicyStartedAt = Date.now();
    let modelPatch = applyCompiledStatementPolicy(
      acceptedPatch,
      modelSnapshot,
      message.trim(),
      { synthesizeWhenComplete: true }
    );
    modelPatch = removeBlankImpactFacetFields(modelPatch);
    stageTimings.compiledStatementPolicyMs = captureDurationMs(compiledPolicyStartedAt);

    const sectionContractStartedAt = Date.now();
    const sectionContract = enforceSectionPatchContract({
      patch: modelPatch,
      responseDomain: effectiveResponseDomain ?? responseDomain,
      focusLock: resolvedFocusLock,
      enabled: ENABLE_STRICT_SECTION_PATCH_CONTRACT,
    });
    modelPatch = removeBlankImpactFacetFields(sectionContract.patch);
    stageTimings.sectionPatchContractMs = captureDurationMs(sectionContractStartedAt);

    const offTopicTangent = isOffTopicTangent(message.trim(), safeHistory);
    if (offTopicTangent) {
      modelPatch = null;
    }

    const mergeStartedAt = Date.now();
    const mergedSnapshot = applyPatchToSnapshot(modelSnapshot, modelPatch);
    stageTimings.mergeSnapshotMs = captureDurationMs(mergeStartedAt);

    // === POST-POPULATION VALIDATION ===
    // If model is sufficiently populated and has suspected placement issues,
    // let Gemini diagnose and fix them on the full model state (avoids heuristic churn).
    const validationStartedAt = Date.now();
    let validatedSnapshot: LogicModel | undefined = mergedSnapshot;
    
    if (
      mergedSnapshot !== undefined &&
      isModelSufficientlyPopulated(mergedSnapshot)
    ) {
      const qualityIssues = detectModelQualityIssues(mergedSnapshot);
      if (qualityIssues.hasIssues) {
        validatedSnapshot = await validateAndFixModelPlacement({
          apiKey,
          model: mergedSnapshot,
          issues: qualityIssues,
          userMessage: message.trim(),
        });
      }
    }
    stageTimings.postValidationMs = captureDurationMs(validationStartedAt);

    const evidenceStartedAt = Date.now();
    const evidenceLedger = buildEvidenceLedgerFromTurn({
      userMessage: message.trim(),
      modelPatch,
      historyLength: safeHistory.length,
    });
    stageTimings.evidenceLedgerMs = captureDurationMs(evidenceStartedAt);

    const readinessAfterStartedAt = Date.now();
    const readinessAfterTurn = computeSectionReadiness(validatedSnapshot, evidenceLedger);
    stageTimings.readinessAfterTurnMs = captureDurationMs(readinessAfterStartedAt);

    const retentionUpdateStartedAt = Date.now();
    const updatedRetentionMemory = updateClaimMemoryFromTurn({
      previous: safeRetentionMemory,
      userMessage: message.trim(),
      modelPatch,
      turnIndex: safeHistory.length + 1,
    });
    stageTimings.retentionUpdateMs = captureDurationMs(retentionUpdateStartedAt);

    const conflictPromptStartedAt = Date.now();
    const conflictPrompt = buildConflictClarificationPrompt(
      updatedRetentionMemory,
      readinessAfterTurn.nextSection
    );
    stageTimings.conflictPromptMs = captureDurationMs(conflictPromptStartedAt);

    const groundedReplyStartedAt = Date.now();
    const groundedReply = applyGroundedReplyFallback({
      reply: conflictPrompt ?? conversational.reply,
      modelPatch,
      nextSection: readinessAfterTurn.nextSection,
    });
    stageTimings.groundedReplyMs = captureDurationMs(groundedReplyStartedAt);

    const finalReplyStartedAt = Date.now();
    let finalReply = enforceImpactDraftAcknowledgement({
      reply: groundedReply,
      userMessage: message.trim(),
      focusSection,
      modelSnapshot: validatedSnapshot,
    });
    if (offTopicTangent) {
      finalReply = buildOffTopicRedirect(focusSection);
    }
    stageTimings.finalReplyRewriteMs = captureDurationMs(finalReplyStartedAt);

    const outgoingFocusLock = resolveFocusLockAfterTurn({
      currentLock: resolvedFocusLock,
      userMessage: message.trim(),
      readinessAfterTurn,
      assistantReply: finalReply,
    });

    const quickRepliesStartedAt = Date.now();
    const quickReplies = ENABLE_RESPONSE_CHIPS
      ? sanitizeQuickReplies(
          detectQuickReplies(
            resolveQuickReplyIntent(finalReply).intent,
            [
              ...safeHistory.map((entry) => entry.content),
              message.trim(),
              finalReply,
            ].join("\n"),
            message.trim()
          ),
          finalReply
        )
      : undefined;
    stageTimings.quickRepliesMs = captureDurationMs(quickRepliesStartedAt);

    const totalMs = captureDurationMs(requestStartedAt);
    stageTimings.totalRequestMs = totalMs;
    const slowRequestThresholdMs = parsePositiveInt(process.env.CHAT_ROUTE_SLOW_REQUEST_MS, 20000);
    if (totalMs >= slowRequestThresholdMs) {
      console.warn("[chat-route] Slow request", JSON.stringify({
        totalMs,
        focusSection,
        stageTimings,
      }));
    }

    const finalTraceIntent =
      outgoingFocusLock?.section ??
      resolvedFocusLock?.section ??
      effectiveResponseDomain ??
      responseDomain ??
      focusSection;

    return NextResponse.json({
      reply: finalReply,
      modelPatch,
      retentionMemory: updatedRetentionMemory,
      focusLock: outgoingFocusLock,
      revisionProposal: null,
      quickReplies,
      transcript: conversational.transcript,
      analysis: conversational.analysis,
      llmMeta: {
        path: "conversational",
        model: conversational.modelUsed,
        fallbackReason: null,
        trace: {
          initialIntent: effectiveResponseDomain ?? responseDomain ?? null,
          stateIntent: responseDomain ?? null,
          finalIntent: finalTraceIntent,
          resolutionSource: "minimal_conversational_pipeline",
          responseDomain: responseDomain ?? null,
          effectiveResponseDomain: effectiveResponseDomain ?? null,
          strictSectionPatchContractEnabled: ENABLE_STRICT_SECTION_PATCH_CONTRACT,
          strictSectionPatchContract: {
            droppedByResponseDomain: sectionContract.droppedByResponseDomain,
            droppedByFocusLock: sectionContract.droppedByFocusLock,
            focusLockDomain: sectionContract.focusLockContractDomain,
          },
          patchSource: "analysis_only",
          retrieval: conversational.retrieval.trace,
          usedExtractionFallback: false,
          usedHeuristicMerge: false,
          routeRewritesEnabled: false,
          nextSection: readinessAfterTurn.nextSection,
          focusLockSection: outgoingFocusLock?.section ?? null,
          focusLockReason: outgoingFocusLock?.reason ?? null,
          openConflictQuestions: updatedRetentionMemory.questions.filter((q) => q.status === "open").length,
          timings: stageTimings,
        },
      },
    });
  } catch (error) {
    const totalMs = captureDurationMs(requestStartedAt);
    stageTimings.totalRequestMs = totalMs;
    console.error("[chat-route] Conversational pipeline error:", JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      totalMs,
      stageTimings,
    }));
    return NextResponse.json(
      { error: "Conversational processing failed" },
      { status: 500 }
    );
  }
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
  | "impact_statement"
  | "impact_population_facet"
  | "impact_geography_facet"
  | "impact_outcome_facet"
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
  | "section_refine"
  | "none";

function detectExplicitSectionSelection(userMessage: string): LogicSection | undefined {
  const text = userMessage.trim().toLowerCase();
  if (!text) return undefined;

  if (/\b(let'?s|lets|we\s+should|i\s+want\s+to|can\s+we|please)\b.{0,40}\b(begin|start|focus|work\s+on|review|refine|tighten|go\s+to)\b/.test(text)) {
    if (/\bintended\s+impact|impact\s+statement|north\s+star|long[-\s]?term\s+goal\b/.test(text)) {
      return "impact";
    }
    if (/\bresources?\b/.test(text)) {
      return "resources";
    }
    if (/\bactivities?\b/.test(text)) {
      return "activities";
    }
    if (/\b(outputs?|metrics?|how many|number of)\b/i.test(text)) {
      return "outputs_metrics";
    }
    if (/\bquality|fidelity\b/.test(text)) {
      return "quality_fidelity";
    }
    if (/\boutcomes?\b/.test(text)) {
      return "outcomes";
    }
    if (/\bstakeholders?\b/.test(text)) {
      return "stakeholders";
    }
    if (/\bimplementation\b/.test(text)) {
      return "resources";
    }
  }

  return undefined;
}

function requestedSectionRelease(userMessage: string): boolean {
  const text = userMessage.trim().toLowerCase();
  if (!text) return false;

  return /\b(move\s+on|next\s+section|continue|proceed|looks\s+good|good\s+to\s+go|let'?s\s+proceed|that\s+works)\b/.test(text);
}

function getSectionScore(readiness: ReturnType<typeof computeSectionReadiness>["scores"], section: LogicSection): number {
  return readiness[section] ?? 0;
}

function resolveFocusLockBeforeTurn(args: {
  currentLock: ConversationFocusLock | null;
  userMessage: string;
  turnIndex: number;
}): ConversationFocusLock | null {
  const explicitSection = detectExplicitSectionSelection(args.userMessage);
  if (explicitSection) {
    return {
      section: explicitSection,
      reason: "user_section_selection",
      acquiredAtTurn: args.turnIndex,
    };
  }

  if (args.currentLock && requestedSectionRelease(args.userMessage)) {
    return null;
  }

  if (args.currentLock) {
    return {
      ...args.currentLock,
      reason: "carry_forward",
    };
  }

  return null;
}

function shouldAutoReleaseFocusLock(args: {
  currentLock: ConversationFocusLock | null;
  readinessAfterTurn: ReturnType<typeof computeSectionReadiness>;
  assistantReply: string;
}): boolean {
  if (!args.currentLock) return false;
  const score = getSectionScore(args.readinessAfterTurn.scores, args.currentLock.section);
  if (score < 1) return false;
  return /\b(move\s+on|next\s+section|continue|proceed|ready\s+to\s+continue|shall\s+we\s+move)\b/i.test(args.assistantReply);
}

function resolveFocusLockAfterTurn(args: {
  currentLock: ConversationFocusLock | null;
  userMessage: string;
  readinessAfterTurn: ReturnType<typeof computeSectionReadiness>;
  assistantReply: string;
}): ConversationFocusLock | null {
  if (!args.currentLock) return null;
  if (requestedSectionRelease(args.userMessage)) return null;
  if (shouldAutoReleaseFocusLock(args)) return null;
  return args.currentLock;
}

type ParsedQuestionIntent = QuestionIntent;

function normalizeQuestionIntent(raw: string | undefined): ParsedQuestionIntent | undefined {
  const normalized = raw?.trim().toLowerCase();
  switch (normalized) {
    case "impact_statement":
    case "impact_population_facet":
    case "impact_geography_facet":
    case "impact_outcome_facet":
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

function inferUserResponseDomainFromHistory(history: ChatMessage[]): QuestionIntent | undefined {
  const lastAssistantMessage = [...history]
    .reverse()
    .find(
      (msg) =>
        msg.role === "assistant" &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
    );

  if (!lastAssistantMessage) return undefined;

  const focus = getQuestionFocusText(lastAssistantMessage.content);
  const sourceText = focus.text || lastAssistantMessage.content;
  return detectQuickReplyIntent(sourceText);
}

function lastAssistantAskedResources(history: ChatMessage[]): boolean {
  const lastAssistantMessage = [...history]
    .reverse()
    .find(
      (msg) =>
        msg.role === "assistant" &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
    );

  if (!lastAssistantMessage) return false;
  return detectQuickReplyIntent(lastAssistantMessage.content) === "resources";
}

function inferEffectiveResponseDomain(
  inferredDomain: QuestionIntent | undefined,
  userMessage: string,
  history: ChatMessage[]
): QuestionIntent | undefined {
  const broadProgramFrame = looksLikeBroadProgramFrame(userMessage);
  const intakeSignals = classifyIntakeSignals(userMessage);
  const looksLikeImpactFraming =
    (intakeSignals.hasPopulationCue || intakeSignals.hasGeographyCue) &&
    (intakeSignals.hasOutcomeCue || /\b(serves?|work\s+with|supports?|targets?)\b/i.test(userMessage));

  if (looksLikeImpactFraming) {
    return inferredDomain && inferredDomain !== "none" ? inferredDomain : "impact_statement";
  }

  // Let strong current-turn evidence override stale domain anchoring from prior prompts.
  if (/\b(short[-\s]?term|medium[-\s]?term|outcomes?)\b/i.test(userMessage)) {
    return "outcomes_review";
  }

  if (/\b(fidelity|quality|standards?|checklist|rubric|adherence|implementation\s+quality|check[-\s]?ins?|monitor(?:ing)?|supervision)\b/i.test(userMessage)) {
    return "quality_evidence";
  }

  // Keep broad first-turn framing in impact flow; avoid coercing into activities
  // when the user is describing program purpose, population, or geography at a high level.
  if (
    broadProgramFrame &&
    (!inferredDomain ||
      inferredDomain === "impact_population_facet" ||
      inferredDomain === "impact_geography_facet" ||
      inferredDomain === "impact_aspiration" ||
      inferredDomain === "impact_change_type" ||
      inferredDomain === "impact_specificity" ||
      inferredDomain === "impact_review" ||
      inferredDomain === "geography" ||
      inferredDomain === "population_focus")
  ) {
    return inferredDomain;
  }

  if (/\b(activity|activities|workshops?|sessions?|mentorship|mentoring|classes?|program\s+delivery|we\s+hold|we\s+run|meets?\s+with|hours?\s+a\s+week|hours?\s+per\s+week)\b/i.test(userMessage)) {
    return "activities";
  }

  const resourceSignal = extractResourcesHeuristic(userMessage);
  if (resourceSignal) {
    return "resources";
  }

  if (
    inferredDomain === "quality_evidence" &&
    /\b(succeed|success|outcome|outcomes|difference|change|long[-\s]?term)\b/i.test(userMessage)
  ) {
    return "outcomes_review";
  }

  if (inferredDomain === "resources") return inferredDomain;

  return inferredDomain;
}

function buildScopedImplementation(
  implementation: Partial<LogicModel["implementation"]> | undefined,
  allowed: Array<"resources" | "activities" | "outputs_metrics" | "quality_fidelity">
): LogicModel["implementation"] | undefined {
  if (!implementation) return undefined;

  const scoped: Partial<LogicModel["implementation"]> = {};
  if (allowed.includes("resources") && implementation.resources) {
    scoped.resources = implementation.resources;
  }
  if (allowed.includes("activities") && implementation.activities) {
    scoped.activities = implementation.activities;
  }
  if (allowed.includes("outputs_metrics") && implementation.outputs_metrics) {
    scoped.outputs_metrics = implementation.outputs_metrics;
  }
  if (allowed.includes("quality_fidelity") && implementation.quality_fidelity) {
    scoped.quality_fidelity = implementation.quality_fidelity;
  }

  return Object.keys(scoped).length > 0 ? (scoped as LogicModel["implementation"]) : undefined;
}

function constrainPatchToResponseDomain(
  patch: Partial<LogicModel> | null,
  responseDomain: QuestionIntent | undefined
): Partial<LogicModel> | null {
  if (!patch || !responseDomain) return patch;

  const constrained: Partial<LogicModel> = {};
  if (patch.stakeholders?.length) {
    constrained.stakeholders = patch.stakeholders;
  }

  switch (responseDomain) {
    case "impact_aspiration":
    case "impact_change_type":
    case "impact_specificity":
    case "impact_review":
    case "long_term_help":
    case "geography":
    case "population_focus": {
      if (patch.intended_impact) {
        constrained.intended_impact = patch.intended_impact;
      }
      break;
    }
    case "resources": {
      const implementation = buildScopedImplementation(patch.implementation, ["resources"]);
      if (implementation) {
        constrained.implementation = implementation;
      }
      break;
    }
    case "activities": {
      const implementation = buildScopedImplementation(patch.implementation, ["activities"]);
      if (implementation) {
        constrained.implementation = implementation;
      }
      break;
    }
    case "outputs_metrics": {
      const implementation = buildScopedImplementation(patch.implementation, ["outputs_metrics"]);
      if (implementation) {
        constrained.implementation = implementation;
      }
      break;
    }
    case "quality_evidence": {
      const implementation = buildScopedImplementation(patch.implementation, ["quality_fidelity"]);
      if (implementation) {
        constrained.implementation = implementation;
      }
      break;
    }
    case "outcomes_review": {
      if (patch.outcomes) {
        constrained.outcomes = patch.outcomes;
      }
      break;
    }
    case "section_refine": {
      return patch;
    }
    default:
      return patch;
  }

  return Object.keys(constrained).length > 0 ? constrained : null;
}

function removeBlankImpactFacetFields(
  patch: Partial<LogicModel> | null
): Partial<LogicModel> | null {
  if (!patch?.intended_impact) return patch;

  const nextPatch = structuredClone(patch);
  const nextImpact = {
    ...(nextPatch.intended_impact ?? {}),
  } as Partial<LogicModel["intended_impact"]>;

  for (const key of ["population", "geography", "long_term_goal"] as const) {
    const value = nextImpact[key];
    if (typeof value === "string" && value.trim().length === 0) {
      delete nextImpact[key];
    }
  }

  if (Object.keys(nextImpact).length === 0) {
    delete nextPatch.intended_impact;
  } else {
    nextPatch.intended_impact = nextImpact as LogicModel["intended_impact"];
  }

  return Object.keys(nextPatch).length > 0 ? nextPatch : null;
}

function mapSectionToContractDomain(section: LogicSection): QuestionIntent | undefined {
  switch (section) {
    case "impact":
      return "population_focus";
    case "resources":
      return "resources";
    case "activities":
      return "activities";
    case "outputs_metrics":
      return "outputs_metrics";
    case "quality_fidelity":
      return "quality_evidence";
    case "outcomes":
      return "outcomes_review";
    case "stakeholders":
      return undefined;
    default:
      return undefined;
  }
}

function enforceSectionPatchContract(args: {
  patch: Partial<LogicModel> | null;
  responseDomain: QuestionIntent | undefined;
  focusLock: ConversationFocusLock | null;
  enabled: boolean;
}): {
  patch: Partial<LogicModel> | null;
  droppedByResponseDomain: boolean;
  droppedByFocusLock: boolean;
  focusLockContractDomain: QuestionIntent | null;
} {
  if (!args.enabled) {
    return {
      patch: args.patch,
      droppedByResponseDomain: false,
      droppedByFocusLock: false,
      focusLockContractDomain: null,
    };
  }

  let nextPatch = args.patch;
  let droppedByResponseDomain = false;
  let droppedByFocusLock = false;

  const patchEquals = (a: Partial<LogicModel> | null, b: Partial<LogicModel> | null): boolean =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  if (args.responseDomain) {
    const constrained = constrainPatchToResponseDomain(nextPatch, args.responseDomain);
    droppedByResponseDomain = !patchEquals(nextPatch, constrained);
    nextPatch = constrained;
  }

  const focusLockContractDomain = args.focusLock
    ? mapSectionToContractDomain(args.focusLock.section)
    : undefined;

  if (focusLockContractDomain) {
    const constrained = constrainPatchToResponseDomain(nextPatch, focusLockContractDomain);
    droppedByFocusLock = !patchEquals(nextPatch, constrained);
    nextPatch = constrained;
  }

  return {
    patch: nextPatch,
    droppedByResponseDomain,
    droppedByFocusLock,
    focusLockContractDomain: focusLockContractDomain ?? null,
  };
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
  impact_statement: [
    /(intended\s+impact\s+statement|draft\s+statement|statement\s+capture|capture\s+your\s+ultimate\s+goal)/i,
  ],
  impact_population_facet: [
    /(who\s+is\s+this\s+for|primary\s+population|which\s+students|target\s+population|who\s+exactly\s+do\s+you\s+serve)/i,
  ],
  impact_geography_facet: [
    /(where\s+do\s+you\s+serve|what\s+place\s+should\s+anchor|which\s+neighborhood|citywide|zip\s+codes?|geograph)/i,
  ],
  impact_outcome_facet: [
    /(what\s+concrete\s+long-term\s+change|what\s+exact\s+difference|ultimate\s+outcome|long-term\s+impact\s+you\s+expect)/i,
  ],
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
    /(particular\s+subset|specific\s+group|particular group|subgroup|specific schools|backgrounds?|circumstances?|confirm who you reach)/i,
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
  none: [/^$/],
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
  const impactState = deriveImpactFacetState(modelSnapshot);
  const latestMessage = latestUserMessage.trim();
  const historyUserText = safeHistory
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");

  const contextText = `${historyUserText}\n${latestMessage}`;
  const modelOutcome = `${modelSnapshot?.intended_impact.long_term_goal ?? ""} ${
    modelSnapshot?.intended_impact.compiled_statement ?? ""
  }`;

  const populationKnown =
    impactState.populationKnown ||
    looksSpecificPopulation(contextText);
  const geographyKnown =
    impactState.geographyKnown ||
    looksSpecificGeography(contextText);
  const concreteOutcomeKnown =
    impactState.concreteOutcomeKnown || hasConcreteImpactMarker(modelOutcome) || hasConcreteImpactMarker(contextText);

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
  if (modelPatch?.intended_impact?.compiled_statement?.trim()) return true;

  return /(draft\s+(?:intended\s+)?impact|does\s+that\s+capture|capture\s+your\s+intent|revise\s+the\s+impact\s+statement)/i.test(
    reply
  );
}

function buildImpactMissingFollowUp(missingIntent: QuestionIntent | undefined): string {
  switch (missingIntent) {
    case "population_focus":
      return "I can see the draft intended impact statement, but it still needs a clearer population anchor. Who is this impact statement really about?";
    case "geography":
      return "I can see the draft intended impact statement, but it still needs a place anchor. What place should we anchor that statement to (for example, citywide, neighborhoods, or specific schools)?";
    case "impact_specificity":
    default:
      return "I can see the draft intended impact statement, but it still needs a sharper long-term outcome. What exact long-term difference should it point to in 10 years (for example: sustained school progression, credential completion, stable employment, stable housing, improved health, or reduced justice-system involvement)?";
  }
}

function looksLikeOutputVolumeEvidence(text: string): boolean {
  return /(attendance|participants?\s+served|number\s+of\s+(?:students?|participants?|sessions?|hours?)|sessions?\s+delivered|hours?\s+delivered|reach|count(?:s|ed)?)/i.test(
    text
  );
}

function looksLikeQualityFidelityEvidence(text: string): boolean {
  return /(fidelity|quality|adherence|as\s+designed|dosage|observation\s+rubric|facilitator\s+observation|participant\s+satisfaction|engagement|retention|implementation\s+checklist)/i.test(
    text
  );
}

function refineRepeatedQualityQuestion(
  reply: string,
  questionIntent: ParsedQuestionIntent | undefined,
  stateIntent: QuestionIntent | undefined,
  latestUserMessage: string
): { reply: string; questionIntent: ParsedQuestionIntent | undefined } {
  if (stateIntent !== "quality_evidence" || questionIntent !== "quality_evidence") {
    return { reply, questionIntent };
  }

  const focus = getQuestionFocusText(reply);
  const canonical = buildCanonicalQuestionForIntent("quality_evidence");
  const canonicalText = canonical?.trim().toLowerCase() ?? "";
  const isCanonicalRepeat =
    focus.hasQuestion &&
    canonicalText.length > 0 &&
    focus.text.trim().toLowerCase() === canonicalText;

  if (!isCanonicalRepeat) {
    return { reply, questionIntent };
  }

  const userHasOutputEvidence = looksLikeOutputVolumeEvidence(latestUserMessage);
  const userHasQualityEvidence = looksLikeQualityFidelityEvidence(latestUserMessage);
  if (!userHasOutputEvidence || userHasQualityEvidence) {
    return { reply, questionIntent };
  }

  return {
    reply:
      "Thanks - that helps for output volume. For implementation fidelity and quality, what evidence shows delivery matched the design and participants experienced it well (for example facilitator observation rubrics, adherence checks, or participant satisfaction feedback)?",
    questionIntent: "quality_evidence",
  };
}

function buildCompiledStatement(population: string, geography: string, longTermGoal: string): string | undefined {
  return guardrailBuildCompiledStatement(population, geography, longTermGoal);
}

/**
 * Emit a structured warning when the agentic path drops to legacy.
 * Fields are logged so that the RAG knowledge gaps that triggered the
 * fallback can be identified and addressed.
 */
function logAgenticFallback(
  reason: string,
  userMessage: string,
  modelSnapshot: LogicModel | undefined,
  historyLength: number
): void {
  const impact = modelSnapshot?.intended_impact;
  console.warn("[agentic-legacy-fallback]", JSON.stringify({
    reason,
    timestamp: new Date().toISOString(),
    userMessagePreview: userMessage.slice(0, 300),
    historyTurns: historyLength,
    modelState: {
      hasPopulation: Boolean(impact?.population?.trim()),
      hasGeography: Boolean(impact?.geography?.trim()),
      hasLongTermGoal: Boolean(impact?.long_term_goal?.trim()),
      hasCompiledStatement: Boolean(impact?.compiled_statement?.trim()),
      hasStakeholders: (modelSnapshot?.stakeholders?.length ?? 0) > 0,
      hasActivities: (modelSnapshot?.implementation?.activities?.length ?? 0) > 0,
      hasOutcomes:
        (modelSnapshot?.outcomes?.short_term?.length ?? 0) +
        (modelSnapshot?.outcomes?.medium_term?.length ?? 0) +
        (modelSnapshot?.outcomes?.long_term?.length ?? 0) > 0,
    },
    ragHint: "Review what the user said and which knowledge chunks would have guided the agentic parse.",
  }));
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

function isRevisionLifecycleShape(value: unknown): value is AgentRevisionLifecycle {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.status !== "none" && v.status !== "pending" && v.status !== "accepted" && v.status !== "dismissed") {
    return false;
  }

  if (v.originalText !== undefined && typeof v.originalText !== "string") return false;
  if (v.revisedText !== undefined && typeof v.revisedText !== "string") return false;
  if (v.rationale !== undefined && typeof v.rationale !== "string") return false;
  if (v.updatedAt !== undefined && typeof v.updatedAt !== "number") return false;
  return true;
}

function isConversationFocusLockShape(value: unknown): value is ConversationFocusLock {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const isSection =
    v.section === "impact" ||
    v.section === "resources" ||
    v.section === "activities" ||
    v.section === "outputs_metrics" ||
    v.section === "quality_fidelity" ||
    v.section === "outcomes" ||
    v.section === "stakeholders";
  const isReason =
    v.reason === "bootstrap_recommendation" ||
    v.reason === "user_section_selection" ||
    v.reason === "carry_forward";
  return isSection && isReason && typeof v.acquiredAtTurn === "number";
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

  const nextResources = { ...snapshot.implementation.resources };
  const patchResources = patch.implementation?.resources;
  if (patchResources) {
    for (const key of ["human", "material", "financial", "knowledge"] as const) {
      const values = patchResources[key];
      if (Array.isArray(values) && values.length > 0) {
        nextResources[key] = values;
      }
    }
  }

  const patchQuality = patch.implementation?.quality_fidelity;
  const nextQuality = {
    fidelity:
      Array.isArray(patchQuality?.fidelity) && patchQuality.fidelity.length > 0
        ? patchQuality.fidelity
        : snapshot.implementation.quality_fidelity.fidelity,
    quality:
      Array.isArray(patchQuality?.quality) && patchQuality.quality.length > 0
        ? patchQuality.quality
        : snapshot.implementation.quality_fidelity.quality,
  };

  const nextActivities =
    Array.isArray(patch.implementation?.activities) && patch.implementation.activities.length > 0
      ? patch.implementation.activities
      : snapshot.implementation.activities;

  const nextOutputsMetrics =
    Array.isArray(patch.implementation?.outputs_metrics) && patch.implementation.outputs_metrics.length > 0
      ? patch.implementation.outputs_metrics
      : snapshot.implementation.outputs_metrics;

  const nextOutcomes = {
    short_term:
      Array.isArray(patch.outcomes?.short_term) && patch.outcomes.short_term.length > 0
        ? patch.outcomes.short_term
        : snapshot.outcomes.short_term,
    medium_term:
      Array.isArray(patch.outcomes?.medium_term) && patch.outcomes.medium_term.length > 0
        ? patch.outcomes.medium_term
        : snapshot.outcomes.medium_term,
    long_term:
      Array.isArray(patch.outcomes?.long_term) && patch.outcomes.long_term.length > 0
        ? patch.outcomes.long_term
        : snapshot.outcomes.long_term,
  };

  return {
    ...snapshot,
    intended_impact: patch.intended_impact
      ? { ...snapshot.intended_impact, ...patch.intended_impact }
      : snapshot.intended_impact,
    stakeholders: patch.stakeholders ?? snapshot.stakeholders,
    implementation: {
      ...snapshot.implementation,
      resources: nextResources,
      activities: nextActivities,
      outputs_metrics: nextOutputsMetrics,
      quality_fidelity: nextQuality,
    },
    outcomes: nextOutcomes,
  };
}

function buildCanonicalQuestionForIntent(intent: QuestionIntent): string | undefined {
  switch (intent) {
    case "population_focus":
      return "I can see a draft intended impact statement, but it still needs a clearer population anchor. Who is this impact statement really about?";
    case "geography":
      return "I can see the draft intended impact statement, but it still needs a place anchor. What place should anchor this intended impact statement (for example, citywide, neighborhoods, or specific sites) before we lock resources?";
    case "impact_specificity":
      return "I can see the draft intended impact statement, but it still needs a sharper long-term outcome. What concrete long-term change should this intended impact statement point to in 10 years?";
    case "resources":
      return "What are the key resources needed to run this program (people, materials, funding, and expertise)?";
    case "activities":
      return "What are the main activity categories your team delivers in a typical cycle?";
    case "outputs_metrics":
      return "How will you count whether those activities happened (for example participants reached, sessions delivered, or hours)?";
    case "outcomes_review":
      return "What outcomes should we expect, and what should short term, medium term, and long term results look like?";
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
  stateIntent: QuestionIntent | undefined,
  options?: { strict?: boolean }
): { reply: string; questionIntent: ParsedQuestionIntent | undefined } {
  const strict = options?.strict ?? true;

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

  const stateCompatible = focus.hasQuestion
    ? isIntentCompatibleWithQuestion(stateIntent, focus.text)
    : false;

  if (!strict) {
    // Soft mode (agentic): preserve coherent model-authored questions and
    // only enforce canonical progression when no usable question exists.
    if (focus.hasQuestion && (explicitCompatible || stateCompatible)) {
      return {
        reply,
        questionIntent: questionIntent && questionIntent !== "none" ? questionIntent : stateIntent,
      };
    }

    if (focus.hasQuestion) {
      return { reply, questionIntent };
    }

    return {
      reply: canonicalQuestion,
      questionIntent: stateIntent,
    };
  }

  if (focus.hasQuestion && explicitCompatible && questionIntent === stateIntent) {
    return { reply, questionIntent };
  }

  return {
    reply: canonicalQuestion,
    questionIntent: stateIntent,
  };
}

function applyQuestionPlanGuard(
  reply: string,
  questionIntent: ParsedQuestionIntent | undefined,
  questionPlan:
    | {
        shouldAsk?: boolean;
        draftQuestion?: string;
      }
    | undefined
): { reply: string; questionIntent: ParsedQuestionIntent | undefined; planApplied: boolean } {
  if (!questionPlan) {
    return { reply, questionIntent, planApplied: false };
  }

  if (questionPlan.shouldAsk === false) {
    return {
      reply,
      questionIntent: "none",
      planApplied: true,
    };
  }

  const focus = getQuestionFocusText(reply);
  if (questionPlan.shouldAsk && !focus.hasQuestion && questionPlan.draftQuestion?.trim()) {
    return {
      reply: `${reply}\n\n${questionPlan.draftQuestion.trim()}`,
      questionIntent,
      planApplied: true,
    };
  }

  return {
    reply,
    questionIntent,
    planApplied: true,
  };
}

function shouldRequestImpactSpecificity(
  modelPatch: Partial<LogicModel> | null,
  options?: {
    currentIntent?: ParsedQuestionIntent;
    snapshot?: LogicModel;
  }
): boolean {
  const currentIntent = options?.currentIntent;
  // Never rewind to impact-specificity if the flow is already in a non-impact section.
  if (
    currentIntent &&
    !["impact_aspiration", "impact_change_type", "impact_specificity", "impact_review", "long_term_help", "none"].includes(
      currentIntent
    )
  ) {
    return false;
  }

  // If a compiled statement already exists on the snapshot, the impact statement was
  // previously accepted and we should not regress back to this prompt.
  if (options?.snapshot?.intended_impact?.compiled_statement?.trim()) {
    return false;
  }

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

function normalizeQuickReplyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEchoLikeQuickReply(candidate: QuickReply, assistantReply: string): boolean {
  if (candidate.action === "open-input" || candidate.value === "__type__") {
    return false;
  }

  const focus = getQuestionFocusText(assistantReply).text || assistantReply;
  const normalizedQuestion = normalizeQuickReplyText(focus);
  if (!normalizedQuestion) return false;

  const normalizedValue = normalizeQuickReplyText(candidate.value || "");
  const normalizedLabel = normalizeQuickReplyText(candidate.label || "");
  const probe = normalizedValue || normalizedLabel;
  if (!probe) return false;

  if (probe === normalizedQuestion) return true;
  if (probe.length >= 16 && (normalizedQuestion.includes(probe) || probe.includes(normalizedQuestion))) {
    return true;
  }

  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "what",
    "which",
    "should",
    "would",
    "could",
    "your",
    "our",
    "from",
    "into",
    "about",
    "next",
  ]);

  const questionTokens = normalizedQuestion
    .split(" ")
    .filter((token) => token.length > 2 && !stopwords.has(token));
  const probeTokens = probe
    .split(" ")
    .filter((token) => token.length > 2 && !stopwords.has(token));

  if (questionTokens.length === 0 || probeTokens.length === 0) return false;

  const questionSet = new Set(questionTokens);
  const overlap = probeTokens.filter((token) => questionSet.has(token)).length;
  return overlap / probeTokens.length >= 0.75 && probeTokens.length >= 3;
}

function sanitizeQuickReplies(
  replies: QuickReply[] | undefined,
  assistantReply: string
): QuickReply[] | undefined {
  if (!replies || replies.length === 0) return undefined;

  const seen = new Set<string>();
  const cleaned: QuickReply[] = [];

  for (const reply of replies) {
    const label = (reply.label ?? "").trim();
    const value = (reply.value ?? "").trim();
    if (!label || !value) continue;
    if (isEchoLikeQuickReply(reply, assistantReply)) continue;

    const key = `${label.toLowerCase()}::${value.toLowerCase()}::${reply.action ?? "send"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ ...reply, label, value });
  }

  if (cleaned.length === 0) return undefined;
  return ensureTypeQuickReply(cleaned);
}

function isLogicModelConceptQuestion(userMessage: string): boolean {
  const text = userMessage.trim();
  if (!text) return false;

  const asksConcept =
    /\b(what|how|why|difference|different|explain|define|meaning|clarify|help me understand)\b/i.test(text) ||
    text.includes("?");

  if (!asksConcept) return false;

  return /\b(logic model|outcomes?|outputs?|activities|resources|inputs?|fidelity|quality|stakeholders?|theory of change|impact statement|short-term|medium-term|long-term)\b/i.test(
    text
  );
}

function applyConceptTangentResumePrompt(reply: string, userMessage: string): { reply: string; applied: boolean } {
  if (!isLogicModelConceptQuestion(userMessage)) {
    return { reply, applied: false };
  }

  if (/continue\s+(?:populating|building)|proceed\s+with\s+populating|resume\s+the\s+logic\s+model/i.test(reply)) {
    return { reply, applied: true };
  }

  return {
    reply: `${reply}\n\nWould you like to continue populating your logic model now?`,
    applied: true,
  };
}

function isOffTopicTangent(userMessage: string, history: ChatMessage[]): boolean {
  const text = userMessage.trim();
  if (!text || !text.includes("?")) return false;
  if (isLogicModelConceptQuestion(text)) return false;
  if (/\b(logic model|impact|resources|activities|outputs?|outcomes?|quality|fidelity|stakeholders?)\b/i.test(text)) {
    return false;
  }

  const context = history.map((entry) => entry.content).join("\n");
  return /\b(logic model|intended impact|resources|activities|outcomes?|quality|fidelity|stakeholders?)\b/i.test(context);
}

function buildOffTopicRedirect(focusSection?: string): string {
  const focusLabel =
    focusSection === "impact"
      ? "intended impact"
      : focusSection === "stakeholders"
        ? "stakeholders"
        : focusSection || "logic model";

  return `I can help with your logic model, but I'm going to stay focused on that work. If you want to continue, tell me more about your ${focusLabel}.`;
}

function getConceptTangentQuickReplies(): QuickReply[] {
  return ensureTypeQuickReply([
    { label: "Yes, continue the model", value: "Yes, let's continue populating the logic model." },
    { label: "One more concept question", value: "I have one more logic model concept question." },
  ]);
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

  if (/(how would you count|unit of measure|participants|sessions|outputs?|track.*deliver|attendance|hours of service|how many|count\b|measure\b|metrics?)/i.test(reply)) {
    return "outputs_metrics";
  }

  if (/(program quality|fidelity|satisfaction|interviews?|retention|how well implemented|quality measures)/i.test(reply)) {
    return "quality_evidence";
  }

  if (
    /(resource|staff|volunteer|partner|funding|curriculum|technology|equipment|inputs?|materials?|expertise)/i.test(reply) &&
    /(what|who|how|tell me|describe|list|name|share|outline|walk me through|please\s+list)/i.test(reply)
  ) {
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

