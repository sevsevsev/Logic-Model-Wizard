/**
 * SKILL + RAG INTEGRATION TEST SCENARIOS
 * 
 * Manual test scenarios validating the Level 1 integration between agent skills,
 * procedural knowledge, and retrieval-augmented generation (RAG).
 * 
 * These scenarios demonstrate the full feedback loop:
 * 1. User provides input
 * 2. Skills identify gaps in logic model structure and quality
 * 3. Skills-informed retrieval fetches targeted evidence
 * 4. Evidence is linked to skill feedback in the response
 * 5. User receives guidance with concrete examples
 * 
 * Execution: Run manually in chat interface or via test automation.
 */

// ─────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Out-of-Sequence Activity Definition
// ─────────────────────────────────────────────────────────────────────────

export const scenario1 = {
  name: "Out-of-Sequence Activity Definition",
  description:
    "User attempts to define activities before specifying intended impact. " +
    "Procedural Dependency Enforcer detects violation and retrieval provides guidance.",
  
  setup: {
    modelSnapshot: {
      intended_impact: {
        population: undefined,
        geography: undefined,
        long_term_goal: undefined,
      },
      implementation: {
        activities: undefined,
      },
    },
  },

  userMessage: "Our activities will include weekly workshops on financial literacy skills.",

  expectedFlow: [
    {
      step: "Skill Assessment - Procedural Dependency Check",
      skillName: "procedural-dependency-enforcer",
      expectedResult: {
        violation: "activities_before_impact",
        severity: "high",
        guidance:
          "Cannot define activities without first establishing who you serve (population), " +
          "where (geography), and long-term goal.",
        suggestedNextStep: "Start with Intended Impact: Define population, geography, long-term goal.",
      },
    },
    {
      step: "Skill-Informed Retrieval",
      skillContext: {
        skillName: "procedural-dependency-enforcer",
        gap: "activities_before_impact",
        gaps: ["activities_before_impact"],
      },
      expectedRetrievalSignals: {
        retrievalQuery: "intended impact implementation resources activities procedural order",
        metadataFilters: {
          skillGap: "procedural_ordering",
          type: ["guidance"],
        },
      },
      expectedChunks: [
        "foundation-causal-chain",
        "foundation-1",
      ],
    },
    {
      step: "Response Construction",
      expectedContent: [
        "Procedural dependency detected",
        "Cannot define activities without first establishing...",
        "Start with Intended Impact",
        "Causal chain logic guidance",
      ],
    },
  ],

  validation: {
    checks: [
      "✓ Skill identifies sequence violation immediately",
      "✓ Retrieval includes procedural guidance chunks",
      "✓ Response links skill feedback to retrieved evidence",
      "✓ User understands prerequisite (Intended Impact) before Activities",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Generic Geography - Remedial Retrieval
// ─────────────────────────────────────────────────────────────────────────

export const scenario2 = {
  name: "Generic Geography - Remedial Retrieval",
  description:
    "User provides generic geography ('Philadelphia'). Impact Statement Scaffolder " +
    "detects low specificity, retrieval fetches neighborhood-specific examples.",
  
  setup: {
    modelSnapshot: {
      intended_impact: {
        population: "High school students in grades 9-12",
        geography: "Philadelphia",
        long_term_goal: "Increase post-secondary enrollment",
      },
    },
  },

  userMessage:
    "We want to make sure our impact statement is more specific about the geography.",

  expectedFlow: [
    {
      step: "Skill Assessment - Quality Validation",
      skillName: "component-quality-validator",
      expectedResult: {
        componentScores: {
          population: 75,
          geography: 45,
          long_term_goal: 80,
        },
        topGaps: ["geography_specificity"],
        guidance: "Geography needs specificity: 'Philadelphia' is too broad.",
      },
    },
    {
      step: "Skill-Informed Retrieval",
      skillContext: {
        skillName: "component-quality-validator",
        gap: "geography_specificity",
        score: 45,
        targetScore: 70,
      },
      expectedRetrievalSignals: {
        retrievalQuery:
          "specific geography place names neighborhoods zip codes districts schools location examples",
        metadataFilters: {
          skillName: "impact-statement-scaffolder",
          skillGap: "geography_specificity",
          componentFocus: "geography",
          type: ["example", "guidance"],
        },
        includeAntiPatterns: true,
      },
      expectedChunks: [
        "geo-scale",
        "geo-philly-north",
        "geo-philly-west",
        "geo-philly-south",
      ],
      expectedMetadata: [
        { skillRelevance: ["impact-statement-scaffolder"], type: "example" },
        { skillRelevance: ["impact-statement-scaffolder"], type: "example" },
      ],
    },
    {
      step: "Response Construction",
      expectedContent: [
        "Geography component needs more specificity",
        "Instead of 'Philadelphia,' specify neighborhoods like North Philadelphia",
        "Examples: Strawberry Mansion, Brewerytown, Temple University area, Hunting Park",
        "Or West Philadelphia: University City, Cobbs Creek, Haddington",
      ],
    },
  ],

  validation: {
    checks: [
      "✓ Quality validator identifies geography as lowest-scoring component",
      "✓ Retrieval boosted chunks marked with geography_specificity skillGap",
      "✓ Retrieved examples show specific neighborhoods (not 'Philadelphia')",
      "✓ User sees anti-patterns (generic) vs examples (specific) side-by-side",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Multiple Gaps - Prioritized Guidance
// ─────────────────────────────────────────────────────────────────────────

export const scenario3 = {
  name: "Multiple Gaps - Prioritized Guidance",
  description:
    "User provides partially-filled logic model with multiple quality issues. " +
    "Quality Validator prioritizes gaps, retrieval fetches targeted guidance for top 3.",
  
  setup: {
    modelSnapshot: {
      intended_impact: {
        population: "students",
        geography: "city",
        long_term_goal: "better outcomes",
      },
      implementation: {
        activities: ["workshops", "mentoring"],
        resources: undefined,
      },
    },
  },

  userMessage: "How can I improve this impact statement?",

  expectedFlow: [
    {
      step: "Skill Assessment - Comprehensive Quality Review",
      skillName: "component-quality-validator",
      expectedResult: {
        componentScores: {
          population: 30,
          geography: 25,
          long_term_goal: 35,
          activities: 40,
        },
        topGaps: [
          "population_specificity",
          "geography_specificity",
          "goal_concreteness",
        ],
        guidance:
          "All three components of Intended Impact need improvement. " +
          "Start with population specificity.",
      },
    },
    {
      step: "Skill-Informed Retrieval - Primary Gap",
      skillContext: {
        skillName: "component-quality-validator",
        gap: "population_specificity",
        gaps: [
          "population_specificity",
          "geography_specificity",
          "goal_concreteness",
        ],
        score: 30,
      },
      expectedChunks: [
        "Chunks with skillRelevance=['impact-statement-scaffolder']",
        "Chunks with skillGap='population_specificity'",
        "Type='example' for low-quality input",
      ],
    },
    {
      step: "Response Construction with Evidence Linking",
      expectedContent: [
        "Gap 1 (Priority: High): Population specificity",
        "[Evidence: Example chunks showing specific grade levels, demographics]",
        "",
        "Gap 2 (Priority: High): Geography specificity",
        "[Evidence: Neighborhood-level examples from Philadelphia]",
        "",
        "Gap 3 (Priority: Medium): Goal concreteness",
        "[Evidence: Outcome markers (employment, graduation, housing)]",
      ],
    },
  ],

  validation: {
    checks: [
      "✓ Quality validator assigns priority to gaps based on impact",
      "✓ Retrieval signals prioritize high-severity gaps",
      "✓ Retrieved chunks include examples AND anti-patterns",
      "✓ Response presents gaps in priority order with linked evidence",
      "✓ User sees clear before/after contrast (generic → specific)",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Example-Driven Learning - Low Quality Score
// ─────────────────────────────────────────────────────────────────────────

export const scenario4 = {
  name: "Example-Driven Learning - Low Quality Score",
  description:
    "User provides very low-quality component (score < 50). Retrieval boosts example " +
    "and anti-pattern chunks to help user learn by seeing good/bad.",
  
  setup: {
    modelSnapshot: {
      intended_impact: {
        population: "people",
        geography: "everywhere",
        long_term_goal: "help",
      },
    },
  },

  userMessage: "I'm not sure what I'm doing wrong with the intended impact.",

  expectedFlow: [
    {
      step: "Skill Assessment",
      skillName: "component-quality-validator",
      expectedResult: {
        componentScores: {
          population: 10,
          geography: 5,
          long_term_goal: 20,
        },
        suggestedNextStep:
          "Very low quality detected. Use examples to learn what specificity looks like.",
      },
    },
    {
      step: "Retrieval Boosts Examples Due to Low Score",
      skillContext: {
        score: 10,
      },
      expectedBoosts: {
        exampleChunks: 0.04,
        antiPatternChunks: 0.04,
        description:
          "When score < 60, retrieval adds +0.04 boost for type='example' and type='anti_pattern'",
      },
    },
    {
      step: "Response Construction",
      expectedContent: [
        "WHAT NOT TO DO (Anti-patterns):",
        "❌ Population: 'people' (too generic)",
        "❌ Geography: 'everywhere' (no specificity)",
        "❌ Goal: 'help' (too vague)",
        "",
        "WHAT TO DO (Examples):",
        "✓ Population: 'High school students in grades 9-12 from low-income households'",
        "✓ Geography: 'North Philadelphia, specifically in Strawberry Mansion and Brewerytown'",
        "✓ Goal: 'Increase post-secondary enrollment to 70% by 2026'",
      ],
    },
  ],

  validation: {
    checks: [
      "✓ Retrieval preferentially ranks example chunks for learning",
      "✓ Anti-pattern chunks show what NOT to do (contrasts well)",
      "✓ Response presents side-by-side comparison (bad vs good)",
      "✓ User learns through concrete examples, not abstract rules",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// EXECUTION GUIDE
// ─────────────────────────────────────────────────────────────────────────

export const executionGuide = {
  setup: `
    1. Open the LM Chatbot in development mode
    2. Ensure skills are registered (they auto-initialize at app startup)
    3. Verify RAG_ENABLE_SKILL_INFORMED_RETRIEVAL is true (environment var or default)
    4. Check browser console for skill execution logs (optional debug)
  `,

  running: `
    For each scenario:
    1. Load the model snapshot (or start fresh)
    2. Type the user message
    3. Observe the response
    4. Check browser Network tab:
       - Look for POST /api/chat response
       - Navigate to llmMeta.trace.skillAssessment in the JSON
    5. Verify expected content from validation checks
  `,

  debugging: `
    If skill-informed retrieval isn't working:
    
    A. Check skill invocation:
       - Console should show "Skill assessment error" or success logs
       - Verify skillRegistry.get('procedural-dependency-enforcer') returns skill
    
    B. Check retrieval signals:
       - In API response, check llmMeta.trace.retrieval.trace
       - Look for skillContext in the retrieval result
       - Verify chunks have skillMetadata fields
    
    C. Check response building:
       - Verify skillAssessment is present in llmMeta.trace
       - If missing, check that conversational.skillAssessment is populated
       - Check that API route includes it in response
  `,

  expectedLogs: [
    "[SKILL] Procedural Dependency Enforcer executed",
    "[SKILL] Component Quality Validator executed",
    "[RAG] Skill-informed retrieval active with context",
    "[RETRIEVAL] Applied skillRelevanceBoost: +0.06 to gap-matching chunks",
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// INTEGRATION CHECKLIST
// ─────────────────────────────────────────────────────────────────────────

export const integrationChecklist = {
  phase1Skills: [
    "✓ Impact Statement Scaffolder registered and executing",
    "✓ Procedural Dependency Enforcer registered and executing",
    "✓ Component Quality Validator registered and executing",
  ],

  retrieval: [
    "✓ SkillAssessmentContext interface defined",
    "✓ mapSkillGapToRetrievalSignals() function implemented",
    "✓ computeMetadataFeatures() accepts skillContext parameter",
    "✓ rerankByMetadata() passes skillContext through",
    "✓ retrieveKnowledgeWithTrace() builds skill-informed queries",
    "✓ Skill relevance boosts applied (+0.08 for matching, +0.06 for gap)",
  ],

  knowledge: [
    "✓ KnowledgeChunk interface includes skillMetadata field",
    "✓ RetrievedChunk accepts skillMetadata",
    "✓ Example chunks tagged with skillRelevance and skillGap",
    "✓ Anti-pattern chunks marked for low-quality learning scenarios",
  ],

  pipeline: [
    "✓ Procedural Dependency Enforcer invoked before retrieval",
    "✓ Component Quality Validator invoked after extraction",
    "✓ Skill results converted to SkillAssessmentContext",
    "✓ Skill context passed to retrieveKnowledgeWithTrace()",
    "✓ Skill assessment returned in ConversationalTurnResult",
  ],

  response: [
    "✓ Chat API route receives skillAssessment from pipeline",
    "✓ skillAssessment included in llmMeta.trace",
    "✓ Frontend can access skill feedback via response.llmMeta.trace.skillAssessment",
    "✓ Frontend can link skill gaps to retrieved chunks by skillMetadata fields",
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// SUCCESS METRICS
// ─────────────────────────────────────────────────────────────────────────

export const successMetrics = {
  skillAccuracy: {
    description: "Skills correctly identify gaps in user input",
    target: "100% of test scenarios show correct gap detection",
  },

  retrievalQuality: {
    description: "Skill-informed retrieval returns relevant chunks",
    target: "Top 3 chunks address the identified gap (manual review)",
  },

  responseCoherence: {
    description: "Skill feedback is linked to retrieved evidence",
    target:
      "User can trace from feedback gap → evidence chunk → concrete example",
  },

  userLearning: {
    description: "User improves logic model based on feedback",
    target:
      "In follow-up turn, user provides higher-quality component (score +15+)",
  },

  feedbackLoop: {
    description: "End-to-end integration works without errors",
    target: "All scenarios complete successfully with skill assessment in response",
  },
};
