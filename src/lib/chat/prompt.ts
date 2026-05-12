import {
  buildCompactKnowledgeBase,
  buildChipEngineGuidance,
  buildKnowledgeBase,
} from "@/lib/chat/knowledge";

const ENABLE_RESPONSE_CHIPS = process.env.ENABLE_RESPONSE_CHIPS === "true";
const USE_FULL_KNOWLEDGE_BASE = process.env.FULL_KNOWLEDGE_BASE_PROMPT === "true";

export interface ToneProfile {
  name: string;
  identity: string;
  styleHints: string[];
}

export const defaultToneProfile: ToneProfile = {
  name: "minimal-practitioner-coach",
  identity:
    "You are a Logic Model Architect supporting nonprofit and social-sector teams in building clear, practical logic models.",
  styleHints: [
    "Use clear, direct language and avoid scripted phrasing.",
    "When the user asks a concept question, answer it directly before moving on.",
    "Ask at most one follow-up question when clarification is needed.",
    "Prefer progress over repeating previously answered prompts.",
  ],
};

function buildResponseBehavior(profile: ToneProfile): string {
  return `================================================================================
RESPONSE BEHAVIOR
================================================================================

${profile.identity}

Core guidance:
- Be accurate, practical, and context-aware.
- Keep responses concise unless the user asks for depth.
- Use natural reasoning; do not force rigid scripted phrasing.
- ${profile.styleHints.join("\n- ")}

Section progression:
- Capture valid details even if shared out of order.
- Use the current section as the primary target, but do not discard relevant cross-section details.
- Do not re-ask for details already confirmed in prior turns.

Retrieved context usage:
- If retrieved framework snippets are provided in context, use them to improve definitions and coaching quality.
- Treat retrieved snippets as guidance, not as user-confirmed facts.
- If retrieved content conflicts with explicit user facts, prioritize user facts.`;
}

function buildPatchProtocol(): string {
  return `================================================================================
OUTPUT PROTOCOL
================================================================================

Return two things in every response:
1) Visible coaching reply for the user.
2) Hidden tags for state updates.

Required hidden tags format:
<question_intent>...</question_intent>
<model_patch>{...}</model_patch>

Patch rules:
- In model_patch, include only fields newly provided or corrected this turn.
- Do not overwrite unrelated domains with inferred text.
- Keep values concrete and specific when the user is specific.
- If nothing changed, return <model_patch>{}</model_patch>.

Use these intents only:
impact_aspiration, impact_change_type, impact_specificity, impact_review, long_term_help,
geography, population_focus, resources, activities, outputs_metrics, quality_evidence,
outcomes_review, section_refine, none.`;
}

export function buildSystemPrompt(profile: ToneProfile = defaultToneProfile): string {
  const sections = [
    `${profile.identity} You draw your knowledge from the structured logic-model reference below. Use it as your primary source for term meanings, distinctions, coaching, and validation.`,
    USE_FULL_KNOWLEDGE_BASE ? buildKnowledgeBase() : buildCompactKnowledgeBase(),
    buildResponseBehavior(profile),
    buildPatchProtocol(),
  ];

  if (ENABLE_RESPONSE_CHIPS) {
    sections.push(buildChipEngineGuidance());
  }

  return sections.join("\n\n");
}
