# Agentic Redesign RFC

Status: Draft
Branch: feature/agentic-redesign-rag-memory
Date: 2026-05-08
Owner: Product + Engineering

## Goal

Redesign the chatbot from a primarily heuristic pipeline to an adaptive, retrieval-grounded, state-aware agent that can handle non-linear logic-model conversations while preserving strict faithfulness to canonical framework rules.

## Current Constraints

The current architecture has important strengths (deterministic progression, explicit acceptance gating, testable guardrails), but it still depends on:

- Large static prompt payloads for domain guidance.
- Regex-heavy intent and extraction fallbacks.
- Session-only memory of model state (limited longitudinal context).
- Limited automated quality evaluation of model patches.

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
  - `model_patch`
  - `confidence`
  - `evidence_refs` (which retrieved chunks justify the patch)
- Treat `model_patch` as authoritative only when schema-valid and guardrail-valid.

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

Risk: Loss of deterministic behavior.
Mitigation: preserve existing guardrails and run dual mode until thresholds are met.

Risk: Prompt token creep.
Mitigation: hard token budget for retrieved context and compact static prompt mode.

## Immediate Next Tasks

1. Create `src/lib/agent` and `src/lib/rag` module skeletons.
2. Add JSON schema for unified model output and parser tests.
3. Add `ENABLE_AGENTIC_TURN` gated route branch in `src/app/api/chat/route.ts`.
4. Create initial eval corpus from existing feedback/debug reports.
5. Define quality gates for rollout decision.
