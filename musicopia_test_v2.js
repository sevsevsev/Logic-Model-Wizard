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
  const meta = res.llmMeta || {};
  const patch = res.modelPatch || {};

  console.log("LLM Path:", meta.path);
  
  const intendedImpactKeys = patch.intended_impact ? Object.keys(patch.intended_impact).join(", ") : "None";
  console.log("Intended Impact Keys:", intendedImpactKeys);
  
  const activitiesCount = (patch.implementation && Array.isArray(patch.implementation.activities)) ? patch.implementation.activities.length : 0;
  const resourcesCount = (patch.implementation && Array.isArray(patch.implementation.resources)) ? patch.implementation.resources.length : 0;
  const outcomesCount = patch.outcomes ? Object.keys(patch.outcomes).length : 0;
  
  console.log("Activities Count:", activitiesCount);
  console.log("Resources Count:", resourcesCount);
  console.log("Outcomes Count:", outcomesCount);
}

run().catch(console.error);
