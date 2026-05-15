import test from "node:test";
import assert from "node:assert/strict";
import { generateCandidatePack, type CandidatePackInputIncident } from "@/lib/regression/candidates";

test("generateCandidatePack maps key failure classes to propose-only scenario candidates", () => {
  const incidents: CandidatePackInputIncident[] = [
    {
      id: "incident-1",
      failureClass: "phase_regression",
      summary: "Impact restarted",
      rationale: "Agent asked baseline question despite draft",
      severity: "high",
      confidence: "high",
    },
    {
      id: "incident-2",
      failureClass: "acceptance_gate_failure",
      summary: "Approval writeback missing",
      rationale: "Compiled statement not persisted after confirmation",
      severity: "high",
      confidence: "high",
    },
  ];

  const pack = generateCandidatePack(incidents, { maxPerClass: 1 });
  assert.equal(pack.sourceIncidentCount, 2);
  assert.equal(pack.generatedCandidateCount, 2);
  assert.equal(pack.byFailureClass.phase_regression, 1);
  assert.equal(pack.byFailureClass.acceptance_gate_failure, 1);

  const phaseCandidate = pack.candidates.find((candidate) => candidate.expectedFailureClass === "phase_regression");
  assert.ok(phaseCandidate);
  assert.match(phaseCandidate!.id, /phase_regression/);
  assert.ok(Array.isArray(phaseCandidate!.turns) && phaseCandidate!.turns.length > 0);
  assert.equal(Boolean(phaseCandidate!.seedModel?.intended_impact?.compiled_statement), true);

  const writebackCandidate = pack.candidates.find(
    (candidate) => candidate.expectedFailureClass === "acceptance_gate_failure"
  );
  assert.ok(writebackCandidate);
  assert.deepEqual(writebackCandidate!.turns[0].expect?.modelPatchMustHavePath, [
    "intended_impact.compiled_statement",
  ]);
});

test("generateCandidatePack enforces maxPerClass cap", () => {
  const incidents: CandidatePackInputIncident[] = [
    {
      id: "incident-a",
      failureClass: "phase_regression",
      summary: "s1",
      rationale: "r1",
      severity: "high",
      confidence: "high",
    },
    {
      id: "incident-b",
      failureClass: "phase_regression",
      summary: "s2",
      rationale: "r2",
      severity: "medium",
      confidence: "high",
    },
  ];

  const pack = generateCandidatePack(incidents, { maxPerClass: 1 });
  assert.equal(pack.generatedCandidateCount, 1);
  assert.equal(pack.byFailureClass.phase_regression, 1);
});
