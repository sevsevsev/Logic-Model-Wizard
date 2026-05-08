import test from "node:test";
import assert from "node:assert/strict";
import type { LogicModel } from "@/store/useLogicModelStore";
import { applyImpactAcceptanceFromReply } from "@/lib/chat/impactAcceptance";

function createModel(): LogicModel {
  return {
    intended_impact: {
      population: "5th graders",
      geography: "Kensington",
      long_term_goal: "lead lives that include healthy and supportive relationships with peers later in life",
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

test("acceptance reply builds compiled statement from existing snapshot", () => {
  const model = createModel();

  const patched = applyImpactAcceptanceFromReply(null, model, "yes");

  assert.equal(
    patched?.intended_impact?.compiled_statement,
    "5th graders in Kensington will lead lives that include healthy and supportive relationships with peers later in life"
  );
});

test("non-acceptance reply does not synthesize compiled statement", () => {
  const model = createModel();

  const patched = applyImpactAcceptanceFromReply(null, model, "can you revise this");

  assert.equal(patched, null);
});
