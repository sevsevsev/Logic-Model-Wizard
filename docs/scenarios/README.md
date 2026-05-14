# Scenario Design & Testing

This folder contains scenario templates and examples for designing conversational test flows for the Logic Model agent.

## Quick Start

1. **Read the Template Guide:** [scenario-template-guide.md](../scenario-template-guide.md)
   - Explains per-section baseline questions the agent should ask.
   - Shows common patterns (happy path, deviation recovery, multi-turn retention).
   - Guides you through the assertion language (finalIntentOneOf, modelPatchMustHavePath, etc.).

2. **Review Examples:** [EXAMPLES.yaml](EXAMPLES.yaml)
   - 6 worked-out scenario examples in YAML format.
   - Shows how to translate test focus into turns + expectations.

3. **Create Your Scenario:**
   - Copy [TEMPLATE.yaml](TEMPLATE.yaml) to a new file (e.g., `my-scenario.yaml`).
   - Fill in metadata, turns, and expectations.
   - Refer back to the template guide if unsure about assertion fields.

4. **Convert to TypeScript & Add to Harness:**
   - Translate your YAML scenario to a TypeScript `Scenario` object.
   - Add to `SCENARIOS` array in `scripts/agent-regression.ts`.
   - Run: `npm run -s test:agent-scenarios`

5. **Inspect Trace Reports:**
   - Check `docs/regression-reports/agent-scenarios-latest.md` for Mermaid diagrams and turn-by-turn traces.
   - Check `.json` file for raw turn details (intent, patch, failures).

## Files in This Folder

| File | Purpose |
|------|---------|
| `TEMPLATE.yaml` | Blank scenario template; copy and fill in your scenario. |
| `EXAMPLES.yaml` | 6 worked examples showing different test patterns. |

## Files in Parent Docs Folder

| File | Purpose |
|------|---------|
| `scenario-template-guide.md` | Complete guide to scenario design, patterns, and assertions. |
| `agent-regression-scenarios.md` | Runbook for running and inspecting scenarios. |
| `regression-reports/` | Generated trace reports after running scenarios. |

## Common Test Patterns

### Happy Path
User provides complete information unprompted; agent confirms; conversation moves on.
- Use when: Testing that agent correctly captures all fields in a single turn.
- Example: User says "We serve middle-school students in North Philly, aiming for grade-level reading." Agent replies "Got it, I've captured…" and moves to next section.

### Deviation Recovery
User provides partial information; agent asks clarifying question; user completes; agent should NOT re-ask.
- Use when: Testing that agent handles incomplete responses gracefully and does not loop.
- Example: User gives only population + geography. Agent asks "What's your long-term goal?" User answers. Agent captures and confirms.

### Multi-Turn Retention
User provides info, confirms, mentions next section, but agent must not drop state or circle back.
- Use when: Testing that model state persists and agent does not regress to prior sections.
- Example: User lists resources, says "that's it", then asks "what about activities?" Agent must not re-ask about resources.

### Bucket Coverage (Resources Only)
User lists resources spanning multiple buckets (human, material, financial, knowledge); agent captures all.
- Use when: Testing that agent properly indexes resources into buckets, not just strings.
- Example: User lists "staff, laptops, grant funding, partner training." Agent patches all 4 buckets, not just concatenates.

## Assertion Language

Each turn's `expect` block can contain:

```yaml
finalIntentOneOf: ["intent1", "intent2"]           # Agent's intent classifier must match
modelPatchMustHavePath: ["path.to.field"]          # Patch must modify these paths
modelPatchResourceBucketsAtLeast: 2                # (Resources only) Min buckets in patch
replyMustContainAny: ["pattern1", "pattern2"]      # Reply acknowledgment
replyMustNotMatch: ["/regex/i", "/pattern/i"]      # Reply anti-patterns
```

## Workflow

```
Design Scenario (YAML)
  ↓
Convert to TypeScript (Scenario object)
  ↓
Add to scripts/agent-regression.ts (SCENARIOS array)
  ↓
Run: npm run -s test:agent-scenarios
  ↓
Inspect docs/regression-reports/agent-scenarios-latest.md
  ↓
If failures: Fix agent logic or refine scenario assertions
  ↓
Repeat
```

## Tips

- **Name scenarios clearly:** `<section>-<focus>` (e.g., `impact-partial-then-clarify`).
- **One section per scenario** unless testing cross-section handoffs.
- **Use seedHistory sparingly:** Only when testing mid-flow or recovery. Omit for end-to-end flows.
- **Assert negatively:** Use `replyMustNotMatch` to ensure agent does NOT repeat questions or show confusion.
- **Multi-turn validation:** Use `finalCheck` callback to validate end-state (e.g., all buckets captured, no silent drops).

## Questions?

Refer to [scenario-template-guide.md](../scenario-template-guide.md) for detailed explanations and best practices.
