# Linter enforce mode (P2.05)

Load when `linterEnforce.enabled=true`.

Promotes the phase 1 anti-pattern linter from `warn-only` to `enforce` mode,
with a pre-commit hook option and a CI gate.

## What changes vs phase 1

Phase 1 (`antiPatternLinter.mode: "warn-only"`):
- Detects anti-patterns in test files
- Reports them in `claude-report.json → antiPatternFindings`
- Never fails the run

Phase 2 (`linterEnforce.enabled: true, mode: "enforce"`):
- Fails the run when a `failOn` rule is violated
- Pre-commit hook prevents committing offending code (opt-in)
- CI gate fails the PR check
- Produces a machine-readable `test-results/lint-violations.json`

## Config

```json
"linterEnforce": {
  "enabled": false,
  "mode": "enforce",
  "failOn": [
    "waitForTimeoutHardcoded",
    "testOnlyInCI",
    "pageDollarApi",
    "skipWithoutIssueRef",
    "hardcodedCredentials"
  ],
  "warnOn": [
    "cssFirstChoice",
    "nthChildSelector",
    "volatileTextMatcher"
  ],
  "preCommitHook": {
    "enabled": false,
    "hookManager": "husky",
    "hookPath": ".husky/pre-commit",
    "runOnStaged": true
  },
  "ciGate": {
    "enabled": true,
    "failJobOnViolation": true
  }
}
```

## Rules reference

All rules are defined in the phase 1 `anti-pattern-linter.md`. Phase 2
adds the enforcement layer without changing the rule detection logic.

## Pre-commit hook installation

When `preCommitHook.enabled=true`, the install script (or manual setup)
adds a `.husky/pre-commit` hook:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run playwright-enterprise-tester linter on staged test files
node .claude/skills/playwright-enterprise-tester/scripts/lint-tests.mjs --staged
```

The script:
1. Lists staged `.spec.ts` / `.spec.js` files
2. Runs the linter on each
3. Exits non-zero if any `failOn` rule is violated
4. Prints a clear error with file:line and a suggested fix

To install husky (one-time):

```bash
npm install -D husky
npx husky install
chmod +x .husky/pre-commit
```

## CI gate

When `ciGate.enabled=true`, the CI workflow runs the linter as a dedicated
step:

```yaml
- name: Playwright tester lint enforce
  run: |
    node .claude/skills/playwright-enterprise-tester/scripts/lint-tests.mjs \
      --mode=enforce \
      --fail-on-violation
```

On violation: the job fails, blocking the PR merge.

## Disable per file

Some legitimate patterns are flagged. Use inline disable comments:

```ts
// playwright-lint-disable-next-line waitForTimeoutHardcoded
await page.waitForTimeout(2000); // Stripe iframe needs settle time, documented
```

Or per file:

```ts
// playwright-lint-disable pageDollarApi
// This is a compatibility shim for a legacy gateway helper
```

## Auto-fix

The linter includes an `--auto-fix` option for simple cases:

```bash
node scripts/lint-tests.mjs --auto-fix tests/e2e/cart.spec.ts
```

Auto-fixable rules:
- `cssFirstChoice` → try `getByRole` / `getByLabel` / `getByTestId`
  replacement when possible
- `pageDollarApi` → replace `page.$(sel)` with `page.locator(sel)`
- `volatileTextMatcher` → flag only (no safe auto-fix)

Not auto-fixable:
- `waitForTimeoutHardcoded` (requires understanding the semantic wait)
- `nthChildSelector` (requires domain knowledge of the DOM)

After auto-fix, review the diff carefully and run the tests to confirm
the replacement is correct.

## Violations output schema

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-09T10:00:00Z",
  "filesScanned": 42,
  "violations": [
    {
      "rule": "waitForTimeoutHardcoded",
      "severity": "error",
      "file": "tests/e2e/cart.spec.ts",
      "line": 42,
      "column": 5,
      "snippet": "await page.waitForTimeout(3000);",
      "recommendation": "Replace with a deterministic wait on a business signal"
    }
  ],
  "summary": {
    "total": 1,
    "errors": 1,
    "warnings": 0
  }
}
```

## Bypass (emergency)

```bash
git commit --no-verify -m "hotfix: ... (lint bypass with reason)"
```

**Use sparingly.** The commit message should explain why the bypass was
needed, and a follow-up PR should address the violation.

CI still runs the linter and will fail the PR even if the commit was
bypassed locally.

## Phase 3 candidates

- ESLint plugin version for better editor integration
- VS Code extension with inline warnings
- LSP-based diagnostics in any editor
- Auto-fix for `waitForTimeoutHardcoded` using AI suggestion
- Team metrics: violations per author, trend over time
