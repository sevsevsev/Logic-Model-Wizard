# Agent Scenario Report

Generated: 2026-05-14T10:51:52.574Z
API: http://localhost:3100/api/chat
Summary: 5/5 scenarios passed.

## Scenario Results

| Scenario | Status | Failures |
|---|---|---|
| full-e2e-green-haven | PASS | 0 |
| full-e2e-stepup-mentorship | PASS | 0 |
| impact-happy-path | PASS | 0 |
| resources-list-capture | PASS | 0 |
| resources-no-silent-drop | PASS | 0 |

## full-e2e-green-haven

A high-clarity user providing detailed, structured data across all logic model sections.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact | none | none | none | analysis_only | 1 | 0 |
| 2 | resources | geography | geography | resources | analysis_only | 4 | 0 |
| 3 | activities | none | none | activities | analysis_only | 4 | 0 |
| 4 | quality_evidence | outputs_metrics | outputs_metrics | quality_evidence | analysis_only | 4 | 0 |
| 5 | outcomes_review | none | none | outcomes_review | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We are starting the Green Haven Community Garden in West Philadelphia. Our goal is to serve local residents by reducing 
A-->>U: intent=impact; buckets=1; That sounds like a wonderful initiative for West Philadelphia. Reducing food insecurity and building community are powerful goals.  Could yo
U->>A: T2: We have two part-time coordinators, $5,000 in seed grants, donated tools from the city, and a partnership with a local h
A-->>U: intent=resources; buckets=4; Thanks for sharing that. It's helpful to know what you're working with. Two part-time coordinators, the grant money, donated tools, and an e
U->>A: T3: We hold weekly planting workshops, maintain 20 raised beds, and run a bi-weekly harvest distribution stand.
A-->>U: intent=activities; buckets=4; Great, that gives me a clear picture of the day-to-day work: the workshops, bed maintenance, and the harvest stand.  Thinking about those ac
U->>A: T4: We maintain quality by using organic-only soil standards. For fidelity, we use a weekly checklist to ensure every bed is
A-->>U: intent=quality_evidence; buckets=4; It's great that you have clear standards for quality and fidelity. The organic-only rule and the weekly checklist will definitely help keep 
U->>A: T5: Short term, we want residents to learn basic gardening. Medium term, we expect 200lbs of produce per season. Long term, 
A-->>U: intent=outcomes_review; buckets=4; Those are excellent goals, connecting the immediate skills residents learn to the long-term health of the community. That 200lbs of produce 
```

## full-e2e-stepup-mentorship

A user providing partial/vague info requiring agent follow-ups and coaching.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact | none | none | none | analysis_only | 0 | 0 |
| 2 | long_term_help | long_term_help | long_term_help | long_term_help | analysis_only | 0 | 0 |
| 3 | resources | none | none | resources | analysis_only | 3 | 0 |
| 4 | resources | none | none | resources | analysis_only | 4 | 0 |
| 5 | activities | resources | resources | activities | analysis_only | 4 | 0 |
| 6 | activities | none | none | activities | analysis_only | 4 | 0 |
| 7 | quality_evidence | none | none | quality_evidence | analysis_only | 4 | 0 |
| 8 | quality_evidence | none | none | quality_evidence | analysis_only | 4 | 0 |
| 9 | outputs_metrics | outputs_metrics | outputs_metrics | outputs_metrics | analysis_only | 4 | 0 |
| 10 | outcomes_review | outputs_metrics | outputs_metrics | outcomes_review | analysis_only | 4 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We work with high schoolers in the city to help them get jobs.
A-->>U: intent=impact; buckets=0; That sounds like a great program. Thinking about the big picture, what is the ultimate change you hope this program creates for these high s
U->>A: T2: Our long-term goal is 100% college or trade school enrollment for our seniors.
A-->>U: intent=long_term_help; buckets=0; That's a powerful and clear goal for your students.  To help them achieve that, what are some of the main things your program does with the 
U->>A: T3: We have mentors and some funding from a local bank.
A-->>U: intent=resources; buckets=3; It's great that you have dedicated mentors and financial support from the bank. Those are important resources.  What do the mentors typicall
U->>A: T4: Oh, we also use a local library for meeting space and a licensed curriculum.
A-->>U: intent=resources; buckets=4; Got it, so a dedicated meeting space and a licensed curriculum are also key parts of your program.  Thinking about that curriculum and the m
U->>A: T5: We do mentorship meetings.
A-->>U: intent=activities; buckets=4; That makes sense. What kinds of things do the mentors and students typically work on together during those meetings?
U->>A: T6: Each student meets with a mentor for 2 hours a week to work on college apps and career goals.
A-->>U: intent=activities; buckets=4; That's a very clear and focused activity. It makes sense how working on college apps and career goals for two hours a week would lead to you
U->>A: T7: We check in with the mentors often.
A-->>U: intent=quality_evidence; buckets=4; That sounds like a great way to support the mentors and ensure the program is running smoothly. What do you typically discuss during those c
U->>A: T8: We use a standardized mentor handbook (fidelity) and require all mentors to have background checks and 10 hours of train
A-->>U: intent=quality_evidence; buckets=4; That's great. Having a handbook, training, and background checks are all excellent ways to make sure the mentoring is high-quality and consi
U->>A: T9: We want them to succeed.
A-->>U: intent=outputs_metrics; buckets=4; Of course, their success is the ultimate goal.  And about how many students are you able to provide this support to in a typical school year
U->>A: T10: Short term is completing one college app. Medium term is getting an acceptance letter. Long term is that enrollment goal
A-->>U: intent=outcomes_review; buckets=4; That's a very clear pathway from the immediate next step to the ultimate goal.  Thinking about what comes even before completing that first 
```

## impact-happy-path

All-in-one impact statement is captured and confirmed.

Turn trace:

| Turn | finalIntent | stateIntent | responseDomain | effectiveDomain | patchSource | resourceBucketsInPatch | turnFailures |
|---|---|---|---|---|---|---:|---|
| 1 | impact | none | none | none | analysis_only | 0 | 0 |
| 2 | resources | none | none | none | analysis_only | 0 | 0 |

```mermaid
sequenceDiagram
participant U as User
participant A as Agent
U->>A: T1: We serve middle school students in North Philadelphia and our long-term goal is that they read on grade level and transi
A-->>U: intent=impact; buckets=0; Thanks, that's a great goal for your students.  Thinking about the bigger picture, what is the long-term change you hope to see in the North
U->>A: T2: Yes, that captures it.
A-->>U: intent=resources; buckets=0; Great. To make that work possible, could you tell me a bit about the staff or key personnel involved in your program?
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
A-->>U: intent=resources; buckets=4; That's a very clear picture of the resources you have.  So, what's the ultimate, long-term change you're hoping to create with this program?
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
A-->>U: intent=resources; buckets=3; Thanks, that's a helpful list of the resources your program relies on.  Thinking about the big picture, what is the ultimate, long-term chan
U->>A: T2: Anything else you need from me on resources?
A-->>U: intent=impact; buckets=3; No, that's a solid list of resources to start with, thank you. We can always come back and add more detail later.  So, whenever you're ready
```