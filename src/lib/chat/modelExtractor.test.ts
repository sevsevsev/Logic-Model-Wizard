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