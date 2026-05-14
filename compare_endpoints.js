/**
 * Compare OLD endpoint (/api/chat) vs NEW conversational endpoint (/api/chat/conversational)
 * Using Musicopia narrative
 */
const http = require("http");

const musicopiaNarrative = `Musicopia advances lifelong learning and community engagement through high quality music and creative arts education. We partner with schools and community organizations across Philadelphia, especially in neighborhoods facing disinvestment, so children and youth have equitable access to instruction, instruments, and performance opportunities. Through consistent participation, students build confidence, belonging, creativity, and transferable skills. Over time we expect stronger school engagement, social-emotional growth, and long-term educational and career pathways for young people and families.`;

async function post(endpoint, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3100${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, res => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Failed to parse response from ${endpoint}: ${body}`)); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log("=".repeat(100));
  console.log("COMPARISON TEST: OLD vs NEW ENDPOINT");
  console.log("=".repeat(100));
  console.log();

  // Test OLD endpoint
  console.log("OLD ENDPOINT: /api/chat");
  console.log("-".repeat(100));

  try {
    const oldRes = await post("/api/chat", {
      message: musicopiaNarrative,
      history: [],
      model: {},
    });

    console.log("Reply:", oldRes.reply.substring(0, 150) + "...");
    console.log("Path:", oldRes.llmMeta?.path);
    console.log("Model used:", oldRes.llmMeta?.model);
    console.log();
    console.log("Model Patch Extracted:");
    if (oldRes.modelPatch) {
      console.log(`  - Population: ${oldRes.modelPatch.intended_impact?.population ? "✓" : "✗"}`);
      console.log(`  - Geography: ${oldRes.modelPatch.intended_impact?.geography ? "✓" : "✗"}`);
      console.log(`  - Activities: ${oldRes.modelPatch.implementation?.activities?.length || 0} items`);
      console.log(`  - Outcomes: ${Object.keys(oldRes.modelPatch.outcomes || {}).length} timeframes`);
      console.log(`  - Quality: ${oldRes.modelPatch.implementation?.quality_fidelity ? "✓" : "✗"}`);
    } else {
      console.log("  (No patch extracted)");
    }
    console.log();
  } catch (err) {
    console.log("ERROR:", err.message);
    console.log();
  }

  // Test NEW endpoint
  console.log("NEW ENDPOINT: /api/chat/conversational");
  console.log("-".repeat(100));

  try {
    const newRes = await post("/api/chat/conversational", {
      message: musicopiaNarrative,
      transcript: undefined,
    });

    console.log("Reply:", newRes.reply.substring(0, 150) + "...");
    console.log("Model used: (from LLM response)");
    console.log();
    console.log("Model Extracted:");
    const analysis = newRes.analysis;
    console.log(`  - Population: ${analysis.model.intended_impact?.population ? "✓ " + analysis.model.intended_impact.population.substring(0, 50) : "✗"}`);
    console.log(`  - Geography: ${analysis.model.intended_impact?.geography ? "✓ " + analysis.model.intended_impact.geography.substring(0, 50) : "✗"}`);
    console.log(`  - Activities: ${analysis.model.implementation?.activities?.length || 0} items`);
    if (analysis.model.implementation?.activities?.length > 0) {
      analysis.model.implementation.activities.slice(0, 3).forEach(a => console.log(`    • ${a.item}`));
    }
    console.log(`  - Outcomes (short): ${analysis.model.outcomes?.short_term?.length || 0} items`);
    console.log(`  - Outcomes (medium): ${analysis.model.outcomes?.medium_term?.length || 0} items`);
    console.log(`  - Outcomes (long): ${analysis.model.outcomes?.long_term?.length || 0} items`);
    console.log(`  - Quality: ${analysis.model.implementation?.quality_fidelity?.quality?.length || 0} quality items`);
    console.log();
    console.log("Completeness Scores:");
    console.log(`  Population: ${analysis.completeness.population}%`);
    console.log(`  Geography: ${analysis.completeness.geography}%`);
    console.log(`  Activities: ${analysis.completeness.activities}%`);
    console.log(`  Outcomes: ${analysis.completeness.outcomes}%`);
    console.log(`  Quality: ${analysis.completeness.quality}%`);
    console.log();
    console.log("Gaps Still Remaining:");
    if (analysis.gaps.length === 0) {
      console.log("  (None identified!)");
    } else {
      analysis.gaps.forEach(g => console.log(`  - ${g}`));
    }
    console.log();
  } catch (err) {
    console.log("ERROR:", err.message);
    console.log();
  }

  console.log("=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));
  console.log("OLD approach: JSON parsing → schema validation → extraction failure → fallback heuristics");
  console.log("NEW approach: Natural dialogue → full transcript analysis → deterministic extraction → confidence scores");
  console.log();
}

run().catch(console.error);
