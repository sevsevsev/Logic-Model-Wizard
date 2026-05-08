import test from "node:test";
import assert from "node:assert/strict";
import type { LogicModel } from "@/store/useLogicModelStore";
import { sanitizeImpactPatchWhenDraftBlocked } from "@/lib/chat/impactDraftGate";

function createPatch(patch: Partial<LogicModel>): Partial<LogicModel> {
  return patch;
}

test("preserves population and geography when draft is blocked", () => {
  const patch = createPatch({
    intended_impact: {
      population: "5th graders",
      geography: "Kensington",
      long_term_goal: "",
      compiled_statement: "",
    },
  });

  const sanitized = sanitizeImpactPatchWhenDraftBlocked(patch);
  assert.equal(sanitized?.intended_impact?.population, "5th graders");
  assert.equal(sanitized?.intended_impact?.geography, "Kensington");
  assert.equal(sanitized?.intended_impact?.compiled_statement, "");
});

test("removes compiled_statement but keeps long_term_goal", () => {
  const patch = createPatch({
    intended_impact: {
      population: "middle school students",
      geography: "Philadelphia",
      long_term_goal: "healthy and stable peer relationships",
      compiled_statement: "middle school students in Philadelphia will have healthy relationships",
    },
  });

  const sanitized = sanitizeImpactPatchWhenDraftBlocked(patch);
  assert.equal(
    sanitized?.intended_impact?.long_term_goal,
    "healthy and stable peer relationships"
  );
  assert.equal(sanitized?.intended_impact?.compiled_statement, "");
});

test("drops empty intended_impact object entirely", () => {
  const patch = createPatch({
    intended_impact: {
      population: "",
      geography: "",
      long_term_goal: "",
      compiled_statement: "",
    },
  });

  const sanitized = sanitizeImpactPatchWhenDraftBlocked(patch);
  assert.equal(sanitized, null);
});
