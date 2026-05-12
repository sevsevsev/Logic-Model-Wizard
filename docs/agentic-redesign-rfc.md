# Agentic Redesign RFC

Status: Active
Branch: feature/agentic-redesign-rag-memory
Date: 2026-05-08
Owner: Product + Engineering

## Goal

Redesign the chatbot from a primarily heuristic pipeline to an adaptive, retrieval-grounded, state-aware agent that can handle non-linear logic-model conversations while preserving strict faithfulness to canonical framework rules.

## Prompt posture (updated)

We now prefer a minimal prompt architecture:
- Keep instructions short and durable.
- Keep strict formatting constraints only where parsing requires them.
- Push progression, acceptance, and domain-safety controls into deterministic code guardrails.
- Use vector retrieval for topical grounding rather than rigid scripted flow control.

## Current Constraints

The current architecture has important strengths (deterministic progression, explicit acceptance gating, testable guardrails), but it still depends on:

- Large static prompt payloads for domain guidance.
- Regex-heavy intent and extraction fallbacks.
- Session-only memory of model state (limited longitudinal context).
- Limited automated quality evaluation of model patches.

## Current State Assessment

The project has made real progress, but the current architecture still spreads conversational control across too many layers. The result is that the agent is often not the real decision-maker, even when the app appears agentic on the surface.

### What is working well

- Guardrail predicates for specificity, acceptance, and phase progression are strong and well tested.
- The impact statement is now moving toward the right abstraction boundary: a canonical draft with derived facets.
- Retrieval has a safe degradation path, which keeps the app usable even when vector infrastructure is unavailable.
- The UI already supports a good basic workflow: intake, prefill, follow-up, live logic model display, and draft persistence.

### What is still dragging quality down

1. Route-level heuristics still rewrite or constrain the agent after it has reasoned.
2. Multiple extraction paths still compete to populate the model on the same turn.
3. Compiled impact statement logic still has more than one effective owner.
4. Turn-state signals are too shallow for reliable coaching-quality decisions.
5. Retrieval is only partially adaptive; it is still driven more by phase templates than by the actual unresolved ambiguity in the conversation.
6. Quality analysis is discussed in the RFC but is not yet strategically inserted into the live loop.
7. Evaluation coverage is still too narrow relative to the behavioral quality being asked of the product.

## Product Goal Clarification

The desired behavior is not just "ask the next missing question." The app should reliably do five things:

1. Ingest initial information from document upload or intake text and create a usable first-pass working draft.
2. Ask clear, focused, non-repetitive coaching questions that follow naturally from what the user just said.
3. Use retrieved framework knowledge to assess alignment to logic-model criteria without confusing retrieved guidance with user facts.
4. Decide when quality analysis is worth running, rather than scoring everything on every turn.
5. Help the user build a stronger logic model with minimal friction, not expose the internal schema as the conversation structure.

That means the target architecture should optimize for conversational control, patch faithfulness, and selective quality review rather than simply more prompt detail.

## Target Architecture

### 1) Retrieval-Grounded Knowledge Layer (RAG)

Objective: Provide only the most relevant framework snippets per turn.

Design:
- Keep short global principles static (foundation, style, safety constraints).
- Move bulky domain knowledge (glossary examples, population taxonomy, sequencing examples) to a retrieval index.
- Retrieve top-k relevant chunks per user turn and inject them as a compact evidence block.

Proposed components:
- `src/lib/rag/chunking.ts`: split knowledge docs into semantically coherent chunks.
- `src/lib/rag/embeddings.ts`: embedding generation abstraction.
- `src/lib/rag/retrieval.ts`: top-k retrieval API with optional reranking.
- `src/lib/rag/types.ts`: chunk metadata schema (`source`, `topic`, `version`, `rule_type`).

Storage path options:
- Postgres + `pgvector` in production.
- JSON fallback for local/dev (no vector search, basic keyword fallback).

Success metrics:
- Reduce prompt token size on average.
- Increase citation quality (retrieved snippets should match user task intent).

### 2) Unified Structured Turn (Single-Pass Agent Output)

Objective: Replace fragmented heuristic extraction with one structured model output.

Design:
- Ask model for structured output sections in one response:
  - `assistant_reply`
  - `question_intent`
  - `question_plan`
  - `model_patch`
  - `confidence`
  - `evidence_refs` (which retrieved chunks justify the patch)
- Treat `model_patch` as authoritative only when schema-valid and guardrail-valid.
- Keep prompt guidance brief and rely on runtime validators for safety-critical behavior.

`question_plan` should make the next-turn posture explicit instead of leaving it implicit inside prose:
- `shouldAsk`: whether the turn should end with a question at all.
- `targetField`: the single field or confirmation target the question is trying to resolve.
- `goal`: the conversational objective for the next turn.
- `draftQuestion`: one focused user-facing question when `shouldAsk=true`.
- `conceptualTopics`: which conceptual retrieval themes shaped the question framing.

Important note:
- Do not require or persist hidden chain-of-thought content.
- If reasoning transparency is needed, request a concise `decision_summary` field instead of free-form internal reasoning traces.

Proposed components:
- `src/lib/agent/schema.ts`: zod/json-schema for model output.
- `src/lib/agent/validate.ts`: parser + schema validation + repair strategy.
- `src/lib/agent/executeTurn.ts`: orchestration (retrieve -> call model -> validate -> apply guardrails).

Success metrics:
- Lower mismatch rate between visible question and emitted intent.
- Fewer fallback extraction passes.

### 2A) Question Planning as a First-Class Step

Objective: Reduce brittle prompting by making the agent explicitly choose between answering, confirming, and asking.

Design:
- Treat question framing as a planning task, not just a style side effect.
- For each turn, the agent should classify the next move into one of three postures:
  - answer only
  - confirm a synthesized draft
  - ask one focused next-step question
- Use the turn brief plus deterministic known-fact checks to suppress stale or repetitive questions.
- Ground question framing with conceptual retrieval, not just lexical similarity to the latest user message.

Retrieval behavior:
- Run one retrieval pass against the literal user turn for topical grounding.
- Run a second retrieval pass against a concept query derived from current phase and missing fields.
- Merge both result sets and keep a compact evidence block.
- Use the concept retrieval results to improve distinctions, confirmation wording, and the shape of the next question.

Why this should be less brittle:
- The model no longer has to infer questioning posture entirely from prose instructions.
- Conceptual chunks can steer the phrasing toward the right distinction even when the user's wording is sparse or noisy.
- Runtime validators can compare `question_intent` and `question_plan` for consistency before the route applies rewrites.

Success metrics:
- Fewer turns that re-ask already confirmed facts.
- Fewer turns that bundle multiple asks into one reply.
- Better match between missing-field state and the question actually asked.

### 2B) Canonical Impact Statement, Derived Facets

Objective: Reduce brittle extraction bugs by making the impact statement the primary artifact and treating population/geography as internal derived memory rather than primary conversation fields.

Recommendation:
- Do not make `population` and `geography` the main user-facing contract.
- Make the evolving intended impact statement draft the canonical artifact during conversation.
- Derive `population`, `geography`, and `long_term_goal` as internal facets from the accepted draft and from confirmed user wording.
- Persist those facets for retrieval, validation, and downstream scaffolding, but treat them as support state rather than the source of truth.

Why this is a better fit:
- Today many bugs come from field-level extraction trying to classify a free-form sentence into the right slot before the sentence itself is stable.
- Users naturally speak in complete ideas like "middle school students in Kensington will stay on track to graduate," not in isolated field updates.
- The system already needs the full sentence for review and confirmation, so the sentence is the right place to anchor conversational memory.

What should stay explicit internally:
- `compiled_statement` or an equivalent canonical impact draft.
- Derived facets for `population`, `geography`, and `long_term_goal`.
- Provenance for each facet: `user_stated`, `derived_from_statement`, `assistant_inferred`.
- Confidence or confirmation status so the agent knows whether to ask a refinement question or just carry context forward.

What should change in behavior:
- Ask for missing meaning in natural language, not by naming internal fields unless the user needs that framing.
- Prefer prompts like "Who is this impact statement really about?" or "What place should this statement be anchored to?" over rigid field-collection phrasing.
- When the user gives a full intended impact sentence, store the sentence first and derive the facets second.
- Only surface the facet-level distinction when it helps disambiguate or improve specificity.

Migration path:
1. Keep the existing schema for compatibility.
2. Reclassify `population` and `geography` as derived support fields in the agent contract and validators.
3. Make `compiled_statement` the primary object used for review and progression.
4. Move phase logic from "field empty/non-empty" toward "impact statement has unresolved facet ambiguity."
5. Only consider removing the explicit fields from persisted schema after the route, draft, bootstrap, and guardrail layers no longer depend on them directly.

Decision:
- Short term: keep the fields in storage and APIs.
- Medium term: stop treating them as the primary conversation target.
- Long term: consider replacing them with derived facet memory if downstream consumers no longer require direct fields.

### 3) Stateful Memory (Session + Cross-Project)

Objective: Improve continuity and reduce repeated elicitation.

Memory layers:
- Session memory (current logic model draft + conversation trajectory).
- Project memory (prior versions and accepted statements for same project).
- User/org memory (prior completed models, reusable resource/activity patterns).

Guardrails for memory use:
- Memory suggestions are proposals only; never auto-apply without user confirmation.
- Distinguish inferred defaults from user-confirmed values.
- Annotate patch provenance (`user_stated`, `retrieved_default`, `assistant_inferred`).

Proposed components:
- `src/lib/memory/sessionMemory.ts`
- `src/lib/memory/projectMemory.ts`
- `src/lib/memory/suggestionEngine.ts`

Success metrics:
- Reduced repeated clarification questions for known contexts.
- Higher acceptance rate of suggested defaults.

### 4) Adaptive State-Aware Guidance

Objective: Make progression quality-aware, not only emptiness-aware.

Design:
- Replace binary checks (field empty/non-empty) with quality scoring:
  - specificity score for population/geography.
  - measurability score for outcomes.
  - causal completeness score across outcome chain.
- Allow controlled backtracking when data quality is insufficient.

Proposed components:
- `src/lib/quality/scoring.ts`
- `src/lib/quality/backtrackPolicy.ts`

Success metrics:
- Fewer vague accepted statements.
- Better downstream outcome coherence.

### 4A) Strategic Quality Analysis

Objective: Run quality analysis when it creates leverage, not on every turn.

Recommendation:
- Do not run full quality scoring continuously.
- Trigger quality analysis only at strategic checkpoints where the user has produced enough material for a useful judgment.

Recommended checkpoints:
1. After the first plausible intended impact draft is assembled.
2. After resources and activities are both populated.
3. After a full short/medium/long outcome chain exists.
4. Before any "looks complete" or "move on" suggestion.
5. After document bootstrap when the system has high-confidence prefill but low clarity on causal logic.

Quality analysis outputs should be lightweight:
- `quality_summary`: one short summary sentence.
- `quality_flags`: a few concrete issues only.
- `quality_next_action`: one recommended coaching move.

Quality analysis should not directly rewrite the model. It should inform question planning and section-level review.

### 5) Evaluation and Faithfulness

Objective: Systematically detect hallucination and rule violations.

Design:
- Build replay/eval harness using real or synthetic transcripts.
- Add LLM-as-judge rubric for:
  - sequencing validity,
  - patch faithfulness to user input,
  - no premature finalization,
  - question clarity and atomicity.
- Keep deterministic unit tests for guardrails.

Proposed components:
- `scripts/evals/run-transcript-evals.ts`
- `scripts/evals/judges/faithfulness.ts`
- `scripts/evals/judges/sequencing.ts`
- `scripts/evals/cases/*.json`

Success metrics:
- Guardrail violation rate trend.
- Judge scores over benchmark transcripts.

## Implementation Phases

### Phase A: Foundations (1-2 sprints)
- Add RAG interfaces and local keyword fallback.
- Introduce unified structured output schema.
- Build orchestration shim beside existing route logic.

### Phase B: Controlled Migration (1-2 sprints)
- Dual-run mode: compare legacy vs agentic outputs in logs.
- Keep legacy path as fallback behind feature flag.
- Add transcript eval harness and baseline scorecards.

### Phase C: Memory + Quality Adaptation (2+ sprints)
- Add project/user memory with explicit provenance.
- Add quality scoring and controlled backtracking.
- Promote agentic path to default if quality thresholds pass.

## Feature Flags

- `ENABLE_AGENTIC_TURN=true|false`
- `ENABLE_RAG_RETRIEVAL=true|false`
- `ENABLE_LONG_TERM_MEMORY=true|false`
- `ENABLE_QUALITY_BACKTRACKING=true|false`
- `AGENTIC_DUAL_RUN=true|false`

## Risks and Mitigations

Risk: Over-autonomy causing incorrect patch updates.
Mitigation: schema validation + explicit acceptance checks + provenance tagging.

Risk: Retrieval returns irrelevant chunks.
Mitigation: metadata filtering + reranking + retrieval eval set.

Risk: Question planning becomes another verbose prompt scaffold.
Mitigation: keep the plan schema compact and validate it in code; use retrieval to supply distinctions instead of embedding long questioning rules in the static prompt.

Risk: Loss of deterministic behavior.
Mitigation: preserve existing guardrails and run dual mode until thresholds are met.

Risk: Prompt token creep.
Mitigation: hard token budget for retrieved context and compact static prompt mode.

Risk: Over-prescriptive prompts causing brittle behavior regressions.
Mitigation: minimal prompt baseline, with deterministic route-level controls for progression and patch scoping.

## Immediate Next Tasks

1. Create `src/lib/agent` and `src/lib/rag` module skeletons.
2. Add JSON schema for unified model output and parser tests.
3. Add `ENABLE_AGENTIC_TURN` gated route branch in `src/app/api/chat/route.ts`.
4. Create initial eval corpus from existing feedback/debug reports.
5. Define quality gates for rollout decision.

## Recommended Next-Stage Architecture

The next stage should simplify control flow rather than add more heuristics.

### A. Make the agent the planner, not the route

- The agent should own question choice, coaching posture, and primary patch proposal.
- The route should become defensive infrastructure: parsing, validation, explicit safety checks, and deterministic disambiguation only.
- Route-level rewrites should shrink dramatically; where possible they should move into the agent brief as constraints rather than post-hoc overrides.

### B. Reduce to one primary patch path per turn

- Agent patch generation should be the default path.
- Fallback extraction should run only when the agent output is missing, invalid, or low-confidence.
- Heuristic merges should be traceable and narrowly scoped to filling obvious omissions rather than co-owning the patch.

### C. Give the agent richer state than flat missing fields

- Replace flat missing-field state with prioritized unresolved items.
- Include urgency, confidence, and ambiguity markers.
- Support unresolved impact-statement facets, unresolved implementation details, and unresolved outcome-chain gaps as distinct planning objects.

### D. Let retrieval serve the actual ambiguity

- Retrieval should be driven by the specific ambiguity the agent is trying to resolve, not only the current phase.
- The system should support both default retrieval and agent-requested retrieval queries.
- Evidence should map clearly to either coaching support, criterion checks, or clarification support.

### E. Insert selective quality checks into the live loop

- Run section-level quality analysis only at checkpoints.
- Feed the result back into question planning, not directly into the patch.
- Track whether the agent used a quality checkpoint and whether the resulting question improved the section.

### F. Treat bootstrap as draft generation, not extraction only

- Intake text and uploaded documents should produce a first-pass working draft plus confidence and gap metadata.
- Bootstrap should say what it believes, what is uncertain, and what the highest-value next question is.
- When uploads prefill multiple sections, the handoff should offer a user-choice entry point (for example, intended impact, implementation, or outcomes) instead of forcing a rigid next-step order.
- This should feel like a coached handoff into chat, not a separate extraction subsystem.

### G. Build evaluation before another major prompt rewrite

- The system is now complex enough that prompt iteration without stronger evals will mostly move defects around.
- The next phase should measure question quality, sequencing quality, patch fidelity, and section-level improvement across replayed conversations.

### H. Add concept traceability as an internal diagnostic view

- Capture per-turn concept coding traces that map user text spans to retrieved framework chunks with rationale and action hints.
- Keep grading/coding outputs internal, while using them to shape low-friction coaching prompts.
- Support collaborator adjudication of coding links and aggregate analytics (unmatched spans, high-ambiguity concepts, dominant topic drift).

## Prioritized Implementation Plan

### Quick wins (1-3 days)

1. Consolidate compiled impact statement synthesis and acceptance into one owning function.
2. Make fallback extraction conditional on agent confidence or parse failure, not a routine parallel owner.
3. Add richer prioritization to the turn brief: urgency and unresolved ambiguity, not just missing field names.
4. Add explicit trace metadata for patch source so debugging reflects which system actually shaped the final turn.

### Medium changes (1-2 weeks)

1. Move route rewrites into agent-side constraints and shrink post-hoc response mutation.
2. Add a question-plan consistency validator between agent output and final route reply.
3. Build a small replay set of representative conversations spanning intake, bootstrap, impact drafting, implementation, and outcomes.
4. Add the first strategic quality checkpoint for intended impact.

### Larger bets (2-4 weeks)

1. Add agent-controlled retrieval requests for clarification and criterion checking.
2. Add section-level quality scoring for implementation and outcomes.
3. Introduce project/session memory with explicit provenance for accepted facts and reusable defaults.
4. Add transcript-level evaluation and judge-style rubrics for clarity, sequencing, faithfulness, and improvement quality.

## Minimum Eval Suite Before More Prompt Iteration

At minimum, the project should have:

1. Unit tests for guardrails, schema parsing, and result sanitization.
2. Integration tests for full route behavior over 4-6 turn conversations.
3. Replay cases for document bootstrap to chat handoff.
4. Tests that assert the agent does not re-ask already confirmed facts unless the user initiates revision.
5. Tests that compare expected phase progression and expected next-question domain.
6. A small human-reviewed set scoring question clarity and patch faithfulness.

Without this baseline, additional prompt iteration is likely to shuffle failure modes rather than improve the product reliably.
