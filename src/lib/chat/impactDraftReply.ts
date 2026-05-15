import type { LogicModel } from "@/store/useLogicModelStore";
import { deriveImpactFacetState, hasConcreteImpactMarker } from "@/lib/chat/guardrails";

interface EnforceImpactDraftAcknowledgementArgs {
  reply: string;
  userMessage: string;
  focusSection?: string;
  modelSnapshot?: LogicModel;
}

const BASELINE_IMPACT_QUESTION_REGEX =
  /(specific population|community your program is designed to serve|who is this impact statement really about|who is this intended impact statement really about|what population)/i;

const IMPACT_USER_FOCUS_REGEX = /(intended impact|impact statement|impact)/i;

function hasWorkingImpactDraft(modelSnapshot?: LogicModel): boolean {
  const impact = modelSnapshot?.intended_impact;
  if (!impact) return false;

  return Boolean(
    impact.compiled_statement?.trim() ||
      (impact.population?.trim() && impact.geography?.trim() && impact.long_term_goal?.trim())
  );
}

function buildTargetedImpactQuestion(modelSnapshot?: LogicModel): string {
  const impactState = deriveImpactFacetState(modelSnapshot);

  if (!impactState.populationKnown) {
    return "I can see the draft intended impact statement, but it still needs a clearer population anchor. Who is this impact statement really about?";
  }

  if (!impactState.geographyKnown) {
    return "I can see the draft intended impact statement, but it still needs a place anchor. What place should this statement be anchored to (for example, citywide, neighborhoods, or specific schools)?";
  }

  const impact = modelSnapshot?.intended_impact;
  const candidate = `${impact?.long_term_goal ?? ""} ${impact?.compiled_statement ?? ""}`;
  if (!hasConcreteImpactMarker(candidate)) {
    return "I can see the draft intended impact statement, but it still needs a sharper long-term outcome marker. What exact long-term difference should it point to in 10 years?";
  }

  return "I can see the working intended impact draft. What part should we tighten first: population precision, place anchor, or the long-term outcome wording?";
}

export function enforceImpactDraftAcknowledgement(
  args: EnforceImpactDraftAcknowledgementArgs
): string {
  const { reply, userMessage, focusSection, modelSnapshot } = args;

  if (!hasWorkingImpactDraft(modelSnapshot)) return reply;

  const userFocusedOnImpact = IMPACT_USER_FOCUS_REGEX.test(userMessage);
  const isImpactFocusSection = (focusSection ?? "").toLowerCase() === "impact";
  if (!userFocusedOnImpact && !isImpactFocusSection) return reply;

  if (!BASELINE_IMPACT_QUESTION_REGEX.test(reply)) return reply;

  return buildTargetedImpactQuestion(modelSnapshot);
}
