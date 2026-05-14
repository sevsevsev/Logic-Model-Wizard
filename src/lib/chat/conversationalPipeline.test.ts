import test from "node:test";
import assert from "node:assert/strict";
import { buildComparisonRetrievalQuery } from "@/lib/chat/conversationalPipeline";

test("buildComparisonRetrievalQuery prioritizes quality comparison evidence", () => {
  const query = buildComparisonRetrievalQuery("How do we judge the quality and fidelity of implementation?", "quality_fidelity");

  assert.match(query, /quality/i);
  assert.match(query, /fidelity/i);
  assert.match(query, /strong example/i);
  assert.match(query, /weak example/i);
  assert.match(query, /anti-pattern/i);
});

test("buildComparisonRetrievalQuery prioritizes activity chunking comparison evidence", () => {
  const query = buildComparisonRetrievalQuery("We need help chunking these activities into strategy buckets.", "activities");

  assert.match(query, /activities/i);
  assert.match(query, /strategy buckets/i);
  assert.match(query, /verb phrase/i);
  assert.match(query, /anti-pattern/i);
});
