type MessageRole = "user" | "assistant";

type ChatMessage = {
  role: MessageRole;
  content: string;
};

type ResourceBuckets = {
  human: string[];
  material: string[];
  financial: string[];
  knowledge: string[];
};

type LogicModel = {
  intended_impact: {
    population: string;
    geography: string;
    long_term_goal: string;
    compiled_statement: string;
  };
  stakeholders: Array<Record<string, unknown>>;
  implementation: {
    resources: ResourceBuckets;
    activities: Array<Record<string, unknown>>;
    quality_fidelity: {
      fidelity: string[];
      quality: string[];
    };
  };
  outcomes: {
    short_term: Array<Record<string, unknown>>;
    medium_term: Array<Record<string, unknown>>;
    long_term: Array<Record<string, unknown>>;
  };
};

type ApiResponse = {
  reply?: string;
  modelPatch?: Partial<LogicModel> | null;
  llmMeta?: {
    path?: string;
    fallbackReason?: string | null;
    trace?: {
      finalIntent?: string | null;
      initialIntent?: string | null;
      stateIntent?: string | null;
      patchSource?: string | null;
      responseDomain?: string | null;
      effectiveResponseDomain?: string | null;
    };
  };
};

type TurnExpectation = {
  finalIntentOneOf?: string[];
  modelPatchMustHavePath?: string[];
  modelPatchResourceBucketsAtLeast?: number;
  replyMustNotMatch?: RegExp[];
};

type ScenarioTurn = {
  user: string;
  expect?: TurnExpectation;
};

type Scenario = {
  id: string;
  description: string;
  seedHistory?: ChatMessage[];
  turns: ScenarioTurn[];
  finalCheck?: (state: ScenarioState) => string[];
};

type ScenarioState = {
  history: ChatMessage[];
  model: LogicModel;
  responses: ApiResponse[];
};

type TurnResult = {
  turn: number;
  user: string;
  reply: string;
  finalIntent: string | null;
  stateIntent: string | null;
  patchSource: string | null;
  responseDomain: string | null;
  effectiveResponseDomain: string | null;
  resourceBucketsInPatch: number;
  failures: string[];
};

type ScenarioResult = {
  id: string;
  description: string;
  failures: string[];
  turnResults: TurnResult[];
};

const API_URL = process.env.CHAT_API_URL ?? "http://localhost:3100/api/chat";

function createEmptyModel(): LogicModel {
  return {
    intended_impact: {
      population: "",
      geography: "",
      long_term_goal: "",
      compiled_statement: "",
    },
    stakeholders: [],
    implementation: {
      resources: {
        human: [],
        material: [],
        financial: [],
        knowledge: [],
      },
      activities: [],
      quality_fidelity: {
        fidelity: [],
        quality: [],
      },
    },
    outcomes: {
      short_term: [],
      medium_term: [],
      long_term: [],
    },
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function mergeModel(model: LogicModel, patch: Partial<LogicModel> | null | undefined): LogicModel {
  if (!patch) return model;

  if (patch.intended_impact) {
    for (const key of ["population", "geography", "long_term_goal", "compiled_statement"] as const) {
      const value = patch.intended_impact[key];
      if (isNonEmptyString(value)) {
        model.intended_impact[key] = value;
      }
    }
  }

  if (Array.isArray(patch.stakeholders) && patch.stakeholders.length > 0) {
    model.stakeholders = patch.stakeholders;
  }

  if (patch.implementation?.resources) {
    for (const key of ["human", "material", "financial", "knowledge"] as const) {
      const nextValues = patch.implementation.resources[key];
      if (Array.isArray(nextValues) && nextValues.length > 0) {
        model.implementation.resources[key] = nextValues.filter(isNonEmptyString);
      }
    }
  }

  if (Array.isArray(patch.implementation?.activities) && patch.implementation.activities.length > 0) {
    model.implementation.activities = patch.implementation.activities;
  }

  if (patch.implementation?.quality_fidelity) {
    const fidelity = patch.implementation.quality_fidelity.fidelity;
    if (Array.isArray(fidelity) && fidelity.length > 0) {
      model.implementation.quality_fidelity.fidelity = fidelity.filter(isNonEmptyString);
    }

    const quality = patch.implementation.quality_fidelity.quality;
    if (Array.isArray(quality) && quality.length > 0) {
      model.implementation.quality_fidelity.quality = quality.filter(isNonEmptyString);
    }
  }

  if (patch.outcomes) {
    for (const key of ["short_term", "medium_term", "long_term"] as const) {
      const arr = patch.outcomes[key];
      if (Array.isArray(arr) && arr.length > 0) {
        model.outcomes[key] = arr;
      }
    }
  }

  return model;
}

function getPathValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

function resourceBucketCount(resources: unknown): number {
  if (!resources || typeof resources !== "object") return 0;
  const r = resources as Record<string, unknown>;
  let count = 0;
  for (const key of ["human", "material", "financial", "knowledge"]) {
    const values = r[key];
    if (Array.isArray(values) && values.some((v) => isNonEmptyString(v))) {
      count += 1;
    }
  }
  return count;
}

async function postChat(body: { message: string; history: ChatMessage[]; model: LogicModel; userId: string }): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": body.userId,
      },
      body: JSON.stringify({
        message: body.message,
        history: body.history,
        model: body.model,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    return (await res.json()) as ApiResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function evaluateTurn(expect: TurnExpectation | undefined, response: ApiResponse): string[] {
  if (!expect) return [];

  const failures: string[] = [];
  const reply = response.reply ?? "";
  const finalIntent = response.llmMeta?.trace?.finalIntent ?? null;

  const intentAliases: Record<string, string[]> = {
    impact: [
      "impact_statement",
      "impact_population_facet",
      "impact_geography_facet",
      "impact_outcome_facet",
      "impact_aspiration",
      "impact_change_type",
      "impact_specificity",
      "impact_review",
      "long_term_help",
      "geography",
      "population_focus",
    ],
    quality_fidelity: ["quality_evidence"],
    outcomes: ["outcomes_review"],
  };

  function intentMatches(actual: string | null, expected: string): boolean {
    if (!actual) return false;
    if (actual === expected) return true;

    if (expected === "impact" && actual === "resources") {
      const impactPatch = response.modelPatch?.intended_impact;
      if (
        impactPatch &&
        (isNonEmptyString(impactPatch.population) ||
          isNonEmptyString(impactPatch.geography) ||
          isNonEmptyString(impactPatch.long_term_goal))
      ) {
        return true;
      }
    }

    const aliases = intentAliases[expected];
    return Array.isArray(aliases) ? aliases.includes(actual) : false;
  }

  if (expect.finalIntentOneOf && !expect.finalIntentOneOf.some((expected) => intentMatches(String(finalIntent), expected))) {
    failures.push(`finalIntent expected one of [${expect.finalIntentOneOf.join(", ")}], got '${String(finalIntent)}'`);
  }

  if (expect.modelPatchMustHavePath) {
    for (const path of expect.modelPatchMustHavePath) {
      const value = getPathValue(response.modelPatch, path);
      const exists = Array.isArray(value)
        ? value.length > 0
        : typeof value === "object"
          ? value !== null && Object.keys(value as Record<string, unknown>).length > 0
          : Boolean(value);
      if (!exists) {
        failures.push(`modelPatch missing required path '${path}'`);
      }
    }
  }

  if (typeof expect.modelPatchResourceBucketsAtLeast === "number") {
    const count = resourceBucketCount(getPathValue(response.modelPatch, "implementation.resources"));
    if (count < expect.modelPatchResourceBucketsAtLeast) {
      failures.push(`expected at least ${expect.modelPatchResourceBucketsAtLeast} non-empty resource buckets in modelPatch, got ${count}`);
    }
  }

  if (expect.replyMustNotMatch) {
    for (const pattern of expect.replyMustNotMatch) {
      if (pattern.test(reply)) {
        failures.push(`reply matched forbidden pattern ${pattern.toString()}`);
      }
    }
  }

  return failures;
}

const SCENARIOS: Scenario[] = [
    // --- FULL E2E: The Gold Standard ---
    {
      id: "full-e2e-green-haven",
      description: "A high-clarity user providing detailed, structured data across all logic model sections.",
      turns: [
        // SECTION: INTENDED IMPACT
        {
          user: "We are starting the Green Haven Community Garden in West Philadelphia. Our goal is to serve local residents by reducing food insecurity and providing a green space for community building.",
          expect: {
            finalIntentOneOf: ["impact"],
            modelPatchMustHavePath: ["intended_impact.population", "intended_impact.geography", "intended_impact.long_term_goal"],
          },
        },
        // SECTION: RESOURCES
        {
          user: "We have two part-time coordinators, $5,000 in seed grants, donated tools from the city, and a partnership with a local horticulture expert for training.",
          expect: {
            finalIntentOneOf: ["resources"],
            modelPatchResourceBucketsAtLeast: 4,
          },
        },
        // SECTION: ACTIVITIES
        {
          user: "We hold weekly planting workshops, maintain 20 raised beds, and run a bi-weekly harvest distribution stand.",
          expect: {
            finalIntentOneOf: ["activities"],
            modelPatchMustHavePath: ["implementation.activities"],
          },
        },
        // SECTION: QUALITY & FIDELITY
        {
          user: "We maintain quality by using organic-only soil standards. For fidelity, we use a weekly checklist to ensure every bed is watered and weeded according to the garden manual.",
          expect: {
            finalIntentOneOf: ["quality_fidelity"],
            modelPatchMustHavePath: ["implementation.quality_fidelity.quality", "implementation.quality_fidelity.fidelity"],
          },
        },
        // SECTION: OUTCOMES
        {
          user: "Short term, we want residents to learn basic gardening. Medium term, we expect 200lbs of produce per season. Long term, we hope to see a 10% decrease in reported food insecurity among regular members.",
          expect: {
            finalIntentOneOf: ["outcomes"],
            modelPatchMustHavePath: ["outcomes.short_term", "outcomes.medium_term", "outcomes.long_term"],
          },
        },
      ],
      finalCheck: ({ model }) => {
        const failures: string[] = [];
        if (!isNonEmptyString(model.intended_impact.compiled_statement)) failures.push("compiled_statement not captured");
        if (!Array.isArray(model.outcomes.long_term) || model.outcomes.long_term.length < 1) failures.push("outcomes.long_term missing or empty");
        return failures;
      },
    },

    // --- FULL E2E: The Helpful Nudge ---
    {
      id: "full-e2e-stepup-mentorship",
      description: "A user providing partial/vague info requiring agent follow-ups and coaching.",
      turns: [
        // SECTION: INTENDED IMPACT
        {
          user: "We work with high schoolers in the city to help them get jobs.",
          expect: {
            finalIntentOneOf: ["impact"],
          },
        },
        {
          user: "Our long-term goal is 100% college or trade school enrollment for our seniors.",
          expect: {
            modelPatchMustHavePath: ["intended_impact.long_term_goal"],
          },
        },
        // SECTION: RESOURCES
        {
          user: "We have mentors and some funding from a local bank.",
          expect: {
            finalIntentOneOf: ["resources"],
            modelPatchResourceBucketsAtLeast: 2,
          },
        },
        {
          user: "Oh, we also use a local library for meeting space and a licensed curriculum.",
          expect: {
            modelPatchResourceBucketsAtLeast: 3,
          },
        },
        // SECTION: ACTIVITIES
        {
          user: "We do mentorship meetings.",
          expect: {
            finalIntentOneOf: ["activities"],
          },
        },
        {
          user: "Each student meets with a mentor for 2 hours a week to work on college apps and career goals.",
          expect: {
            modelPatchMustHavePath: ["implementation.activities"],
          },
        },
        // SECTION: QUALITY & FIDELITY
        {
          user: "We check in with the mentors often.",
          expect: {
            finalIntentOneOf: ["quality_fidelity"],
          },
        },
        {
          user: "We use a standardized mentor handbook (fidelity) and require all mentors to have background checks and 10 hours of training (quality).",
          expect: {
            modelPatchMustHavePath: ["implementation.quality_fidelity.quality"],
          },
        },
        // SECTION: OUTCOMES
        {
          user: "We want them to succeed.",
          expect: {
            finalIntentOneOf: ["outcomes", "outputs_metrics"],
          },
        },
        {
          user: "Short term is completing one college app. Medium term is getting an acceptance letter. Long term is that enrollment goal I mentioned.",
          expect: {
            modelPatchMustHavePath: ["outcomes.medium_term"],
            finalIntentOneOf: ["outcomes"],
          },
        },
      ],
      finalCheck: ({ model }) => {
        const failures: string[] = [];
        if (!Array.isArray(model.implementation.resources.material) || model.implementation.resources.material.length < 1) failures.push("resources.material missing or empty");
        if (!Array.isArray(model.outcomes.short_term) || model.outcomes.short_term.length < 1) failures.push("outcomes.short_term missing or empty");
        return failures;
      },
    },
  {
    id: "impact-happy-path",
    description: "All-in-one impact statement is captured and confirmed.",
    turns: [
      {
        user: "We serve middle school students in North Philadelphia and our long-term goal is that they read on grade level and transition successfully to high school.",
      },
      {
        user: "Yes, that captures it.",
      },
    ],
    finalCheck: ({ model }) => {
      const failures: string[] = [];
      if (!isNonEmptyString(model.intended_impact.population)) failures.push("population not captured");
      if (!isNonEmptyString(model.intended_impact.geography)) failures.push("geography not captured");
      if (!isNonEmptyString(model.intended_impact.long_term_goal)) failures.push("long_term_goal not captured");
      return failures;
    },
  },
  {
    id: "resources-list-capture",
    description: "When user provides a resource list, the patch captures multiple resource buckets.",
    seedHistory: [
      {
        role: "assistant",
        content: "What key resources does your program rely on (people, materials, funding, expertise)?",
      },
    ],
    turns: [
      {
        user: "We have program staff, volunteers, partner counselors, curriculum materials, laptops, grant funding, and staff training.",
        expect: {
          finalIntentOneOf: ["resources"],
          modelPatchMustHavePath: ["implementation.resources"],
          modelPatchResourceBucketsAtLeast: 2,
          replyMustNotMatch: [
            /what\s+key\s+resources\s+does\s+your\s+program\s+rely\s+on/i,
          ],
        },
      },
    ],
  },
  {
    id: "resources-no-silent-drop",
    description: "Resource response should not be ignored across turns and should keep resources in model state.",
    seedHistory: [
      {
        role: "assistant",
        content: "Please list the people, materials, funding, and expertise your program depends on.",
      },
    ],
    turns: [
      {
        user: "Staff mentors, school partners, donated laptops, grant funding, and evidence-based training.",
        expect: {
          modelPatchMustHavePath: ["implementation.resources"],
          modelPatchResourceBucketsAtLeast: 2,
        },
      },
      {
        user: "Anything else you need from me on resources?",
        expect: {
          replyMustNotMatch: [
            /please\s+list\s+the\s+people,?\s+materials,?\s+funding,?\s+and\s+expertise/i,
            /what\s+key\s+resources/i,
          ],
        },
      },
    ],
    finalCheck: ({ model }) => {
      const count = resourceBucketCount(model.implementation.resources);
      return count >= 2 ? [] : [`model retained only ${count} resource buckets after multi-turn flow`];
    },
  },
];

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const model = createEmptyModel();
  const history: ChatMessage[] = [...(scenario.seedHistory ?? [])];
  const responses: ApiResponse[] = [];
  const failures: string[] = [];
  const turnResults: TurnResult[] = [];

  for (let index = 0; index < scenario.turns.length; index++) {
    const turn = scenario.turns[index];

    let response: ApiResponse;
    try {
      response = await postChat({
        message: turn.user,
        history,
        model,
        userId: `agent-regression-${scenario.id}`,
      });
    } catch (error) {
      failures.push(`turn ${index + 1}: request failed: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }

    responses.push(response);
    mergeModel(model, response.modelPatch ?? null);

    history.push({ role: "user", content: turn.user });
    history.push({ role: "assistant", content: String(response.reply ?? "") });

    const turnFailures = evaluateTurn(turn.expect, response);
    for (const failure of turnFailures) {
      failures.push(`turn ${index + 1}: ${failure}`);
    }

    turnResults.push({
      turn: index + 1,
      user: turn.user,
      reply: String(response.reply ?? ""),
      finalIntent: (response.llmMeta?.trace?.finalIntent as string | null) ?? null,
      stateIntent: (response.llmMeta?.trace?.stateIntent as string | null) ?? null,
      patchSource: (response.llmMeta?.trace?.patchSource as string | null) ?? null,
      responseDomain: (response.llmMeta?.trace?.responseDomain as string | null) ?? null,
      effectiveResponseDomain:
        (response.llmMeta?.trace?.effectiveResponseDomain as string | null) ?? null,
      resourceBucketsInPatch: resourceBucketCount(
        getPathValue(response.modelPatch, "implementation.resources")
      ),
      failures: turnFailures,
    });
  }

  if (scenario.finalCheck) {
    for (const failure of scenario.finalCheck({ history, model, responses })) {
      failures.push(`final: ${failure}`);
    }
  }

  return {
    id: scenario.id,
    description: scenario.description,
    failures,
    turnResults,
  };
}

async function ensureDir(dir: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(dir, { recursive: true });
}

function esc(input: string): string {
  return input.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function buildMermaidForScenario(result: ScenarioResult): string {
  const lines: string[] = ["sequenceDiagram", "participant U as User", "participant A as Agent"];
  for (const turn of result.turnResults) {
    const intent = turn.finalIntent ?? "none";
    const buckets = String(turn.resourceBucketsInPatch);
    lines.push(`U->>A: T${turn.turn}: ${esc(turn.user).slice(0, 120)}`);
    lines.push(`A-->>U: intent=${intent}; buckets=${buckets}; ${esc(turn.reply).slice(0, 140)}`);
  }
  return lines.join("\n");
}

async function writeReport(results: ScenarioResult[]): Promise<void> {
  const fs = await import("node:fs/promises");
  const outDir = "docs/regression-reports";
  await ensureDir(outDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = `${outDir}/agent-scenarios-${timestamp}.json`;
  const latestJsonPath = `${outDir}/agent-scenarios-latest.json`;
  await fs.writeFile(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), apiUrl: API_URL, results }, null, 2), "utf8");
  await fs.writeFile(latestJsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), apiUrl: API_URL, results }, null, 2), "utf8");

  const passCount = results.filter((r) => r.failures.length === 0).length;
  const lines: string[] = [];
  lines.push("# Agent Scenario Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`API: ${API_URL}`);
  lines.push(`Summary: ${passCount}/${results.length} scenarios passed.`);
  lines.push("");
  lines.push("## Scenario Results");
  lines.push("");
  lines.push("| Scenario | Status | Failures |");
  lines.push("|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.failures.length === 0 ? "PASS" : "FAIL"} | ${r.failures.length} |`);
  }

  for (const r of results) {
    lines.push("");
    lines.push(`## ${r.id}`);
    lines.push("");
    lines.push(r.description);
    lines.push("");
    if (r.failures.length > 0) {
      lines.push("Failures:");
      for (const failure of r.failures) {
        lines.push(`- ${failure}`);
      }
      lines.push("");
    }
    lines.push("Turn trace:");
    lines.push("");
    lines.push("| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |");
    lines.push("|---|---|---|---|---|---|---:|---|");
    for (const t of r.turnResults) {
      lines.push(`| ${t.turn} | ${t.finalIntent ?? "none"} | ${t.stateIntent ?? "none"} | ${t.responseDomain ?? "none"} | ${t.effectiveResponseDomain ?? "none"} | ${t.patchSource ?? "none"} | ${t.resourceBucketsInPatch} | ${t.failures.length} |`);
    }
    lines.push("");
    lines.push("```mermaid");
    lines.push(buildMermaidForScenario(r));
    lines.push("```");
  }

  const mdPath = `${outDir}/agent-scenarios-${timestamp}.md`;
  const latestMdPath = `${outDir}/agent-scenarios-latest.md`;
  const mdContent = lines.join("\n");
  await fs.writeFile(mdPath, mdContent, "utf8");
  await fs.writeFile(latestMdPath, mdContent, "utf8");

  console.log(`\nReport written:`);
  console.log(`- ${mdPath}`);
  console.log(`- ${jsonPath}`);
}

async function main(): Promise<void> {
  console.log(`Running agent regression scenarios against ${API_URL}`);

  const results: ScenarioResult[] = [];
  for (const scenario of SCENARIOS) {
    console.log(`\n--- ${scenario.id}: ${scenario.description}`);
    const result = await runScenario(scenario);
    results.push(result);
    if (result.failures.length === 0) {
      console.log("PASS");
    } else {
      console.log("FAIL");
      for (const failure of result.failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  await writeReport(results);

  const failed = results.filter((r) => r.failures.length > 0);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Scenario run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
