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

test("chat route accepts structured routing envelope and returns agent reply", async () => {
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
                text: JSON.stringify({
                  model_patch: {
                    intended_impact: {
                      long_term_goal: "graduate high school",
                    },
                  },
                  internal_reasoning:
                    "Model is already complete enough to move into causal review.",
                  next_intent: "causal_review",
                  agent_reply: "Let's inspect the weakest causal link together.",
                }),
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

    assert.match(text, /\[Current Logic Model Snapshot\]/);

    const json = (await res.json()) as { reply?: string; modelPatch?: Partial<LogicModel> | null };
    assert.equal(json.reply, "Let's inspect the weakest causal link together.");
    assert.equal(json.modelPatch?.intended_impact?.long_term_goal, "graduate high school");
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
                text: JSON.stringify({
                  model_patch: {
                    intended_impact: {
                      long_term_goal: "better opportunities",
                    },
                  },
                  internal_reasoning:
                    "Impact is good-enough for now; move into resources to keep draft momentum.",
                  next_intent: "resources",
                  agent_reply:
                    "Good enough for now—let's move to resources. What people, materials, funding, and know-how do you need?",
                }),
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
      "Good enough for now—let's move to resources. What people, materials, funding, and know-how do you need?"
    );
    assert.equal(Boolean(json.modelPatch?.intended_impact), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("chat route preserves an existing impact draft when the user clarifies the statement", async () => {
  process.env.GEMINI_API_KEY = "test-key";

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  model_patch: {
                    intended_impact: {
                      long_term_goal: "achieve strong foundational literacy skills",
                    },
                  },
                  internal_reasoning:
                    "Keep the existing compiled draft and refine goal wording with user's literacy clarification.",
                  next_intent: "intended_impact",
                  agent_reply:
                    "That helps—I've strengthened the impact draft around foundational literacy. What wording would you refine next?",
                }),
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
    model.intended_impact.population = "6th graders";
    model.intended_impact.geography = "West Philadelphia schools";
    model.intended_impact.long_term_goal = "graduate high school";
    model.intended_impact.compiled_statement =
      "6th graders in West Philadelphia schools will graduate high school";

    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "We focus on literacy as the foundation.",
        history: [
          {
            id: "a1",
            role: "assistant",
            content:
              "Tell me about your program — what does it do, and who does it serve?",
            timestamp: Date.now() - 1000,
          },
          {
            id: "u1",
            role: "user",
            content: "We work with 6th graders enrolled in West Philadelphia schools.",
            timestamp: Date.now() - 900,
          },
        ],
        model,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const json = (await res.json()) as { modelPatch?: Partial<LogicModel> | null };
    const compiled = json.modelPatch?.intended_impact?.compiled_statement ?? "";
    assert.equal(compiled.length > 0, true);
    assert.match(compiled, /6th graders in West Philadelphia schools/i);
    assert.match(compiled, /literacy/i);
  } finally {
    global.fetch = originalFetch;
  }
});
