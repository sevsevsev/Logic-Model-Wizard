import test from "node:test";
import assert from "node:assert/strict";

import { extractModelFromTranscript } from "@/lib/chat/modelExtractor";
import type { ConversationTranscript } from "@/lib/chat/transcript";

function makeTranscript(message: string): ConversationTranscript {
  return {
    turns: [
      {
        role: "user",
        content: message,
        timestamp: Date.now(),
      },
    ],
    questionsAsked: [],
    topicsCovered: [],
  };
}

test("extractModelFromTranscript splits multi-item resource lists into clean strings", async () => {
  const transcript = makeTranscript(
    "Our program staff, funding from grants, a research-based curriculum, assessments that we use for formative and summative reflection, and our lab space at the University City Sciences Center."
  );

  const analysis = await extractModelFromTranscript(transcript);
  const resources = analysis.model.implementation?.resources;

  assert.ok(resources, "resources should be present");

  const flattened = [
    ...resources.human,
    ...resources.material,
    ...resources.financial,
    ...resources.knowledge,
  ];

  assert.ok(flattened.length >= 4, `expected at least 4 resource items, got ${flattened.length}`);
  assert.match(flattened.join(" | "), /program staff/i);
  assert.match(flattened.join(" | "), /funding from grants/i);
  assert.match(flattened.join(" | "), /research-based curriculum/i);
  assert.match(flattened.join(" | "), /lab space/i);
  assert.ok(
    flattened.every((item) => !/for formative and summative reflection/i.test(item)),
    `unexpected clause leak in resources: ${flattened.join(" | ")}`
  );
});

test("extractModelFromTranscript captures mentor and funding buckets after prior impact turns", async () => {
  const transcript: ConversationTranscript = {
    turns: [
      {
        role: "user",
        content: "We work with high schoolers in the city to help them get jobs.",
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: "Our long-term goal is 100% college or trade school enrollment for our seniors.",
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: "We have mentors and some funding from a local bank.",
        timestamp: Date.now(),
      },
    ],
    questionsAsked: [],
    topicsCovered: [],
  };

  const analysis = await extractModelFromTranscript(transcript);
  const resources = analysis.model.implementation?.resources;

  assert.ok(resources, "resources should be present");
  assert.ok(resources.human.length > 0, "human resources should include mentors");
  assert.ok(resources.financial.length > 0, "financial resources should include funding");
});

test("extractModelFromTranscript prefers corrected geography later in transcript", async () => {
  const transcript: ConversationTranscript = {
    turns: [
      {
        role: "user",
        content: "We serve middle school students in North Philadelphia and want them to read on grade level by high school.",
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: "Correction: not North Philadelphia, it's West Philadelphia.",
        timestamp: Date.now(),
      },
    ],
    questionsAsked: [],
    topicsCovered: [],
  };

  const analysis = await extractModelFromTranscript(transcript);
  assert.equal(analysis.model.intended_impact?.geography, "West Philadelphia");
});

test("extractModelFromTranscript captures neighborhood geography like Kensington", async () => {
  const transcript = makeTranscript(
    "Specifically, high school youth in Kensington graduating on time."
  );

  const analysis = await extractModelFromTranscript(transcript);
  assert.equal(analysis.model.intended_impact?.geography, "Kensington");
  assert.match(String(analysis.model.intended_impact?.long_term_goal ?? ""), /graduating on time/i);
});

test("extractModelFromTranscript latest_turn mode only attests latest user turn", async () => {
  const transcript: ConversationTranscript = {
    turns: [
      {
        role: "user",
        content: "Our resources are staff mentors, grant funding, and laptops.",
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: "Thanks. What are your core activities?",
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: "We hold weekly tutoring sessions.",
        timestamp: Date.now(),
      },
    ],
    questionsAsked: [],
    topicsCovered: [],
  };

  const analysis = await extractModelFromTranscript(transcript, { mode: "latest_turn" });
  assert.equal(analysis.extraction.mode, "latest_turn");
  assert.deepEqual(analysis.extraction.attestedUserTurnIndices, [3]);
  assert.equal(analysis.model.implementation?.resources?.human?.length ?? 0, 0);
});