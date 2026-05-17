---
name: component-quality-validator
description: Validates each logic model component against domain-specific quality criteria. Provides targeted improvement feedback and quality scores. Use when evaluating specificity, clarity, and framework alignment of logic model components.
license: Apache-2.0
compatibility: Requires TypeScript/Node.js environment
metadata:
  version: "1.0"
  author: "LM Chatbot"
  phase: "1"
---

# Component Quality Validator

## Overview

The Component Quality Validator evaluates logic model components against quality criteria specific to the ImpactED framework. It:
- Assigns quality scores (0-100) for each component
- Flags common mistakes (e.g., activities vs. outcomes confusion)
- Provides specific improvement suggestions
- Ensures framework alignment

## Quality Criteria by Component

### Population Quality

**Good** (80-100 points):
- Includes specific demographic characteristics (age, grade, or named group)
- Concrete and measurable (e.g., "6th-8th grade, low-income students")
- Non-generic descriptors
- 4+ descriptive words

**Fair** (50-79 points):
- Has a population noun but limited specificity
- Includes 1-2 qualifiers (e.g., "low-income youth")
- Somewhat concrete but could be more precise

**Poor** (0-49 points):
- Generic placeholders ("people", "community", "students")
- No demographic specificity
- 1-3 words with no qualifiers
- Vague descriptors

**Common Mistakes**:
- "all students" (need to specify which ones)
- "our clients" (need demographic specificity)
- Using outcome language in population (e.g., "successful students")

### Geography Quality

**Good** (80-100 points):
- Specific place name or coordinates (neighborhood, ZIP, school)
- Clearly bounded area
- Observable/verifiable location
- 1-3 geographic terms with high specificity

**Fair** (50-79 points):
- District or multi-neighborhood area
- Directional reference with city (e.g., "West Philadelphia")
- School district name
- Somewhat vague but interpretable

**Poor** (0-49 points):
- Vague ("area", "region", "our community")
- Unbounded ("the state", "multiple locations")
- Unclear reference ("here")
- Missing entirely

**Common Mistakes**:
- "citywide" (without naming the city)
- "wherever our participants are" (too unbounded)
- "different neighborhoods" (name them specifically)

### Activities Quality

**Good** (80-100 points):
- Specific, action-oriented process (verb-driven)
- Implementable with clear steps
- Measurable/observable
- Realistic given resources
- Example: "Weekly after-school tutoring in small groups (5-8 students) using [curriculum], 90 minutes per session"

**Fair** (50-79 points):
- Clear activity but missing implementation details
- Action-oriented but somewhat vague on delivery
- Partially measurable
- Example: "After-school tutoring sessions"

**Poor** (0-49 points):
- Aspirational rather than actionable ("improved instruction")
- No clear delivery method
- Too vague to implement
- Duplicate outcomes
- Example: "Help students succeed"

**Common Mistakes**:
- Confusing activities with outcomes (activities = what you DO; outcomes = what results)
- "Improved instruction" (aspirational, not actionable)
- "Staff training" (what kind? on what? how long?)
- Listing every task instead of core strategies

### Outputs Quality

**Good** (80-100 points):
- Countable/measurable direct products
- Directly tied to specific activity
- Realistic given activity scope
- Examples: "100 students served", "30 workshops delivered", "500 packets distributed"

**Fair** (50-79 points):
- Measurable but vague on connection to activity
- Realistic but lacks specificity
- Example: "Serve students in the program"

**Poor** (0-49 points):
- Confuses output with outcome ("Students graduate")
- Vague or non-measurable ("Better outcomes")
- Unrelated to activities
- Example: "Improved achievement"

**Common Mistakes**:
- Output vs. Outcome confusion (outputs = direct products; outcomes = changes in knowledge, skills, status)
- "Number of staff trained" (who cares if training wasn't effective?)
- Not tying outputs to specific activities

### Outcomes Quality

**Good** (80-100 points):
- Clear progression (short → medium → long-term)
- Behavioral or status change (not just knowledge)
- Aligned with intended long-term goal
- Realistic timeline for change
- Examples:
  - Short: "Students improve reading fluency (increase from 25% to 50% at grade level)"
  - Medium: "Students demonstrate grade-level reading comprehension"
  - Long: "Students graduate high school and enroll in college"

**Fair** (50-79 points):
- Describes change but missing timeline or specificity
- Some alignment with intended impact
- Partially realistic

**Poor** (0-49 points):
- Duplicate of activities ("receive tutoring")
- Duplicate of outputs ("participate in 10 sessions")
- Confuses outcome with long-term goal aspiration
- Unrelated to intended impact
- Example: "Improved instruction" (this is an activity, not an outcome)

**Common Mistakes**:
- Outcomes = activities (getting the dose, not the result)
- Too vague ("increased engagement")
- Unrealistic timeline
- Misaligned with intended impact

## Validation Rules

1. **No component should describe a lower-level component**
   - Population should not include activity language
   - Activities should not describe resources
   - Outputs should not describe outcomes

2. **Components should not repeat other components**
   - "Delivered 20 tutoring sessions" should not appear in both Activities AND Outputs

3. **Outcomes should show progression**
   - Short-term: knowledge, awareness, attitude
   - Medium-term: skills, behaviors, actions
   - Long-term: status, condition, position

4. **Specificity increases confidence**
   - "100 3rd-graders" > "students"
   - "West Philadelphia public schools" > "the city"
   - "Weekly 90-minute algebra tutoring" > "academic support"

## Integration Points

This skill should be invoked:
1. After user provides or extracts a component
2. When evaluating readiness to move forward
3. When user requests feedback on a section
4. During stakeholder review preparation