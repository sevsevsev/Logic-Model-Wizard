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

test("buildComparisonRetrievalQuery shifts impact focus toward draft review when a draft already exists", () => {
  const query = buildComparisonRetrievalQuery(
    "We are focusing on the intended impact.",
    "impact",
    {
      intended_impact: {
        population: "middle school students",
        geography: "North Philadelphia",
        long_term_goal: "read on grade level and transition successfully to high school",
        compiled_statement: "Middle school students in North Philadelphia will read on grade level and transition successfully to high school.",
      },
      stakeholders: [],
      implementation: {
        resources: { human: [], material: [], financial: [], knowledge: [] },
        activities: [],
        quality_fidelity: { fidelity: [], quality: [] },
      },
      outcomes: { short_term: [], medium_term: [], long_term: [] },
    }
  );

  assert.match(query, /draft review/i);
  assert.match(query, /working draft/i);
  assert.match(query, /acknowledge/i);
});
