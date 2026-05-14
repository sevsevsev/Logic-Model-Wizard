/**
 * Test new conversational endpoint with Musicopia narrative
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

async function testConversational() {
  console.log("=".repeat(80));
  console.log("TESTING NEW CONVERSATIONAL ENDPOINT");
  console.log("=".repeat(80));

  let transcript = undefined;

  console.log("\n[Turn 1] Submitting Musicopia narrative...\n");

  const res1 = await post("/api/chat/conversational", {
    message: musicopiaNarrative,
    transcript,
  });

  transcript = res1.transcript;

  console.log("Agent Reply:");
  console.log(res1.reply);
  console.log();

  console.log("Extracted Model:");
  const analysis = res1.analysis;
  console.log(`Population: ${analysis.model.intended_impact?.population || "(empty)"}`);
  console.log(`Geography: ${analysis.model.intended_impact?.geography || "(empty)"}`);
  console.log(`Long-term goal: ${analysis.model.intended_impact?.long_term_goal || "(empty)"}`);
  console.log(`Activities: ${analysis.model.implementation?.activities?.length || 0}`);
  console.log(`Activities list:`, analysis.model.implementation?.activities?.map(a => a.item) || []);
  console.log(`Resources (human): ${analysis.model.implementation?.resources?.human?.length || 0}`);
  console.log(`Resources (material): ${analysis.model.implementation?.resources?.material?.length || 0}`);
  console.log(`Outcomes (short-term): ${analysis.model.outcomes?.short_term?.length || 0}`);
  console.log(`Outcomes (medium-term): ${analysis.model.outcomes?.medium_term?.length || 0}`);
  console.log(`Outcomes (long-term): ${analysis.model.outcomes?.long_term?.length || 0}`);
  console.log();

  console.log("Completeness Scores:");
  console.log(`Population: ${analysis.completeness.population}%`);
  console.log(`Geography: ${analysis.completeness.geography}%`);
  console.log(`Activities: ${analysis.completeness.activities}%`);
  console.log(`Outcomes: ${analysis.completeness.outcomes}%`);
  console.log(`Quality: ${analysis.completeness.quality}%`);
  console.log(`Intent: ${analysis.completeness.intent}%`);
  console.log();

  console.log("Gaps Identified:");
  if (analysis.gaps.length === 0) {
    console.log("(No gaps found!)");
  } else {
    analysis.gaps.forEach(gap => console.log(`- ${gap}`));
  }
  console.log();

  console.log("Suggested Next Questions:");
  analysis.suggestedNextQuestions.forEach(q => console.log(`- ${q}`));
  console.log();

  console.log("Retrieval Info:");
  console.log(`Knowledge chunks used: ${res1.retrieval.knowledgeChunkCount}`);
  console.log(`Retrieval mode: ${res1.retrieval.trace.mode}`);
  console.log(`Retrieval top-k: ${res1.retrieval.trace.topK}`);
  console.log();

  // Simulate a follow-up turn
  console.log("=".repeat(80));
  console.log("[Turn 2] User follows up about scale...\n");

  const res2 = await post("/api/chat/conversational", {
    message: "We reach about 150-200 students annually, with about 30% in schools and 70% in community organizations.",
    transcript,
  });

  transcript = res2.transcript;

  console.log("Agent Reply:");
  console.log(res2.reply);
  console.log();

  console.log("Updated Model:");
  console.log(`Population: ${res2.analysis.model.intended_impact?.population || "(empty)"}`);
  console.log(`Geography: ${res2.analysis.model.intended_impact?.geography || "(empty)"}`);
  console.log(`Activities: ${res2.analysis.model.implementation?.activities?.length || 0}`);
  console.log(`Outcomes (all): ${(res2.analysis.model.outcomes?.short_term?.length || 0) + (res2.analysis.model.outcomes?.medium_term?.length || 0) + (res2.analysis.model.outcomes?.long_term?.length || 0)}`);
  console.log();

  console.log("Remaining Gaps:");
  if (res2.analysis.gaps.length === 0) {
    console.log("(No gaps found!)");
  } else {
    res2.analysis.gaps.forEach(gap => console.log(`- ${gap}`));
  }
  console.log();
}

testConversational().catch(console.error);
