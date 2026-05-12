import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentStructuredOutput, salvageAgentStructuredOutput } from "@/lib/agent/schema";

test("parseAgentStructuredOutput reads question_plan", () => {
  const parsed = parseAgentStructuredOutput(`{
    "assistant_reply": "Here is a draft. Does this capture your intended impact?",
    "question_intent": "impact_review",
    "question_plan": {
      "shouldAsk": true,
      "targetField": "impact_review_confirmation",
      "goal": "Confirm the compiled impact statement before moving on.",
      "draftQuestion": "Does this capture your intended impact?",
      "conceptualTopics": ["intended-impact"]
    }
  }`);

  assert.equal(parsed?.question_plan?.shouldAsk, true);
  assert.equal(parsed?.question_plan?.targetField, "impact_review_confirmation");
  assert.deepEqual(parsed?.question_plan?.conceptualTopics, ["intended-impact"]);
});

test("salvageAgentStructuredOutput accepts camelCase questionPlan", () => {
  const parsed = salvageAgentStructuredOutput(`{
    "assistantReply": "Here is the distinction between outputs and outcomes.",
    "questionIntent": "none",
    "questionPlan": {
      "shouldAsk": false,
      "targetField": "none",
      "goal": "Answer the concept question directly.",
      "conceptualTopics": ["outputs", "outcomes"]
    }
  }`);

  assert.equal(parsed?.question_plan?.shouldAsk, false);
  assert.equal(parsed?.question_plan?.targetField, "none");
  assert.deepEqual(parsed?.question_plan?.conceptualTopics, ["outputs", "outcomes"]);
});