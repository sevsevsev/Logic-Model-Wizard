# Prompt Architecture (Minimal)

Status: Active
Date: 2026-05-11

## Objective

Use a very simple system prompt that leans on Gemini's default reasoning while preserving structured outputs and vector-grounded coaching quality.

## Design Rules

1. Keep static prompt compact.
2. Keep strict constraints only for output shape and parsing.
3. Avoid long scripted sequencing text in prompt copy.
4. Use retrieved vector context as guidance, not as user-confirmed data.
5. Let runtime guardrails own safety-critical behavior.

## Runtime Contract

### Legacy route prompt

- Visible coaching response
- Hidden tags in response text:
  - `<question_intent>...</question_intent>`
  - `<model_patch>{...}</model_patch>`

### Agentic prompt

- Strict JSON schema with fields used by parser/validator.
- No hidden chain-of-thought requirements.
- Include an explicit `question_plan` object so the model states whether it should ask, confirm, or simply answer.

## Where Control Lives

Prompt layer:
- Role framing
- Concise style guidance
- Output contract
- Retrieval usage guidance
- Lightweight question-planning contract

Code guardrails:
- Domain-scoped patch constraints
- Deterministic phase enforcement
- Impact acceptance gating
- Schema validation and sanitization
- Fallback behavior

## Retrieval Policy

1. Retrieve top-k snippets by semantic relevance.
2. Retrieve an additional compact concept set keyed off current phase and missing fields when question framing is needed.
3. Inject compact evidence block only.
4. Use snippets to sharpen definitions, distinctions, and the next question's wording.
5. Never auto-promote snippets to user facts.
6. If user facts conflict with retrieval text, user facts win.

## Question Planning Rules

1. Decide explicitly whether the turn should answer only, confirm a draft, or ask one focused question.
2. If the user asked a concept question, answer it directly before considering a follow-up.
3. If all inputs for a synthesis are already present, prefer confirmation over another open-ended ask.
4. If the next ask targets a known fact, validators should suppress it and set `question_plan.shouldAsk=false`.
5. Use conceptual retrieval to improve framing, not to manufacture project facts.

## Canonical Impact Guidance

1. Treat the evolving impact statement draft as the canonical conversational artifact.
2. Treat `population`, `geography`, and `long_term_goal` as derived internal facets unless the user is explicitly refining one of them.
3. When the user gives a full impact sentence, store and confirm that sentence before decomposing it into facet memory.
4. Ask facet-specific follow-ups only when the statement is ambiguous, underspecified, or internally inconsistent.
5. Keep derived facets available for retrieval, validation, and downstream scaffolding, but do not force the conversation to mirror the storage schema.

## Anti-Patterns To Avoid

- Prompting with exhaustive rule trees for every turn.
- Duplicating code guardrail logic in prompt prose.
- Forcing fixed wording templates in user-facing replies.
- Treating retrieved examples as confirmed project details.

## Evaluation Checklist

1. Prompt token size is materially smaller than prior version.
2. Response quality remains high for concept questions.
3. Progression does not regress after impact acceptance.
4. Cross-domain contamination stays blocked by guardrails.
5. Retrieval improves specificity without causing factual drift.
