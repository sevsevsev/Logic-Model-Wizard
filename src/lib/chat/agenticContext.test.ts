import test from "node:test";
import assert from "node:assert/strict";
import type { LogicModel } from "@/store/useLogicModelStore";
import {
  assertIntentWithLatestUserEvidence,
  buildContextCoverageSummary,
} from "@/lib/chat/agenticContext";
import { looksLikeBroadProgramFrame } from "@/lib/chat/intakeSignals";

function createModel(): LogicModel {
  return {
    intended_impact: {
      population: "",
      geography: "",
      long_term_goal: "",
      compiled_statement: "",
    },
    stakeholders: [],
    implementation: {
      resources: {
        human: [],
        material: [],
        financial: [],
        knowledge: [],
      },
      activities: [],
      quality_fidelity: {
        fidelity: [],
        quality: [],
      },
    },
    outcomes: {
      short_term: [],
      medium_term: [],
      long_term: [],
    },
  };
}

test("context coverage flags missing population capture", () => {
  const summary = buildContextCoverageSummary(
    "We provide mentoring to elementary students.",
    null
  );

  assert.equal(summary.user.hasPopulationCue, true);
  assert.equal(summary.patch.hasPopulationCue, false);
  assert.ok(summary.missingCaptures.includes("population"));
});

test("context coverage recognizes captured population and activities", () => {
  const summary = buildContextCoverageSummary(
    "We provide mentoring to elementary students.",
    {
      intended_impact: {
        population: "elementary students",
        geography: "",
        long_term_goal: "",
        compiled_statement: "",
      },
      implementation: {
        resources: {
          human: [],
          material: [],
          financial: [],
          knowledge: [],
        },
        activities: [
          {
            item: "Mentoring",
            actions: ["Provide mentoring"],
            outputs: [],
          },
        ],
        quality_fidelity: {
          fidelity: [],
          quality: [],
        },
      },
    }
  );

  assert.equal(summary.patch.hasPopulationCue, true);
  assert.equal(summary.patch.hasActivityCue, true);
  assert.ok(!summary.missingCaptures.includes("population"));
});

test("broad program framing is not treated as an activity cue", () => {
  const text = "We provide mentoring to students in North Philadelphia.";
  const summary = buildContextCoverageSummary(text, null);

  assert.equal(looksLikeBroadProgramFrame(text), true);
  assert.equal(summary.user.hasPopulationCue, true);
  assert.equal(summary.user.hasGeographyCue, true);
  assert.equal(summary.user.hasActivityCue, false);
  assert.ok(!summary.missingCaptures.includes("activities"));
});

test("mission/theory narrative with noisy unicode preserves activity and outcome cues", () => {
  const text = "Musicopia's mission is to inspire, educate, and connect children, youth, and their extended communi􀆟es through collabora􀆟ve music and dance experiences. Theory of Change: Musicopia delivers sustained, culturally responsive music and dance learning experiences that build students' self-efficacy and social-emo􀆟onal learning. Programs strengthen classroom climate, school culture, and family engagement. Through consistent presence in under-resourced neighborhoods, Musicopia contributes to safer, more vibrant communi􀆟es where arts learning is embedded in daily life.";
  const summary = buildContextCoverageSummary(text, null);

  assert.equal(looksLikeBroadProgramFrame(text), false);
  assert.equal(summary.user.hasPopulationCue, true);
  assert.equal(summary.user.hasGeographyCue, true);
  assert.equal(summary.user.hasActivityCue, true);
  assert.equal(summary.user.hasOutcomeCue, true);
});

test("intent assertion advances from population to geography when user already gave population", () => {
  const model = createModel();
  const next = assertIntentWithLatestUserEvidence(
    "population_focus",
    "We provide mentoring to elementary students.",
    model
  );

  assert.equal(next, "geography");
});

test("intent assertion advances from geography to specificity when user gives geography", () => {
  const model = createModel();
  model.intended_impact.population = "elementary students";

  const next = assertIntentWithLatestUserEvidence(
    "geography",
    "We serve schools in North Philadelphia.",
    model
  );

  assert.equal(next, "impact_specificity");
});
