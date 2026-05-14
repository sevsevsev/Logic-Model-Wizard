# Scenario Template & Mapping Guide

This guide explains how to design conversational scenarios for the Logic Model agent using a repeatable template. Scenarios test agent behavior across critical paths, deviations, and recovery flows.

---

## 1. Agent Section Flow & Baseline Questions

The agent orchestrates five logical sections, each with an expected opening question. Use these as anchors when mapping scenarios.

### Section: **Intended Impact**
**Baseline Opening Questions:**
- "Tell me about your program's intended impact. Who are you serving, where, and what's the long-term goal?"
- "Who does your program serve and what geography are you working in?"

**Key Captures:** population, geography, long_term_goal, compiled_statement  
**Deviation Handlers:**
- If user provides only 1–2 fields (e.g., just population), agent should ask clarifying follow-ups.
- If user provides all fields unprompted, agent should confirm and move on.

---

### Section: **Resources**
**Baseline Opening Questions:**
- "What key resources does your program rely on (people, materials, funding, expertise)?"
- "Please list the people, materials, funding, and expertise your program depends on."

**Key Captures:** resources.human, resources.material, resources.financial, resources.knowledge  
**Deviation Handlers:**
- If user lists resources but misses a bucket, agent may ask: "Do you have any grant or donation funding?"
- If user says "we don't have that," agent should move to next bucket without re-asking the same one.
- If user re-answers after confirmation, agent must preserve prior captures (no silent drop).

---

### Section: **Activities**
**Baseline Opening Questions:**
- "What activities does your program implement?"
- "Walk me through the key activities your team runs."

**Key Captures:** implementation.activities (array of activity objects)  
**Deviation Handlers:**
- If user provides 1 activity, ask: "Any other activities?"
- If user says "that's it," move to next section.
- If activities lack detail (e.g., no description), ask follow-up: "Can you describe that activity?"

---

### Section: **Quality & Fidelity**
**Baseline Opening Questions:**
- "How does your program maintain quality and fidelity? What standards or evidence guide implementation?"
- "What quality checks or fidelity markers does your program use?"

**Key Captures:** implementation.quality_fidelity.quality, implementation.quality_fidelity.fidelity  
**Deviation Handlers:**
- If user conflates quality and fidelity, agent should clarify: "By quality, I mean…; by fidelity, I mean…"
- If user provides only one, ask for the other explicitly.

---

### Section: **Outcomes**
**Baseline Opening Questions:**
- "What outcomes does your program aim to achieve? Think in terms of short, medium, and long term."
- "What changes do you expect from your program—in the short term (0–6 months), medium term (6–18 months), and long term (18+ months)?"

**Key Captures:** outcomes.short_term, outcomes.medium_term, outcomes.long_term (arrays)  
**Deviation Handlers:**
- If user provides only 1–2 time horizons, ask for the missing one.
- If user provides vague outcomes, ask for specifics: "What does 'student success' look like?"
- If user provides all three, move to final confirmation.

---

## 2. Scenario Template Structure

Each scenario is composed of:

### **Metadata**
```yaml
id: <scenario-slug>              # e.g., "resources-list-capture"
section: <section-name>          # e.g., "resources" or "cross-section"
description: <human-readable>    # e.g., "When user provides resource list, all buckets captured."
focus: <test-focus>              # e.g., "assertion", "deviation-recovery", "multi-turn-retention"
```

### **Seed History** (optional)
Pre-populate conversation with agent's opening question for the section. Maps to `seedHistory` field in harness.

```yaml
seedHistory:
  - role: "assistant"
    content: "What key resources does your program rely on (people, materials, funding, expertise)?"
```

Use this when **testing a mid-flow interaction** (not starting fresh). Omit when testing full end-to-end flow.

### **Turns**
Array of user inputs and corresponding expectations.

```yaml
turns:
  - user: <user-message>                    # What user says
    expect:
      finalIntentOneOf:
        - <expected-intent>                 # e.g., ["resources"]
      modelPatchMustHavePath:               # Patch must contain these paths
        - "implementation.resources"
      modelPatchResourceBucketsAtLeast: 2   # If resources, min buckets captured
      replyMustContainAny:                  # Reply must include at least one of these
        - "...understood..."
        - "...captured..."
      replyMustNotMatch:                    # Reply must NOT match (anti-patterns)
        - "regex-pattern-to-avoid"
```

### **Final Check** (optional)
Callback to validate end-state of model after all turns. Example:

```
finalCheck:
  - path: "intended_impact.population"
    expectNonEmpty: true
  - path: "implementation.resources.human"
    expectMinLength: 1
  - path: "outcomes.short_term"
    expectMinLength: 1
```

---

## 3. Handling Deviations & Follow-Ups

### **Pattern A: Happy Path → Confirmation Turn**
```yaml
scenario:
  id: "impact-capture-and-confirm"
  section: "impact"
  turns:
    # Turn 1: User provides all impact fields unprompted
    - user: "We serve middle school students in North Philadelphia with a goal of grade-level reading."
      expect:
        finalIntentOneOf: ["impact"]
        modelPatchMustHavePath: ["intended_impact"]
        replyMustNotMatch: ["/clarify/i", "/missing/i"]  # Should not ask for more
    
    # Turn 2: User confirms
    - user: "Yes, that's exactly right."
      expect:
        replyMustNotMatch: ["/tell me more/i"]  # Should accept confirmation and move on
```

### **Pattern B: Partial Input → Agent Asks Clarifying Follow-Up**
```yaml
scenario:
  id: "impact-partial-then-clarify"
  section: "impact"
  turns:
    # Turn 1: User provides only population + geography
    - user: "We work with teens in Philadelphia."
      expect:
        finalIntentOneOf: ["impact"]
        replyMustContainAny:
          - "long-term goal"    # Agent should ask for the missing field
          - "what's the long-term"
    
    # Turn 2: User provides missing field
    - user: "Long term, we want them to read on grade level."
      expect:
        finalIntentOneOf: ["impact"]
        modelPatchMustHavePath: ["intended_impact.long_term_goal"]
        replyMustNotMatch: ["/anything else/i"]  # Should confirm and move on
```

### **Pattern C: Resource Bucket Missed → Multi-Turn Recovery**
```yaml
scenario:
  id: "resources-missing-bucket-recovery"
  section: "resources"
  seedHistory:
    - role: "assistant"
      content: "What key resources does your program rely on (people, materials, funding, expertise)?"
  turns:
    # Turn 1: User provides only 3 of 4 buckets (e.g., no knowledge/training)
    - user: "We have staff, donated laptops, and grant funding."
      expect:
        finalIntentOneOf: ["resources"]
        modelPatchResourceBucketsAtLeast: 2
        replyMustContainAny:
          - "expertise"          # Agent should probe for missing bucket
          - "training"
          - "knowledge"
    
    # Turn 2: User provides the missing bucket
    - user: "And we have partner expertise—they run evidence-based training."
      expect:
        finalIntentOneOf: ["resources"]
        modelPatchResourceBucketsAtLeast: 3
        replyMustNotMatch: ["/what resources/i"]  # Should NOT re-ask the resource question
  
  finalCheck:
    - path: "implementation.resources.human"
      expectMinLength: 1
    - path: "implementation.resources.material"
      expectMinLength: 1
    - path: "implementation.resources.financial"
      expectMinLength: 1
    - path: "implementation.resources.knowledge"
      expectMinLength: 1
```

### **Pattern D: User Confirms, Then Continues (No Silent Drop)**
```yaml
scenario:
  id: "resources-no-silent-drop-after-confirm"
  section: "resources"
  seedHistory:
    - role: "assistant"
      content: "What key resources does your program rely on?"
  turns:
    # Turn 1: User provides resource list
    - user: "Staff, laptops, grant funding, and partner training."
      expect:
        finalIntentOneOf: ["resources"]
        modelPatchResourceBucketsAtLeast: 3
    
    # Turn 2: User indicates no more resources
    - user: "That's everything on resources."
      expect:
        replyMustNotMatch: ["/what resources/i"]  # Do NOT re-ask
    
    # Turn 3: User asks about next section or adds unrelated info
    - user: "Can we talk about activities now?"
      expect:
        replyMustNotMatch:
          - "/resources?/i"     # Do NOT circle back to resources
          - "/anything else.*resource/i"
  
  finalCheck:
    - path: "implementation.resources"
      expectResourceBucketsAtLeast: 2
    - description: "Model state must retain resources through conversation close"
```

---

## 4. Template YAML Skeleton

Save new scenarios as YAML files in `docs/scenarios/` for reference, then convert to TypeScript for harness execution.

```yaml
# docs/scenarios/my-scenario.yaml
---
id: "scenario-id"
section: "impact|resources|activities|quality|outcomes|cross-section"
description: "Human-readable test intent"
focus: "assertion|deviation-recovery|multi-turn-retention|edge-case"

# (Optional) Pre-populate conversation
seedHistory:
  - role: "assistant"
    content: "Agent's opening question for this section"

# Turns: user input → expected intent + patch + reply pattern
turns:
  - user: "User input for turn 1"
    expect:
      finalIntentOneOf: ["intent1", "intent2"]
      modelPatchMustHavePath: ["path.to.field"]
      modelPatchResourceBucketsAtLeast: 2        # If resources section
      replyMustContainAny: ["pattern1", "pattern2"]
      replyMustNotMatch: ["/regex-to-avoid/i", "/another-pattern/i"]

  - user: "User input for turn 2"
    expect:
      finalIntentOneOf: ["intent1"]
      replyMustNotMatch: ["/do not re-ask/i"]

# (Optional) Final state validation
finalCheck:
  - path: "intended_impact.population"
    expectNonEmpty: true
  - path: "outcomes.short_term"
    expectMinLength: 1
```

---

## 5. Converting YAML Template to TypeScript Harness

Once you design a scenario in YAML, convert it to a `Scenario` object:

```typescript
const myScenario: Scenario = {
  id: "resources-no-silent-drop-after-confirm",
  description: "User confirms resources; agent must not re-ask or drop state.",
  seedHistory: [
    {
      role: "assistant",
      content: "What key resources does your program rely on?",
    },
  ],
  turns: [
    {
      user: "Staff, laptops, grant funding, and partner training.",
      expect: {
        finalIntentOneOf: ["resources"],
        modelPatchResourceBucketsAtLeast: 3,
      },
    },
    {
      user: "That's everything on resources.",
      expect: {
        replyMustNotMatch: [/what resources/i],
      },
    },
    {
      user: "Can we talk about activities now?",
      expect: {
        replyMustNotMatch: [/resources?/i, /anything else.*resource/i],
      },
    },
  ],
  finalCheck: ({ model }) => {
    const failures: string[] = [];
    const count = resourceBucketCount(model.implementation.resources);
    if (count < 2) {
      failures.push(`Model retained only ${count} resource buckets; expected ≥2`);
    }
    return failures;
  },
};
```

Then add to `SCENARIOS` array in `scripts/agent-regression.ts`.

---

## 6. Best Practices

1. **One Section Per Scenario** (unless testing cross-section handoff)
   - Easier to isolate bugs and debug assertion failures.

2. **Use `seedHistory` Sparingly**
   - Use when testing mid-flow or recovery after capture.
   - Omit for happy-path end-to-end flows (agent should ask the opening question).

3. **Assert Positively and Negatively**
   - `replyMustContainAny`: what agent SHOULD acknowledge.
   - `replyMustNotMatch`: what agent MUST avoid (re-asking, confusion, etc.).

4. **Resource Bucket Counts Matter**
   - Use `modelPatchResourceBucketsAtLeast: N` to ensure multi-bucket capture.
   - In `finalCheck`, validate that buckets persist after multi-turn interactions.

5. **Multi-Turn Validation via `finalCheck`**
   - After all turns, use `finalCheck` callback to validate end-state.
   - Catches silent drops or state loss between turns.

6. **Deviation Scenarios Should Show Recovery**
   - Turn 1: User provides incomplete input.
   - Turn 2: Agent clarifies or probes.
   - Turn 3+: User provides missing info; agent captures without re-asking.

7. **Name Scenarios Clearly**
   - `<section>-<scenario-focus>`
   - e.g., `resources-list-capture`, `impact-partial-then-clarify`, `outcomes-multi-turn-retention`.

---

## 7. Common Assertion Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| `finalIntentOneOf: ["resources"]` | Assert agent correctly classifies intent. | User provides resources; agent must tag as "resources", not "impact". |
| `modelPatchMustHavePath: ["implementation.resources"]` | Assert patch modifies expected model path. | Resources input must update `implementation.resources`, not ignore. |
| `modelPatchResourceBucketsAtLeast: 2` | Assert multi-bucket capture (resources only). | User lists staff + laptops; model must capture both human + material. |
| `replyMustContainAny: ["..."]` | Assert agent acknowledges or validates. | After resource input, agent should say "I've captured..." or similar. |
| `replyMustNotMatch: [/pattern/i]` | Assert agent does NOT repeat question. | After confirm, agent must NOT re-ask: `/what resources/i`. |

---

## 8. Walkthrough: Creating a New Scenario

### Step 1: Identify Test Focus
"Test that when user provides partial impact info (population + geography only), agent asks for long-term goal."

### Step 2: Design Turns
- **Turn 1:** User provides population + geography.  
  Expect: Agent replies asking for long-term goal.
- **Turn 2:** User provides long-term goal.  
  Expect: Agent captures and confirms; does not re-ask.

### Step 3: Write YAML Template
```yaml
id: "impact-partial-then-ask"
section: "impact"
description: "Agent clarifies missing long-term goal when user provides only population + geography."
focus: "deviation-recovery"

turns:
  - user: "We serve youth in Philadelphia."
    expect:
      finalIntentOneOf: ["impact"]
      modelPatchMustHavePath: ["intended_impact"]
      replyMustContainAny: ["long-term goal", "long-term", "goal"]  # Agent should ask
  
  - user: "The goal is that they graduate high school on time."
    expect:
      finalIntentOneOf: ["impact"]
      modelPatchMustHavePath: ["intended_impact.long_term_goal"]
      replyMustNotMatch: ["/tell me about.*impact/i", "/who are you serving/i"]  # Should not re-ask
```

### Step 4: Convert to TypeScript
Add to `SCENARIOS` in `scripts/agent-regression.ts` (or paste into harness directly).

### Step 5: Run & Validate
```bash
npm run -s test:agent-scenarios
```

If assertions fail, check trace report in `docs/regression-reports/` to debug intent drift or patch absence.

---

## Next Steps

- **Build Your Scenarios:** Use the YAML template to map out 1–2 new scenarios per section.
- **Convert & Add to Harness:** Paste TypeScript equivalents into `SCENARIOS` array.
- **Run & Inspect Traces:** `npm run -s test:agent-scenarios` generates Mermaid diagrams and JSON reports for debugging.
- **Iterate:** Refine scenarios based on trace findings; update agent logic if assertions reveal bugs.
