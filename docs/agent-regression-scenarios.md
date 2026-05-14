# Agent Regression Scenarios

Status: Active
Date: 2026-05-13

## Purpose

This scenario suite validates multi-turn agent behavior with assertions, not just smoke output.

It is designed to catch:
- response loops (same question repeated after user answers)
- silent patch drops (user provides data but modelPatch is empty)
- intent drift (assistant jumps to unrelated phase)
- resource-capture failures

## Runner

- Script: scripts/agent-regression.ts
- npm command: npm run test:agent-scenarios
- API endpoint (default): http://localhost:3100/api/chat
- Override endpoint: set CHAT_API_URL

## How To Run

1. Start app server:
   - npm run dev -- --port 3100
2. Run scenarios:
   - npm run test:agent-scenarios

The runner exits non-zero when any scenario fails.

Artifacts are generated on each run:
- docs/regression-reports/agent-scenarios-latest.md
- docs/regression-reports/agent-scenarios-latest.json
- timestamped copies in the same folder

## Current Scenario Set

1. impact-happy-path
- Validates capture and completion for a full intended-impact input.

2. resources-list-capture
- Seeds history with a resources question.
- User provides a mixed resource list.
- Asserts that:
  - intent stays in resources
  - modelPatch includes implementation.resources
  - at least two resource buckets are captured

3. resources-no-silent-drop
- Multi-turn resources exchange.
- Asserts no silent drop of resources across turns.

## Reading Failures

Each failure includes:
- scenario id
- turn index
- assertion that failed

Common failure signatures:
- finalIntent expected resources, got geography
- modelPatch missing implementation.resources
- model retained only 0 resource buckets

These signatures indicate the agent is not respecting response-domain context for resources turns.

## Visualization For Tuning

The markdown report contains a Mermaid sequence diagram per scenario showing:
- user turn text
- assistant reply
- final intent selected
- resource buckets captured in that turn's patch

Use this to spot drift and loops quickly without digging through raw logs.

The JSON report contains the same turn-level fields for programmatic analysis:
- finalIntent
- stateIntent
- patchSource
- resourceBucketsInPatch
- turnFailures

This supports custom dashboards or trend analysis across commits.

## Expanding The Suite

When adding scenarios:
- model real user behavior (short, messy, list-heavy answers)
- avoid brittle exact-string checks
- assert durable outcomes (intent class, patch presence, bucket counts, anti-loop constraints)
- include at least one negative assertion (what must not happen)
