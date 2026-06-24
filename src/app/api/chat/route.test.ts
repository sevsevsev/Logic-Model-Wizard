import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { LogicModel } from "@/store/useLogicModelStore";
import { POST } from "@/app/api/chat/route";

function createModel(): LogicModel {
  return {
    intended_impact: {
      population: "9th graders",
      geography: "citywide",
      long_term_goal: "graduate high school",
      compiled_statement: "9th graders in citywide will graduate high school",
    },
    stakeholders: [],
    implementation: {
      resources: {
        human: ["Program staff"],
        material: ["Curriculum"],
        financial: ["Grant funding"],
        knowledge: ["Trauma-informed practice"],
      },
      activities: [
        {
          item: "Mentoring",
          actions: ["Provide weekly mentoring"],
          outputs: [{ text: "100 sessions delivered" }],
        },
      ],
      quality_fidelity: {
        fidelity: ["Session adherence"],
        quality: ["Participant satisfaction"],
      },
    },
    outcomes: {
      short_term: [{ statement: "Improved school engagement" }],
      medium_term: [{ statement: "Improved attendance" }],
      long_term: [{ statement: "Higher on-time graduation" }],
    },
  };
}

test("chat route injects causal review instruction when model is structurally complete", async () => {
  process.env.GEMINI_API_KEY = "test-key";

  const calls: Array<{ url: string; payload: unknown }> = [];
  const originalFetch = global.fetch;

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const payload = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, payload });

    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  "Let\'s inspect the weakest causal link together.\n<question_intent>causal_review</question_intent>\n<model_patch>{\"intended_impact\":{\"long_term_goal\":\"graduate high school\"}}</model_patch>",
              },
            ],
          },
        },
      ],
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Can we review for logic gaps?",
        history: [],
        model: createModel(),
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    assert.ok(calls.length >= 1);

    const payload = calls[0].payload as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    const text = payload.contents?.[payload.contents.length - 1]?.parts?.[0]?.text ?? "";

    assert.match(
      text,
      /\[Causal Review Instruction\][\s\S]*Review the causal chain \(Resources -> Activities -> Outputs -> Short\/Medium\/Long Outcomes\)/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("chat route bypasses repeated impact specificity gate and advances to resources", async () => {
  process.env.GEMINI_API_KEY = "test-key";

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  "Thanks for clarifying.\n<question_intent>impact_specificity</question_intent>\n<model_patch>{\"intended_impact\":{\"long_term_goal\":\"better opportunities\"}}</model_patch>",
              },
            ],
          },
        },
      ],
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const model = createModel();
    model.intended_impact.long_term_goal = "";
    model.intended_impact.compiled_statement = "";
    model.implementation.resources = { human: [], material: [], financial: [], knowledge: [] };

    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Still better opportunities over time.",
        history: [
          {
            id: "a1",
            role: "assistant",
            content:
              "Before I draft an impact statement, what exact long-term difference should we be able to point to in 10 years?",
            timestamp: Date.now() - 1000,
          },
          {
            id: "u1",
            role: "user",
            content: "They should have better opportunities.",
            timestamp: Date.now() - 900,
          },
        ],
        model,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const json = (await res.json()) as { reply?: string; modelPatch?: Partial<LogicModel> | null };
    assert.equal(
      json.reply,
      "What are the key resources needed to run this program (people, materials, funding, and expertise)?"
    );
    assert.equal(Boolean(json.modelPatch?.intended_impact), true);
  } finally {
    global.fetch = originalFetch;
  }
});
