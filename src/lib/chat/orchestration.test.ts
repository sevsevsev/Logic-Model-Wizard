import test from "node:test";
import assert from "node:assert/strict";
import type { LogicModel } from "@/store/useLogicModelStore";
import {
  applyGroundedReplyFallback,
  buildConflictClarificationPrompt,
  buildEvidenceLedgerFromTurn,
  buildSectionScopedMemoryContext,
  computeSectionReadiness,
  createEmptyClaimMemory,
  detectContextConflicts,
  updateClaimMemoryFromTurn,
} from "@/lib/chat/orchestration";

function createModel(): LogicModel {
  return {
    intended_impact: {
      population: "students in grades K-3",
      geography: "North Philadelphia",
      long_term_goal: "graduate high school and persist in postsecondary education",
      compiled_statement: "",
    },
    stakeholders: [{ id: "students", label: "Students" }],
    implementation: {
      resources: { human: ["Volunteers"], material: [], financial: [], knowledge: [] },
      activities: [],
      outputs_metrics: [],
      quality_fidelity: { fidelity: [], quality: [] },
    },
    outcomes: { short_term: [], medium_term: [], long_term: [] },
  };
}

test("evidence ledger marks committed entry when patch is present", () => {
  const ledger = buildEvidenceLedgerFromTurn({
    userMessage: "We provide mentoring to students in North Philadelphia",
    historyLength: 2,
    modelPatch: {
      intended_impact: {
        population: "Students",
        geography: "North Philadelphia",
        long_term_goal: "",
        compiled_statement: "",
      },
    },
  });

  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].status, "committed");
  assert.ok(ledger.entries[0].candidateSections.includes("impact"));
});

test("readiness summary uses momentum when section is incomplete", () => {
  const model = createModel();
  const ledger = buildEvidenceLedgerFromTurn({
    userMessage: "We track attendance and session completion",
    historyLength: 3,
    modelPatch: {
      implementation: {
        resources: { human: [], material: [], financial: [], knowledge: [] },
        activities: [],
        outputs_metrics: ["Session attendance", "Program completion rate"],
        quality_fidelity: { fidelity: [], quality: [] },
      },
    },
  });

  const readiness = computeSectionReadiness(model, ledger);
  assert.equal(readiness.nextSection, "outputs_metrics");
  assert.equal(readiness.scores.impact, 1);
});

test("conflict detector flags ungrounded activity capture claim", () => {
  const flags = detectContextConflicts({
    history: [],
    userMessage: "We serve students.",
    reply: "Great, I captured that activity.",
    modelPatch: null,
    mergedModel: createModel(),
  });

  assert.ok(flags.includes("ungrounded_capture_claim"));
});

test("grounded fallback replaces ungrounded activity acknowledgement", () => {
  const reply = applyGroundedReplyFallback({
    reply: "Great, I captured that activity.",
    modelPatch: null,
    nextSection: "activities",
  });

  assert.match(reply, /one concrete activity/i);
});

test("retention memory stores confirmed claims from patch updates", () => {
  const updated = updateClaimMemoryFromTurn({
    previous: createEmptyClaimMemory(),
    userMessage: "We serve middle school students in North Philadelphia.",
    turnIndex: 1,
    modelPatch: {
      intended_impact: {
        population: "middle school students",
        geography: "North Philadelphia",
        long_term_goal: "",
        compiled_statement: "",
      },
    },
  });

  assert.equal(updated.claims.length, 2);
  assert.equal(updated.claims.every((claim) => claim.status === "confirmed"), true);
});

test("retention memory opens conflict question for singleton field mismatch", () => {
  const initial = updateClaimMemoryFromTurn({
    previous: createEmptyClaimMemory(),
    userMessage: "We serve middle school students.",
    turnIndex: 1,
    modelPatch: {
      intended_impact: {
        population: "middle school students",
        geography: "",
        long_term_goal: "",
        compiled_statement: "",
      },
    },
  });

  const conflicted = updateClaimMemoryFromTurn({
    previous: initial,
    userMessage: "Actually we serve high school students.",
    turnIndex: 2,
    modelPatch: {
      intended_impact: {
        population: "high school students",
        geography: "",
        long_term_goal: "",
        compiled_statement: "",
      },
    },
  });

  assert.equal(conflicted.conflicts.length, 1);
  assert.equal(conflicted.conflicts[0].status, "open");
  assert.equal(conflicted.questions.some((question) => question.status === "open"), true);
});

test("section-scoped memory context includes confirmed facts", () => {
  const memory = updateClaimMemoryFromTurn({
    previous: createEmptyClaimMemory(),
    userMessage: "Our key resources are volunteers and grants.",
    turnIndex: 1,
    modelPatch: {
      implementation: {
        resources: {
          human: ["Volunteers"],
          material: [],
          financial: ["Grants"],
          knowledge: [],
        },
        activities: [],
        outputs_metrics: [],
        quality_fidelity: { fidelity: [], quality: [] },
      },
    },
  });

  const context = buildSectionScopedMemoryContext(memory, "resources");
  assert.match(context, /Confirmed retained facts/i);
  assert.match(context, /Volunteers/i);
  assert.match(context, /Grants/i);
});

test("conflict clarification prompt returns open conflict question", () => {
  const initial = updateClaimMemoryFromTurn({
    previous: createEmptyClaimMemory(),
    userMessage: "We serve middle school students.",
    turnIndex: 1,
    modelPatch: {
      intended_impact: {
        population: "middle school students",
        geography: "",
        long_term_goal: "",
        compiled_statement: "",
      },
    },
  });
  const conflicted = updateClaimMemoryFromTurn({
    previous: initial,
    userMessage: "We serve high school students.",
    turnIndex: 2,
    modelPatch: {
      intended_impact: {
        population: "high school students",
        geography: "",
        long_term_goal: "",
        compiled_statement: "",
      },
    },
  });

  const prompt = buildConflictClarificationPrompt(conflicted, "impact");
  assert.ok(prompt);
  assert.match(String(prompt), /which one/i);
});

test("retention memory opens conflict question for explicit revision on activities", () => {
  const initial = updateClaimMemoryFromTurn({
    previous: createEmptyClaimMemory(),
    userMessage: "We run weekly tutoring sessions.",
    turnIndex: 1,
    modelPatch: {
      implementation: {
        resources: { human: [], material: [], financial: [], knowledge: [] },
        activities: [{ item: "", actions: ["weekly tutoring sessions"], outputs: [] }],
        outputs_metrics: [],
        quality_fidelity: { fidelity: [], quality: [] },
      },
    },
  });

  const revised = updateClaimMemoryFromTurn({
    previous: initial,
    userMessage: "Correction: instead of tutoring, we run mentoring circles.",
    turnIndex: 2,
    modelPatch: {
      implementation: {
        resources: { human: [], material: [], financial: [], knowledge: [] },
        activities: [{ item: "", actions: ["mentoring circles"], outputs: [] }],
        outputs_metrics: [],
        quality_fidelity: { fidelity: [], quality: [] },
      },
    },
  });

  assert.equal(revised.conflicts.length, 1);
  assert.equal(revised.conflicts[0].section, "activities");
  assert.equal(revised.questions.some((question) => question.status === "open"), true);
});

test("conflict detector flags known-information repeat when asking for population already captured", () => {
  const flags = detectContextConflicts({
    history: [],
    userMessage: "We already shared this.",
    reply: "Who is your program for?",
    modelPatch: null,
    mergedModel: createModel(),
  });

  assert.ok(flags.includes("asks_for_known_information"));
});
