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

## Incident Collection (Sprint A)

Use the incident collector to normalize scenario failures and debug snapshots into deterministic taxonomy labels.

- Script: scripts/agent-incident-loop.ts
- npm command: npm run collect:incidents
- Taxonomy tests: npm run test:incident-taxonomy

Default behavior:
- Reads docs/regression-reports/agent-scenarios-latest.json
- Pulls debug snapshots from http://localhost:3100/api/feedback/debug (falls back to latest_debug_report.json if API is unavailable)
- Writes artifacts:
   - docs/regression-reports/incident-collection-latest.json
   - docs/regression-reports/incident-collection-latest.md

Useful flags:
- --debug-source file
- --debug-file latest_debug_report.json
- --debug-user-id <id>
- --debug-limit 30
- --recency-hours 24

## Candidate Generation (Sprint B, Propose-Only)

Generate candidate scenarios from normalized incidents without mutating the baseline regression suite.

- Script: scripts/agent-generate-candidates.ts
- npm command: npm run generate:candidates
- Template tests: npm run test:candidate-templates

Default behavior:
- Reads docs/regression-reports/incident-collection-latest.json
- Writes staging artifacts:
   - docs/regression-reports/candidate-pack-latest.json
   - docs/regression-reports/candidate-pack-latest.md

Useful flags:
- --incidents docs/regression-reports/incident-collection-latest.json
- --max-per-class 2

## Candidate Execution (Staging)

Run generated candidate scenarios against the local chat API to verify whether they still fail.

- Script: scripts/agent-run-candidates.ts
- npm command: npm run run:candidates

Default behavior:
- Reads docs/regression-reports/candidate-pack-latest.json
- Writes:
   - docs/regression-reports/candidate-run-latest.json
   - docs/regression-reports/candidate-run-latest.md

Useful flags:
- --pack docs/regression-reports/candidate-pack-latest.json
- --api-url http://localhost:3100/api/chat

Note:
- Exit code is non-zero when one or more candidate scenarios fail.

## Unattended Iteration Loop (Sprint C, Propose-Only)

Run baseline scenarios, incident collection, and candidate generation in bounded unattended iterations.

- Script: scripts/agent-unattended-loop.ts
- npm command: npm run run:unattended-loop
- Stop-condition tests: npm run test:unattended-loop

Default stop conditions:
- zero high-severity failures
- no net improvement for 2 consecutive iterations
- destabilizing regression beyond threshold
- budget exhausted

Useful flags:
- --budget 6
- --no-improvement-window 2
- --destabilization-threshold 1
- --debug-source none (default, recommended)
- --debug-source file
- --debug-file latest_debug_report.json

Default safety behavior:
- Unattended loop now defaults to --debug-source none to avoid stale debug snapshot contamination.
- Opt in to debug snapshots only when explicitly investigating debug-report incidents.

Artifacts:
- docs/regression-reports/unattended-loop-latest.json
- docs/regression-reports/unattended-loop-latest.md

The unattended loop now also:
- runs candidate scenarios each iteration
- includes candidate-failure counts in stop-condition pressure
- refreshes the QA dashboard artifact at the end of each run

## QA Dashboard

Generate a consolidated report for incidents, candidate packs, candidate run results, and unattended trends.

- Script: scripts/agent-qa-dashboard.ts
- npm command: npm run qa:dashboard

Outputs:
- docs/regression-reports/qa-dashboard-latest.json
- docs/regression-reports/qa-dashboard-latest.md

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
