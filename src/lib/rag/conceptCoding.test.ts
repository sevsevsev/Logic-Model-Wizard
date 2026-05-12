import test from "node:test";
import assert from "node:assert/strict";
import { buildConceptCodingTrace } from "@/lib/rag/conceptCoding";

test("buildConceptCodingTrace maps user spans to chunk links", () => {
  const trace = buildConceptCodingTrace({
    userText: "Middle school students in Philadelphia need better attendance outcomes.",
    retrievedChunks: [
      {
        id: "k1",
        title: "Intended impact basics",
        text: "Population and geography should be explicit in impact statements.",
        topic: "intended-impact",
        source: "knowledge-base",
        tags: ["population", "geography"],
        score: 0.88,
      },
      {
        id: "k2",
        title: "Outcomes sequencing",
        text: "Outcomes should include short, medium, and long-term changes.",
        topic: "outcomes",
        source: "knowledge-base",
        tags: ["outcomes", "attendance"],
        score: 0.72,
      },
    ],
    evidenceRefs: ["k1", "k2"],
  });

  assert.equal(trace.queryText.includes("Middle school students"), true);
  assert.equal(trace.spans.length >= 1, true);
  assert.equal(trace.retrievedChunkIds.length, 2);
  assert.equal(trace.spans[0].matchedChunks.length >= 1, true);
});

test("buildConceptCodingTrace marks unmatched spans when overlap is absent", () => {
  const trace = buildConceptCodingTrace({
    userText: "Our mascot colors changed this season.",
    retrievedChunks: [
      {
        id: "k1",
        title: "Outcomes sequencing",
        text: "Outcomes should include short, medium, and long-term changes.",
        topic: "outcomes",
        source: "knowledge-base",
        tags: ["logic model"],
        score: 0.65,
      },
    ],
  });

  assert.equal(trace.unmatchedSpans >= 1, true);
});
