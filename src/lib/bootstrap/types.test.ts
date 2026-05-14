import test from "node:test";
import assert from "node:assert/strict";
import {
  getBootstrapStartOptions,
  getBootstrapStartRecommendation,
} from "@/lib/bootstrap/types";
import type { LogicModel } from "@/store/useLogicModelStore";
import type { BootstrapSuggestion } from "@/lib/bootstrap/types";

function buildModel(overrides?: Partial<LogicModel>): LogicModel {
  return {
    intended_impact: {
      population: "",
      geography: "",
      long_term_goal: "",
      compiled_statement: "",
      ...(overrides?.intended_impact ?? {}),
    },
    stakeholders: overrides?.stakeholders ?? [],
    implementation: {
      resources: {
        human: [],
        material: [],
        financial: [],
        knowledge: [],
        ...(overrides?.implementation?.resources ?? {}),
      },
      activities: overrides?.implementation?.activities ?? [],
      quality_fidelity: {
        fidelity: [],
        quality: [],
        ...(overrides?.implementation?.quality_fidelity ?? {}),
      },
    },
    outcomes: {
      short_term: [],
      medium_term: [],
      long_term: [],
      ...(overrides?.outcomes ?? {}),
    },
  };
}

test("getBootstrapStartRecommendation prioritizes intended impact when impact is incomplete", () => {
  const model = buildModel({
    implementation: {
      resources: { human: ["Coach"], material: [], financial: [], knowledge: [] },
      activities: [{ item: "Tutoring", actions: [], outputs: [] }],
      quality_fidelity: { fidelity: [], quality: [] },
    },
    outcomes: {
      short_term: [{ statement: "Students understand course expectations" }],
      medium_term: [{ statement: "Students attend consistently" }],
      long_term: [{ statement: "Students graduate high school" }],
    },
  });

  const recommendation = getBootstrapStartRecommendation(model);
  assert.equal(recommendation.section, "impact");
  assert.equal(recommendation.label, "Intended Impact");
});

test("getBootstrapStartRecommendation prioritizes implementation after impact is anchored", () => {
  const model = buildModel({
    intended_impact: {
      population: "Middle school students",
      geography: "Philadelphia",
      long_term_goal: "graduate high school",
      compiled_statement: "Middle school students in Philadelphia will graduate high school",
    },
    outcomes: {
      short_term: [{ statement: "Students understand course expectations" }],
      medium_term: [{ statement: "Students attend consistently" }],
      long_term: [{ statement: "Students graduate high school" }],
    },
  });

  const recommendation = getBootstrapStartRecommendation(model);
  assert.equal(recommendation.section, "implementation");
  assert.equal(recommendation.label, "Implementation");
});

test("getBootstrapStartOptions includes a recommendation choice when multiple parts are prefilled", () => {
  const model = buildModel({
    intended_impact: {
      population: "Middle school students",
      geography: "Philadelphia",
      long_term_goal: "graduate high school",
      compiled_statement: "Middle school students in Philadelphia will graduate high school",
    },
    implementation: {
      resources: { human: ["Coach"], material: [], financial: [], knowledge: [] },
      activities: [{ item: "Tutoring", actions: [], outputs: [] }],
      quality_fidelity: { fidelity: [], quality: [] },
    },
  });

  const options = getBootstrapStartOptions(model);
  assert.ok(options);
  assert.equal(options?.length, 4);
  assert.match(options?.[3].label ?? "", /Use recommended start/i);
});

test("getBootstrapStartRecommendation uses uncertainty signals to prioritize section clarification", () => {
  const model = buildModel({
    intended_impact: {
      population: "Middle school students",
      geography: "Philadelphia",
      long_term_goal: "graduate high school",
      compiled_statement: "Middle school students in Philadelphia will graduate high school",
    },
    implementation: {
      resources: { human: ["Coach"], material: [], financial: [], knowledge: [] },
      activities: [{ item: "Tutoring", actions: [], outputs: [] }],
      quality_fidelity: { fidelity: [], quality: [] },
    },
    outcomes: {
      short_term: [{ statement: "Students understand course expectations" }],
      medium_term: [{ statement: "Students attend consistently" }],
      long_term: [{ statement: "Students graduate high school" }],
    },
  });

  const uncertainSuggestions: BootstrapSuggestion[] = [
    {
      id: "1",
      label: "Outcome 1",
      path: "outcomes.short_term",
      value: [{ statement: "Students are better" }],
      confidence: 0.3,
      rationale: "",
      evidence: "",
      qualityRating: "Weak",
    },
    {
      id: "2",
      label: "Outcome 2",
      path: "outcomes.medium_term",
      value: [{ statement: "Students improve" }],
      confidence: 0.4,
      rationale: "",
      evidence: "",
      qualityRating: "Weak",
    },
  ];

  const recommendation = getBootstrapStartRecommendation(model, uncertainSuggestions);
  assert.equal(recommendation.section, "outcomes");
});

test("getBootstrapStartRecommendation falls back to guide order when uncertainty is broad", () => {
  const model = buildModel({
    intended_impact: {
      population: "Middle school students",
      geography: "Philadelphia",
      long_term_goal: "graduate high school",
      compiled_statement: "Middle school students in Philadelphia will graduate high school",
    },
    implementation: {
      resources: { human: [], material: [], financial: [], knowledge: [] },
      activities: [],
      quality_fidelity: { fidelity: [], quality: [] },
    },
  });

  const broadUncertainty: BootstrapSuggestion[] = [
    {
      id: "1",
      label: "Resources",
      path: "implementation.resources.human",
      value: ["Staff"],
      confidence: 0.2,
      rationale: "",
      evidence: "",
      qualityRating: "Weak",
    },
    {
      id: "2",
      label: "Activities",
      path: "implementation.activities",
      value: [{ category: "Instruction", actions: [], outputs: [] }],
      confidence: 0.3,
      rationale: "",
      evidence: "",
      qualityRating: "Weak",
    },
    {
      id: "3",
      label: "Outcomes",
      path: "outcomes.short_term",
      value: [{ statement: "Students improve" }],
      confidence: 0.3,
      rationale: "",
      evidence: "",
      qualityRating: "Weak",
    },
    {
      id: "4",
      label: "Outcomes 2",
      path: "outcomes.long_term",
      value: [{ statement: "Graduation improves" }],
      confidence: 0.4,
      rationale: "",
      evidence: "",
      qualityRating: "Weak",
    },
  ];

  const recommendation = getBootstrapStartRecommendation(model, broadUncertainty);
  // Base guide-sequenced recommendation here is implementation (impact anchored, implementation missing).
  assert.equal(recommendation.section, "implementation");
});
