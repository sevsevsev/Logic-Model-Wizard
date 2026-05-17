---
name: procedural-dependency-enforcer
description: Ensures that users complete logic model components in a logical order that respects procedural dependencies. Redirects out-of-sequence requests and suggests the next logical step. Use when users ask about or provide information for components before prerequisites are defined.
license: Apache-2.0
compatibility: Requires TypeScript/Node.js environment
metadata:
  version: "1.0"
  author: "LM Chatbot"
  phase: "1"
---

# Procedural Dependency Enforcer

## Overview

The Procedural Dependency Enforcer ensures users build their logic model in an order that respects logical dependencies, preventing confusion and rework. It:
- Detects out-of-sequence requests
- Redirects users to prerequisites when needed
- Suggests the next logical step based on current model state
- Prevents defining complex sections (Implementation, Outcomes) without foundational understanding (Intended Impact)

## Procedural Dependencies

### Dependency Chain

```
Intended Impact (Population, Geography, Long-term Goal)
    ↓
    ├─→ Implementation Resources
    │       ↓
    │   ├─→ Activities
    │   │       ↓
    │   └─→ Outputs
    │
    └─→ Outcomes (Short → Medium → Long-term)
            ↓
            └─→ Back to Intended Impact (long-term outcomes must align)
```

### Key Rules

1. **Intended Impact must be drafted before detailed Implementation**
   - Cannot meaningfully define activities without understanding *who* and *where*
   - Cannot define outputs without understanding *what activities you're doing*
   - Cannot define outcomes without understanding *intended impact and activities*

2. **Resources precede Activities**
   - Can't implement activities you don't have resources for
   - Must know capacity before committing to activity scope

3. **Activities precede Outputs**
   - Outputs are direct products of activities
   - Can't specify outputs without knowing activities

4. **Activities and Outputs precede Outcomes**
   - Outcomes describe what happens as a result of activities
   - Need implementation context to define realistic outcomes

5. **Long-term Outcomes must align with Intended Impact**
   - Creates a feedback loop requiring Intended Impact to be revisited

### Workflow States

| Current State | Request | Action |
|---------------|---------|--------|
| Empty model | Any | Redirect to: "Let's start by defining who you serve (population), where (geography), and your long-term goal." |
| Population only | Activities | Redirect: "First, let's specify where you work (geography) and your long-term goal, then we can discuss activities." |
| Population + Geography | Activities | Ask clarifying: "What's your long-term goal for this population?" |
| Population + Geography + Goal | Resources or Activities | Proceed (prerequisites met) |
| No Implementation section | Outcomes | Redirect: "Let's first outline your implementation (resources, activities, outputs) so we can define realistic outcomes." |
| Activities defined | Outputs | Proceed (prerequisites met) |
| Outputs defined | Outcomes | Proceed (prerequisites met) |

## Examples

### Example 1: Attempting Activities Before Impact
```
User (new model): "What activities should we run?"
→ Skill detects: No Intended Impact defined
→ Redirect: "Let's first clarify who you're serving (population), where (geography), and your long-term goal. 
   Then we can discuss activities that will work for that population in that context."
```

### Example 2: Attempting Outcomes Before Activities
```
User (Resources defined, no Activities): "What outcomes should we measure?"
→ Skill detects: Resources exist, but Activities and Outputs not defined
→ Redirect: "To define realistic outcomes, we need to know what activities you'll actually deliver. 
   What are the specific activities your program will implement?"
```

### Example 3: Outcomes Misaligned with Impact
```
Current state:
- Population: "Low-income high school students"
- Long-term Goal: "Increase college enrollment"
- Medium-term Outcome: "Students learn to code"

User: "That sounds good"
→ Skill detects: Coding skills don't clearly align with college enrollment goal
→ Alert: "The coding skills outcome doesn't clearly connect to your college enrollment goal. 
   Is coding meant to strengthen college applications, or are we adding a different goal?"
```

## Integration Points

This skill should be invoked:
1. At the start of each user message, before extracting intent
2. When user mentions a section (e.g., "activities", "outcomes", "resources")
3. When the extracted question intent targets a component
4. Before answering questions about lower-level components

## Redirect Messages

When a dependency violation is detected:
- Be clear about what's missing
- Explain why the prerequisite matters
- Ask a focused question to help them move forward
- Offer to revisit later if they want to jump ahead