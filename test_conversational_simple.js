/**
 * Simple test of new conversational endpoint with better error handling
 */
const http = require("http");

const musicopiaNarrative = `Musicopia advances lifelong learning and community engagement through high quality music and creative arts education. We partner with schools and community organizations across Philadelphia, especially in neighborhoods facing disinvestment, so children and youth have equitable access to instruction, instruments, and performance opportunities. Through consistent participation, students build confidence, belonging, creativity, and transferable skills. Over time we expect stronger school engagement, social-emotional growth, and long-term educational and career pathways for young people and families.`;

async function post(endpoint, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3100${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    }, res => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { 
          const parsed = JSON.parse(body);
          resolve(parsed); 
        }
        catch (e) { 
          reject(new Error(`Failed to parse response from ${endpoint}: ${body.substring(0, 200)}`)); 
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request to ${endpoint} timed out`));
    });
    req.on("error", reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  console.log("Testing /api/chat/conversational with Musicopia narrative");
  console.log("=".repeat(80));

  try {
    console.log("\nMaking request to /api/chat/conversational...");
    console.log("Message length:", musicopiaNarrative.length);
    console.log();

    const result = await post("/api/chat/conversational", {
      message: musicopiaNarrative,
    });

    console.log("✓ Response received!");
    console.log();

    if (result.error) {
      console.log("ERROR from endpoint:", result.error);
      return;
    }

    console.log("RESPONSE FIELDS:");
    console.log("- reply:", result.reply ? `${result.reply.substring(0, 80)}...` : "(missing)");
    console.log("- transcript:", result.transcript ? `${result.transcript.turns.length} turns` : "(missing)");
    console.log("- analysis:", result.analysis ? "present" : "(missing)");
    console.log("- retrieval:", result.retrieval ? "present" : "(missing)");
    console.log("- timestamp:", result.timestamp);
    console.log();

    if (result.analysis) {
      const { model, completeness, gaps, suggestedNextQuestions } = result.analysis;
      
      console.log("EXTRACTED MODEL:");
      console.log(`  Population: ${model.intended_impact?.population || "(empty)"}`);
      console.log(`  Geography: ${model.intended_impact?.geography || "(empty)"}`);
      console.log(`  Activities: ${model.implementation?.activities?.length || 0} items`);
      console.log(`  Outcomes (ST): ${model.outcomes?.short_term?.length || 0}`);
      console.log(`  Outcomes (MT): ${model.outcomes?.medium_term?.length || 0}`);
      console.log(`  Outcomes (LT): ${model.outcomes?.long_term?.length || 0}`);
      console.log();

      console.log("COMPLETENESS SCORES:");
      console.log(`  Population: ${completeness.population}%`);
      console.log(`  Geography: ${completeness.geography}%`);
      console.log(`  Activities: ${completeness.activities}%`);
      console.log(`  Outcomes: ${completeness.outcomes}%`);
      console.log(`  Quality: ${completeness.quality}%`);
      const avg = Math.round((completeness.population + completeness.geography + completeness.activities + completeness.outcomes + completeness.quality) / 5);
      console.log(`  Average: ${avg}%`);
      console.log();

      console.log("GAPS:");
      if (gaps.length === 0) {
        console.log("  ✓ None!");
      } else {
        gaps.forEach(g => console.log(`  - ${g}`));
      }
      console.log();

      console.log("SUGGESTED NEXT QUESTIONS:");
      if (suggestedNextQuestions.length === 0) {
        console.log("  (None)");
      } else {
        suggestedNextQuestions.forEach(q => console.log(`  - ${q}`));
      }
    }

  } catch (error) {
    console.error("✗ Test failed:", error.message);
  }
}

test();
