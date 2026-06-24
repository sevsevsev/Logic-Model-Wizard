import test from "node:test";
import assert from "node:assert/strict";
import type { LogicModel } from "@/store/useLogicModelStore";
import type { ChatMessage } from "@/store/useLogicModelStore";
import {
  buildCompiledStatement,
  inferImpactDraftReadiness,
  inferNextRequiredIntent,
  isExplicitImpactAcceptance,
  looksSpecificPopulation,
} from "@/lib/chat/guardrails";

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

test("population specificity rejects generic labels", () => {
  assert.equal(looksSpecificPopulation("we serve youth"), false);
  assert.equal(looksSpecificPopulation("we serve justice-involved youth"), true);
  assert.equal(looksSpecificPopulation("we serve 9th graders"), true);
});

test("acceptance detector only passes explicit confirmations", () => {
  assert.equal(isExplicitImpactAcceptance("Yes, that captures it."), true);
  assert.equal(isExplicitImpactAcceptance("That sounds right."), true);
  assert.equal(isExplicitImpactAcceptance("Can you revise it?"), false);
});

test("compiled statement builds only when all parts are present", () => {
  assert.equal(
    buildCompiledStatement("K-8 students", "Philadelphia", "graduate high school"),
    "K-8 students in Philadelphia will graduate high school"
  );
  assert.equal(buildCompiledStatement("K-8 students", "", "graduate high school"), undefined);
});

test("phase intent progression follows atomic sequence", () => {
  const model = createModel();
  assert.equal(inferNextRequiredIntent(model), "population_focus");

  model.intended_impact.population = "9th graders";
  assert.equal(inferNextRequiredIntent(model), "geography");

  model.intended_impact.geography = "citywide";
  assert.equal(inferNextRequiredIntent(model), "impact_specificity");

  model.intended_impact.long_term_goal = "graduate high school";
  assert.equal(inferNextRequiredIntent(model), "resources");

  model.implementation.resources.human.push("Program staff");
  assert.equal(inferNextRequiredIntent(model), "activities");

  model.implementation.activities.push({
    item: "Mentoring",
    actions: ["Provide weekly mentoring"],
    outputs: [],
  });
  assert.equal(inferNextRequiredIntent(model), "outputs_metrics");

  model.implementation.activities[0].outputs.push({ text: "100 sessions delivered" });
  assert.equal(inferNextRequiredIntent(model), "quality_evidence");

  model.implementation.quality_fidelity.quality.push("Participant satisfaction");
  assert.equal(inferNextRequiredIntent(model), "outcomes_review");

  model.outcomes.short_term.push({ statement: "Improved program awareness" });
  assert.equal(inferNextRequiredIntent(model), "causal_review");
});

test("impact readiness bypasses blocking after one prior specificity attempt", () => {
  const model = createModel();
  model.intended_impact.population = "9th graders";
    model.intended_impact.geography = "citywide";

  const history: ChatMessage[] = [
    {
      role: "assistant",
      content:
        "Before I draft an impact statement, what exact long-term difference should we be able to point to in 10 years?",
    },
    {
      role: "user",
      content: "They should have better opportunities.",
    },
  ] as const;

  const readiness = inferImpactDraftReadiness(model, history, "Still better opportunities over time.");

  assert.equal(readiness.ready, true);
  assert.equal(readiness.bypassed, true);
  assert.equal(readiness.missingIntent, "impact_specificity");
});
