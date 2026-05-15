import test from "node:test";
import assert from "node:assert/strict";
import { evaluateStopCondition } from "@/lib/regression/unattended";

test("evaluateStopCondition stops on zero high-severity failures", () => {
  const result = evaluateStopCondition({
    history: [{ iteration: 1, highSeverityFailures: 0 }],
    noImprovementWindow: 2,
    destabilizationThreshold: 1,
    maxIterations: 6,
  });
  assert.equal(result.shouldStop, true);
  assert.equal(result.reason, "zero_high_severity");
});

test("evaluateStopCondition stops on no net improvement over window", () => {
  const result = evaluateStopCondition({
    history: [
      { iteration: 1, highSeverityFailures: 4 },
      { iteration: 2, highSeverityFailures: 4 },
      { iteration: 3, highSeverityFailures: 4 },
    ],
    noImprovementWindow: 2,
    destabilizationThreshold: 1,
    maxIterations: 6,
  });
  assert.equal(result.shouldStop, true);
  assert.equal(result.reason, "no_net_improvement");
});

test("evaluateStopCondition stops on destabilizing regression", () => {
  const result = evaluateStopCondition({
    history: [
      { iteration: 1, highSeverityFailures: 2 },
      { iteration: 2, highSeverityFailures: 5 },
    ],
    noImprovementWindow: 2,
    destabilizationThreshold: 1,
    maxIterations: 6,
  });
  assert.equal(result.shouldStop, true);
  assert.equal(result.reason, "destabilizing_regression");
});

test("evaluateStopCondition stops when budget exhausted", () => {
  const result = evaluateStopCondition({
    history: [
      { iteration: 5, highSeverityFailures: 2 },
      { iteration: 6, highSeverityFailures: 2 },
    ],
    noImprovementWindow: 2,
    destabilizationThreshold: 1,
    maxIterations: 6,
  });
  assert.equal(result.shouldStop, true);
  assert.equal(result.reason, "budget_exhausted");
});

test("evaluateStopCondition continues when improving", () => {
  const result = evaluateStopCondition({
    history: [
      { iteration: 1, highSeverityFailures: 4 },
      { iteration: 2, highSeverityFailures: 3 },
      { iteration: 3, highSeverityFailures: 2 },
    ],
    noImprovementWindow: 2,
    destabilizationThreshold: 1,
    maxIterations: 6,
  });
  assert.equal(result.shouldStop, false);
  assert.equal(result.reason, "continue");
});
