import test from "node:test";
import assert from "node:assert/strict";
import { useLogicModelStore } from "@/store/useLogicModelStore";

function resetStore(): void {
  useLogicModelStore.getState().resetModel();
}

test("applyModelPatch merges quality and fidelity buckets instead of overwriting", () => {
  resetStore();

  const { applyModelPatch, model } = useLogicModelStore.getState();
  applyModelPatch({
    implementation: {
      quality_fidelity: {
        quality: ["Background checks"],
        fidelity: [],
      },
    },
  });

  applyModelPatch({
    implementation: {
      quality_fidelity: {
        quality: [],
        fidelity: ["Weekly checklist"],
      },
    },
  });

  const nextModel = useLogicModelStore.getState().model;
  assert.deepEqual(nextModel.implementation.quality_fidelity.quality, ["Background checks"]);
  assert.deepEqual(nextModel.implementation.quality_fidelity.fidelity, ["Weekly checklist"]);
  assert.notStrictEqual(nextModel, model);
});

test("applyModelPatch merges outcomes across turns", () => {
  resetStore();

  const { applyModelPatch } = useLogicModelStore.getState();
  applyModelPatch({
    outcomes: {
      short_term: [{ statement: "Students learn the basics of college applications" }],
      medium_term: [],
      long_term: [],
    },
  });

  applyModelPatch({
    outcomes: {
      short_term: [],
      medium_term: [{ statement: "Students submit more complete applications" }],
      long_term: [{ statement: "Students enroll in college or trade school" }],
    },
  });

  const nextModel = useLogicModelStore.getState().model;
  assert.equal(nextModel.outcomes.short_term.length, 1);
  assert.equal(nextModel.outcomes.medium_term.length, 1);
  assert.equal(nextModel.outcomes.long_term.length, 1);
  assert.equal(nextModel.outcomes.short_term[0].statement, "Students learn the basics of college applications");
  assert.equal(nextModel.outcomes.medium_term[0].statement, "Students submit more complete applications");
  assert.equal(nextModel.outcomes.long_term[0].statement, "Students enroll in college or trade school");
});

test("applyModelPatch ignores inferred activity categories and subcategories", () => {
  resetStore();

  const { applyModelPatch } = useLogicModelStore.getState();
  applyModelPatch({
    implementation: {
      resources: { human: [], material: [], financial: [], knowledge: [] },
      activities: [
        {
          item: "Mentor students",
          category: "Program",
          subcategory: "Academic support",
          actions: ["Mentor students during lunch"],
          outputs: [{ text: "Weekly check-ins", category: "Program" }],
        },
      ],
      outputs_metrics: [],
      quality_fidelity: { quality: [], fidelity: [] },
    },
  });

  const nextModel = useLogicModelStore.getState().model;
  assert.equal(nextModel.implementation.activities.length, 1);
  assert.equal(nextModel.implementation.activities[0].category, undefined);
  assert.deepEqual(nextModel.implementation.activities[0].outputs, [{ text: "Weekly check-ins" }]);
});

test("applyModelPatch does not erase existing resources when patch has empty arrays", () => {
  resetStore();

  const { applyModelPatch } = useLogicModelStore.getState();
  applyModelPatch({
    implementation: {
      resources: {
        human: ["Program staff"],
        material: ["Curriculum"],
        financial: ["Grant funding"],
        knowledge: ["Trauma-informed expertise"],
      },
    },
  });

  // Simulates later chat turns that emit empty resource arrays in patch payload.
  applyModelPatch({
    implementation: {
      resources: { human: [], material: [], financial: [], knowledge: [] },
    },
  });

  const nextModel = useLogicModelStore.getState().model;
  assert.deepEqual(nextModel.implementation.resources.human, ["Program staff"]);
  assert.deepEqual(nextModel.implementation.resources.material, ["Curriculum"]);
  assert.deepEqual(nextModel.implementation.resources.financial, ["Grant funding"]);
  assert.deepEqual(nextModel.implementation.resources.knowledge, ["Trauma-informed expertise"]);
});

test("restoreDraft strips legacy activity categories from saved drafts", () => {
  resetStore();

  const { restoreDraft } = useLogicModelStore.getState();
  restoreDraft({
    model: {
      intended_impact: {
        population: "",
        geography: "",
        long_term_goal: "",
        compiled_statement: "",
      },
      stakeholders: [],
      implementation: {
        resources: { human: [], material: [], financial: [], knowledge: [] },
        activities: [
          {
            item: "Run check-ins",
            category: "Program",
            actions: ["Run weekly check-ins"],
            outputs: [{ text: "Meeting notes", category: "Support" }],
            stakeholderIds: [],
          },
        ],
        outputs_metrics: [],
        quality_fidelity: { quality: [], fidelity: [] },
      },
      outcomes: {
        short_term: [],
        medium_term: [],
        long_term: [],
      },
    },
    messages: [],
  });

  const nextModel = useLogicModelStore.getState().model;
  assert.equal(nextModel.implementation.activities.length, 1);
  assert.equal(nextModel.implementation.activities[0].category, undefined);
  assert.deepEqual(nextModel.implementation.activities[0].outputs, [{ text: "Meeting notes" }]);
});
