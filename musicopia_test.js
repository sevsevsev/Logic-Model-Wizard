const http = require("http");

const message = "Musicopia advances lifelong learning and community engagement through high quality music and creative arts education. We partner with schools and community organizations across Philadelphia, especially in neighborhoods facing disinvestment, so children and youth have equitable access to instruction, instruments, and performance opportunities. Through consistent participation, students build confidence, belonging, creativity, and transferable skills. Over time we expect stronger school engagement, social-emotional growth, and long-term educational and career pathways for young people and families.";

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

async function run() {
  const res = await post({ message, history: [], model: {} });
  const trace = res.trace || {};
  const meta = res.llmMeta || {};
  const patch = res.modelPatch || {};

  console.log("Reply Preview:", res.reply.substring(0, 300));
  console.log("LLM Path:", meta.path);
  console.log("LLM Model:", meta.model);
  console.log("Initial Intent:", trace.initialIntent);
  console.log("State Intent:", trace.stateIntent);
  console.log("Final Intent:", trace.finalIntent);
  console.log("Response Domain:", trace.responseDomain);
  console.log("Effective Response Domain:", trace.effectiveResponseDomain);
  console.log("Patch Source:", trace.patchSource);
  console.log("Used Extraction Fallback:", trace.usedExtractionFallback);
  console.log("Used Heuristic Merge:", trace.usedHeuristicMerge);
  console.log("Retrieval:", trace.retrieval ? JSON.stringify(trace.retrieval).substring(0, 100) : "N/A");
  
  const intendedImpactKeys = patch.intended_impact ? Object.keys(patch.intended_impact).join(", ") : "None";
  console.log("Intended Impact Keys:", intendedImpactKeys);
  
  const implementationCount = patch.implementation ? Object.keys(patch.implementation).length : 0;
  const outcomesCount = patch.outcomes ? Object.keys(patch.outcomes).length : 0;
  console.log("Implementation Count:", implementationCount);
  console.log("Outcomes Count:", outcomesCount);
}

run().catch(console.error);
