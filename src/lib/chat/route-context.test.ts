import test from "node:test";
import assert from "node:assert/strict";
import { looksSpecificPopulation } from "@/lib/chat/guardrails";

function extractPopulationFromMessage(message: string): string | null {
  const simplifyPopulation = (raw: string): string =>
    raw
      .replace(/^the\s+/i, "")
      .replace(/\s+in\s+.+$/i, "")
      .replace(/\s+through\s+.+$/i, "")
      .replace(/\s+with\s+.+$/i, "")
      .replace(/[.,;:]+$/g, "")
      .trim();

  const populationRegexes = [
    /(?:enrolls?|serves?|supports?|targets?|works with)\s+([^.!?]+)/i,
    /(?:for|with|to)\s+((?:k-?12|middle school|high school|elementary)\s+students?)/i,
    /\bto\s+([^.!?]*(?:students?|youth|young adults?|adults?|participants?))/i,
    /\b([0-9]{1,2}(?:st|nd|rd|th)\s+graders?)\b/i,
  ];

  for (const rx of populationRegexes) {
    const match = message.match(rx);
    if (match?.[1]) return simplifyPopulation(match[1]);
  }

  return null;
}

test("population regex captures 'to elementary students' phrasing", () => {
  const input = "We provide mentoring to elementary students.";
  const extracted = extractPopulationFromMessage(input);

  assert.equal(extracted, "elementary students");
  assert.equal(looksSpecificPopulation(extracted ?? ""), true);
});

test("population regex still captures grade-based phrasing", () => {
  const input = "We serve 9th graders in afterschool programming.";
  const extracted = extractPopulationFromMessage(input);

  assert.equal(extracted, "9th graders");
  assert.equal(looksSpecificPopulation(extracted ?? ""), true);
});
