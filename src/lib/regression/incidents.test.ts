import test from "node:test";
import assert from "node:assert/strict";
import {
  collapseIncidentThreads,
  normalizeDebugSnapshots,
  normalizeScenarioReport,
  summarizeFailureClassCounts,
  type DebugSnapshotRecord,
  type ScenarioReport,
} from "@/lib/regression/incidents";

test("normalizeScenarioReport classifies intent mismatch and missing patch writeback", () => {
  const report: ScenarioReport = {
    generatedAt: "2026-05-14T00:00:00.000Z",
    results: [
      {
        id: "impact-happy-path",
        failures: [
          "turn 2: finalIntent expected one of [impact], got 'resources'",
          "turn 2: modelPatch missing required path 'intended_impact.compiled_statement'",
        ],
        turnResults: [{ turn: 2, finalIntent: "resources", stateIntent: "impact" }],
      },
    ],
  };

  const incidents = normalizeScenarioReport(report);
  assert.equal(incidents.length, 2);
  assert.equal(incidents[0].failureClass, "phase_regression");
  assert.equal(incidents[0].confidence, "high");
  assert.equal(incidents[1].failureClass, "missing_patch_writeback");
  assert.equal(incidents[1].severity, "high");
});

test("normalizeDebugSnapshots classifies acceptance-gate and phase-regression behavior", () => {
  const snapshots: DebugSnapshotRecord[] = [
    {
      id: "snapshot-1",
      userId: "u-1",
      createdAt: "2026-05-14T01:00:00.000Z",
      capture: {
        feedbackReport: {
          description:
            "The impact statement was confirmed by the user but failed to be written to the model template before moving to resources.",
        },
        model: {
          intended_impact: {
            compiled_statement: "A complete draft exists.",
          },
        },
        messages: [
          { role: "assistant", content: "Could you tell me about the specific population your program is designed to serve?" },
        ],
        llm: {
          recentCalls: [
            {
              trace: {
                retrieval: {
                  mode: "vector",
                  reason: "vector_success",
                },
              },
            },
          ],
        },
      },
    },
  ];

  const incidents = normalizeDebugSnapshots(snapshots);
  assert.equal(incidents.length, 2);
  assert.equal(incidents[0].failureClass, "acceptance_gate_failure");
  assert.equal(incidents[1].failureClass, "phase_regression");
});

test("collapseIncidentThreads groups repeated fingerprints in recency window", () => {
  const report: ScenarioReport = {
    generatedAt: "2026-05-14T00:00:00.000Z",
    results: [
      {
        id: "resources-no-silent-drop",
        failures: ["turn 1: modelPatch missing required path 'implementation.resources'"],
      },
      {
        id: "resources-no-silent-drop",
        failures: ["turn 1: modelPatch missing required path 'implementation.resources'"],
      },
    ],
  };

  const incidents = normalizeScenarioReport(report);
  const threads = collapseIncidentThreads(incidents, 24);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].occurrences, 2);

  const counts = summarizeFailureClassCounts(incidents);
  assert.equal(counts.missing_patch_writeback, 2);
});
