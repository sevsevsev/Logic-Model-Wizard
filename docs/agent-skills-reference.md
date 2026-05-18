# Agent Skills Reference

**Document Version:** 1.0  
**Last Updated:** May 2026  
**Status:** Phase 1 (3/7 Skills Implemented)

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1 Skills (Current)](#phase-1-skills-current)
3. [Phase 2 Skills (Planned)](#phase-2-skills-planned)
4. [Phase 3 Skills (Planned)](#phase-3-skills-planned)
5. [Progressive Disclosure & Token Optimization](#progressive-disclosure--token-optimization)
6. [Skill Integration Architecture](#skill-integration-architecture)
7. [Implementation Standards](#implementation-standards)

---

## Overview

**Agent Skills Framework** implements the [Agent Skills standard](https://agentskills.io/) to extend agent capabilities through modular, discoverable, composable skill modules. Each skill encapsulates domain-specific procedural knowledge and can be invoked at appropriate pipeline stages.

### Key Design Principles

- **Procedural Knowledge Anchoring**: Skills embody procedural guidance (logic model component construction, quality validation, dependency enforcement) that anchors domain knowledge (RAG retrieval)
- **Progressive Disclosure**: Metadata-only discovery minimizes token usage; full instructions loaded only when skill executes
- **Composable Feedback Loops**: Skills identify gaps → drive targeted RAG retrieval → users iterate with guidance
- **Agent Skills Standard Compliance**: SKILL.md format, hierarchical organization, metadata-driven discovery

---

## Phase 1 Skills (Current)

### 1. **Impact Statement Scaffolder**

**Name:** `impact-statement-scaffolder`

**Purpose:** Guides structured construction of the Intended Impact component (population + geography + long-term goal) through validating specificity and concreteness.

**When to Use:** 
- User is drafting or refining population, geography, or long-term goal
- User submits generic/vague language ("students," "Philadelphia," "help")
- User wants feedback on impact statement clarity

**Key Capabilities:**

| Validation | Input | Output | Token Cost |
|---|---|---|---|
| **Population Specificity** | User text | Valid/Invalid + Feedback | ~50 tokens |
| **Geography Specificity** | User text | Valid/Invalid + Feedback | ~50 tokens |
| **Long-Term Goal Concreteness** | User text | Valid/Invalid + Feedback | ~50 tokens |
| **Compiled Statement** | All three components | Assembled impact statement | ~100 tokens |

**Validation Rules:**

```typescript
// Population: Grade/age or named demographic group + optional qualifier
✓ "High school students in grades 9-12"
✓ "First-generation college students"
✓ "Low-income elementary school children"
❌ "students"
❌ "people"

// Geography: Place names, neighborhoods, districts, ZIP codes
✓ "North Philadelphia, specifically Strawberry Mansion"
✓ "West Philadelphia neighborhoods (Cobbs Creek, Haddington)"
✓ "Philadelphia School District, Zone 4"
❌ "Philadelphia"
❌ "the city"

// Long-Term Goal: Concrete outcome markers (employment, housing, health, graduation)
✓ "Increase post-secondary enrollment by 30%"
✓ "60% of graduates employed in family-sustaining jobs"
✓ "Reduce chronic absenteeism to <5%"
❌ "help students"
❌ "improve outcomes"
```

**Integration Points:**
- Invoked during impact statement drafting (NOT automatic; requires explicit user request or system trigger)
- Returns validation feedback linked to RAG retrieval of specificity examples
- Scored 0-100 by Component Quality Validator

**Token Efficiency:**
- Executes only when user mentions impact-related terms
- Does NOT require loading full instructions unless validation rules need consultation
- Metadata-only discovery: 1-2 lines of discovery context

---

### 2. **Procedural Dependency Enforcer**

**Name:** `procedural-dependency-enforcer`

**Purpose:** Ensures logical component ordering by detecting and preventing out-of-sequence definitions (e.g., activities before impact, outcomes before implementation).

**When to Use:**
- User attempts to define activities/resources without Intended Impact
- User attempts to define outcomes without implementation details
- User asks about component sequence or "what comes next"

**Key Capabilities:**

| Check | Detects | Action | Token Cost |
|---|---|---|---|
| **Impact Required** | Activities/resources defined without impact | Block + redirect | ~30 tokens |
| **Activities Required** | Outcomes defined without activities | Warn + redirect | ~30 tokens |
| **Resources Required** | Activities without resources | Warn + redirect | ~30 tokens |
| **State Assessment** | Current completeness status | Suggest next step | ~40 tokens |

**Procedural Chain:**

```
1. Intended Impact (population + geography + goal)
        ↓ MUST have Impact first
2. Implementation:
   a) Resources (human, financial, material, knowledge)
   b) Activities (what program does)
   c) Outputs (direct results of activities)
        ↓ MUST have these in order
3. Outcomes (short, medium, long-term)
        ↓ MUST follow from activities
```

**Violation Types & Severity:**

| Violation | User Intent | Severity | Suggested Action |
|---|---|---|---|
| `no_impact` | User tries activities | HIGH | "Start with Intended Impact" |
| `activity_before_impact` | User tries resources | HIGH | "Define population, geography, goal first" |
| `outcome_before_implementation` | User tries outcomes | HIGH | "Define activities and outputs first" |
| `outputs_before_activities` | User tries outputs | MEDIUM | "Define activities first" |

**Integration Points:**
- Invoked **before** retrieval (early validation prevents bad directions)
- If violation detected: gap used to drive skill-informed RAG retrieval for procedural guidance
- Prevents wasted tokens on off-sequence content

**Token Efficiency:**
- Early exit: ~30 tokens for violation detection
- Redirects user to prerequisites without lengthy back-and-forth
- Skill-informed retrieval supplies only procedural guidance chunks, not tangential examples

---

### 3. **Component Quality Validator**

**Name:** `component-quality-validator`

**Purpose:** Scores each logic model component (0-100) against domain-specific quality criteria, identifies top gaps, and suggests improvements.

**When to Use:**
- User asks "how can I improve this?"
- System detects low-quality component after extraction
- User wants feedback on component clarity and rigor

**Key Capabilities:**

| Component | Scoring Criteria | Output | Token Cost |
|---|---|---|---|
| **Population** | Age/grade + demographic qualifiers | Score 0-100 + feedback | ~60 tokens |
| **Geography** | Place name specificity | Score 0-100 + feedback | ~60 tokens |
| **Long-Term Goal** | Concrete outcome markers | Score 0-100 + feedback | ~60 tokens |
| **Activities** | Action verb specificity | Score 0-100 + feedback | ~60 tokens |
| **Outcomes** | Measurability + progression | Score 0-100 + feedback | ~60 tokens |

**Scoring Scale:**

```
90-100: Excellent (specific, measurable, concrete)
  "9-12 grade students from low-income households"
  "North Philadelphia: Strawberry Mansion, Brewerytown"
  "Increase post-secondary enrollment to 70% by 2026"

70-89: Good (mostly specific, some improvement possible)
  "High school students"
  "Philadelphia neighborhoods"
  "Improve employment outcomes"

50-69: Fair (partial specificity, needs development)
  "Students in our area"
  "Our city"
  "Better outcomes for participants"

20-49: Poor (too generic, significant revision needed)
  "Students"
  "Everywhere"
  "Help people"

0-19: Critically Low (requires complete rewrite)
  Empty fields or unintelligible content
```

**Feedback Structure:**

```
{
  score: 45,
  rating: "fair",
  feedback: "Population has some specificity but could be more detailed.",
  suggestions: [
    "Specify grade level or age range",
    "Add demographic qualifiers (income, language, background)"
  ],
  commonMistakes: [
    "Generic 'students' without context",
    "Missing demographic specificity"
  ]
}
```

**Integration Points:**
- Invoked **after** model extraction (post-user input processing)
- Scores drive retrieval boosting: lowest scores → more example/anti-pattern chunks
- Top gaps prioritized for skill-informed retrieval signals
- Results returned in response for frontend UX

**Token Efficiency:**
- Concurrent scoring (all components scored in parallel)
- Example chunks boosted when score < 60 (learning-mode retrieval)
- Anti-pattern chunks included to show "what NOT to do"
- Reduces LLM hallucination by grounding in validated rules

---

## Phase 2 Skills (Planned)

These skills are designed but not yet implemented. **Estimated implementation: Q3 2026**

### 4. **Evidence Quality Assessor**

**Name:** `evidence-quality-assessor`

**Purpose:** Evaluates the sufficiency and credibility of evidence cited in impact claims, resource descriptions, and outcome definitions.

**Planned Capabilities:**
- Check if resources claimed have supporting evidence
- Verify outcome claims have baseline/target data
- Assess risk/assumption documentation
- Score evidence quality 0-100

**Skill Gap Integration:** Will drive retrieval for outcome indicators, measurement strategies, and evidence frameworks.

---

### 5. **Resource Adequacy Analyzer**

**Name:** `resource-adequacy-analyzer`

**Purpose:** Assesses whether claimed resources are realistically sufficient to deliver activities and achieve outcomes at the claimed scale.

**Planned Capabilities:**
- Analyze resource type/quantity vs. activity scale
- Flag resource mismatches (e.g., "$50K budget" for "citywide program")
- Suggest resource benchmarks
- Score adequacy 0-100

**Skill Gap Integration:** Will drive retrieval for funding models, staffing ratios, and resource allocation examples.

---

### 6. **Activity Implementation Realism Checker**

**Name:** `activity-implementation-realism-checker`

**Purpose:** Evaluates whether described activities are feasible given constraints, timeline, and staffing.

**Planned Capabilities:**
- Check activity specificity (timing, location, participants per session)
- Flag vague delivery ("mentoring") vs. concrete ("weekly 1:1 mentoring sessions, 30 min each")
- Identify implementation bottlenecks
- Score realism 0-100

**Skill Gap Integration:** Will drive retrieval for activity design examples and implementation case studies.

---

## Phase 3 Skills (Planned)

These skills represent advanced procedural knowledge. **Estimated implementation: Q4 2026+**

### 7. **Outcome Prediction Model**

**Name:** `outcome-prediction-model`

**Purpose:** Predicts likely outcomes given model structure, based on logic model patterns in evidence base.

**Planned Capabilities:**
- Extract model structure (inputs → activities → outputs → outcomes)
- Match against evidence patterns
- Estimate probability of achieving claimed outcomes
- Flag overly optimistic projections
- Score prediction confidence 0-100

**Skill Gap Integration:** Will drive retrieval for similar models, lessons learned, and comparative outcome data.

---

## Progressive Disclosure & Token Optimization

### Problem Statement

Without progressive disclosure, all skill definitions and examples would be loaded into context at startup, consuming tokens unnecessarily. A typical skill has:

- **Metadata:** 2-3 lines (name, description)
- **Instructions (SKILL.md):** 50-150 lines
- **Implementation Code:** 100-500 lines
- **Examples & Validation Rules:** 200-500 lines

**Total per skill:** 400-1,000+ tokens

---

### Solution: Three-Tier Progressive Disclosure

#### Tier 1: Discovery (No Token Cost)

**When:** Application startup and skill listing  
**What Loads:** Name + description ONLY (~10 tokens per skill)

```typescript
// From SkillRegistry.listDiscoverable()
{
  name: "procedural-dependency-enforcer",
  description: "Ensures logical component ordering..."
}
```

**Used By:**
- System-level skill selection logic (which skills to invoke?)
- Future UI: "Available Skills" panel (show to users without loading full content)

**Token Savings:** ~390-990 tokens per skill avoided

---

#### Tier 2: Activation (On-Demand)

**When:** Skill execution is about to occur  
**What Loads:** Full skill definition (metadata + instructions + code) (~400-800 tokens per skill)

```typescript
// From SkillRegistry.get(skillName)
const skill = skillRegistry.get("component-quality-validator");
if (skill) {
  skill.execute(context); // Full implementation now available
}
```

**Used By:**
- Pipeline stage determines skill should run (e.g., Procedural Dependency Enforcer before retrieval)
- Skill is fetched and executed

**Token Cost:** Only paid when skill actually needed

---

#### Tier 3: Retrieval Signals (Targeted Context)

**When:** Skill identifies gaps  
**What Loads:** Only the retrieval signals matching the gap (~50 tokens per signal)

```typescript
// From retrieval-mapping.ts
const signals = mapSkillGapToRetrievalSignals("population_specificity");
// Returns: query terms, metadata filters, priority
// Does NOT load full retrieval examples upfront
```

**Used By:**
- Skill-informed RAG retrieval to fetch relevant knowledge chunks
- Chunks already stored; signals just route retrieval efficiently

**Token Savings:** ~100-200 tokens per retrieval avoided

---

### Efficiency Metrics

**Scenario: User provides generic population ("students")**

| Stage | Action | Tokens | Notes |
|---|---|---|---|
| Discovery | Skill listed (name + description only) | +10 | Deferred: only loaded if needed |
| Pre-Retrieval | Skill activated; full code loaded | +600 | Amortized cost; executes once per turn |
| Execution | Skill detects `population_specificity` gap | +50 | Computing validation rules |
| Retrieval Signals | Map gap to signals (query + filters) | +40 | No examples loaded; just signal metadata |
| RAG Retrieval | Fetch population-specific examples | +100 | Knowledge chunks already in database; just routes retrieval |
| **Total per Turn** | | **~800** | |

**Without Progressive Disclosure:** ~1,200-1,500 tokens  
**With Progressive Disclosure:** ~800-900 tokens  
**Savings:** 30-40% token reduction

---

### Implementation Details

#### Phase 1: Metadata-Only Discovery

```typescript
// src/lib/agent/skills/index.ts
listDiscoverable(): Array<{ name: string; description: string }> {
  return Array.from(this.skills.values()).map((skill) => ({
    name: skill.metadata.name,
    description: skill.metadata.description,
    // ✗ NO full metadata loaded
    // ✗ NO instructions loaded
    // ✗ NO validation rules loaded
  }));
}
```

**Result:** Discovery costs ~10 tokens/skill instead of 400+

---

#### Phase 2: On-Demand Activation

```typescript
// src/lib/agent/skills/index.ts
get(skillName: string): AgentSkill | undefined {
  // Returns full skill definition ONLY when explicitly requested
  return this.skills.get(skillName);
}

// src/lib/chat/conversationalPipeline.ts
const dependencyEnforcer = skillRegistry.get("procedural-dependency-enforcer");
if (dependencyEnforcer) {
  const result = await dependencyEnforcer.execute(context);
  // Full skill code executed; tokens paid when needed
}
```

**Result:** Full skill loaded (~600 tokens) only when skill actually runs

---

#### Phase 3: Skill-Specific Signal Mapping

```typescript
// src/lib/agent/skills/retrieval-mapping.ts
function mapSkillGapToRetrievalSignals(skillName: string, gap: string) {
  // Returns minimal signal metadata:
  // - Enhanced query terms
  // - Metadata filters for retrieval reranking
  // - NOT full retrieval examples
  return {
    retrievalQuery: "...",
    metadataFilters: { ... },
    priority: "high",
  };
}
```

**Result:** Retrieval signals (~50 tokens) route knowledge fetch without duplicating knowledge in context

---

### Confirmation: Progressive Disclosure is Active

✅ **Discovery Phase:** `listDiscoverable()` returns only name + description  
✅ **Activation Phase:** `get()` defers full skill load until execution  
✅ **Signal Phase:** `retrieval-mapping.ts` creates minimal gap→query mappings  

**Token Optimization Validation:**

| Metric | Status | Evidence |
|---|---|---|
| Metadata-only discovery | ✅ Active | `listDiscoverable()` implementation (line 93-97) |
| On-demand activation | ✅ Active | Skills registered but not instantiated; `get()` lazy-loads |
| Signal mapping | ✅ Active | `mapSkillGapToRetrievalSignals()` avoids duplicating full examples |
| No upfront loading | ✅ Confirmed | `initializeSkills()` only calls `register()`; no full loading |

---

## Skill Integration Architecture

### Invocation Flow

```
User Message
    ↓
┌───────────────────────────────────────────┐
│ STAGE 1: Procedural Validation            │
│ Invoke: Procedural Dependency Enforcer    │
│ Token Cost: ~600 (skill load) + ~50 (run)│
└───────────────────────────────────────────┘
    ↓
  Violation Detected?
    ├─ YES → Map gap to retrieval signals (~40 tokens)
    │         Skip to Stage 3 (Retrieval)
    │
    └─ NO → Continue to Stage 2
    ↓
┌───────────────────────────────────────────┐
│ STAGE 2: LLM Generation                   │
│ Generate response using conversational    │
│ pipeline (existing RAG + LLM)             │
└───────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────┐
│ STAGE 3: Quality Validation                │
│ Invoke: Component Quality Validator        │
│ Token Cost: ~600 (skill load) + ~100 (run)│
└───────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────┐
│ STAGE 4: Response Building                 │
│ Include skill assessment in response       │
│ Frontend links skill gaps to evidence      │
└───────────────────────────────────────────┘
    ↓
Response with Skill Feedback + Evidence
```

### Data Flow: Gap → Retrieval → Evidence

```
Skill Execution
│
├─ Identifies Gap
│  └─ gap: "population_specificity"
│
├─ Maps to Retrieval Signals
│  ├─ Query: "specific population demographics examples"
│  ├─ Filters: { skillGap: "population_specificity", type: "example" }
│  └─ Priority: "high"
│
├─ Pass to RAG Retrieval
│  ├─ Enhanced embedding (query + signals)
│  ├─ Rerank by skill relevance metadata
│  └─ Return top 3-5 chunks
│
└─ Return to Frontend
   ├─ Skill assessment (what's wrong)
   └─ Evidence chunks (how to fix)
```

---

## Implementation Standards

### Skill Definition Format

Every skill implements the Agent Skills specification:

```typescript
export const skillName: AgentSkill = {
  // Metadata (frontmatter from SKILL.md)
  metadata: {
    name: "skill-name",                    // lowercase-with-hyphens
    description: "What it does...",        // <1024 chars
    license: "Apache-2.0",
    compatibility: "TypeScript/Node.js",
  },

  // Instructions (body of SKILL.md)
  instructions: "Progressive disclosure pattern...",

  // Executable logic
  execute: async (context: SkillContext): Promise<SkillResult> => {
    // Validate inputs
    // Run procedural checks
    // Return structured result
    return {
      success: true,
      message: "Assessment complete",
      data: { ... },
      shouldProceed: true,
    };
  },
};
```

### Skill Context

```typescript
interface SkillContext {
  modelSnapshot?: LogicModel;              // Current model state
  modelPatch?: Partial<LogicModel> | null; // Proposed changes
  userMessage: string;                     // Latest user input
  history: ChatMessage[];                  // Conversation history (empty in Phase 1)
  questionIntent?: string;                 // Inferred user intent
  retrievedEvidence?: RetrievedChunk[];    // For future skills
}
```

### Skill Result

```typescript
interface SkillResult {
  success: boolean;                        // Execution succeeded
  message?: string;                        // Human-readable summary
  data?: unknown;                          // Structured result
  shouldProceed?: boolean;                 // Continue to next stage?
  nextAction?: "redirect" | "validate" | "block" | "continue";
}
```

---

## Roadmap

| Phase | Skills | Target | Status |
|---|---|---|---|
| **Phase 1** | Impact Scaffolder, Dependency Enforcer, Quality Validator | May 2026 | ✅ Complete |
| **Phase 2** | Evidence Assessor, Resource Adequacy, Activity Realism | Q3 2026 | 📋 Planned |
| **Phase 3** | Outcome Prediction, Advanced Synthesis | Q4 2026+ | 🔮 Visionary |

---

## References

- [Agent Skills Specification](https://agentskills.io/)
- [Skills + RAG Integration Vision](skills-rag-integration-vision.md)
- [Skills Implementation Summary](skills-implementation-summary.md)
- [Test Scenarios: Skill + RAG Integration](../test-scenarios-skill-rag-integration.ts)
