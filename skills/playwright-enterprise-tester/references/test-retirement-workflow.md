# Test retirement / quarantine workflow (P2.08)

Load when `quarantineWorkflow.enabled=true`.

Automated lifecycle for chronically flaky tests: detection → quarantine
tag → proposed PR → eventual removal.

## Why

Flaky tests rot the suite: they pass on retry but waste CI time and
erode trust. Phase 2 automates the lifecycle: detect, quarantine,
propose fix or removal.

## Lifecycle stages

```
normal → flaky-detected → quarantine-tagged → fix-attempted → {restored | removed}
```

1. **normal** — test runs, no unusual flaky rate
2. **flaky-detected** — flaky rate over threshold; logged in rollup
3. **quarantine-tagged** — `@quarantine` tag added to the test
4. **fix-attempted** — team works on a fix (tracked via issue)
5. **restored** — flaky rate drops below threshold for N days → tag removed
6. **removed** — no fix within timeout → test proposed for deletion

## Config

```json
"quarantineWorkflow": {
  "enabled": false,
  "flakyRateThreshold": 0.15,
  "minRuns": 20,
  "windowDays": 14,
  "action": "tag-only",
  "availableActions": ["tag-only", "add-tag", "skip-with-comment", "create-pr"],
  "quarantineTag": "@quarantine",
  "issueRefRequired": true,
  "autoCreatePR": {
    "enabled": false,
    "branchPrefix": "auto-quarantine/",
    "labels": ["test-maintenance", "quarantine"],
    "reviewers": []
  },
  "removalAfterDaysWithoutFix": 60,
  "removalAction": "propose-pr"
}
```

## Actions

### `tag-only` (safest, default)

Logs the list of candidates in `test-results/quarantine-candidates.json`.
Team manually reviews and tags.

### `add-tag`

The skill edits the spec file to add `@quarantine` to the test title:

```ts
// before
test('add to cart @critical', async ({ page }) => { ... });

// after
test('add to cart @critical @quarantine', async ({ page }) => { ... });
```

Commits the change locally (does not push).

### `skip-with-comment`

The skill wraps the test in `test.skip(...)` with a comment linking to
the flaky history:

```ts
test.skip('add to cart @critical', async ({ page }) => {
  // Auto-quarantined on 2026-04-09 due to 18% flaky rate over 20 runs
  // See test-results/flakiness-rollup.json and issue #1234
  ...
});
```

Requires `issueRefRequired=true` to refuse skipping without an issue.

### `create-pr`

The skill creates a git branch, applies the tag/skip change, commits,
pushes, and creates a PR via `gh pr create`:

```
Branch: auto-quarantine/cart-spec-2026-04-09
Title: Auto-quarantine flaky test: add to cart
Body: Flaky rate 18% over last 20 runs. Evidence: ...
Labels: test-maintenance, quarantine
Reviewers: (from config)
```

The team reviews and merges (or rejects).

## Config flags explained

| Key | Meaning |
|---|---|
| `flakyRateThreshold` | 0.15 = 15% flaky runs trigger detection |
| `minRuns` | Minimum runs before threshold applies (avoids premature tagging) |
| `windowDays` | Look-back window for flaky rate calculation |
| `issueRefRequired` | When true, refuses to skip without an issue number |
| `removalAfterDaysWithoutFix` | Days a test can stay quarantined before removal is proposed |
| `removalAction` | What to do on removal: `propose-pr` \| `log-only` |

## Candidates report

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-09T10:00:00Z",
  "windowDays": 14,
  "candidates": [
    {
      "testId": "tests/e2e/cart.spec.ts::add to cart",
      "flakyRate": 0.18,
      "runs": 22,
      "lastFlaky": "2026-04-08T19:54:00Z",
      "recommendedAction": "add-tag",
      "issueRef": null
    }
  ],
  "totalCandidates": 1
}
```

## Restoration

A test can exit quarantine when:
- Flaky rate drops below `flakyRateThreshold` for `windowDays / 2` days
- Manual removal of the `@quarantine` tag by the owner team

The skill runs a weekly "restoration check" and logs candidates for
restoration in `test-results/quarantine-restoration-candidates.json`.

## Removal policy

After `removalAfterDaysWithoutFix` days in quarantine without a fix:

- `propose-pr` → create a PR that deletes the test with a clear message:
  ```
  Remove chronically flaky test after 60 days in quarantine without fix.
  
  Test: tests/e2e/cart.spec.ts::add to cart
  Quarantined since: 2026-02-08
  Evidence: test-results/flakiness-rollup.json
  ```
- `log-only` → log the proposal; team manually deletes

## Invocation

Weekly cron job (GitHub Actions scheduled workflow):

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'  # every Monday 09:00 UTC

jobs:
  quarantine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          node .claude/skills/playwright-enterprise-tester/scripts/quarantine-manager.mjs \
            --window-days=14 \
            --action=tag-only
```

## Phase 3 candidates

- ML-based flakiness root cause classification
- Auto-fix suggestions based on common patterns
- Per-owner quarantine dashboards
- SLA enforcement (quarantine > N days → escalate)
- Cross-repo quarantine coordination
