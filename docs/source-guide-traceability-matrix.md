# Source Guide Traceability Matrix

Date: 2026-05-08
Source document: Logic Model Overview Guide.docx
Extraction artifact: docs/logic-model-overview-guide.extracted.txt

## Purpose

This matrix maps guidance from the source guide to current implementation locations in the chatbot system so future prompt audits can verify coverage and identify drift.

## Coverage Legend

- Covered: Guidance is explicitly represented in active prompt/knowledge/routing behavior.
- Partial: Guidance is implied or indirectly represented, but not fully explicit.
- Not Covered: Guidance is not represented in current behavior or artifacts.

## Matrix

| Source Guide Area | Coverage | Primary Mapping | Supporting Mapping | Notes |
|---|---|---|---|---|
| Why logic models matter (strategy, evaluation, learning/storytelling) | Covered | src/lib/chat/knowledge.ts | src/lib/chat/knowledge.ts | Added as explicit "Why Logic Models Matter in Practice" section. |
| Logic model structure: Intended Impact, Implementation, Outcomes | Covered | src/lib/chat/knowledge.ts | src/lib/chat/prompt.ts | Present in foundation and phase sequencing. |
| Intended Impact format: population + geography + long-term change | Covered | src/lib/chat/knowledge.ts | src/app/api/chat/route.ts | Enforced with follow-up gating and impact-specific prompts. |
| Implementation resources categories (human, material, financial, knowledge) | Covered | src/lib/chat/knowledge.ts | src/store/useLogicModelStore.ts | Reflected in glossary and persistent schema. |
| Activities as strategy categories (not task dumps) | Covered | src/lib/chat/knowledge.ts | src/app/api/chat/route.ts | Prompted and normalized in routing/patch logic. |
| Outputs as direct products (what delivered / who reached) | Covered | src/lib/chat/knowledge.ts | src/app/api/chat/route.ts | Included in guidance and intent progression. |
| Fidelity and quality distinction | Covered | src/lib/chat/knowledge.ts | src/store/useLogicModelStore.ts | Explicitly represented in glossary and schema (`implementation.quality_fidelity`). |
| Outcomes sequencing (short knowledge, medium behavior, long condition) | Covered | src/lib/chat/knowledge.ts | src/app/api/chat/route.ts | Captured in glossary/rules and route heuristics. |
| Right-sized outcomes vs overly detailed evaluation metrics | Covered | src/lib/chat/knowledge.ts | src/lib/chat/knowledge.ts | Included as right-sizing notes. |
| 3 P's reflection (Purpose, People, Process) | Covered | src/lib/chat/knowledge.ts | src/lib/chat/knowledge.ts | Added as explicit section, previously only referenced. |
| ARC stakeholder engagement method (Accessible, Reciprocal, Creative) | Covered | src/lib/chat/knowledge.ts | src/lib/chat/knowledge.ts | Added as explicit section, previously only referenced. |
| Stakeholder alignment and plain language refinement | Covered | src/lib/chat/knowledge.ts | src/app/api/chat/route.ts | Present in phase model and section-refinement intent path. |
| One focused question per turn | Covered | src/lib/chat/prompt.ts | src/app/api/chat/route.ts | Prompt rule + deterministic phase-question enforcement. |
| Explicit acceptance before final compiled impact statement | Covered | src/lib/chat/knowledge.ts | src/app/api/chat/route.ts | Acceptance gating added before writing `compiled_statement`. |
| Progressive capture of impact fields before final confirmation | Covered | src/lib/chat/knowledge.ts | src/app/api/chat/route.ts | Progressive population/geography/goal capture retained; compiled gated. |
| Avoid assistant-text contamination in user fact extraction | Covered | src/app/api/chat/route.ts | src/app/api/chat/route.ts | Fallback extraction now uses user message + model snapshot, not assistant text. |
| Domain-neutral examples for long-term impact follow-ups | Covered | src/app/api/chat/route.ts | src/lib/chat/knowledge.ts | Follow-up examples generalized beyond education-only markers. |
| Companion tools and templates (worksheet, PPT template, examples DB) | Partial | docs/logic-model-overview-guide.extracted.txt | docs/ | Not needed for runtime prompt behavior; can be documented as external references. |

## Active Prompt Wiring

- Default prompt mode uses compact knowledge base: src/lib/chat/prompt.ts
- Full reference mode can be enabled with `FULL_KNOWLEDGE_BASE_PROMPT=true`: src/lib/chat/prompt.ts
- Both compact and full knowledge builders now include 3 P's and ARC sections: src/lib/chat/knowledge.ts

## Residual Risks / Watchouts

1. Source-guide examples are still mostly social-sector/education flavored; continue monitoring domain neutrality in generated follow-up examples.
2. Large prompt payloads can reduce instruction adherence; keep compact mode as default unless full-reference mode is specifically needed.
3. Periodically rerun this matrix after major prompt/schema edits to prevent coverage drift.

## Suggested Audit Cadence

- Trigger this audit on any change to:
  - src/lib/chat/knowledge.ts
  - src/lib/chat/prompt.ts
  - src/app/api/chat/route.ts
  - src/store/useLogicModelStore.ts
- Run at minimum once per release cycle.
