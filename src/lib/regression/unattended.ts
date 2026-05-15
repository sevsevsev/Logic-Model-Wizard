export interface IterationMetrics {
  iteration: number;
  highSeverityFailures: number;
}

export interface StopEvaluationInput {
  history: IterationMetrics[];
  noImprovementWindow: number;
  destabilizationThreshold: number;
  maxIterations: number;
}

export interface StopEvaluationResult {
  shouldStop: boolean;
  reason:
    | "zero_high_severity"
    | "no_net_improvement"
    | "destabilizing_regression"
    | "budget_exhausted"
    | "continue";
}

export function evaluateStopCondition(input: StopEvaluationInput): StopEvaluationResult {
  const { history, noImprovementWindow, destabilizationThreshold, maxIterations } = input;
  if (history.length === 0) {
    return { shouldStop: false, reason: "continue" };
  }

  const current = history[history.length - 1];
  if (current.highSeverityFailures === 0) {
    return { shouldStop: true, reason: "zero_high_severity" };
  }

  if (history.length >= 2) {
    const previous = history[history.length - 2];
    if (current.highSeverityFailures > previous.highSeverityFailures + Math.max(0, destabilizationThreshold)) {
      return { shouldStop: true, reason: "destabilizing_regression" };
    }
  }

  const window = Math.max(1, noImprovementWindow);
  if (history.length > window) {
    const recent = history.slice(-(window + 1));
    let improved = false;
    for (let index = 1; index < recent.length; index++) {
      if (recent[index].highSeverityFailures < recent[index - 1].highSeverityFailures) {
        improved = true;
        break;
      }
    }
    if (!improved) {
      return { shouldStop: true, reason: "no_net_improvement" };
    }
  }

  if (current.iteration >= maxIterations) {
    return { shouldStop: true, reason: "budget_exhausted" };
  }

  return { shouldStop: false, reason: "continue" };
}
