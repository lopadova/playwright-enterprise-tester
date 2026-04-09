# Swarm mode (P2.18)

Load when `swarmMode.enabled=true` or user requests parallel sub-agent
test authoring.

## What it is

Swarm mode spawns multiple sub-agents in parallel, each writing test
specs for a different "concern". Phase 1 mentioned swarm as a possibility
in the agent definition. Phase 2 ships the orchestration logic.

## Concerns

Default concerns (configurable):

- **happy-path** (`@smoke @critical`) — core user journeys
- **validation-edge** (`@validation @edge`) — form validation, empty inputs, edge values
- **auth-protected** (`@auth`) — login-dependent flows
- **visual-a11y** (`@visual @a11y`) — visual regression + a11y scan

Each concern runs in its own sub-agent with its own context window,
preventing context bloat in the main session.

## Config

```json
"swarmMode": {
  "enabled": false,
  "maxConcurrentAgents": 3,
  "concerns": [
    { "name": "happy-path", "tag": "@smoke @critical", "enabled": true },
    { "name": "validation-edge", "tag": "@validation @edge", "enabled": true },
    { "name": "auth-protected", "tag": "@auth", "enabled": false },
    { "name": "visual-a11y", "tag": "@visual @a11y", "enabled": false }
  ],
  "mergeStrategy": "concatenate-specs",
  "timeoutMinutesPerAgent": 15,
  "orchestratorScript": ".claude/skills/playwright-enterprise-tester/scripts/swarm-orchestrator.mjs"
}
```

## How it works

1. Main thread invokes `/playwright-tester swarm=true feature=checkout`
2. Orchestrator script reads enabled concerns
3. Spawns one `playwright-enterprise-tester` sub-agent per concern via
   the Agent tool, with a concern-specific prompt
4. Each sub-agent:
   - Receives the same feature context (e.g., "checkout")
   - Writes tests for its specific concern
   - Tags tests accordingly
   - Returns a summary to the orchestrator
5. Orchestrator merges sub-agent outputs:
   - Concatenates spec files
   - Deduplicates overlapping scenarios
   - Produces a combined test file or separate files per concern
6. Main thread runs the combined suite once
7. Reports classified results

## Invocation

```
/playwright-tester swarm=true feature=checkout
```

Or via direct agent delegation with swarm flag:

```
Use the playwright-enterprise-tester agent in swarm mode for the
checkout feature, spawning sub-agents for happy-path, validation-edge,
and auth-protected concerns in parallel.
```

## Sub-agent prompt template

Each spawned agent receives:

```
You are the {concern.name} sub-agent for the playwright-enterprise-tester
swarm. Your task:

Write Playwright E2E tests for the feature "{feature}" focusing on
the {concern.name} concern. Tests should be tagged with "{concern.tag}".

Scope:
- Read the existing tests/e2e/{feature}*.spec.ts if any
- Do not duplicate scenarios already covered
- Write a new file tests/e2e/{feature}.{concern.name}.spec.ts
- Follow the skill locator policy (getByRole > getByLabel > ...)
- Follow the async policy (no waitForTimeout)
- Assert business outcomes

Do NOT execute the tests. The orchestrator will run the combined suite.

Return:
- List of spec files created
- List of scenarios covered
- Any assumptions or open questions
```

## Merge strategies

### `concatenate-specs` (default)

Each sub-agent produces its own file:
- `tests/e2e/checkout.happy-path.spec.ts`
- `tests/e2e/checkout.validation-edge.spec.ts`
- `tests/e2e/checkout.auth-protected.spec.ts`

No merging; files coexist.

### `merge-into-single-file` (advanced)

Orchestrator parses sub-agent outputs and merges test blocks into a
single `tests/e2e/checkout.spec.ts`, deduplicating. More complex to
implement, cleaner output.

Phase 2 ships only `concatenate-specs`. Merge mode is phase 3.

## Concurrency limit

`maxConcurrentAgents: 3` — orchestrator spawns at most N agents at once.
If more concerns are enabled, they queue.

Reason: each sub-agent consumes API tokens. Limiting concurrency controls
cost and avoids rate limits.

## Timeout per agent

`timeoutMinutesPerAgent: 15` — if a sub-agent takes longer, orchestrator
kills it and logs the partial output. The run continues without that
concern's contribution.

## Output schema

```json
{
  "schemaVersion": 1,
  "swarmRunId": "swarm-2026-04-09-abc123",
  "feature": "checkout",
  "concernsAttempted": ["happy-path", "validation-edge", "auth-protected"],
  "agents": [
    {
      "concern": "happy-path",
      "status": "success",
      "durationSec": 420,
      "filesCreated": ["tests/e2e/checkout.happy-path.spec.ts"],
      "scenarios": ["fill form + submit", "guest checkout", "returning user"]
    },
    ...
  ],
  "combinedSpecFiles": ["tests/e2e/checkout.*.spec.ts"],
  "totalDurationSec": 680
}
```

## When to use

- First-time test setup for a complex feature (e.g., checkout)
- Pre-release hardening: cover multiple angles quickly
- Refactor protection: generate comprehensive tests before touching code

## When NOT to use

- Small changes: single-agent is faster
- Iterative debugging: swarm is for authoring, not fixing
- Token budget concerns: swarm uses 3x more tokens than single agent

## Phase 3 candidates

- Merge mode (single combined spec)
- Smart deduplication via semantic comparison
- Dependency ordering (some concerns depend on others)
- Feedback loop: main agent reviews sub-agent outputs before running
- Cross-concern coverage gap detection
