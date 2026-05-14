import { looksSpecificGeography, looksSpecificPopulation } from "@/lib/chat/guardrails";

export interface IntakeSignalSummary {
  hasPopulationCue: boolean;
  hasGeographyCue: boolean;
  hasGenericActivityCue: boolean;
  hasSpecificActivityCue: boolean;
  hasOutcomeCue: boolean;
  isBroadProgramFrame: boolean;
}

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    // Common copy/paste artifact: private-use glyph replacing the ligature "ti".
    .replace(/([A-Za-z])[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]([A-Za-z])/gu, "$1ti$2")
    .replace(/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectGenericActivityCue(text: string): boolean {
  return /\b(provide|offer|support|serve|work with|mentor|tutor|coach|train|help|guide|run|hold|facilitate|deliver|connect|link|refer)\b/i.test(
    text
  );
}

function detectSpecificActivityCue(text: string): boolean {
  return /\b(weekly|bi-weekly|daily|sessions?|workshops?|classes?|meetings?|events?|dosage|frequency|duration|hours?|calendar|schedule|curriculum|checklist|fidelity|output|outputs|learning\s+experiences?|arts\s+learning|music|dance|culturally\s+responsive|sustained|deliver(?:ed|ing|s)?|facilitat(?:e|ed|ing)|conduct(?:ed|ing)?|host(?:ed|ing)?)\b/i.test(
    text
  );
}

function detectOutcomeCue(text: string): boolean {
  return /\b(graduate|graduation|employment|job|wage|income|housing|health|attendance|reading|justice|safety|safer|improve|increase|reduce|credential|enroll(?:ment)?|retention|completion|self[-\s]?efficacy|social[-\s]?emotional|SEL|classroom\s+climate|school\s+culture|family\s+engagement|vibrant\s+communit(?:y|ies))\b/i.test(
    text
  );
}

export function classifyIntakeSignals(text: string): IntakeSignalSummary {
  const normalized = normalize(text);
  if (!normalized) {
    return {
      hasPopulationCue: false,
      hasGeographyCue: false,
      hasGenericActivityCue: false,
      hasSpecificActivityCue: false,
      hasOutcomeCue: false,
      isBroadProgramFrame: false,
    };
  }

  const hasPopulationCue = looksSpecificPopulation(normalized);
  const hasGeographyCue = looksSpecificGeography(normalized);
  const hasGenericActivityCue = detectGenericActivityCue(normalized);
  const hasSpecificActivityCue = detectSpecificActivityCue(normalized);
  const hasOutcomeCue = detectOutcomeCue(normalized);

  return {
    hasPopulationCue,
    hasGeographyCue,
    hasGenericActivityCue,
    hasSpecificActivityCue,
    hasOutcomeCue,
    isBroadProgramFrame:
      (hasPopulationCue || hasGeographyCue) &&
      hasGenericActivityCue &&
      !hasSpecificActivityCue &&
      !hasOutcomeCue,
  };
}

export function looksLikeBroadProgramFrame(text: string): boolean {
  return classifyIntakeSignals(text).isBroadProgramFrame;
}
