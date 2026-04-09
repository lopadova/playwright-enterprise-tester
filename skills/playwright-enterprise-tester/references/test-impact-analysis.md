# Test impact analysis (P2.04)

Load when `testImpactAnalysis.enabled=true`.

Selects only the test specs relevant to files changed in the current PR
(or working tree), saving CI time and focusing local iteration.

## Strategy: heuristic from git diff

Phase 2 uses a **manually-maintained mapping** from source file patterns
to test specs. The user chose this over AST analysis because it's more
predictable and easier to debug. The mapping lives in
`.playwright-tester.json → testImpactAnalysis.fileToTestMap`.

## Config

```json
"testImpactAnalysis": {
  "enabled": false,
  "strategy": "git-diff-heuristic",
  "baseBranch": "master",
  "diffTarget": "HEAD...master",
  "fallbackOnEmptyDiff": "all-smoke",
  "fileToTestMap": [
    { "pattern": "resources/frontend/**/cart*.js",        "tests": ["tests/e2e/cart.spec.ts", "tests/e2e/critical-path.spec.ts"] },
    { "pattern": "resources/frontend/**/checkout*.js",    "tests": ["tests/e2e/checkout.spec.ts", "tests/e2e/critical-path.spec.ts"] },
    { "pattern": "resources/frontend/**/home*.js",        "tests": ["tests/e2e/home.spec.ts", "tests/e2e/smoke.spec.ts"] },
    { "pattern": "resources/frontend/**/pdp*.js",         "tests": ["tests/e2e/pdp.spec.ts"] },
    { "pattern": "resources/frontend/**/plp*.js",         "tests": ["tests/e2e/plp.spec.ts"] },
    { "pattern": "app/Domain/Cart/**/*.php",              "tests": ["tests/e2e/cart.spec.ts", "tests/e2e/critical-path.spec.ts"] },
    { "pattern": "app/Domain/Checkout/**/*.php",          "tests": ["tests/e2e/checkout.spec.ts"] },
    { "pattern": "app/Domain/Catalog/**/*.php",           "tests": ["tests/e2e/pdp.spec.ts", "tests/e2e/plp.spec.ts"] },
    { "pattern": "resources/views/frontend/**/*.blade.php", "tests": ["tests/e2e/smoke.spec.ts"] }
  ],
  "alwaysRunOnChanges": [
    "playwright.config.ts",
    ".playwright-tester.json",
    "tests/support/**"
  ],
  "outputPath": "test-results/impact-selection.json"
}
```

## How it works

1. `scripts/test-impact-analysis.mjs` runs `git diff --name-only HEAD...master`
2. For each changed file, match against `fileToTestMap` patterns (using
   minimatch)
3. Union all matched test specs into a set
4. If any file in `alwaysRunOnChanges` is touched, add ALL tests
5. If no matches (e.g., only docs changed), fallback per
   `fallbackOnEmptyDiff`:
   - `all-smoke` — run all @smoke tests
   - `none` — skip tests entirely (useful for docs-only PRs)
   - `full` — run full suite
6. Write `test-results/impact-selection.json` with the selected tests
7. The slash command / CI workflow reads this file and passes the selection
   as positional args to `npx playwright test`

## Invocation

```
/playwright-tester mode=critical-path test-impact=true
```

Or in CI:

```yaml
- run: node .claude/skills/playwright-enterprise-tester/scripts/test-impact-analysis.mjs
- run: npx playwright test $(cat test-results/impact-selection.json | jq -r '.tests | join(" ")')
```

## Output schema

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-09T10:00:00Z",
  "base": "master",
  "head": "HEAD",
  "changedFiles": [
    "resources/frontend/default/js/cart.js",
    "app/Domain/Cart/Services/AddToCartService.php"
  ],
  "matchedPatterns": [
    { "pattern": "resources/frontend/**/cart*.js", "files": ["resources/frontend/default/js/cart.js"] },
    { "pattern": "app/Domain/Cart/**/*.php", "files": ["app/Domain/Cart/Services/AddToCartService.php"] }
  ],
  "selectedTests": [
    "tests/e2e/cart.spec.ts",
    "tests/e2e/critical-path.spec.ts"
  ],
  "totalSpecs": 42,
  "selectedCount": 2,
  "reductionPct": 95.2,
  "fallbackApplied": null
}
```

## Maintenance

The mapping in `fileToTestMap` must be kept in sync with the feature areas.
Guidelines:

- One mapping entry per major feature area (cart, checkout, PDP, PLP, home, account)
- Always include `critical-path.spec.ts` when touching critical business logic
- Prefer broader patterns (`**/cart*.js`) over narrow ones (`cart-summary.js`)
- Add to `alwaysRunOnChanges` anything that affects global test behavior
  (config, shared fixtures, CI workflow)

When adding a new feature area, update the mapping BEFORE the first PR that
touches it, otherwise the test will be missed.

## Caveats

### False negatives

The heuristic can miss indirect dependencies. Example: a change to
`app/Services/SharedPricingService.php` affects cart + checkout + PDP,
but the mapping might only catch one. Mitigation: broaden the pattern
or add the service to `alwaysRunOnChanges`.

### False positives

Changing a comment in `cart.js` triggers the full cart suite. This is
usually fine: running a few extra tests is cheap, missing a relevant
test is expensive.

### Branch comparison

`diffTarget: HEAD...master` uses the **merge base** (three-dot syntax),
which compares the current branch to the point where it diverged from
master. This is the correct way to see "changes in this PR" regardless
of master advancing.

## Local use

Run before committing to see what tests you should run locally:

```bash
node scripts/test-impact-analysis.mjs
cat test-results/impact-selection.json | jq '.selectedTests'
```

Then:

```bash
npx playwright test $(cat test-results/impact-selection.json | jq -r '.selectedTests | join(" ")')
```

## Fallback strategies

| Strategy | When to use |
|---|---|
| `all-smoke` | Default; guarantees at least basic coverage |
| `none` | Docs-only repos or doc-only PRs (risky for code repos) |
| `full` | When in doubt; slowest but safest |

Set `fallbackOnEmptyDiff` based on your team's risk tolerance.

## Phase 3 candidates

- Static analysis via TypeScript compiler to build import graph
- Auto-generation of `fileToTestMap` from test imports
- Historical heuristic: "this test usually fails when file X changes"
- Integration with GitHub PR check: comment the selection inline
