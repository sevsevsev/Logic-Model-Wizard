import test from "node:test";
import assert from "node:assert/strict";
import { enforceImpactDraftAcknowledgement } from "@/lib/chat/impactDraftReply";
import type { LogicModel } from "@/store/useLogicModelStore";

function buildModel(overrides?: Partial<LogicModel>): LogicModel {
  return {
    intended_impact: {
      population: "middle school students",
      geography: "North Philadelphia",
      long_term_goal: "read on grade level and transition successfully to high school",
      compiled_statement:
        "Middle school students in North Philadelphia will read on grade level and transition successfully to high school.",
      ...(overrides?.intended_impact ?? {}),
    },
    stakeholders: [],
    implementation: {
      resources: { human: [], material: [], financial: [], knowledge: [] },
      activities: [],
      quality_fidelity: { fidelity: [], quality: [] },
      ...(overrides?.implementation ?? {}),
    },
    outcomes: {
      short_term: [],
      medium_term: [],
      long_term: [],
      ...(overrides?.outcomes ?? {}),
    },
  };
}

test("enforceImpactDraftAcknowledgement rewrites baseline impact question when draft exists", () => {
  const reply =
    "Of course. To start, could you tell me about the specific population or community your program is designed to serve?";

  const rewritten = enforceImpactDraftAcknowledgement({
    reply,
    userMessage: "Let's begin with intended impact.",
    focusSection: "impact",
    modelSnapshot: buildModel(),
  });

  assert.notEqual(rewritten, reply);
  assert.match(rewritten.toLowerCase(), /draft intended impact statement|working intended impact draft/);
});

test("enforceImpactDraftAcknowledgement preserves non-impact replies", () => {
  const reply = "Thanks. What are your key resources for delivery?";

  const rewritten = enforceImpactDraftAcknowledgement({
    reply,
    userMessage: "Let's review resources.",
    focusSection: "resources",
    modelSnapshot: buildModel(),
  });

  assert.equal(rewritten, reply);
});
