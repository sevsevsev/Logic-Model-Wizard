# Agent Skills Proposal: Enhancing Procedural Knowledge

## Executive Summary

Based on the ImpactED logic model framework and the current agentic application architecture, this proposal outlines **seven core agent skills** that will significantly improve the agent's ability to guide users through the procedural workflow of building a logic model. These skills modularize procedural knowledge, enable progressive scaffolding, and ensure consistency and quality throughout the user journey.

---

## Context: Logic Model Framework

The ImpactED logic model has three key procedural stages:

1. **Part 1 - Intended Impact** (WHO, WHERE, WHAT long-term)
   - Population (specific demographic)
   - Geography (specific location)
   - Long-term Goal (concrete outcome)
   - Compiled Statement (synthesis of above)

2. **Part 2 - Implementation** (WHAT resources and activities)
   - Resources (human, financial, material, knowledge)
   - Activities (what program does with resources)
   - Outputs (direct products of activities)

3. **Part 3 - Outcomes** (WHAT change over time)
   - Short-term outcomes (knowledge, attitude, awareness)
   - Medium-term outcomes (skills, behaviors, actions)
   - Long-term outcomes (status or condition)

---

## Proposed Agent Skills

### Skill 1: **Impact Statement Scaffolder**

**Purpose**  
Guide users through structured construction of the intended impact statement by validating and combining population, geography, and long-term goal components progressively.

**Procedural Knowledge**  
- Ensure all three facets (population, geography, long-term goal) are present before synthesizing compiled statement.
- Validate that population is specific enough (e.g., "6th-grade students" vs. "people").
- Validate that geography is specific enough (e.g., "Kensington neighborhood" vs. "area").
- Validate that long-term goal uses concrete impact markers (employment, graduation, housing, etc.).
- Follow format: "X population in Y geography will accomplish Z outcomes."

**Integration Points**  
- Invoked when user provides any component of intended impact.
- Blocks premature compilation until all facets are complete and valid.
- Provides targeted feedback on which facet needs refinement.

**Example Flow**  
```
User: "We serve low-income students"
→ Skill validates: "Specific population ✓, but missing geography and concrete long-term goal"
→ Agent asks: "Where do these students live or attend school?"

User: "In West Philadelphia"
→ Skill validates: "Population ✓, Geography ✓, but long-term goal needs concrete outcome (e.g., college readiness, employment)"
→ Agent asks: "What concrete change do you want for these students?"
```

---

### Skill 2: **Procedural Dependency Enforcer**

**Purpose**  
Ensure that users complete logic model components in an order that respects procedural dependencies and reduces confusion.

**Procedural Knowledge**  
- Cannot meaningfully define activities without understanding population and geography.
- Cannot define outputs without understanding activities.
- Cannot define outcomes without understanding activities and intended impact.
- Intended impact must be drafted before drilling into implementation details.
- Quality assessment requires activities and outputs to be defined first.

**Integration Points**  
- Invoked when user asks about or provides information for a component.
- Blocks or redirects out-of-sequence requests with a helpful explanation.
- Suggests the next logical step based on current model state.

**Example Flow**  
```
User (with no model data): "What activities should we run?"
→ Skill detects: "No population/geography/long-term goal defined yet"
→ Agent redirects: "Let's first clarify who you're serving and where. What population is your program for?"
```

---

### Skill 3: **Component Quality Validator**

**Purpose**  
Validate each logic model component (population, geography, activities, outcomes, etc.) against domain-specific quality criteria and provide targeted improvement feedback.

**Procedural Knowledge**  
- **Population**: Specific demographics or named groups (not generic "people").
- **Geography**: Named neighborhoods, ZIP codes, or administrative districts (not vague "area").
- **Activities**: Action-oriented, implementable processes (not aspirational outcomes).
- **Outputs**: Measurable, countable deliverables (number of sessions, participants reached, materials distributed).
- **Outcomes**: Aligned with ImpactED framework (short/medium/long-term progression).
- **Pitfalls**: Activities that duplicate outcomes, outcomes too vague, outputs that are actually outcomes.

**Integration Points**  
- Invoked after user provides or drafts a component.
- Generates quality score (0-100) based on specificity, clarity, and framework alignment.
- Returns specific suggestions for improvement.
- Flags common mistakes (e.g., "This sounds like an outcome, not an activity").

**Example Flow**  
```
User: "Our activity is to provide improved instruction"
→ Skill validates: ⚠️ Quality score: 35/100
→ Feedback: "This is more of a goal than an activity. Try: 'Deliver weekly small-group reading instruction for 90 minutes, using [specific curriculum]'"
```

---

### Skill 4: **Logic Chain Validator**

**Purpose**  
Validate that the proposed logic model components form a coherent causal chain: Resources → Activities → Outputs → Short-term Outcomes → Medium-term Outcomes → Long-term Outcomes → Intended Impact.

**Procedural Knowledge**  
- Each component should logically flow from the previous one.
- Resources must align with the types of activities proposed.
- Activities must directly enable the proposed outputs.
- Outputs must set up the conditions for short-term outcomes.
- Outcome progression must be realistic and time-phased.
- Long-term outcomes must align with the intended impact long-term goal.
- Identify logical gaps or misalignment.

**Integration Points**  
- Invoked after user has populated multiple components across sections.
- Performs end-to-end validation of the model coherence.
- Highlights breaks in the logic chain and suggests improvements.

**Example Flow**  
```
Model state:
- Population: Low-income high school students
- Activities: Weekly mentorship sessions
- Outputs: 100 students reached
- Long-term Outcome: Increased employment within 5 years
- Intended Impact: Students graduate and secure career-track jobs

→ Skill validates: ✓ Logic chain is coherent
   - Mentorship (activity) can reach 100 students (output) ✓
   - Mentorship supports graduation (short-term) → career readiness (medium-term) ✓
   - Career-track jobs (long-term outcome) aligns with intended impact ✓
```

---

### Skill 5: **Conflict Resolution Orchestrator**

**Purpose**  
Detect, surface, and guide resolution of contradictions or tensions between logic model components, especially when user revisions introduce conflicts.

**Procedural Knowledge**  
- Detects when a new population definition makes prior activities infeasible.
- Detects when a long-term goal conflicts with stated resources or capacity.
- Detects when outcome timelines are unrealistic given proposed activities and dosage.
- Generates clarifying questions to resolve ambiguities.
- Proposes specific revisions to align conflicting elements.
- Tracks and documents user's resolution choices (for audit trail).

**Integration Points**  
- Invoked when a model patch introduces a contradiction with prior components.
- Surfaces conflicts proactively in agent trace with flags.
- Provides multiple resolution paths (user choice, agent suggestion, reconciliation).

**Example Flow**  
```
Previous model: "Serve 100 students, 2 hours/week"
User revises: "Actually, 500 students"

→ Skill detects: ⚠️ Conflict
   - Prior resource/staffing implies 100 students
   - New population is 500 students
   - Likely infeasible without resource expansion

→ Agent asks: "To reach 500 students with your current 2-hour weekly sessions, you'd need to either:
   a) Increase session frequency or group size
   b) Adjust realistic reach back to ~100
   c) Scale resources (more staff, budget)
   
   Which direction works for your program?"
```

---

### Skill 6: **Evidence Anchor Mapper**

**Purpose**  
Track and surface the evidence or reasoning behind each component of the logic model, ensuring transparency and supporting defensibility.

**Procedural Knowledge**  
- Each major component should be anchored to evidence (research, practitioner knowledge, pilot data, participant feedback).
- Evidence types: peer-reviewed research, evaluation data, organizational expertise, community input, pilot results.
- Evidence can be explicit ("Studies show...") or implicit ("Based on 10 years of experience").
- Surface evidence gaps (components without supporting rationale).
- Link evidence to specific outcomes and activities.

**Integration Points**  
- Invoked when user provides or revises a component.
- Extracts evidence references from user input or RAG retrieval.
- Builds an evidence map across the model.
- Flags components lacking evidence (for stakeholder conversations).

**Example Flow**  
```
User: "Our long-term goal is students earn $50k+ within 5 years of graduation"

→ Skill maps evidence:
   Evidence provided: ✓ "Aligned with living wage in Philadelphia"
   Evidence needed: ? "How does your program's track record support this outcome timeline?"
   
→ Agent asks: "Do you have data on prior cohorts' employment outcomes? That would strengthen this goal."
```

---

### Skill 7: **Stakeholder Alignment Checker**

**Purpose**  
Ensure that the logic model reflects stakeholder perspectives (per ARC Method: Accessible, Reciprocal, Creative) and surface areas where stakeholder input may be needed.

**Procedural Knowledge**  
- Logic models should reflect needs/goals of those served, not just funders/staff.
- Key stakeholders: participants, staff, partners, community members, funders.
- Procedural workflow: Define model → Gather stakeholder input → Refine model → Align and communicate.
- Use ARC principles: make participation accessible, reciprocal, and creative.
- Flag areas needing stakeholder input (e.g., outcome timelines, resource feasibility).

**Integration Points**  
- Invoked as the model matures and becomes ready for validation.
- Suggests specific stakeholder conversations needed.
- Recommends which components need external validation.
- Guides the agent to surface questions that stakeholders should weigh in on.

**Example Flow**  
```
Model state: Outcomes defined, activities drafted, intended impact clear

→ Skill suggests stakeholder alignment:
   Ready for participant input: ✓ Activities (Are these relevant and feasible?)
   Ready for staff input: ✓ Resources (Are these realistic given staffing/budget?)
   Ready for funder alignment: ✓ Long-term outcomes (Do these match funder priorities?)

→ Agent prompts: "Before finalizing, we should validate this with [participants/staff/funders]. 
   Would you like help designing that conversation?"
```

---

## Integration Architecture

### Skill Registry and Lifecycle

```
SkillRegistry
├── register(skill: AgentSkill)
├── get(skillName: string): AgentSkill | undefined
└── list(): string[] → ["Impact Statement Scaffolder", "Procedural Dependency Enforcer", ...]

AgentSkill Interface
├── name: string
├── description: string
└── execute(context: SkillContext): Promise<SkillResult>

SkillContext
├── modelSnapshot: LogicModel
├── modelPatch: Partial<LogicModel>
├── userMessage: string
├── history: ChatMessage[]
└── questionIntent: AgentQuestionIntent

SkillResult
├── isValid: boolean
├── feedback: string
├── suggestions?: string[]
├── blockedComponent?: string
├── nextStep?: string
├── confidenceScore?: number
└── evidenceRefs?: string[]
```

### Invocation Points in Conversational Pipeline

1. **Input Validation Stage** (after user message received)
   - Invoke: Procedural Dependency Enforcer
   - Decision: Should this question be answered now, or redirected?

2. **Extraction and Patch Generation Stage** (after LLM extraction)
   - Invoke: Impact Statement Scaffolder, Component Quality Validator
   - Decision: Is the extracted component valid? Complete enough?

3. **Model Merge and Conflict Detection Stage** (after patch applied to model)
   - Invoke: Conflict Resolution Orchestrator, Logic Chain Validator
   - Decision: Are there unresolved tensions? Is the chain coherent?

4. **Evidence and Rationale Tracking Stage** (continuously)
   - Invoke: Evidence Anchor Mapper
   - Decision: What evidence supports this component? What's missing?

5. **Readiness Assessment Stage** (after substantial progress)
   - Invoke: Stakeholder Alignment Checker
   - Decision: Is the model ready for external validation?

---

## Expected Outcomes

With these skills integrated:

1. **Improved User Guidance**: Users receive targeted, context-aware feedback at each step.
2. **Reduced Procedural Mistakes**: Dependency enforcer and validators prevent common pitfalls.
3. **Better Model Quality**: Quality validator and logic chain validator ensure coherence and specificity.
4. **Transparency and Defensibility**: Evidence anchor mapper surfaces rationale and gaps.
5. **Stakeholder Alignment**: Checker ensures the model reflects community and participant perspectives.
6. **Reduced Agent Regression**: Conflict orchestrator proactively prevents contradictions and rewrites.

---

## Implementation Priority

### Phase 1 (High Impact, Lower Complexity)
1. Impact Statement Scaffolder
2. Component Quality Validator
3. Procedural Dependency Enforcer

### Phase 2 (Medium Impact, Medium Complexity)
4. Logic Chain Validator
5. Evidence Anchor Mapper

### Phase 3 (Strategic Impact, Higher Complexity)
6. Conflict Resolution Orchestrator
7. Stakeholder Alignment Checker

---

## Next Steps

1. Prototype Skills 1-3 from Phase 1.
2. Write unit tests for each skill's validation logic.
3. Integrate into the conversational pipeline at appropriate invocation points.
4. Validate with manual test scenarios (avoiding broad API-backed regression to preserve credits).
5. Gather feedback and iterate before Phase 2.