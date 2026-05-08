import test from "node:test";
import assert from "node:assert/strict";
import type { LogicModel } from "@/store/useLogicModelStore";
import {
  assertIntentWithLatestUserEvidence,
  buildContextCoverageSummary,
} from "@/lib/chat/agenticContext";

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

test("context coverage flags missing population capture", () => {
  const summary = buildContextCoverageSummary(
    "We provide mentoring to elementary students.",
    null
  );

  assert.equal(summary.user.hasPopulationCue, true);
  assert.equal(summary.patch.hasPopulationCue, false);
  assert.ok(summary.missingCaptures.includes("population"));
});

test("context coverage recognizes captured population and activities", () => {
  const summary = buildContextCoverageSummary(
    "We provide mentoring to elementary students.",
    {
      intended_impact: {
        population: "elementary students",
      },
      implementation: {
        activities: [
          {
            item: "Mentoring",
            actions: ["Provide mentoring"],
            outputs: [],
          },
        ],
      },
    }
  );

  assert.equal(summary.patch.hasPopulationCue, true);
  assert.equal(summary.patch.hasActivityCue, true);
  assert.ok(!summary.missingCaptures.includes("population"));
});

test("intent assertion advances from population to geography when user already gave population", () => {
  const model = createModel();
  const next = assertIntentWithLatestUserEvidence(
    "population_focus",
    "We provide mentoring to elementary students.",
    model
  );

  assert.equal(next, "geography");
});

test("intent assertion advances from geography to specificity when user gives geography", () => {
  const model = createModel();
  model.intended_impact.population = "elementary students";

  const next = assertIntentWithLatestUserEvidence(
    "geography",
    "We serve schools in North Philadelphia.",
    model
  );

  assert.equal(next, "impact_specificity");
});
