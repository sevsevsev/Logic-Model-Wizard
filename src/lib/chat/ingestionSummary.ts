import type { LogicModelState, SectionState } from "@/lib/agent/logicModelSectionState";

function getSectionLabelSummary(label: string, section?: SectionState): { line: string; missing: boolean } {
  const sufficiency = section?.sufficiency ?? "empty";

  if (sufficiency === "sufficient" || sufficiency === "confirmed") {
    return { line: `${label}: populated and sufficient.`, missing: false };
  }

  if (sufficiency === "present") {
    return { line: `${label}: partially populated, may need more detail.`, missing: true };
  }

  return { line: `${label}: missing.`, missing: true };
}

export function summarizeLogicModelState(model: Partial<LogicModelState>): string {
  const sections: Array<{ key: keyof LogicModelState; label: string }> = [
    { key: "intendedImpact", label: "Intended Impact" },
    { key: "implementation", label: "Implementation" },
    { key: "outcomes", label: "Outcomes" },
  ];
  const lines: string[] = [];
  const missing: string[] = [];
  for (const { key, label } of sections) {
    const status = getSectionLabelSummary(label, model[key]);
    lines.push(`${label}: ${status.missing ? 'needs input' : 'ok'}`);
    if (status.missing) missing.push(label);
  }
  if (missing.length > 0) {
    return `Logic model updated. Next: ${missing.join(', ')}.`;
  } else {
    return `Logic model complete. Ready for review or refinement.`;
  }
}

export function handleDocumentIngestionAndPopulate(
  logicModelState: LogicModelState,
  agentReply: string
): string {
  const summary = summarizeLogicModelState(logicModelState);
  return `${summary}\n\n${agentReply}`;
}
