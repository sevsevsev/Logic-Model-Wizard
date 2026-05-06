import type { LogicModel } from "@/store/useLogicModelStore";
import type { BootstrapSuggestion } from "@/lib/bootstrap/types";

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
  if (patch.intended_impact?.population) found.push("target population");
  if (patch.intended_impact?.geography) found.push("geography");
  if (patch.intended_impact?.long_term_goal) found.push("long-term goal");
  if (patch.intended_impact?.compiled_statement) found.push("impact statement");
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
  if (!model.intended_impact.population) gaps.push("target population");
  if (!model.intended_impact.geography) gaps.push("geography");
  // If we already have a compiled impact statement from an uploaded document,
  // do not treat long_term_goal as a missing gap in the onboarding summary.
  if (!model.intended_impact.long_term_goal && !model.intended_impact.compiled_statement) {
    gaps.push("long-term goal");
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
