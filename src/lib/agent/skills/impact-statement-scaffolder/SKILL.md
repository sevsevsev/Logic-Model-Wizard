---
name: impact-statement-scaffolder
description: Guides users through structured construction of the intended impact statement by validating and progressively combining population, geography, and long-term goal components. Use when working on the intended impact section of a logic model.
license: Apache-2.0
compatibility: Requires TypeScript/Node.js environment
metadata:
  version: "1.0"
  author: "LM Chatbot"
  phase: "1"
---

# Impact Statement Scaffolder

## Overview

The Impact Statement Scaffolder helps users construct a complete, specific intended impact statement by:
- Validating that population is specific enough (e.g., "6th-grade students" vs. "people")
- Validating that geography is specific enough (e.g., "Kensington neighborhood" vs. "area")
- Validating that long-term goal uses concrete impact markers (employment, graduation, housing, etc.)
- Preventing premature synthesis until all three components are present and valid
- Providing targeted feedback on which component needs refinement

## Procedural Knowledge

The intended impact statement follows this format:
> **"X population in Y geography will accomplish Z outcomes."**

Where:
- **X (Population)**: Specific demographic (e.g., "low-income first-generation college-bound students")
- **Y (Geography)**: Specific location (e.g., "West Philadelphia public schools")
- **Z (Long-term Goal)**: Concrete outcome (e.g., "enroll in and complete a postsecondary credential")

### Population Specificity

A population is specific enough if it includes:
- **Grade/age specificity** (e.g., "9th-grade students", "ages 6-8", "early childhood")
- **Named demographic groups** (e.g., "veterans", "refugees", "formerly incarcerated")
- **Population + qualifier combination** (e.g., "low-income families", "English language learners")
- **Non-generic descriptors** (4+ distinct words describing the group)

Do NOT accept generic populations like:
- "people", "community", "everyone", "anyone", "participants", "clients", "users", "individuals"

### Geography Specificity

A geography is specific enough if it includes:
- **Specific place names** (e.g., "Philadelphia", "Kensington", "Center City")
- **Neighborhood-level or administrative references** (e.g., "West Philadelphia", "District 12", "ZIP 19143")
- **Named schools or institutions** (e.g., "Bethune Elementary School")
- **City/state notation** (e.g., "Philadelphia, PA")
- **ZIP code specificity** (e.g., "19143", "19104-19147")

Do NOT accept vague geographies like:
- "area", "region", "district", "our community", "citywide (without context)"

### Long-term Goal Specificity

A long-term goal is concrete if it includes one of these impact markers:
- **Education**: graduate, graduation, postsecondary, college, credential, degree
- **Employment**: employment, job, wage, income, career track
- **Housing**: housing, stable housing, homeless (reduction)
- **Justice**: justice-involved (reduction), arrest (reduction), incarceration (reduction)
- **Violence**: safety, violence (reduction), trauma-informed
- **Health**: health, mental health, healthcare access
- **Attendance**: attendance, absenteeism (reduction), chronic absence (reduction)
- **Academic**: reading level, grade level, academic achievement

Do NOT accept vague or intermediate goals like:
- "improved instruction", "better outcomes", "increased engagement", "more skills"

## Workflow

1. **Extract**: Capture population, geography, and long-term goal from user input
2. **Validate**: Check each component against specificity criteria
3. **Feedback**: Report which components are complete and which need refinement
4. **Scaffold**: Ask targeted follow-up questions for incomplete components
5. **Synthesize**: Once all three are present and valid, compile the impact statement

## Examples

### Example 1: Incomplete Population
```
User: "We serve students in Philadelphia who want to go to college"
→ Population: "students" (generic, needs specificity)
→ Geography: "Philadelphia" ✓
→ Long-term Goal: "go to college" → "attend and complete college" ✓

Feedback: "You have geography and a college goal. Let's specify which students. 
What grade level or age group? Are they first-generation? Low-income?"
```

### Example 2: Vague Geography
```
User: "We work with low-income youth in our area"
→ Population: "low-income youth" ✓
→ Geography: "our area" (too vague)
→ Long-term Goal: missing

Feedback: "Good population. Now let's pinpoint your geography. 
Are you in a specific neighborhood, school district, or ZIP code? 
And what's the primary long-term outcome you're working toward?"
```

### Example 3: Complete and Valid
```
User: "We serve 6th-8th grade students in Kensington who will graduate high school and enroll in college"
→ Population: "6th-8th grade students" ✓
→ Geography: "Kensington" ✓
→ Long-term Goal: "graduate high school and enroll in college" ✓

Compiled Impact Statement:
"6th-8th grade students in Kensington will graduate high school and enroll in college."
```

## Common Pitfalls

- **Too generic population**: "students" or "youth" without demographic specificity
- **Too vague geography**: "our community" or "the area" without concrete location
- **Intermediate vs. long-term goal**: Confusing activities ("tutoring") or short-term outcomes ("improved attendance") with long-term impact
- **Multiple populations/geographies**: "All students in the district and surrounding areas" (pick one primary population and geography)

## Integration Points

This skill should be invoked:
1. When user provides any component of intended impact (population, geography, or long-term goal)
2. After LLM extraction of impact-related fields
3. Before allowing progression to implementation section (unless explicitly acknowledged by user)