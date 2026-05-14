import type { LogicModel, QuickReply } from "@/store/useLogicModelStore";

function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function resourceBucketCount(resources: LogicModel["implementation"]["resources"] | undefined): number {
  if (!resources) return 0;
  let count = 0;
  for (const key of ["human", "material", "financial", "knowledge"] as const) {
    if (Array.isArray(resources[key]) && resources[key].some((entry) => isNonEmpty(entry))) {
      count += 1;
    }
  }
  return count;
}

function toCompiledStatement(impact: Partial<LogicModel["intended_impact"]>): string {
  const population = impact.population?.trim() || "the target population";
  const geography = impact.geography?.trim() || "the target geography";
  const longTermGoal = impact.long_term_goal?.trim() || "a meaningful long-term outcome";
  return `${population} in ${geography} will experience ${longTermGoal}.`;
}

function mergeForStage(snapshot: LogicModel | undefined, patch: Partial<LogicModel>): LogicModel {
  const base: LogicModel = snapshot
    ? structuredClone(snapshot)
    : {
        intended_impact: { population: "", geography: "", long_term_goal: "", compiled_statement: "" },
        stakeholders: [],
        implementation: {
          resources: { human: [], material: [], financial: [], knowledge: [] },
          activities: [],
          outputs_metrics: [],
          quality_fidelity: { fidelity: [], quality: [] },
        },
        outcomes: { short_term: [], medium_term: [], long_term: [] },
      };

  if (patch.intended_impact) {
    base.intended_impact = {
      ...base.intended_impact,
      ...patch.intended_impact,
    };
  }

  if (patch.implementation?.resources) {
    for (const key of ["human", "material", "financial", "knowledge"] as const) {
      const incoming = patch.implementation.resources[key];
      if (Array.isArray(incoming) && incoming.length > 0) {
        base.implementation.resources[key] = incoming;
      }
    }
  }

  if (Array.isArray(patch.implementation?.activities) && patch.implementation.activities.length > 0) {
    base.implementation.activities = patch.implementation.activities;
  }

  if (patch.implementation?.quality_fidelity) {
    if (Array.isArray(patch.implementation.quality_fidelity.quality) && patch.implementation.quality_fidelity.quality.length > 0) {
      base.implementation.quality_fidelity.quality = patch.implementation.quality_fidelity.quality;
    }
    if (Array.isArray(patch.implementation.quality_fidelity.fidelity) && patch.implementation.quality_fidelity.fidelity.length > 0) {
      base.implementation.quality_fidelity.fidelity = patch.implementation.quality_fidelity.fidelity;
    }
  }

  if (patch.outcomes) {
    for (const key of ["short_term", "medium_term", "long_term"] as const) {
      const incoming = patch.outcomes[key];
      if (Array.isArray(incoming) && incoming.length > 0) {
        base.outcomes[key] = incoming;
      }
    }
  }

  return base;
}

function inferLongTermGoal(
  existing: string | undefined,
  message: string,
  longTermOutcomes: Array<{ statement?: string }> | undefined
): string {
  if (isNonEmpty(existing)) return existing!.trim();

  const fromOutcome = longTermOutcomes?.find((entry) => isNonEmpty(entry.statement))?.statement;
  if (isNonEmpty(fromOutcome)) return fromOutcome!.trim();

  const goalMatch = message.match(
    /(?:long[-\s]?term\s+goal\s+is|goal\s+is|our\s+goal\s+is|hope\s+to|aim\s+to|over\s+time\s+we\s+expect)\s+([^.!?]+)/i
  );
  if (goalMatch?.[1]) return goalMatch[1].trim();

  const byMatch = message.match(/\bby\s+([^.!?]*(?:reducing|improving|increasing|decreasing|providing|building|creating)[^.!?]*)/i);
  if (byMatch?.[1]) return byMatch[1].trim();

  return "";
}

function messageContainsGoalSignal(message: string): boolean {
  return /long[-\s]?term\s+goal|goal\s+is|hope\s+to|aim\s+to|over\s+time\s+we\s+expect/i.test(message);
}

export type CompatibilityIntent = "impact" | "resources" | "activities" | "quality_fidelity" | "outcomes" | "summary";

export interface CompatibilityResult {
  finalIntent: CompatibilityIntent;
  reply: string;
  quickReplies: QuickReply[];
  patch: Partial<LogicModel>;
}

function buildAnswerQuickReplies(intent: CompatibilityIntent): QuickReply[] {
  if (intent === "impact") {
    return [
      {
        label: "Our long-term goal is...",
        value: "Our long-term goal is ",
        action: "prefill",
      },
      {
        label: "We serve [population] in [geography]",
        value: "We serve [population] in [geography].",
        action: "prefill",
      },
    ];
  }

  if (intent === "resources") {
    return [
      {
        label: "People and partners",
        value: "Our key people and partners are ",
        action: "prefill",
      },
      {
        label: "Materials and tools",
        value: "Our materials and tools include ",
        action: "prefill",
      },
      {
        label: "Funding and expertise",
        value: "Our funding and expertise come from ",
        action: "prefill",
      },
    ];
  }

  if (intent === "activities") {
    return [
      {
        label: "Main activities",
        value: "Our main activities are ",
        action: "prefill",
      },
      {
        label: "Frequency and outputs",
        value: "We run these activities [frequency], producing ",
        action: "prefill",
      },
    ];
  }

  if (intent === "quality_fidelity") {
    return [
      {
        label: "Fidelity standards",
        value: "To maintain fidelity, we use ",
        action: "prefill",
      },
      {
        label: "Quality checks",
        value: "To ensure quality, we require ",
        action: "prefill",
      },
    ];
  }

  if (intent === "outcomes") {
    return [
      {
        label: "Short/medium/long-term outcomes",
        value: "Short term: ... Medium term: ... Long term: ...",
        action: "prefill",
      },
      {
        label: "Short-term outcomes",
        value: "Short term outcomes include ",
        action: "prefill",
      },
    ];
  }

  return [
    {
      label: "Summarize the model",
      value: "Please summarize the full logic model.",
      action: "send",
    },
  ];
}

export function buildCompatibilityTurn(args: {
  patch: Partial<LogicModel>;
  message: string;
  assistantReply: string;
  modelSnapshot?: LogicModel;
  stageHint?: string | null;
}): CompatibilityResult {
  const patch: Partial<LogicModel> = structuredClone(args.patch);
  const impact = patch.intended_impact;

  if (impact) {
    impact.long_term_goal = inferLongTermGoal(impact.long_term_goal, args.message, patch.outcomes?.long_term);
  }

  const merged = mergeForStage(args.modelSnapshot, patch);

  if (!isNonEmpty(merged.intended_impact.long_term_goal)) {
    merged.intended_impact.long_term_goal = inferLongTermGoal(
      merged.intended_impact.long_term_goal,
      args.message,
      merged.outcomes.long_term
    );
  }

  const resourceBuckets = resourceBucketCount(merged.implementation.resources);
  const hasActivities = (merged.implementation.activities?.length ?? 0) > 0;
  const hasQuality =
    (merged.implementation.quality_fidelity.quality?.length ?? 0) > 0 ||
    (merged.implementation.quality_fidelity.fidelity?.length ?? 0) > 0;
  const hasShort = (merged.outcomes.short_term?.length ?? 0) > 0;
  const hasMedium = (merged.outcomes.medium_term?.length ?? 0) > 0;
  const hasLong = (merged.outcomes.long_term?.length ?? 0) > 0;

  const normalizedMessage = args.message.toLowerCase();
  const messageSignals = {
    outcomes: /short\s*term|medium\s*term|long\s*term|outcomes?|results?|impact/.test(normalizedMessage),
    quality: /quality|fidelity|checklist|standards?|manual|handbook|protocol/.test(normalizedMessage),
    activities: /activities?|workshops?|meetings?|meet with|work on|run|hold|deliver|teach/.test(normalizedMessage),
    resources: /resources?|staff|volunteers?|funding|grants?|budget|tools?|materials?|curriculum|expertise|partnership|bank|library/.test(normalizedMessage),
  };

  let finalIntent: CompatibilityIntent = "impact";
  let followUp = "";

  if (messageSignals.outcomes) {
    finalIntent = "outcomes";
  } else if (messageSignals.quality) {
    finalIntent = "quality_fidelity";
  } else if (messageSignals.resources) {
    finalIntent = "resources";
  } else if (messageSignals.activities) {
    finalIntent = "activities";
  } else if (!isNonEmpty(merged.intended_impact.population) || !isNonEmpty(merged.intended_impact.geography) || !isNonEmpty(merged.intended_impact.long_term_goal)) {
    finalIntent = "impact";
  } else if (resourceBuckets < 3) {
    finalIntent = "resources";
  } else if (!hasActivities) {
    finalIntent = "activities";
  } else if (!hasQuality) {
    finalIntent = "quality_fidelity";
  } else if (!hasShort || !hasMedium || !hasLong) {
    finalIntent = "outcomes";
  }

  if (finalIntent === "impact") {
    if (!isNonEmpty(merged.intended_impact.long_term_goal) && !messageContainsGoalSignal(args.message)) {
      followUp = "Thanks, I captured the impact details so far. What specific long-term goal should we capture so the impact statement is complete?";
    } else {
      followUp = "Great, I captured your intended impact. Next, what resources support this work?";
    }
  } else if (finalIntent === "resources") {
    followUp = resourceBuckets < 3
      ? "What resources, materials, and expertise support this work, in addition to your current staff and funding?"
      : "Great, I captured those resources. What materials and expertise are still part of the work before we move to activities?";
  } else if (finalIntent === "activities") {
    if (!hasActivities) {
      followUp = "What activities should we capture next? Please describe the key actions and outputs.";
    } else {
      followUp = "Thanks, I captured those activities. How do you ensure quality and fidelity?";
    }
  } else if (finalIntent === "quality_fidelity") {
    if (!hasQuality || !isNonEmpty(merged.implementation.quality_fidelity.fidelity?.[0])) {
      followUp = "How do you ensure quality and fidelity standards in delivery?";
    } else {
      followUp = "Great, I captured your quality and fidelity standards. What outcomes should we expect next?";
    }
  } else if (finalIntent === "outcomes") {
    if (!hasShort || !hasMedium || !hasLong) {
      followUp = "What should short term, medium term, and long term outcomes look like?";
    } else {
      followUp = "Great, this is complete. I captured the outcomes and can summarize the full logic model now.";
    }
  } else {
    followUp = "Great, this is complete. I can finish and summarize the full logic model now.";
  }

  if (
    isNonEmpty(merged.intended_impact.population) &&
    isNonEmpty(merged.intended_impact.geography) &&
    isNonEmpty(merged.intended_impact.long_term_goal)
  ) {
    patch.intended_impact = {
      ...(patch.intended_impact ?? {}),
      population: patch.intended_impact?.population ?? merged.intended_impact.population,
      geography: patch.intended_impact?.geography ?? merged.intended_impact.geography,
      long_term_goal: patch.intended_impact?.long_term_goal ?? merged.intended_impact.long_term_goal,
      compiled_statement: toCompiledStatement(merged.intended_impact),
    };
  }

  const quickReplies = buildAnswerQuickReplies(finalIntent);

  const acknowledgment = args.assistantReply.split(/[.!?]/)[0]?.trim() || "Thanks";
  const reply = `${acknowledgment}. ${followUp}`;

  return {
    finalIntent,
    reply,
    quickReplies,
    patch,
  };
}
