const http = require("http");

const turns = [
  "Hi, I'm checking in. My reservation is under 'The Green Haven'.",
  "I'm here for a 3-night stay.",
  "Yes, it should be under my name, Jordan Smith.",
  "Great, thank you. Is breakfast included?",
  "Perfect. What time does the gym open?"
];

async function post(data) {
  return new Promise((resolve, reject) => {
    const req = http.request("http://localhost:3100/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, res => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error("Failed to parse response: " + body)); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

function mergeModel(current, patch) {
  if (!patch) return current;
  const next = { ...current };
  for (const key in patch) {
    if (patch[key] && typeof patch[key] === "object" && !Array.isArray(patch[key])) {
      next[key] = { ...(next[key] || {}), ...patch[key] };
    } else if (patch[key] !== undefined && patch[key] !== null) {
      next[key] = patch[key];
    }
  }
  return next;
}

async function run() {
  let history = [];
  let model = {};
  for (let i = 0; i < turns.length; i++) {
    const message = turns[i];
    const res = await post({ message, history, model });
    
    const trace = res.trace || {};
    const modelPatch = res.modelPatch || {};
    model = mergeModel(model, modelPatch);
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: res.reply });

    console.log(`Turn ${i + 1}:`);
    console.log(`- Reply: ${res.reply.substring(0, 80)}...`);
    console.log(`- Intent: ${trace.stateIntent} / ${trace.finalIntent}`);
    console.log(`- Domain: ${trace.responseDomain} (Eff: ${trace.effectiveResponseDomain})`);
    
    const activities = modelPatch.implementation?.activities;
    console.log(`- Activities: ${Array.isArray(activities) ? activities.length : "N/A"}`);
    
    const quality = modelPatch.implementation?.quality_fidelity;
    console.log(`- Quality/Fidelity entries: ${quality && Object.keys(quality).length > 0}`);
    
    const outcomes = modelPatch.outcomes;
    console.log(`- Outcomes entries: ${outcomes && Object.keys(outcomes).length > 0}`);
    console.log("");
  }
}

run().catch(console.error);
