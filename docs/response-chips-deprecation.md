# Response Chips Deprecation (Temporary)

Status: Deprecated (kept in code, disabled in runtime)
Date: 2026-05-08

## Why this approach

We want to preserve prior chip experiments while preventing unstable behavior from affecting production coaching flow.

Best practice is to treat this as feature retirement, not deletion:
1. Keep implementation code in place.
2. Disable runtime behavior with a feature flag defaulted to off.
3. Remove feature-specific guidance from active prompts while disabled.
4. Keep a short design log so we can re-evaluate without reverse-engineering old code.

## Current implementation

Runtime flag:
- Environment variable: ENABLE_RESPONSE_CHIPS
- Default in example env: false

Behavior when false:
- API does not generate quick-reply payloads.
- System prompt excludes chip-engine guidance.
- UI continues to support chips structurally but receives none.

## Re-enable checklist

1. Set ENABLE_RESPONSE_CHIPS=true in environment.
2. Confirm API payloads include quickReplies.
3. Run targeted UX checks for chip relevance and progression.
4. Verify free-text path remains available for every turn.
5. Review debug snapshots for chip mismatch regressions.

## Experiment tracking template

Use this format whenever chip behavior is tested:

- Date:
- Build/commit:
- Flag state:
- Scenario:
- Expected chip set:
- Actual chip set:
- User outcome:
- Regression observed:
- Decision (keep/revert/tune):

## What not to do

- Do not delete chip logic yet.
- Do not keep chip prompt guidance active while runtime chips are disabled.
- Do not mix experimental chip text into default coaching behavior.
