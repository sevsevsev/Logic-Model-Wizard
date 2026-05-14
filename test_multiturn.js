/**
 * Test new conversational endpoint with multi-turn scenario
 * (simulating hotel check-in scenario, but as a nonprofit intake instead)
 */
const http = require("http");

const turns = [
  {
    message: "Hi, I'm reaching out because we just started a new after-school tutoring program in North Philadelphia.",
    context: "User introduces their organization and program"
  },
  {
    message: "We work with middle and high school students, mainly from low-income families who need extra academic support.",
    context: "User describes population"
  },
  {
    message: "Across 5 school sites in North Philly. We focus on math and literacy.",
    context: "User adds geography and activity details"
  },
  {
    message: "Right now we have 2 paid coordinators per site and about 20 volunteer tutors. We use Khan Academy and open-source curriculum materials.",
    context: "User describes resources"
  },
  {
    message: "We track attendance and grades. So far we're seeing students who attend regularly improving their grades by about half a letter grade per semester.",
    context: "User describes outcomes and quality metrics"
  },
];

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

async function runMultiTurnTest() {
  console.log("=".repeat(100));
  console.log("MULTI-TURN CONVERSATIONAL TEST");
  console.log("Scenario: After-school tutoring program intake");
  console.log("=".repeat(100));
  console.log();

  let transcript = undefined;
  let lastAnalysis = null;

  for (let i = 0; i < turns.length; i++) {
    const { message, context } = turns[i];
    console.log(`[Turn ${i + 1}] ${context}`);
    console.log(`User: "${message}"`);
    console.log();

    const res = await post("/api/chat/conversational", {
      message,
      transcript,
    });

    transcript = res.transcript;
    lastAnalysis = res.analysis;

    console.log(`Agent: "${res.reply.substring(0, 120)}..."`);
    console.log();

    // Show current model state
    const analysis = res.analysis;
    console.log("Current Model State:");
    const scores = [
      { label: "Population", val: analysis.completeness.population },
      { label: "Geography", val: analysis.completeness.geography },
      { label: "Activities", val: analysis.completeness.activities },
      { label: "Outcomes", val: analysis.completeness.outcomes },
      { label: "Quality", val: analysis.completeness.quality },
    ];
    
    const maxLen = Math.max(...scores.map(s => s.label.length));
    scores.forEach(s => {
      const bar = "█".repeat(Math.floor(s.val / 5)) + "░".repeat(20 - Math.floor(s.val / 5));
      console.log(`  ${s.label.padEnd(maxLen)}: [${bar}] ${s.val}%`);
    });
    console.log();

    if (analysis.gaps.length > 0) {
      console.log("Gaps remaining:");
      analysis.gaps.forEach(g => console.log(`  - ${g}`));
    } else {
      console.log("✓ No gaps remaining!");
    }
    console.log();
    console.log("-".repeat(100));
    console.log();
  }

  // Final summary
  console.log("=".repeat(100));
  console.log("FINAL MODEL EXTRACTION SUMMARY");
  console.log("=".repeat(100));
  console.log();

  if (lastAnalysis) {
    const model = lastAnalysis.model;
    
    console.log("INTENDED IMPACT:");
    console.log(`  Population: ${model.intended_impact?.population || "(not captured)"}`);
    console.log(`  Geography: ${model.intended_impact?.geography || "(not captured)"}`);
    console.log(`  Long-term goal: ${model.intended_impact?.long_term_goal || "(not captured)"}`);
    console.log();

    console.log("IMPLEMENTATION:");
    console.log(`  Activities: ${model.implementation?.activities?.length || 0}`);
    if (model.implementation?.activities) {
      model.implementation.activities.forEach(a => console.log(`    - ${a.item}`));
    }
    console.log(`  Human Resources: ${model.implementation?.resources?.human?.length || 0}`);
    if (model.implementation?.resources?.human) {
      model.implementation.resources.human.forEach(r => console.log(`    - ${r}`));
    }
    console.log(`  Material Resources: ${model.implementation?.resources?.material?.length || 0}`);
    if (model.implementation?.resources?.material) {
      model.implementation.resources.material.forEach(r => console.log(`    - ${r}`));
    }
    console.log();

    console.log("OUTCOMES:");
    const outcomes = model.outcomes;
    if (outcomes?.short_term?.length) {
      console.log(`  Short-term (${outcomes.short_term.length}):`);
      outcomes.short_term.forEach(o => console.log(`    - ${o.statement}`));
    }
    if (outcomes?.medium_term?.length) {
      console.log(`  Medium-term (${outcomes.medium_term.length}):`);
      outcomes.medium_term.forEach(o => console.log(`    - ${o.statement}`));
    }
    if (outcomes?.long_term?.length) {
      console.log(`  Long-term (${outcomes.long_term.length}):`);
      outcomes.long_term.forEach(o => console.log(`    - ${o.statement}`));
    }
    console.log();

    console.log("QUALITY & FIDELITY:");
    if (model.implementation?.quality_fidelity?.quality?.length) {
      console.log(`  Quality measures: ${model.implementation.quality_fidelity.quality.join(", ")}`);
    }
    if (model.implementation?.quality_fidelity?.fidelity?.length) {
      console.log(`  Fidelity measures: ${model.implementation.quality_fidelity.fidelity.join(", ")}`);
    }
    console.log();

    console.log("COMPLETENESS SUMMARY:");
    const avg = Math.round(
      (lastAnalysis.completeness.population +
        lastAnalysis.completeness.geography +
        lastAnalysis.completeness.activities +
        lastAnalysis.completeness.outcomes +
        lastAnalysis.completeness.quality) / 5
    );
    console.log(`  Overall: ${avg}%`);
  }
}

runMultiTurnTest().catch(console.error);
