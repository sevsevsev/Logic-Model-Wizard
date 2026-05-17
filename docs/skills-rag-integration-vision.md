# Agent Skills + RAG Integration Vision

**Date**: May 17, 2026  
**Context**: LM Chatbot experiment exploring procedural knowledge enhancement

---

## Executive Summary

Agent Skills and RAG can form a powerful **feedback loop** where:

1. **Skills assess** what the user has built (validation, quality, dependencies)
2. **Skills identify gaps** (incomplete components, quality issues, procedural violations)
3. **RAG retrieves targeted guidance** addressing those specific gaps
4. **User iterates** with skill-informed, evidence-backed guidance
5. **Skills validate again** on the refined model

This creates **progressive scaffolding**: each skill invocation surfaces gaps, RAG fills gaps with examples and guidance, then skills validate the improvement.

---

## Current State

### RAG System (src/lib/rag/)
- **Vector retrieval**: Semantic search over knowledge base
- **Metadata reranking**: Boosts chunks with source weight, quality score, domain match
- **Query domain inference**: Maps user query to logic model domain
- **Diagnostics**: Traces scoring decisions for transparency

### Agent Skills (src/lib/agent/skills/)
- **Impact Scaffolder**: Validates population/geography/goal specificity
- **Dependency Enforcer**: Checks procedural ordering (Impact → Implementation → Outcomes)
- **Quality Validator**: Scores components against domain criteria

---

## Vision: Skills-Informed RAG

### Layer 1: Skill Validation → Identified Gaps

When a user provides or updates a component:

```
User Input
    ↓
Skill Executes (e.g., Component Quality Validator)
    ↓
Skill Result: {
  score: 45/100,
  rating: "fair",
  feedback: "Population lacks demographic specificity",
  suggestions: ["Add grade level", "Add income qualifier"],
  commonMistakes: ["Generic 'students' without specificity"]
}
    ↓
Gap Identified: "population_specificity" ← THIS is the retrieval signal
```

### Layer 2: Gap-Informed Retrieval

RAG uses skill assessment results to inform retrieval:

```
Gap: "population_specificity"
Context: User said "students"
    ↓
Retrieve Guidance For:
  1. Query: "specific population examples logic model"
  2. Domain: inferred from gap type
  3. Ranking Signal: "quality_score", "is_example=true", "addresses_population=true"
    ↓
Retrieved Chunks:
  - Example: "Low-income first-generation college students" (quality_score: 9/10)
  - Anti-pattern: "Students" (qualityScore: 2/10, is_anti_pattern: true)
  - Guidance: "Demographic specificity in population includes grade, income, status..."
```

### Layer 3: Evidence Integration

Chunks include evidence that links to logic model structure:

```
Retrieved Chunk Metadata:
{
  id: "pop-spec-001",
  canonicalDomain: "intended impact > population",
  qualityScore: 8,
  skillRelevance: ["impact-statement-scaffolder"],
  skillGap: "population_specificity",
  type: "example",
  example: "6th-8th grade, low-income students",
  antiPattern: false,
  category: "demographic_specificity"
}

↓ Linked in Agent Response:

"Your population needs demographic specificity.
 
 Example of specific: '6th-8th grade, low-income students'
 Avoid: 'students' (too generic)
 
 Add: grade/age, income level, or other demographic qualifiers."
```

### Layer 4: Iterative Refinement

```
Iteration Cycle:
┌─────────────────────┐
│ User Provides Text  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Skill: Validate     │ (Impact Scaffolder)
│ Gap: population_    │
│ specificity         │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ RAG: Retrieve       │ (Targeted guidance)
│ Guidance            │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Agent: Present      │ (With examples)
│ Evidence + Ask      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ User: Refine        │ (With guidance)
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Skill: Re-Validate  │ (Score improves from 45/100 to 85/100)
└─────────────────────┘
```

---

## Implementation Architecture

### Data Flow: Skill Assessment → RAG Query

```typescript
// Current: RAG takes only user query
const chunks = await retrieveKnowledgeWithTrace(userMessage, ...);

// Vision: RAG takes skill assessment results
const skillAssessment = await skillRegistry.execute("component-quality-validator", context);

const retrieval = await retrieveKnowledgeWithTrace(userMessage, {
  skillGaps: skillAssessment.data.topPrioritySuggestions,     // Gaps identified
  modelState: skillAssessment.data.assessments,               // What's present/absent
  targetComponent: skillAssessment.data.focusComponent,      // Where to improve
  qualityThreshold: 75,  // Retrieve high-quality examples
  includeAntiPatterns: true,  // Show what NOT to do
});
```

### Metadata Enhancement

Knowledge chunks can be enriched with skill-relevant metadata:

```json
{
  "id": "pop-spec-002",
  "text": "Low-income first-generation college-bound students",
  "source": "logic-model-overview-guide",
  "canonicalDomain": "intended_impact.population",
  "qualityScore": 9,
  "type": "example",
  "skillRelevance": [
    "impact-statement-scaffolder"
  ],
  "skillGap": "population_specificity",
  "category": "demographic_specificity",
  "specificity": "high",
  "components": {
    "demographic": ["income", "generation_status", "aspiration"]
  },
  "antiPattern": false,
  "preferredSource": true
}
```

### Retrieval Query Enhancement

Instead of generic query:
```
"Tell me about populations in a logic model"
```

Use skill-informed query:
```
{
  baseQuery: "Specific population examples in logic models",
  skillContext: {
    skillName: "impact-statement-scaffolder",
    gap: "population_specificity",
    currentText: "students",
    score: 45,
    targetScore: 80
  },
  rankingSignals: [
    "qualityScore > 7",
    "type = example",
    "includeAntiPatterns = true"
  ]
}
```

---

## Three Integration Levels

### Level 1: Direct Gap-to-Evidence (Phase 1)
**When**: Component Quality Validator detects a gap  
**How**: Retrieve high-quality examples + anti-patterns for that gap  
**Impact**: Users see concrete, targeted guidance immediately

```typescript
// In conversational pipeline
const validation = await skillRegistry.execute("component-quality-validator", context);
if (!validation.success) return; // Skip retrieval if skill fails

// Use skill output to inform retrieval
const chunks = await retrieveKnowledgeWithTrace(userMessage, {
  skillGaps: validation.data.topPrioritySuggestions,
});

// Agent uses chunks to provide grounded feedback
const response = buildResponseWithEvidence(validation.data, chunks);
```

### Level 2: Procedural Guidance + Evidence (Phase 1.5)
**When**: Dependency Enforcer detects out-of-sequence request  
**How**: Retrieve guidance for the prerequisite component + examples  
**Impact**: Users understand dependencies with concrete examples

```typescript
// Dependency check returns redirect
const dependency = await skillRegistry.execute("procedural-dependency-enforcer", context);
if (dependency.data.violation) {
  // Retrieve guidance for the missing prerequisite
  const chunks = await retrieveKnowledgeWithTrace(dependency.data.suggestedNextStep);
  
  // Grounded redirect message
  return buildRedirectWithGuidance(dependency.data, chunks);
}
```

### Level 3: Evidence-Aware Validation & Reranking (Phase 2+)
**When**: Evidence Anchor Mapper (Phase 2 skill) runs  
**How**: Validate components against retrieved evidence; rerank retrieval by relevance  
**Impact**: User model becomes evidence-grounded; RAG becomes smarter

```typescript
// Future: Skills inform what evidence is relevant
const evidenceMapper = await skillRegistry.execute("evidence-anchor-mapper", context);

// Retrieved chunks ranked by skill-assessed relevance
const rerankedChunks = rerankBySkillRelevance(chunks, evidenceMapper.data);

// User sees which evidence supports which components
const response = buildEvidenceLinkedResponse(model, rerankedChunks);
```

---

## Benefits of Skills + RAG Integration

### For Users
1. **Targeted Guidance**: Not generic knowledge, but answers to their specific gaps
2. **Progressive Clarity**: Each iteration shows why a component needs work + how to fix it
3. **Confidence Building**: See examples of good vs. bad components
4. **Evidence-Grounded**: Know the reasoning behind suggestions

### For Agent
1. **Smarter Retrieval**: Skills identify gaps; RAG fills those specific gaps
2. **Better Reranking**: Metadata from skills (quality scores, gap types) improve chunk ranking
3. **Reduced Context Waste**: Retrieve exactly what's needed, not broad knowledge dumps
4. **Clearer Decision Making**: Skill output + retrieved evidence → grounded responses

### For Product
1. **Measurable Quality**: Track how skills + RAG improve model quality over time
2. **Feedback Loop**: Each user iteration refines both skills and knowledge base
3. **Scalable Expertise**: Skills encode procedural knowledge; RAG provides domain knowledge
4. **Audit Trail**: Skill assessment + retrieved evidence create transparent decisions

---

## Practical Examples

### Example 1: Population Specificity Gap

**User Input**: "We serve students in Philadelphia"

**Step 1: Skill Assessment**
```
Impact Scaffolder validates population = "students"
Result: {
  isPopulationValid: false,
  populationFeedback: "Population is too generic",
  score: 30/100,
  suggestions: ["Add grade level", "Add income level or demographic"]
}
```

**Step 2: Skill-Informed Retrieval**
```
Retrieve with signals:
- skillGap: "population_specificity"
- type: "example"
- includeAntiPatterns: true
- qualityScore > 7
```

**Step 3: Agent Response (Evidence-Backed)**
```
"Your population needs more specificity. 

Examples of specific populations:
✓ '6th-8th grade, low-income students in public schools'
✓ 'First-generation college-bound high school students'

Avoid:
✗ 'students' (too generic)
✗ 'people in Philadelphia' (missing demographics)

Try adding: grade level, income level, or other qualifiers."

[Evidence: Retrieved from 5 high-quality examples in knowledge base]
```

**Step 4: User Refines**
```
User: "OK, we serve 6th-8th grade, low-income students"
```

**Step 5: Skill Re-Validates**
```
Impact Scaffolder re-validates population = "6th-8th grade, low-income students"
Result: {
  isPopulationValid: true,
  populationFeedback: "Population is specific and well-defined",
  score: 85/100
}
→ Move to next component
```

### Example 2: Dependency Violation + Evidence

**User Input**: "What activities should we run?" (No Intended Impact yet)

**Step 1: Dependency Check**
```
Procedural Dependency Enforcer detects violation
Result: {
  violates: true,
  reason: "Cannot define activities without Intended Impact",
  suggestedNextStep: "Define population, geography, long-term goal"
}
```

**Step 2: Skill-Informed Retrieval**
```
Retrieve guidance for Intended Impact construction:
- Query: "Intended impact population geography long-term goal"
- skillGap: "intended_impact_incomplete"
- type: "guidance" (not just examples)
```

**Step 3: Agent Response (With Scaffolding)**
```
"Before activities, let's define who you're serving and where.

Intended Impact has three parts:
1. Population: Who are you serving? (e.g., 'low-income high school students')
2. Geography: Where do they live/study? (e.g., 'West Philadelphia')
3. Long-term Goal: What concrete change? (e.g., 'enroll in and complete college')

Example: 'Low-income high school students in West Philadelphia will enroll in and 
complete a college degree.'

Once we nail these three, activities will be much clearer. Let's start: Who does your 
program serve?"

[Evidence: 3 strong impact statement examples from knowledge base]
```

---

## Implementation Roadmap

### Immediate (Phase 1.5: Integrate with Current Skills)
- [ ] Modify `retrieveKnowledgeWithTrace()` to accept `skillContext` parameter
- [ ] Map skill gaps to retrieval signals (skillGap → domain, type, metadata filters)
- [ ] Enhance knowledge base metadata with `skillRelevance`, `skillGap`, `type` fields
- [ ] Update agent response building to link retrieved chunks to skill feedback

### Near-term (Phase 2: Enhance with Advanced Skills)
- [ ] Implement Logic Chain Validator skill (detects broken causal chain)
- [ ] Implement Evidence Anchor Mapper skill (links components to evidence)
- [ ] Add chunk-level relevance scoring based on skill assessment
- [ ] Create "evidence dashboard" showing which chunks support which components

### Mid-term (Phase 3: Closed-Loop Optimization)
- [ ] Implement Conflict Resolution Orchestrator (detects contradictions)
- [ ] Add user feedback loop: "Was this example helpful?" → rerank future retrievals
- [ ] Implement smart reranking that learns which evidence types help most
- [ ] Create metrics on skill score improvements vs. evidence quality

### Long-term (Vision)
- [ ] Skills become meta-learners: optimize knowledge base based on what helps most
- [ ] Multi-turn evidence tracking: "We used this example 3 turns ago, why is user still stuck?"
- [ ] Personalized guidance: Different evidence types for different user learning styles
- [ ] Automated knowledge curation: Surface and remove unhelpful or conflicting guidance

---

## Key Design Principles

1. **Skills Drive Retrieval**: What users need (per skills) determines what RAG retrieves
2. **Evidence Grounds Feedback**: Don't tell users "be more specific"—show specific examples
3. **Progressive Disclosure**: Don't overwhelm with all knowledge; retrieve only what's needed
4. **Transparent Reasoning**: Link skill assessment + evidence → clear decision trail
5. **Iterative Refinement**: Each cycle skill → retrieval → user input → skill again
6. **Skill-Neutral Metadata**: Knowledge base metadata works for all skill types (current + future)

---

## Success Metrics

- **User Experience**: Model quality scores improve faster with skills + RAG than RAG alone
- **Efficiency**: Fewer turns to reach quality thresholds
- **Confidence**: Users report clarity on what needs work and how to improve
- **Retrieval Quality**: Retrieved chunks increasingly match skill-identified gaps
- **Agent Clarity**: Skill assessment + evidence reduces ambiguous feedback

---

## Questions for Implementation

1. **Skill-to-Retrieval Mapping**: How do we standardize how each skill type maps to retrieval signals?
2. **Knowledge Base Enrichment**: Priority order for adding skill-relevant metadata to chunks?
3. **Evidence Quality Bar**: What's the minimum quality score for chunks used to ground skill feedback?
4. **Conflict Handling**: When skill feedback conflicts with retrieved evidence, which takes priority?
5. **Multi-Skill Retrieval**: When multiple skills identify gaps, how do we prioritize which to retrieve for?

---

## Conclusion

Skills + RAG integration creates a **"feedback loop of procedural + domain knowledge"**:

- **Procedural Knowledge** (Skills): "Here's what a good logic model looks like, and here's where yours needs work"
- **Domain Knowledge** (RAG): "Here are examples, anti-patterns, and guidance for that specific area"
- **User Agency**: "Now I see what's needed and how to improve it"
- **Iteration**: Process repeats with progressive refinement

This is fundamentally different from generic question-answering RAG. It's **guided scaffolding**: structured guidance (skills) anchored by evidence (RAG).
