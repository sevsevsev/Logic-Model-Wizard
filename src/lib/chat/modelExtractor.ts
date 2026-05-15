/**
 * Extract structured LogicModel from conversation transcript.
 * This runs after each turn to maintain current understanding.
 */

import type { LogicModel } from "@/store/useLogicModelStore";
import { ConversationTranscript } from "./transcript";

export interface ExtractionAnalysis {
  model: Partial<LogicModel>;
  completeness: {
    population: number; // 0-100 confidence
    geography: number;
    activities: number;
    outcomes: number;
    quality: number;
    intent: number;
  };
  gaps: string[]; // Missing critical fields
  suggestedNextQuestions: string[];
}

/**
 * Extract model from conversation transcript using heuristic analysis.
 * This is deterministic (no LLM call), making it reliable and debuggable.
 */
export async function extractModelFromTranscript(
  transcript: ConversationTranscript
): Promise<ExtractionAnalysis> {
  const userMessages = transcript.turns
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join(" ");
  const fullText = userMessages;

  const model: Partial<LogicModel> = {};
  const gaps: string[] = [];
  const suggestedNextQuestions: string[] = [];

  // ===== INTENDED IMPACT =====
  const population = extractPopulation(userMessages, fullText);
  const geography = extractGeography(userMessages, fullText);
  const longTermGoal = extractLongTermGoal(userMessages, fullText);

  if (population || geography || longTermGoal) {
    model.intended_impact = {
      population: population || "",
      geography: geography || "",
      long_term_goal: longTermGoal || "",
      compiled_statement: "",
    };
  }

  // ===== IMPLEMENTATION =====
  const activities = extractActivities(userMessages, fullText);
  const resources = extractResources(userMessages, fullText);
  const quality = extractQuality(userMessages, fullText);

  if (activities.length > 0 || resources.length > 0 || Object.keys(quality).length > 0) {
    model.implementation = {
      resources: {
        human: [],
        material: [],
        financial: [],
        knowledge: [],
      },
      activities: activities.map((a) => ({
        item: a,
        category: "",
        actions: [],
        outputs: [],
      })),
      outputs_metrics: [],
      quality_fidelity: {
        fidelity: quality.fidelity ? ["mentioned"] : [],
        quality: quality.quality ? ["mentioned"] : [],
      },
    };
    
    // Add resources to all matching buckets when a phrase contains multiple signals.
    for (const resource of resources) {
      const lower = resource.toLowerCase();
      const matchesHuman =
        lower.includes("volunteer") ||
        lower.includes("staff") ||
        lower.includes("instructor") ||
        lower.includes("coordinator") ||
        lower.includes("mentor") ||
        lower.includes("teacher") ||
        lower.includes("expert") ||
        lower.includes("counselor") ||
        lower.includes("partner");
      const matchesFinancial =
        lower.includes("fund") ||
        lower.includes("grant") ||
        lower.includes("budget") ||
        lower.includes("bank") ||
        /\$\s*\d/.test(lower);
      const matchesKnowledge =
        lower.includes("technolog") ||
        lower.includes("software") ||
        lower.includes("curriculum") ||
        lower.includes("training") ||
        lower.includes("expertise") ||
        lower.includes("handbook") ||
        lower.includes("manual") ||
        lower.includes("evidence-based");
      const matchesMaterial =
        lower.includes("tool") ||
        lower.includes("equipment") ||
        lower.includes("laptop") ||
        lower.includes("device") ||
        lower.includes("space") ||
        lower.includes("library") ||
        lower.includes("material");

      let assigned = 0;
      if (matchesHuman) {
        model.implementation.resources.human.push(resource);
        assigned += 1;
      }
      if (matchesFinancial) {
        model.implementation.resources.financial.push(resource);
        assigned += 1;
      }
      if (matchesKnowledge) {
        model.implementation.resources.knowledge.push(resource);
        assigned += 1;
      }
      if (matchesMaterial) {
        model.implementation.resources.material.push(resource);
        assigned += 1;
      }

      if (assigned === 0) {
        model.implementation.resources.material.push(resource);
      }
    }

    for (const key of ["human", "material", "financial", "knowledge"] as const) {
      const values = model.implementation.resources[key];
      model.implementation.resources[key] = Array.from(new Set(values));
    }
  }

  // ===== OUTCOMES =====
  const outcomes = extractOutcomes(userMessages, fullText);
  if (outcomes.short_term.length > 0 || outcomes.medium_term.length > 0 || outcomes.long_term.length > 0) {
    model.outcomes = {
      short_term: outcomes.short_term.map((s) => ({ statement: s })),
      medium_term: outcomes.medium_term.map((m) => ({ statement: m })),
      long_term: outcomes.long_term.map((l) => ({ statement: l })),
    };
  }

  // ===== COMPLETENESS SCORING =====
  const completeness = {
    population: population ? 85 : 0,
    geography: geography ? 80 : 0,
    activities: activities.length > 0 ? 75 + Math.min(activities.length * 5, 15) : 0,
    outcomes:
      outcomes.short_term.length > 0 || outcomes.medium_term.length > 0 || outcomes.long_term.length > 0
        ? 70 + (outcomes.short_term.length + outcomes.medium_term.length + outcomes.long_term.length) * 3
        : 0,
    quality: quality.fidelity || quality.quality ? 80 : 0,
    intent: longTermGoal ? 75 : 0,
  };

  // ===== GAP IDENTIFICATION =====
  if (!population) gaps.push("Population: Who do you serve?");
  if (!geography) gaps.push("Geography: Where do you operate?");
  if (activities.length === 0) gaps.push("Activities: What do you actually do?");
  if (outcomes.short_term.length === 0 && outcomes.medium_term.length === 0 && outcomes.long_term.length === 0) gaps.push("Outcomes: What changes do you expect?");
  if (!quality.fidelity && !quality.quality) gaps.push("Quality: How do you ensure quality?");

  // ===== SUGGESTED FOLLOW-UPS =====
  if (!population) suggestedNextQuestions.push("Can you tell me more about the population you serve?");
  if (!geography) suggestedNextQuestions.push("Where geographically do you operate?");
  if (activities.length < 3) suggestedNextQuestions.push("What are the main activities or programs you run?");
  if (outcomes.short_term.length < 2) suggestedNextQuestions.push("What outcomes or changes do you expect from your work?");
  if (!quality.fidelity && !quality.quality) suggestedNextQuestions.push("How do you ensure quality and consistency in your work?");

  return {
    model,
    completeness,
    gaps,
    suggestedNextQuestions,
  };
}

// ===== EXTRACTION HELPERS =====

function extractPopulation(userMessages: string, fullText: string): string {
  const patterns = [
    /(?:serves?|works with|targets?|supports?|for|reach)\s+([^.!?]+?(?:students?|youth|children|families?|participants?|community|residents?|people))/i,
    /(?:population|audience)\s+(?:of|is|includes?)\s+([^.!?]+)/i,
    /\b(students?|youth|children|families?|participants?|[A-Z]\w+ community)\b/,
  ];

  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match?.[1]) {
      return match[1].trim().substring(0, 200);
    }
  }
  return "";
}

function extractGeography(userMessages: string, fullText: string): string {
  const patterns = [
    /(?:in|across|throughout|serving|based in)\s+([^.!?]+?(?:(?:north|south|west|east|northeast|northwest|southeast|southwest)\s+philadelphia|philadelphia|center\s+city|kensington|fishtown|germantown|south\s+philly|north\s+philly|west\s+philly|city|county|state|region|neighborhood|district|school))/i,
    /(?:location|geography|based)\s+(?:in|is)\s+([^.!?]+)/i,
    /\b((?:North|South|West|East|Northeast|Northwest|Southeast|Southwest)\s+Philadelphia|Philadelphia|New York|Chicago|Kensington|Fishtown|Germantown|South Philly|North Philly|West Philly|[A-Z][a-z]+ (?:County|City|Neighborhood))\b/,
  ];

  let lastMatch = "";
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (const match of fullText.matchAll(regex)) {
      const candidate = (match[1] ?? "").trim().substring(0, 150);
      if (candidate) {
        lastMatch = candidate;
      }
    }
  }
  return lastMatch;
}

function extractLongTermGoal(userMessages: string, fullText: string): string {
  const patterns = [
    /(?:long.?term\s+goal|goal|mission|vision)\s+(?:is|that|to|for)\s+([^.!?]+)/i,
    /(?:our\s+goal\s+is|we\s+aim\s+to|we\s+hope\s+to|over\s+time\s+we\s+expect)\s+([^.!?]+)/i,
    /\b(?:so that|ultimately|over time)\s+([^.!?]+)/i,
    /(?:we want|we aim|we seek)\s+([^.!?]+)/i,
  ];

  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match?.[1]) {
      const candidate = match[1].trim();
      if (candidate.length < 8) continue;
      return candidate.substring(0, 250);
    }
  }
  return "";
}

function extractActivities(userMessages: string, fullText: string): string[] {
  const activities: Set<string> = new Set();
  const patterns = [
    /(?:provides?|offers?|runs?|holds?|delivers?|meets?|teach|mentor|connect)\s+([^.!?]+(?:education|instruction|mentoring|support|training|counseling|classes?))/i,
    /(?:meets?\s+with|meetings?|mentor(?:ing)?|work\s+on)\s+([^.!?]+(?:apps?|goals?|plans?|skills?|support|education|training))/i,
    /\b(music education|tutoring|mentoring|counseling|training|instruction|classes?|workshops?|programs?|services?|support|coaching)\b/i,
  ];

  for (const pattern of patterns) {
    const matches = fullText.matchAll(new RegExp(pattern.source, pattern.flags + "g"));
    for (const match of matches) {
      const text = (match[1] || match[0]).trim();
      if (text.length > 5 && text.length < 200) {
        activities.add(text);
      }
    }
  }

  return Array.from(activities).slice(0, 10);
}

function extractResources(userMessages: string, fullText: string): string[] {
  const resources: string[] = [];
  const seen = new Set<string>();

  const addResource = (candidate: string) => {
    const cleaned = normalizeResourceCandidate(candidate);
    if (!cleaned) return;
    if (cleaned.length < 2 || cleaned.length > 120) return;

    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    resources.push(cleaned);
  };

  for (const segment of splitResourceSegments(fullText)) {
    if (containsResourceSignal(segment)) {
      addResource(segment);
    }
  }

  return resources.slice(0, 8);
}

function splitResourceSegments(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const segments: string[] = [];
  for (const sentence of normalized.split(/[.;!?\n]+/)) {
    const commaParts = sentence.split(/\s*,\s*/).filter(Boolean);
    for (const commaPart of commaParts) {
      const andParts = splitOnListConjunctions(commaPart);
      for (const part of andParts) {
        const trimmed = part.trim();
        if (trimmed) segments.push(trimmed);
      }
    }
  }

  return segments;
}

function splitOnListConjunctions(text: string): string[] {
  if (!/\band\b/i.test(text)) return [text];

  const resourceSignalCount = countResourceSignals(text);
  if (resourceSignalCount < 2 && text.length > 90) {
    return [text];
  }

  return text
    .split(/\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function countResourceSignals(text: string): number {
  const matches = text.match(
    /\b(volunteers?|mentors?|coordinators?|staff|instructors?|teachers?|tools?|equipment|materials?|supplies|space|library|curriculum|curricula|handbook|manual|expert(?:ise)?|training|funding|funds?|grants?|budget|donations?|bank|partnerships?|technology|software|assessments?)\b/gi
  );
  return matches?.length ?? 0;
}

function containsResourceSignal(text: string): boolean {
  return countResourceSignals(text) > 0;
}

function normalizeResourceCandidate(candidate: string): string {
  let text = candidate.trim();
  if (!text) return "";

  text = text
    .replace(/^(?:and|or|plus|also)\s+/i, "")
    .replace(/^(?:our|the|a|an|some|any|these|those|this|that)\s+/i, "")
    .replace(/^(?:resources?|inputs?)\s*(?:include|are|:)?\s*/i, "")
    .replace(/^(?:we\s+have|we\s+use|we\s+need|we\s+access|we\s+include|we\s+work\s+with|we)\s+/i, "")
    .replace(/^(?:have|has)\s+/i, "")
    .replace(/\b(?:that|which|who|where|while|because|so that|to ensure|to support|for reflection|for analysis|for reporting)\b.*$/i, "")
    .trim();

  text = text.replace(/^[,:;\-\s]+|[,:;\-\s]+$/g, "").trim();
  return text;
}

function extractQuality(userMessages: string, fullText: string): { fidelity: boolean; quality: boolean } {
  return {
    fidelity: /(?:fidelity|checklist|manual|handbook|protocol|consistency|reliability|adherence)/i.test(fullText),
    quality: /(?:high quality|quality standards?|ensure quality|training|background checks?|qualified|organic-only)/i.test(fullText),
  };
}

function extractOutcomes(userMessages: string, fullText: string): { short_term: string[]; medium_term: string[]; long_term: string[] } {
  const outcomes = {
    short_term: [] as string[],
    medium_term: [] as string[],
    long_term: [] as string[],
  };

  const labeledShort = fullText.match(/short\s*term[^.!?]*[:,-]?\s*([^.!?]+)/i);
  if (labeledShort?.[1]) outcomes.short_term.push(labeledShort[1].trim());
  const labeledMedium = fullText.match(/medium\s*term[^.!?]*[:,-]?\s*([^.!?]+)/i);
  if (labeledMedium?.[1]) outcomes.medium_term.push(labeledMedium[1].trim());
  const labeledLong = fullText.match(/long\s*term[^.!?]*[:,-]?\s*([^.!?]+)/i);
  if (labeledLong?.[1]) outcomes.long_term.push(labeledLong[1].trim());

  // Parse temporal language to classify outcomes into time buckets
  const sentences = fullText.split(/[.!?\n]+/).filter(Boolean);
  for (const sentence of sentences) {
    // Skip activity-describing sentences (to avoid activity-outcome confusion)
    if (/\b(?:hold|run|deliver|offer|provide|conduct|lead|teach|mentor)\s+(?:weekly|monthly|daily|session|activity|program|class|workshop)/i.test(sentence)) {
      continue;
    }
    if (/\b(?:activities?|programs?|sessions?)\s+(?:include|consist of|are|involve)/i.test(sentence)) {
      continue;
    }

    // Short-term temporal signals (immediate, instant)
    if (/(immediately|right away|instantly|at once|first thing|day one|week one)\b/i.test(sentence)) {
      const match = sentence.match(/(we\s+)?(?:want|expect|hope|intend|aim)\s+(?:to|that|for)?\s*([^.!?]+)/i);
      if (match?.[2]) {
        outcomes.short_term.push(match[2].trim());
      }
    }
    // Short-term keywords
    else if (/\b(?:knowledge|awareness|understanding|skills?|confidence|sense of|belonging|welcome)\b/i.test(sentence)) {
      const match = sentence.match(/(?:we\s+)?(?:want|expect|hope)\s+(?:to|that)?\s*([^.!?]+)/i);
      if (match?.[1]) {
        const text = match[1].trim();
        if (!/\b(?:within|in|after|over)\s+\d+\s+(?:year|month|week)/i.test(text)) {
          outcomes.short_term.push(text);
        }
      }
    }

    // Medium-term temporal signals (weeks, months, up to ~6 months)
    if (/(within\s+)?(?:(?:a|\d+)\s+)?(?:week|month|semester)s?\b|(?:few|several)\s+(?:weeks?|months?)/i.test(sentence)) {
      const match = sentence.match(/(we\s+)?(?:want|expect|hope|intend|aim)\s+(?:to|that)?\s*([^.!?]+)/i);
      if (match?.[2]) {
        outcomes.medium_term.push(match[2].trim());
      }
    }
    // Medium-term keywords (behavior, engagement, attendance)
    else if (/\b(?:behavior|engagement|attendance|grades|participation|social.?emotional|performance|achievement|progress|habits?)\b/i.test(sentence)) {
      const match = sentence.match(/(?:we\s+)?(?:want|expect|hope)\s+(?:to|that)?\s*([^.!?]+)/i);
      if (match?.[1]) {
        const text = match[1].trim();
        // Skip if it explicitly mentions years
        if (!/\b(?:within|in|after)\s+\d+\s+years?\b/i.test(text)) {
          outcomes.medium_term.push(text);
        }
      }
    }

    // Long-term temporal signals (years)
    if (/(within\s+)?(?:\d+\s+)?years?\b|in\s+(?:10|five|several)\s+years?|ten\s+years|long.?term/i.test(sentence)) {
      const match = sentence.match(/(we\s+)?(?:want|expect|hope|intend|aim)\s+(?:to|that)?\s*([^.!?]+)/i);
      if (match?.[2]) {
        outcomes.long_term.push(match[2].trim());
      }
    }
    // Long-term keywords (graduation, career, pathways)
    else if (/\b(?:graduation|graduate|college|career|employment|pathways?|trajectories?|reduce|decrease|increase|enrollment|persistence)\b/i.test(sentence)) {
      const match = sentence.match(/(?:we\s+)?(?:want|expect|hope)\s+(?:to|that)?\s*([^.!?]+)/i);
      if (match?.[1]) {
        const text = match[1].trim();
        // Only include if it doesn't explicitly say short/medium timeframe
        if (!/\b(?:immediately|within\s+(?:a\s+)?(?:week|month|semester))/i.test(text)) {
          outcomes.long_term.push(text);
        }
      }
    }
  }

  // Deduplicate and limit results
  const dedupe = (arr: string[]) => Array.from(new Set(arr.map(s => s.toLowerCase()))).map(s => {
    const original = arr.find(o => o.toLowerCase() === s);
    return original || "";
  }).filter(Boolean).slice(0, 3);

  outcomes.short_term = dedupe(outcomes.short_term);
  outcomes.medium_term = dedupe(outcomes.medium_term);
  outcomes.long_term = dedupe(outcomes.long_term);

  return outcomes;
}
