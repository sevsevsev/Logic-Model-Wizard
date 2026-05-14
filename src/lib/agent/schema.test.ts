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

test("parseAgentStructuredOutput reads revision_proposal", () => {
  const parsed = parseAgentStructuredOutput(`{
    "assistant_reply": "Here is a polished version of your intended impact.",
    "question_intent": "impact_review",
    "revision_proposal": {
      "shouldRevise": true,
      "originalText": "Students will graduate high school.",
      "revisedText": "Middle school students in Kensington will graduate high school.",
      "rationale": "Adds the missing population and geography.",
      "confidence": 0.84
    }
  }`);

  assert.equal(parsed?.revision_proposal?.shouldRevise, true);
  assert.equal(parsed?.revision_proposal?.revisedText, "Middle school students in Kensington will graduate high school.");
  assert.equal(parsed?.revision_proposal?.confidence, 0.84);
});

test("salvageAgentStructuredOutput accepts camelCase revisionProposal", () => {
  const parsed = salvageAgentStructuredOutput(`{
    "assistantReply": "Here is a polished version of your intended impact.",
    "questionIntent": "impact_review",
    "revisionProposal": {
      "shouldRevise": true,
      "originalText": "Youth will succeed.",
      "revisedText": "Middle school students in Kensington will graduate high school.",
      "rationale": "Adds specific population and outcome language."
    }
  }`);

  assert.equal(parsed?.revision_proposal?.shouldRevise, true);
  assert.equal(parsed?.revision_proposal?.originalText, "Youth will succeed.");
});