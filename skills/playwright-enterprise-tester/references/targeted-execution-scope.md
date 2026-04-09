# Targeted execution scope

How to select which tests to run. The skill supports fine-grained scope
selection via slash command args; internally maps to Playwright CLI flags.

## Argument precedence

When multiple scope args are present, only the highest-priority one applies:

```
files > folders > grep > tags > mode-inferred-scope > default smoke
```

Example: `/playwright-tester mode=critical-path files=tests/e2e/cart.spec.ts`
→ runs only `cart.spec.ts`, ignoring the `critical-path` mode scope inference.

## `files=<csv>`

Run exactly these files. Comma-separated, absolute or relative paths.

```
files=tests/e2e/cart.spec.ts
files=tests/e2e/cart.spec.ts,tests/e2e/checkout.spec.ts
```

Maps to positional args:
```
npx playwright test tests/e2e/cart.spec.ts tests/e2e/checkout.spec.ts
```

Use when: you are iterating on a specific test or small set of tests.

## `folders=<csv>`

Run all specs under these folders. Comma-separated, absolute or relative.

```
folders=tests/e2e/critical/
folders=tests/e2e/critical/,tests/e2e/smoke/
```

Maps to positional args with trailing slash:
```
npx playwright test tests/e2e/critical/ tests/e2e/smoke/
```

Use when: you are testing a whole feature area.

## `grep=<pattern>`

Filter tests by title regex.

```
grep=cart
grep=^checkout
grep=add to (cart|wishlist)
```

Maps to:
```
npx playwright test --grep="cart"
```

Use when: you know part of the test title but not the file.

## `tags=<csv>`

Filter by tag. Tags are text markers inside test titles, e.g., `test('does X @smoke', ...)`.

```
tags=@smoke
tags=@critical,@smoke
tags=@ajax,@auth
```

Maps to an OR-joined grep:
```
npx playwright test --grep="@smoke|@critical"
```

Use when: you have a well-tagged suite and want to run all tests in a category.

## `mode=<name>` inferred scope

Each operating mode has a default scope inference:

| Mode | Default scope |
|---|---|
| `smoke` | files tagged `@smoke` |
| `critical-path` | files tagged `@critical` OR under `tests/e2e/critical/` |
| `e2e-regression` | all specs under `tests/e2e/` (requires confirmation) |
| `ajax-heavy` | files tagged `@ajax` |
| `auth-protected` | files tagged `@auth` OR using storageState |
| `legacy-mpa` | files tagged `@legacy-mpa` |
| `visual-regression` | files tagged `@visual` OR under `tests/e2e/visual/` |
| `perf-budget` | files tagged `@perf` OR under `tests/e2e/perf/` |
| `release-gate` | full matrix (requires confirmation) |
| `dynamic-scraping` | files under `tests/scraping/` |

If any of `files`/`folders`/`grep`/`tags` is provided, it **overrides** the
mode-inferred scope.

## `scope=all` (dangerous)

Explicit request to run the entire suite. Behavior:

- In `local` runner mode: **requires confirmation** from the user before running
- In `ci` runner mode: runs directly (CI workflow implies explicit intent)

Maps to:
```
npx playwright test
```

## `brand=`, `country=`, `lang=` matrix overrides

Force a specific brand/country/language combination, overriding the default
matrix from `.playwright-tester.json → multiTenant`.

```
brand=mybrand country=it lang=it
```

Sets env vars before running Playwright:
```
PWTEST_BRAND=mybrand PWTEST_COUNTRY=it PWTEST_LANG=it npx playwright test
```

The `multi-country.fixture.ts` reads these and configures `baseURL` accordingly.

## `update-snapshots=true`

Enable visual regression baseline update. **Forbidden in CI.**

```
npx playwright test --update-snapshots
```

Local only. Use when: you intentionally changed the visual and want to accept
the new baseline.

## `dry-run=true`

Plan the run without executing. The agent:
1. Resolves scope, mode, runner mode
2. Produces the command line it would execute
3. Produces the list of tests it would run (via `--list` flag)
4. Stops without executing

Use when: you want to verify scope resolution before committing to a long run.

## `fix-app-code=true`

Allow the skill to modify application code in response to classified `app_bug`
failures. **Requires double confirmation** (see governance in SKILL.md).

Use when: you have already decided that app fixes are acceptable in this
session and you are present to review them.

## Combining args

Args combine. Order does not matter (they are key=value pairs).

```
/playwright-tester mode=critical-path files=tests/e2e/cart.spec.ts brand=mybrand country=it
```

Runs only `cart.spec.ts` against mybrand.it, in critical-path mode (which
affects retries and diagnostic levels but not the scope, because files= wins).

## Interactive confirmations

The skill asks for confirmation (AskUserQuestion) when:

- `scope=all` in local runner mode
- `mode=e2e-regression` or `mode=release-gate` without explicit `files`/`folders`
- `fix-app-code=true` and the governance conditions are satisfied
- The suite run is estimated to take > 5 minutes (via `--list` estimation)

## Examples

```bash
# Quickest: smoke only (default)
/playwright-tester

# Specific feature iteration
/playwright-tester files=tests/e2e/cart.spec.ts

# Whole critical flow area
/playwright-tester mode=critical-path folders=tests/e2e/critical/

# Search by title
/playwright-tester grep="add to cart"

# Tag-based
/playwright-tester tags=@smoke,@critical

# Visual regression on specific brand
/playwright-tester mode=visual-regression brand=mybrand country=it lang=it

# Perf budget on PDP
/playwright-tester mode=perf-budget files=tests/e2e/pdp.spec.ts

# Full CI release gate (with confirmation)
/playwright-tester mode=release-gate runner=ci

# Dry run to preview
/playwright-tester mode=critical-path folders=tests/e2e/ dry-run=true
```
