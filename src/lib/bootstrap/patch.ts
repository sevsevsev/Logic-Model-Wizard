import type { LogicModel } from "@/store/useLogicModelStore";
import { deriveImpactFacetState } from "@/lib/chat/guardrails";
import type { BootstrapSuggestion } from "@/lib/bootstrap/types";

type RefinementDomain = "impact" | "resources" | "activities" | "outcomes" | "stakeholders";

export interface BootstrapRefinementCoaching {
  note: string;
  question: string;
  broadRefinementNeeded: boolean;
}

function mergeUniqueStrings(base: string[] = [], incoming: string[] = []): string[] {
  return Array.from(new Set([...base, ...incoming]));
}

function mergeUniqueOutcomeEntries(
  base: Array<{ statement: string; stakeholderIds?: string[]; stakeholderLabels?: string[] }> = [],
  incoming: Array<{ statement: string; stakeholderIds?: string[]; stakeholderLabels?: string[] }> = []
) {
  const keyOf = (entry: {
    statement: string;
    stakeholderIds?: string[];
    stakeholderLabels?: string[];
  }) => {
    const stake = (entry.stakeholderIds ?? []).slice().sort().join("|");
    const labels = (entry.stakeholderLabels ?? []).slice().sort().join("|");
    return `${entry.statement.toLowerCase().trim()}::${stake}::${labels}`;
  };

  const deduped = new Map<
    string,
    { statement: string; stakeholderIds?: string[]; stakeholderLabels?: string[] }
  >();
  for (const item of [...base, ...incoming]) {
    if (!item.statement?.trim()) continue;
    deduped.set(keyOf(item), {
      statement: item.statement.trim(),
      stakeholderIds: item.stakeholderIds ?? [],
      stakeholderLabels: item.stakeholderLabels ?? [],
    });
  }
  return Array.from(deduped.values());
}

export function buildPatchFromSuggestions(suggestions: BootstrapSuggestion[]): Partial<LogicModel> {
  const patch: Partial<LogicModel> = {};

  for (const { path, value } of suggestions) {
    switch (path) {
      case "stakeholders": {
        if (Array.isArray(value)) {
          const labels = value.filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0
          );
          const mergedLabels = mergeUniqueStrings(
            (patch.stakeholders ?? []).map((s) => s.label || ""),
            labels
          );
          patch.stakeholders = mergedLabels.map((label) => ({
            id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
            label,
          }));
        }
        break;
      }

      case "intended_impact.population":
      case "intended_impact.geography":
      case "intended_impact.long_term_goal":
      case "intended_impact.compiled_statement": {
        patch.intended_impact ??= {} as LogicModel["intended_impact"];
        const key = path.split(".")[1] as keyof LogicModel["intended_impact"];
        if (typeof value === "string") {
          patch.intended_impact[key] = value;
        } else if (Array.isArray(value)) {
          const first = value.find(
            (v): v is string => typeof v === "string" && v.trim().length > 0
          );
          if (first) patch.intended_impact[key] = first;
        }
        break;
      }

      case "implementation.resources.human":
      case "implementation.resources.material":
      case "implementation.resources.financial":
      case "implementation.resources.knowledge": {
        patch.implementation ??= {} as LogicModel["implementation"];
        patch.implementation.resources ??= {
          human: [],
          material: [],
          financial: [],
          knowledge: [],
        };
        const key = path.split(".")[2] as keyof LogicModel["implementation"]["resources"];
        if (Array.isArray(value)) {
          patch.implementation.resources[key] = mergeUniqueStrings(
            patch.implementation.resources[key],
            value.filter((v): v is string => typeof v === "string")
          );
        }
        break;
      }

      case "implementation.activities": {
        if (Array.isArray(value)) {
          patch.implementation ??= {} as LogicModel["implementation"];
          patch.implementation.activities = value as LogicModel["implementation"]["activities"];
        }
        break;
      }

      case "outcomes.short_term":
      case "outcomes.medium_term":
      case "outcomes.long_term": {
        patch.outcomes ??= { short_term: [], medium_term: [], long_term: [] };
        const key = path.split(".")[1] as keyof LogicModel["outcomes"];
        if (Array.isArray(value)) {
          const normalized = value
            .map((v) => {
              if (typeof v === "string") return { statement: v, stakeholderIds: [] };
              if (
                v &&
                typeof v === "object" &&
                "statement" in v &&
                typeof (v as { statement?: unknown }).statement === "string"
              ) {
                const candidate = v as { statement: string; stakeholderIds?: string[] };
                return {
                  statement: candidate.statement,
                  stakeholderIds: Array.isArray(candidate.stakeholderIds)
                    ? candidate.stakeholderIds.filter((id): id is string => typeof id === "string")
                    : [],
                  stakeholderLabels:
                    "stakeholderLabels" in (v as object) &&
                    Array.isArray((v as { stakeholderLabels?: unknown }).stakeholderLabels)
                      ? (v as { stakeholderLabels?: unknown[] }).stakeholderLabels!.filter(
                          (label): label is string => typeof label === "string"
                        )
                      : [],
                };
              }
              return null;
            })
            .filter(
              (
                v
              ): v is {
                statement: string;
                stakeholderIds: string[];
                stakeholderLabels: string[];
              } => Boolean(v)
            );

          patch.outcomes[key] = mergeUniqueOutcomeEntries(patch.outcomes[key], normalized);
        }
        break;
      }
    }
  }

  return patch;
}

export function describeDetected(patch: Partial<LogicModel>): string[] {
  const found: string[] = [];
  if (
    patch.intended_impact?.compiled_statement ||
    patch.intended_impact?.long_term_goal ||
    patch.intended_impact?.population ||
    patch.intended_impact?.geography
  ) {
    found.push("intended impact");
  }
  const res = patch.implementation?.resources;
  if (res) {
    (["human", "material", "financial", "knowledge"] as const).forEach((k) => {
      if ((res[k]?.length ?? 0) > 0) found.push(`${k} resources`);
    });
  }
  const acts = patch.implementation?.activities;
  if (acts && acts.length > 0) found.push(`${acts.length} activit${acts.length === 1 ? "y" : "ies"}`);
  if ((patch.outcomes?.short_term?.length ?? 0) > 0) found.push("short-term outcomes");
  if ((patch.outcomes?.medium_term?.length ?? 0) > 0) found.push("medium-term outcomes");
  if ((patch.outcomes?.long_term?.length ?? 0) > 0) found.push("long-term outcomes");
  return found;
}

export function describeGaps(model: LogicModel): string[] {
  const gaps: string[] = [];
  const impactState = deriveImpactFacetState(model);
  if (!impactState.hasImpactDraft) {
    gaps.push("intended impact statement");
  } else {
    if (!impactState.populationKnown) gaps.push("who the impact statement is about");
    if (!impactState.geographyKnown) gaps.push("where the impact statement is anchored");
    if (!impactState.concreteOutcomeKnown) gaps.push("the long-term change in the impact statement");
  }
  const { human, material, financial, knowledge } = model.implementation.resources;
  if (human.length === 0 && material.length === 0 && financial.length === 0 && knowledge.length === 0) {
    gaps.push("resources");
  }
  if (model.implementation.activities.length === 0) gaps.push("activities");
  if (model.outcomes.short_term.length === 0) gaps.push("short-term outcomes");
  if (model.outcomes.medium_term.length === 0) gaps.push("medium-term outcomes");
  if (model.outcomes.long_term.length === 0) gaps.push("long-term outcomes");
  return gaps;
}

function toRefinementDomain(path: BootstrapSuggestion["path"]): RefinementDomain {
  if (path.startsWith("intended_impact.")) return "impact";
  if (path.startsWith("implementation.resources.")) return "resources";
  if (path === "implementation.activities") return "activities";
  if (path.startsWith("outcomes.")) return "outcomes";
  return "stakeholders";
}

function getRefinementQuestion(domain: RefinementDomain): string {
  switch (domain) {
    case "impact":
      return "Could you restate the intended impact in one concrete sentence with who, where, and the long-term change?";
    case "resources":
      return "Which 2-3 resources are most essential for delivery right now?";
    case "activities":
      return "What are the top 1-2 recurring activities your team consistently delivers?";
    case "outcomes":
      return "What is one measurable short-term and one long-term outcome you most want to track?";
    case "stakeholders":
      return "Who are the primary stakeholders we should center first?";
    default:
      return "Which section would you like to sharpen first?";
  }
}

export function buildRefinementCoaching(
  suggestions: BootstrapSuggestion[]
): BootstrapRefinementCoaching | null {
  const weakSuggestions = suggestions.filter((s) => s.qualityRating === "Weak");
  if (weakSuggestions.length === 0) return null;

  const domainCounts = new Map<RefinementDomain, number>();
  for (const suggestion of weakSuggestions) {
    const domain = toRefinementDomain(suggestion.path);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }

  const domainPriority: RefinementDomain[] = [
    "impact",
    "activities",
    "outcomes",
    "resources",
    "stakeholders",
  ];

  const sortedByCount = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);
  const highestCountDomain = sortedByCount[0]?.[0];
  const selectedDomain =
    domainPriority.find((domain) => domainCounts.has(domain)) ?? highestCountDomain ?? "impact";

  const broadRefinementNeeded =
    weakSuggestions.length >= 4 || weakSuggestions.length / Math.max(1, suggestions.length) >= 0.5;

  return {
    note: broadRefinementNeeded
      ? "I drafted this to reduce your workload. To keep this manageable, we can tighten one section at a time."
      : "I drafted this to reduce your workload. We can quickly sharpen one section before moving on.",
    question: getRefinementQuestion(selectedDomain),
    broadRefinementNeeded,
  };
}
