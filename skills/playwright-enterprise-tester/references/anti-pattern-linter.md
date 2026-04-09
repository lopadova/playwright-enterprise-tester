# Anti-pattern linter

The skill scans spec files for common anti-patterns and reports them.
Phase 1 is `warn-only` by default; phase 2 may promote to `enforce` mode
with pre-commit hook integration.

## Modes

```json
"antiPatternLinter": {
  "enabled": true,
  "mode": "warn-only",
  "failOn": [],
  "warnOn": [...]
}
```

- `warn-only`: issues are logged in the report, tests still pass
- `enforce`: any `failOn` issue fails the test run

To escalate a specific rule: move it from `warnOn` to `failOn`.

## Rules

### `waitForTimeoutHardcoded`

**Pattern**: `page.waitForTimeout(N)` where N > 1000

**Why bad**: arbitrary sleeps hide real sync issues, slow the suite, and
become flaky under load.

**Acceptable**: `waitForTimeout(N)` where N ≤ 1000 AND surrounded by a
comment explaining why no deterministic signal exists.

**Fix**: replace with a deterministic wait:
- `expect(locator).toBeVisible()`
- `waitForResponse(/api\/x/)`
- `waitForURL(...)`

### `cssFirstChoice`

**Pattern**: `page.locator('.foo .bar')` or `page.locator('div > button')`
as the first locator in a test, when semantic alternatives exist.

**Why bad**: CSS selectors couple tests to build-generated classes and DOM
structure.

**Fix**: use `getByRole` / `getByLabel` / `getByTestId` first.

Exception: when the target truly has no semantic alternative (generic
icon, decorative element, third-party widget with no ARIA).

### `nthChildSelector`

**Pattern**: `:nth-child(N)`, `:nth-of-type(N)`, or `.nth(N)` chain without
a semantic filter.

**Why bad**: positional selectors break when order changes, items are added,
or the list is re-rendered.

**Fix**: filter by content or `data-testid`:
- `getByRole('listitem').filter({ hasText: 'Product A' })`
- `getByTestId(`cart-item-${id}`)`

### `volatileTextMatcher`

**Pattern**: `getByText('long marketing copy string')` on copy likely to change.

**Heuristic**: text is marketing-volatile if it contains: "ora", "subito",
"scopri", "offerta", emoji, "nuovo", "promo", contains exact price like "€19,90".

**Fix**: use `getByRole` with accessible name OR `data-testid`.

### `pageDollarApi`

**Pattern**: `page.$(...)` or `page.$$(...)`

**Why bad**: deprecated Playwright API that returns ElementHandle instead
of Locator. ElementHandle does not auto-wait.

**Fix**: use `page.locator(...)` instead.

### `testOnlyInCI`

**Pattern**: `test.only(...)` or `test.describe.only(...)`

**Why bad**: `.only` in CI means the whole suite is skipped except that
test. Breaks CI completely.

**Config**: Playwright already has `forbidOnly: !!process.env.CI`. The
linter catches it before commit.

**Fix**: remove `.only` before committing.

### `skipWithoutIssueRef`

**Pattern**: `test.skip(...)` or `test.describe.skip(...)` without a
comment referencing an issue tracker ID.

**Why bad**: skipped tests silently rot. Without an issue ref, nobody
knows why they're skipped.

**Fix**: add a comment:
```ts
test.skip('flaky', async () => {...}); // TODO: PROJ-1234, flaky on CI
```

### `asyncWithoutAwait`

**Pattern**: calling an `async` function inside `test()` without `await`.

**Why bad**: test completes before the async op, assertions run on stale state.

**Fix**: add `await`.

### `locatorWithoutAssertion`

**Pattern**: `const x = page.locator(...)` that is never asserted or used.

**Why bad**: dead code or forgotten assertion.

**Fix**: delete or add an assertion.

### `hardcodedCredentials`

**Pattern**: email/password string literals in spec files.

**Why bad**: secrets in git history, violates governance.

**Fix**: read from `process.env.PWTEST_*`.

### `logConsoleDumps`

**Pattern**: `console.log(...)` in spec files.

**Why bad**: test logs pollute CI output. If you need debug, use
`test.step(...)` or Playwright's built-in reporter output.

**Fix**: remove or wrap in `if (process.env.DEBUG)`.

## Scanning implementation

The linter runs as part of the skill's pre-execution step. It reads all
target spec files, applies regex and AST heuristics, and produces findings
in `claude-report.json → antiPatternFindings`:

```json
"antiPatternFindings": [
  {
    "rule": "waitForTimeoutHardcoded",
    "severity": "warn",
    "file": "tests/e2e/cart.spec.ts",
    "line": 42,
    "snippet": "await page.waitForTimeout(3000);",
    "recommendation": "Replace with expect(page.getByRole('alert')).toBeVisible()"
  }
]
```

In `warn-only` mode, findings are printed at the end of the final report
but do not affect exit code.

In `enforce` mode (phase 2 / opt-in), findings in `failOn` cause the test
run to fail with a clear message listing violations.

## Whitelist

Sometimes a pattern is the right choice despite the linter. Whitelist per
file + line:

```ts
// playwright-lint-disable-next-line waitForTimeoutHardcoded
await page.waitForTimeout(2000); // gateway iframe needs settle time
```

Phase 1 supports this comment-based disable. Phase 2 may add a global
whitelist file.

## False positives

The linter is heuristic. Report false positives to the skill maintainer
so the heuristic can be refined. In the meantime, use the inline disable
comment.

## Integration with pre-commit hook (phase 2)

A git pre-commit hook can run the linter in `enforce` mode on staged spec
files. Phase 2 provides a template for `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
node .claude/skills/playwright-enterprise-tester/scripts/lint-tests.mjs --staged
```

Phase 1 users can manually run the linter:

```bash
/playwright-tester dry-run=true
```

The dry-run output includes the linter findings without executing tests.

## Exempt rules per file

Test fixture/helper files may need legitimate anti-patterns (e.g., a helper
that calls `page.$` for a compatibility shim). Add a file-level comment:

```ts
// playwright-lint-disable pageDollarApi
```

The whole file is exempted from that rule.

## Linter evolution

As the team writes more tests, new patterns will emerge. Add new rules
in `antiPatternLinter.warnOn` and let the team observe impact before
promoting to `failOn`.
