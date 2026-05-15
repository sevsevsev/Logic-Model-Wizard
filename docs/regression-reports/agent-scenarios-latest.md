# Agent Scenario Report

Generated: 2026-05-15T13:47:16.044Z
API: http://localhost:3300/api/chat
Summary: 18/18 scenarios passed.

## Scenario Results

| Scenario | Status | Failures |
|---|---|---|
| full-e2e-green-haven | PASS | 0 |
| full-e2e-stepup-mentorship | PASS | 0 |
| impact-happy-path | PASS | 0 |
| resources-list-capture | PASS | 0 |
| resources-no-silent-drop | PASS | 0 |
| impact-contradiction-explicit-correction | PASS | 0 |
| impact-ambiguous-input-single-clarifier | PASS | 0 |
| offtopic-smalltalk-no-model-pollution | PASS | 0 |
| long-context-resources-retained-after-multi-section-flow | PASS | 0 |
| extraction-activity-not-outcome | PASS | 0 |
| extraction-mixed-intent-boundary | PASS | 0 |
| extraction-outcome-accuracy | PASS | 0 |
| extraction-resource-bucket-accuracy | PASS | 0 |
| extraction-geography-consistency | PASS | 0 |
| extraction-irrelevant-data-isolation | PASS | 0 |
| coaching-close-enough-then-refine | PASS | 0 |
| resources-persist-through-impact-refinement | PASS | 0 |
| prefill-impact-focus-lock | PASS | 0 |

## full-e2e-green-haven

A high-clarity user providing detailed, structured data across all logic model sections.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact_statement | none | none | impact_statement | analysis_only | 1 | 0 |
| 2 | resources | none | none | resources | analysis_only | 4 | 0 |
| 3 | activities | resources | resources | activities | analysis_only | 4 | 0 |
| 4 | quality_evidence | outputs_metrics | outputs_metrics | quality_evidence | analysis_only | 4 | 0 |
| 5 | outcomes_review | none | none | outcomes_review | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We are starting the Green Haven Community Garden in West Philadelphia. Our goal is to serve local residents by reducing 
A-->>U: intent=impact_statement; buckets=1; That's a great start. The goals of reducing food insecurity and creating a space for community building are a fantastic foundation for your 
U->>A: T2: We have two part-time coordinators, $5,000 in seed grants, donated tools from the city, and a partnership with a local h
A-->>U: intent=resources; buckets=4; Thanks, that's a fantastic list of resources to start with. It sounds like you have a great foundation with staff, funding, and key material
U->>A: T3: We hold weekly planting workshops, maintain 20 raised beds, and run a bi-weekly harvest distribution stand.
A-->>U: intent=activities; buckets=4; Those are very clear activities, thanks for sharing them. They give a great picture of what the program does day-to-day.  Thinking about tho
U->>A: T4: We maintain quality by using organic-only soil standards. For fidelity, we use a weekly checklist to ensure every bed is
A-->>U: intent=quality_evidence; buckets=4; That's excellent information on quality and fidelity. Using organic standards and a weekly checklist are great ways to ensure the garden is 
U->>A: T5: Short term, we want residents to learn basic gardening. Medium term, we expect 200lbs of produce per season. Long term, 
A-->>U: intent=outcomes_review; buckets=4; That's a very helpful breakdown of the changes you hope to see over time. The "200lbs of produce per season" is a fantastic example of a pro
```

## full-e2e-stepup-mentorship

A user providing partial/vague info requiring agent follow-ups and coaching.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |
| 2 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |
| 3 | resources | none | none | resources | analysis_only | 2 | 0 |
| 4 | resources | none | none | resources | analysis_only | 4 | 0 |
| 5 | activities | none | none | activities | analysis_only | 4 | 0 |
| 6 | activities | none | none | activities | analysis_only | 4 | 0 |
| 7 | quality_evidence | none | none | quality_evidence | analysis_only | 4 | 0 |
| 8 | quality_evidence | none | none | quality_evidence | analysis_only | 4 | 0 |
| 9 | outputs_metrics | none | none | none | analysis_only | 4 | 0 |
| 10 | impact_statement | none | none | impact_statement | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We work with high schoolers in the city to help them get jobs.
A-->>U: intent=impact_statement; buckets=0; That's a great mission—helping high schoolers get jobs is so important.  To get started, let's think about the big picture. If your program 
U->>A: T2: Our long-term goal is 100% college or trade school enrollment for our seniors.
A-->>U: intent=impact_statement; buckets=0; That’s a powerful and specific goal. Ensuring 100% of your seniors are enrolled in college or a trade school is a fantastic long-term outcom
U->>A: T3: We have mentors and some funding from a local bank.
A-->>U: intent=resources; buckets=2; Those are definitely important resources for your program! We'll circle back to the mentors and funding in just a bit.  For now, let's finis
U->>A: T4: Oh, we also use a local library for meeting space and a licensed curriculum.
A-->>U: intent=resources; buckets=4; Thanks, those are more great examples of the resources your program uses. We'll be sure to capture the library space and curriculum.  Let's 
U->>A: T5: We do mentorship meetings.
A-->>U: intent=activities; buckets=4; Got it, mentorship meetings are a key activity. We'll be sure to capture that.  Let's quickly try to wrap up the impact statement. We've est
U->>A: T6: Each student meets with a mentor for 2 hours a week to work on college apps and career goals.
A-->>U: intent=activities; buckets=4; Thanks, that's a very clear description of your mentorship meetings. Two hours a week focused on college apps and career goals sounds like a
U->>A: T7: We check in with the mentors often.
A-->>U: intent=quality_evidence; buckets=4; That's a great practice for ensuring the mentorship is high-quality. We can definitely circle back to that when we discuss how you monitor y
U->>A: T8: We use a standardized mentor handbook (fidelity) and require all mentors to have background checks and 10 hours of train
A-->>U: intent=quality_evidence; buckets=4; That's fantastic information. The standardized handbook, background checks, and training are all excellent examples of how you ensure your m
U->>A: T9: We want them to succeed.
A-->>U: intent=outputs_metrics; buckets=4; Of course—their success is the ultimate goal, and that's a perfect way to put it.  Based on what you've said, we have a really strong draft 
U->>A: T10: Short term is completing one college app. Medium term is getting an acceptance letter. Long term is that enrollment goal
A-->>U: intent=impact_statement; buckets=4; That's a fantastic way to map out the student journey! Seeing the progression from completing an application, to getting an acceptance lette
```

## impact-happy-path

All-in-one impact statement is captured and confirmed.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |
| 2 | resources | none | none | none | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We serve middle school students in North Philadelphia and our long-term goal is that they read on grade level and transi
A-->>U: intent=impact_statement; buckets=0; That's a clear and powerful goal. Having students read on grade level and successfully transition to high school are crucial long-term outco
U->>A: T2: Yes, that captures it.
A-->>U: intent=resources; buckets=0; Excellent, we'll use that as our guiding impact statement.  To make that happen, a program needs resources. Let's start with the people invo
```

## resources-list-capture

When user provides a resource list, the patch captures multiple resource buckets.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | resources | resources | resources | resources | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We have program staff, volunteers, partner counselors, curriculum materials, laptops, grant funding, and staff training.
A-->>U: intent=resources; buckets=4; Thanks, that's a great list of the key resources you have in place.  Now, let's think about the big picture. What is the ultimate, long-term
```

## resources-no-silent-drop

Resource response should not be ignored across turns and should keep resources in model state.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | resources | resources | resources | resources | analysis_only | 3 | 0 |
| 2 | impact | none | none | none | analysis_only | 3 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: Staff mentors, school partners, donated laptops, grant funding, and evidence-based training.
A-->>U: intent=resources; buckets=3; Thanks, that gives me a clear picture of the resources your program relies on.  Now, let's think about the ultimate goal. What is the long-t
U->>A: T2: Anything else you need from me on resources?
A-->>U: intent=impact; buckets=3; No, that list is very clear for now. We can always come back to it if anything else comes to mind.  So, thinking about that big-picture goal
```

## impact-contradiction-explicit-correction

User explicitly corrects captured geography; model should reflect corrected value.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |
| 2 | impact | none | none | none | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We serve middle school students in North Philadelphia and want them to read on grade level by high school.
A-->>U: intent=impact_statement; buckets=0; That's a great goal. Having students read on grade level is a powerful outcome.  For the logic model, the 'impact' describes the ultimate, l
U->>A: T2: Correction: not North Philadelphia, it's West Philadelphia.
A-->>U: intent=impact; buckets=0; Thanks for that correction. I've updated the location to West Philadelphia.  So, thinking about those students in West Philadelphia who beco
```

## impact-ambiguous-input-single-clarifier

Vague impact statement should trigger focused clarification before section jump.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact | none | none | none | analysis_only | 0 | 0 |
| 2 | impact | none | none | none | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We want youth to thrive and succeed.
A-->>U: intent=impact; buckets=0; That's a powerful goal to have for your program.  To help bring that vision into focus for the logic model, it can be helpful to describe th
U->>A: T2: Specifically, high school youth in Kensington graduating on time.
A-->>U: intent=impact; buckets=0; Thank you, that's much more specific. Focusing on high school youth in Kensington and their on-time graduation really helps clarify the prog
```

## offtopic-smalltalk-no-model-pollution

Off-topic small talk should redirect without writing unrelated model data.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact | none | none | none | analysis_only | 0 | 0 |
| 2 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: By the way, what's your favorite movie?
A-->>U: intent=impact; buckets=0; I can help with your logic model, but I'm going to stay focused on that work. If you want to continue, tell me more about your intended impa
U->>A: T2: Okay, we serve elementary students in South Philly and want stronger reading outcomes.
A-->>U: intent=impact_statement; buckets=0; Thanks, that's a great start. Focusing on stronger reading outcomes for elementary students in South Philly is a very clear goal.  An impact
```

## long-context-resources-retained-after-multi-section-flow

Resources captured early should persist after activity, quality, and outcome turns.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | resources | none | none | resources | analysis_only | 3 | 0 |
| 2 | activities | outputs_metrics | outputs_metrics | activities | analysis_only | 3 | 0 |
| 3 | quality_evidence | none | none | quality_evidence | analysis_only | 3 | 0 |
| 4 | outputs_metrics | outputs_metrics | outputs_metrics | outputs_metrics | analysis_only | 3 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: Our resources are staff mentors, donated tablets, grant funding, and evidence-based training.
A-->>U: intent=resources; buckets=3; Thanks, that's a great start for your resources. We can circle back to those details later.  For now, let's think about the big picture. Wha
U->>A: T2: Main activities are weekly tutoring sessions and family literacy workshops.
A-->>U: intent=activities; buckets=3; Got it. So, the core of your program is the weekly tutoring sessions and the family literacy workshops.  To help connect the dots, who typic
U->>A: T3: For quality, we do facilitator observations; for fidelity, we use session checklists.
A-->>U: intent=quality_evidence; buckets=3; Those are great, concrete methods for tracking how the program is delivered. It's smart to be thinking about both quality and fidelity.  Whe
U->>A: T4: Short term: stronger reading confidence. Medium term: improved attendance. Long term: grade-level proficiency.
A-->>U: intent=outputs_metrics; buckets=3; That's a very clear progression from stronger confidence to better attendance, and ultimately to grade-level proficiency.  That final outcom
```

## extraction-activity-not-outcome

Activity language should not be incorrectly placed in outcomes; agent must route to activities section.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | activities | none | none | activities | analysis_only | 0 | 0 |
| 2 | activities | outputs_metrics | outputs_metrics | activities | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We hold weekly one-on-one coaching sessions with participants.
A-->>U: intent=activities; buckets=0; Thanks for sharing that. So, the core of your program involves weekly one-on-one coaching sessions.  To start thinking about the overall goa
U->>A: T2: Each session is 60 minutes and focuses on skill-building.
A-->>U: intent=activities; buckets=0; That's helpful detail. So the sessions are an hour long and dedicated to building skills.  Thinking about that long-term change again, if pa
```

## extraction-mixed-intent-boundary

When user mixes activities and outcomes in one turn, agent should extract both to correct sections without cross-contamination.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | activities | activities | activities | activities | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We run monthly workshops where participants build professional portfolios. After six months, we expect 80% to have job i
A-->>U: intent=activities; buckets=0; That's a fantastic outcome. Having 80% of your participants scheduling interviews is a clear sign of success.  Thinking bigger, if they succ
```

## extraction-outcome-accuracy

Outcomes must be correctly classified into short/medium/long term based on temporal language.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: Immediately, we want students to feel welcomed. Within three months, we expect better attendance. Within two years, we h
A-->>U: intent=impact_statement; buckets=0; Thanks for sharing that timeline. It gives a great sense of how you see the program's effects unfolding, from the immediate feeling of being
```

## extraction-resource-bucket-accuracy

Resources must be placed into correct category buckets (human, material, financial, knowledge).

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | resources | resources | resources | resources | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We have program directors and peer mentors (people). We use curriculum workbooks and laptops (materials). We receive fou
A-->>U: intent=resources; buckets=4; Thanks, that's a clear picture of the resources you're working with.  Now let's think about the big picture. In the long term, what is the u
```

## extraction-geography-consistency

Geography should be accurately extracted and maintained across turns; corrections should update the model.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |
| 2 | impact | none | none | none | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We work in South Philadelphia and serve students from three schools there.
A-->>U: intent=impact_statement; buckets=0; Got it. It's helpful to know that your program is focused on students from those three schools in South Philadelphia.  To get started, let's
U->>A: T2: Actually, we also include students from West Philadelphia now.
A-->>U: intent=impact; buckets=0; Thanks for that correction. So your program serves students from schools in both South and West Philadelphia.  With that in mind, let's thin
```

## extraction-irrelevant-data-isolation

Irrelevant or conversational data should not corrupt the logic model; unrelated statements stay out of section fields.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact_statement | none | none | impact_statement | analysis_only | 0 | 0 |
| 2 | geography | geography | geography | geography | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: How's the weather today? Anyway, our program serves youth in underserved neighborhoods.
A-->>U: intent=impact_statement; buckets=0; The weather's great, thanks for asking!  It's helpful to know that your program focuses on youth in underserved neighborhoods. To get a bit 
U->>A: T2: That's nice. So our long-term goal is college readiness.
A-->>U: intent=geography; buckets=0; That's a great, clear goal. "College readiness" definitely points toward the ultimate change you're trying to create.  To make that as speci
```

## coaching-close-enough-then-refine

Agent should capture close-enough user language during collection and support wording polish when the user requests refinement.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | outputs_metrics | outputs_metrics | outputs_metrics | outputs_metrics | analysis_only | 1 | 0 |
| 2 | outputs_metrics | outputs_metrics | outputs_metrics | outputs_metrics | analysis_only | 1 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: Short term, 85% of participants attend regularly. Medium term, they complete job readiness training.
A-->>U: intent=outputs_metrics; buckets=1; Thanks, that's a helpful start.  Regular attendance is a great sign of engagement. We can think of that as a key behavior. Short-term outcom
U->>A: T2: Great, now let's polish the wording and make it logic-model appropriate.
A-->>U: intent=outputs_metrics; buckets=1; Of course. Let's focus on defining the program's intended impact.  This is the big-picture, community-level change you hope to contribute to
```

## resources-persist-through-impact-refinement

Resources captured before intended-impact refinement should remain populated after subsequent impact turns.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | resources | none | none | resources | analysis_only | 4 | 0 |
| 2 | impact | none | none | none | analysis_only | 4 | 0 |
| 3 | impact | none | none | none | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: Our resources include program staff, curriculum materials, grant funding, and trauma-informed training expertise.
A-->>U: intent=resources; buckets=4; Thanks, that's a clear list of what you're working with—the staff, funding, curriculum, and expertise.  Now, let's think about the big pictu
U->>A: T2: Let's begin with intended impact.
A-->>U: intent=impact; buckets=4; Perfect. For the intended impact, we want to capture the ultimate, big-picture change you're aiming for.  Who are you serving, and what is t
U->>A: T3: The STEM workforce in Philadelphia will be more representative of the demographics of our city.
A-->>U: intent=impact; buckets=4; That's a powerful and clear goal for the future of Philadelphia's STEM workforce. It nicely captures the high-level, community-wide change y
```

## prefill-impact-focus-lock

With prefilled implementation data, selecting intended impact should keep the assistant in impact refinement until release.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | activities | none | none | activities | analysis_only | 4 | 0 |
| 2 | impact | none | none | none | analysis_only | 4 | 0 |
| 3 | impact | none | none | impact_statement | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: Our resources include program staff, curriculum materials, grant funding, and trauma-informed training expertise. We run
A-->>U: intent=activities; buckets=4; Thanks, that gives us a clear picture of your resources and key activities.  Now let's think about the big picture. If your program is succe
U->>A: T2: Let's begin with intended impact.
A-->>U: intent=impact; buckets=4; Of course. To start, could you describe the ultimate, long-term change you hope to see for the youth you serve?
U->>A: T3: The intended impact is that youth in West Philadelphia graduate high school prepared for postsecondary pathways.
A-->>U: intent=impact; buckets=4; That's a strong goal, and it clearly describes a critical milestone for the young people you serve.  An impact statement often takes that on
```