# Source Guide Coverage Executive Summary

Date: 2026-05-08
Source: Logic Model Overview Guide.docx
Technical matrix: docs/source-guide-traceability-matrix.md

## Bottom Line

The chatbot now captures the core guidance from the source guide in active prompt and response logic.

Most source-guide content is covered, including:
- Logic model structure (intended impact, implementation, outcomes)
- Resource/activity/output distinctions
- Fidelity vs quality distinctions
- Outcome sequencing (short, medium, long)
- Right-sizing outcomes (logic model vs evaluation metric detail)
- Reflection frameworks (3 P's and ARC)

## What Was Strengthened

Recent updates closed the main gaps identified in audit:
1. Added explicit 3 P's reflection guidance (Purpose, People, Process).
2. Added explicit ARC stakeholder engagement guidance (Accessible, Reciprocal, Creative).
3. Added explicit "why logic models matter" operational benefits.
4. Tightened response guardrails so the system better supports atomic, stepwise data collection.

## Current Coverage Assessment

- Covered: Core logic model concepts and coaching flow guidance.
- Covered: Prompt-level distinctions that reduce common modeling errors.
- Covered: Structured schema support for implementation quality/fidelity.
- Partial: Companion external resources (worksheet/template/examples DB) are documented but not embedded as runtime chatbot behavior.

## Operational Impact

These changes improve:
- Consistency of coaching prompts
- Clarity of user guidance across stages
- Fidelity between source framework and chatbot behavior
- Auditability of prompt coverage over time

## Remaining Risks To Monitor

1. Domain example bias: examples can still skew social-sector/education in some outputs.
2. Prompt size tradeoff: full-reference mode may reduce adherence if overused.
3. Drift risk: future edits to prompt or route logic can unintentionally reduce source-guide coverage.

## Recommended Next Actions

1. Keep compact prompt mode as default; use full mode only for targeted testing.
2. Re-run traceability audit whenever key prompt/routing/schema files change.
3. Add transcript-level acceptance tests to verify one-question flow and stage progression in realistic conversations.

## Governance Note

Use this executive summary for stakeholder communication and the full matrix for engineering-level change review.
