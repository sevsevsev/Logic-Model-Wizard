import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentTurnBrief } from "@/lib/agent/turnBrief";
import type { LogicModel } from "@/store/useLogicModelStore";

function createModel(): LogicModel {
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

test("buildAgentTurnBrief uses impact facet missing fields when statement draft exists", () => {
  const model = createModel();
  model.intended_impact.long_term_goal =
    "Middle school students will graduate high school and stay on track for college";

  const brief = buildAgentTurnBrief({
    userMessage: model.intended_impact.long_term_goal,
    history: [],
    modelSnapshot: model,
  });

  assert.equal(brief.currentPhase, "geography");
  assert.ok(brief.missingFields.includes("impact_geography_facet"));
  assert.ok(!brief.missingFields.includes("population"));
  assert.ok(brief.missingFields.includes("impact_review_confirmation") === false);
});

test("buildAgentTurnBrief treats full draft statements as known impact context", () => {
  const model = createModel();
  model.intended_impact.long_term_goal =
    "Middle school students in Kensington will graduate high school and avoid justice-system involvement";

  const brief = buildAgentTurnBrief({
    userMessage: model.intended_impact.long_term_goal,
    history: [],
    modelSnapshot: model,
  });

  assert.equal(brief.currentPhase, "impact_review");
  assert.ok(brief.avoidAskingFor.some((entry) => entry.includes("primary population")));
  assert.ok(brief.avoidAskingFor.some((entry) => entry.includes("geography")));
  assert.ok(brief.missingFields.includes("impact_review_confirmation"));
});

test("buildAgentTurnBrief defaults revision lifecycle to none", () => {
  const brief = buildAgentTurnBrief({
    userMessage: "We serve middle school students.",
    history: [],
    modelSnapshot: createModel(),
  });

  assert.equal(brief.revisionLifecycle.status, "none");
});

test("buildAgentTurnBrief carries revision lifecycle from input", () => {
  const brief = buildAgentTurnBrief({
    userMessage: "That rewrite works.",
    history: [],
    modelSnapshot: createModel(),
    revisionLifecycle: {
      status: "accepted",
      originalText: "We serve middle school students in Kensington to help them do better.",
      revisedText: "Middle school students in Kensington sustain school progression and graduate high school.",
    },
  });

  assert.equal(brief.revisionLifecycle.status, "accepted");
  assert.equal(brief.revisionLifecycle.revisedText, "Middle school students in Kensington sustain school progression and graduate high school.");
});