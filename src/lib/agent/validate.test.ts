import test from "node:test";
import assert from "node:assert/strict";
import type { LogicModel } from "@/store/useLogicModelStore";
import { sanitizeAgentTurnResult } from "@/lib/agent/validate";
import type { AgentTurnBrief } from "@/lib/agent/turnBrief";

function createModel(): LogicModel {
  return {
    intended_impact: {
      population: "middle school students",
      geography: "Kensington",
      long_term_goal: "lead stable and healthy lives",
      compiled_statement: "",
    },
    stakeholders: [],
    implementation: {
      resources: { human: [], material: [], financial: [], knowledge: [] },
      activities: [],
      quality_fidelity: { fidelity: [], quality: [] },
    },
    outcomes: { short_term: [], medium_term: [], long_term: [] },
  };
}

function createBrief(): AgentTurnBrief {
  return {
    currentPhase: "impact_review",
    lastAssistantQuestion: "What exact long-term difference should we be able to point to in 10 years?",
    confirmedFacts: [
      "Population already confirmed: middle school students",
      "Geography already confirmed: Kensington",
    ],
    missingFields: ["impact_review_confirmation"],
    latestUserSignals: ["latest user message contains an outcome cue"],
    avoidAskingFor: [
      "Do not ask again for the primary population unless the user explicitly revises it.",
      "Do not ask again for geography unless the user explicitly revises it.",
    ],
    revisionLifecycle: { status: "none" },
  };
}

test("sanitizeAgentTurnResult removes unintended population overwrite", () => {
  const sanitized = sanitizeAgentTurnResult(
    {
      reply: "Who exactly is the primary population your program serves?",
      questionIntent: "population_focus",
      modelPatch: {
        intended_impact: {
          population: "help them build SEL skills so that they go on to lead stable and healthy lives",
          geography: "Kensington",
          long_term_goal: "lead stable and healthy lives",
          compiled_statement: "",
        },
      },
    },
    {
      modelSnapshot: createModel(),
      userMessage: "Our mentors work with students to help them build SEL skills so that they go on to lead stable and healthy lives.",
      turnBrief: createBrief(),
    }
  );

  assert.equal(sanitized.modelPatch?.intended_impact?.population, undefined);
  assert.equal(sanitized.questionIntent, "none");
  assert.deepEqual(
    sanitized.contradictionFlags?.sort(),
    ["asks_for_known_information", "known_fact_overwrite"].sort()
  );
});

test("sanitizeAgentTurnResult seeds state assessment from turn brief when missing", () => {
  const brief = createBrief();
  const sanitized = sanitizeAgentTurnResult(
    {
      reply: "Based on what you've shared, here's a draft intended impact statement.",
      questionIntent: "impact_review",
      modelPatch: null,
    },
    {
      modelSnapshot: createModel(),
      userMessage: "Yes, that captures it.",
      turnBrief: brief,
    }
  );

  assert.equal(sanitized.stateAssessment?.currentPhase, brief.currentPhase);
  assert.deepEqual(sanitized.stateAssessment?.missingFields, brief.missingFields);
});

test("sanitizeAgentTurnResult suppresses question plan when asking for known information", () => {
  const sanitized = sanitizeAgentTurnResult(
    {
      reply: "Which population are you serving?",
      questionIntent: "population_focus",
      modelPatch: null,
      questionPlan: {
        shouldAsk: true,
        targetField: "population",
        goal: "Clarify the primary population.",
        draftQuestion: "Which population are you serving?",
        conceptualTopics: ["population", "intended-impact"],
      },
    },
    {
      modelSnapshot: createModel(),
      userMessage: "We serve middle school students in Kensington.",
      turnBrief: createBrief(),
    }
  );

  assert.equal(sanitized.questionIntent, "none");
  assert.equal(sanitized.questionPlan?.shouldAsk, false);
  assert.equal(sanitized.questionPlan?.targetField, "none");
  assert.equal(sanitized.questionPlan?.draftQuestion, undefined);
});

test("sanitizeAgentTurnResult preserves prior impact fields when geography-only turn emits empty clears", () => {
  const model = createModel();
  const sanitized = sanitizeAgentTurnResult(
    {
      reply: "Who exactly is the primary population your program serves?",
      questionIntent: "population_focus",
      modelPatch: {
        intended_impact: {
          geography: "Philadelphia",
          population: "",
          long_term_goal: "",
          compiled_statement: "",
        },
      },
    },
    {
      modelSnapshot: model,
      userMessage: "We work across Philadelphia.",
      turnBrief: {
        ...createBrief(),
        currentPhase: "impact_review",
      },
    }
  );

  assert.equal(sanitized.modelPatch?.intended_impact?.geography, "Philadelphia");
  assert.equal(sanitized.modelPatch?.intended_impact?.population, undefined);
  assert.equal(sanitized.modelPatch?.intended_impact?.long_term_goal, undefined);
  assert.equal(sanitized.questionIntent, "none");
  assert.ok((sanitized.contradictionFlags ?? []).includes("known_fact_overwrite"));
  assert.ok((sanitized.contradictionFlags ?? []).includes("asks_for_known_information"));
});

test("sanitizeAgentTurnResult keeps a close revision proposal and drops a drifting one", () => {
  const brief = createBrief();
  const kept = sanitizeAgentTurnResult(
    {
      reply: "Here is a polished version of your statement.",
      questionIntent: "impact_review",
      modelPatch: null,
      revisionProposal: {
        shouldRevise: true,
        originalText: "We serve students.",
        revisedText: "We serve middle school students in Kensington.",
        rationale: "Adds the missing specificity.",
      },
    },
    {
      modelSnapshot: createModel(),
      userMessage: "We serve students.",
      turnBrief: brief,
    }
  );

  assert.equal(kept.revisionProposal?.revisedText, "We serve middle school students in Kensington.");
  assert.equal(kept.revisionProposal?.shouldRevise, true);

  const dropped = sanitizeAgentTurnResult(
    {
      reply: "Here is a polished version of your statement.",
      questionIntent: "impact_review",
      modelPatch: null,
      revisionProposal: {
        shouldRevise: true,
        originalText: "We serve students.",
        revisedText: "We build a citywide systems-change coalition.",
        rationale: "Moves to a more strategic framing.",
      },
    },
    {
      modelSnapshot: createModel(),
      userMessage: "We serve students.",
      turnBrief: brief,
    }
  );

  assert.equal(dropped.revisionProposal, undefined);
  assert.ok((dropped.contradictionFlags ?? []).includes("unsupported_patch"));
});