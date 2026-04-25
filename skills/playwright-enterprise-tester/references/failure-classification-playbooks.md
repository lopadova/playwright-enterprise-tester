# Failure classification playbooks

Every failure MUST be classified as one of the four types. For each type,
there is a deterministic playbook the skill follows before escalating.

## Classification types

1. `test_bug` — the test is wrong, the app is fine
2. `app_bug` — the app is broken, the test is correct
3. `environment_bug` — the app didn't boot, the URL is wrong, a service is down
4. `flaky` — passed on retry, timing/race condition

Classification happens BEFORE any fix attempt. Never patch blindly.

> **Precondition: `TEST-CI-001`** — for any failure (CI or local), download
> and read the full artifact set + logs before classifying. CI: `gh run
> download`, `gh run view --log` (full, not `--log-failed`), and the
> `laravel-logs*` artifact. Local: read `storage/logs/laravel.log`,
> `test-results/`, `playwright-report/`. Correlate frontend ↔ backend ↔
> silent errors. See `../../../rules/rule-ci-test-failure-analysis.md`.

## Signals per classification

### `test_bug` signals
- Locator returns nothing, error "Timed out waiting for selector"
- Assertion fails with "expected X but got Y" where Y is plausible
- Test passes locally but fails in CI with a locator error (CI vs local DOM diff)
- The test contains `waitForTimeout` hardcoded
- The test uses CSS selector on a dynamic class

### `app_bug` signals
- HTTP 500 on a request that should succeed
- `page.on('pageerror')` fires with a stack trace
- A form submit POST returns an error response
- The UI shows a user-facing error message ("Ops! Si è verificato un errore")
- A console.error from the app (not a third-party tracker)
- Visual regression diff shows broken layout (missing element, overflow)

### `environment_bug` signals
- `net::ERR_CONNECTION_REFUSED` → app didn't boot
- `ECONNREFUSED 127.0.0.1:8000` → wrong port
- "Cannot find module '...'" → missing dependency
- DNS resolution failure on external URL
- Timeout on initial `page.goto` before any assertion

### `flaky` signals
- Test passed on attempt 2 or 3
- Error message varies between runs
- Element appears after a variable delay
- Two tests fail together when run in parallel, pass in isolation
- Test involves websocket or polling without deterministic signal

## Playbook: `environment_bug`

**Playbook 1.1: Wrong port**
1. Scan common ports: 8000, 8080, 8787, 3000, 5173
2. For each, try `curl --head http://127.0.0.1:PORT` — first 200/302 wins
3. Update `playwright.config.ts → use.baseURL` to the found URL
4. Rerun the failing test
5. If none respond → escalate to user with clear "app is not running" message

**Playbook 1.2: App didn't boot**
1. Check if `webServer.command` is set correctly
2. Check the working directory
3. Check `.env` / `.env.testing` for `APP_ENV=testing`, `DB_DATABASE=...`
4. Check the logs: `storage/logs/laravel.log` for the latest error.
   In CI: download the `laravel-logs*` artifact (`gh run download <RUN>
   --pattern "laravel-logs*"`) and `grep -B 3 -A 30 "Exception\|ERROR\|CRITICAL"`
   the `storage/logs/laravel.log` it contains.
5. Report the log tail to the user; do NOT try to fix app boot issues automatically

**Playbook 1.3: Missing Playwright dependency**
1. Run `npx playwright --version` to verify install
2. If missing: ask user to run `npm install -D @playwright/test`
3. Run `npx playwright install chromium` if browser is missing
4. Never auto-install without confirmation

## Playbook: `test_bug`

**Playbook 2.1: Locator drift (role/label fallback)**
1. Open the trace zip for the failing test
2. Extract the DOM snapshot at the failure moment
3. Find the intended target element in the DOM (by surrounding context)
4. Rank candidate locators using the priority list:
   - `getByRole` with accessible name → best
   - `getByLabel` for form fields
   - `getByTestId` if `data-testid` present
   - CSS as last resort
5. Update the test with the best available locator
6. Rerun

**Playbook 2.2: Missing deterministic wait**
1. Identify the async action preceding the failing assertion
2. Find the UI signal that marks the action complete:
   - button returning to enabled
   - skeleton disappearing
   - URL change
   - toast visible
3. Add the wait using `expect(...).toBeVisible()` or `waitForResponse`
4. Remove any `waitForTimeout` hacks
5. Rerun

**Playbook 2.3: Brittle assertion**
1. Check what the assertion is checking
2. If asserting on CSS class toggled during animation → assert on final state
3. If asserting on marketing copy → use `getByRole` with stable name
4. If asserting on exact text that includes dynamic data → use regex or `toContainText`
5. Rerun

## Playbook: `app_bug`

**Playbook 3.1: STOP, do not modify app code automatically**

This playbook always starts with a hard stop unless ALL these are true:

1. `governance.fixAppCode=true` in `.playwright-tester.json`
2. `PWTEST_FIX_APP_CODE=true` in env
3. The user explicitly passed `fix-app-code=true` or confirmed via prompt
4. The classification is solid (trace + screenshot + server log all point to
   an app bug, not a test or env bug)

If ANY of these are missing, STOP and report:

```
Classified as app_bug.
Evidence:
  - HTTP 500 on POST /cart/add
  - Laravel log: [2026-04-08 19:54] production.ERROR: Undefined variable $cart
  - Trace: test-results/artifacts/traces/cart-add-1.zip

Governance blocks automatic app code fixes.
To allow: set governance.fixAppCode=true AND export PWTEST_FIX_APP_CODE=true.
Otherwise, please review the log and fix manually.
```

**Playbook 3.2 (only when governance allows): Apply minimal fix**
1. Read the trace + server log
2. Find the exact file:line causing the error
3. Propose the minimal fix
4. Ask AskUserQuestion for confirmation even with governance enabled
5. If confirmed, apply, log to `test-results/app-code-changes.log`, rerun
6. If the fix causes a new failure, revert and STOP

## Playbook: `flaky`

**Playbook 4.1: Confirm flaky via re-run**
1. Rerun the same test 3 times in isolation
2. If 3/3 pass → mark flaky, investigate further
3. If 2/3 pass → flaky confirmed, proceed to playbook 4.2
4. If 0/3 pass → reclassify as test_bug or app_bug

**Playbook 4.2: Stabilize waits**
1. Find all `waitForTimeout`, `networkidle`, and short `expect` timeouts
2. Replace with deterministic signals (element visible, URL change, API response)
3. If a race condition is network-related, add `waitForResponse`
4. Rerun; if still flaky, proceed to 4.3

**Playbook 4.3: Isolate shared state**
1. Check if the test depends on a shared user/cart/address
2. Check if other tests in the same file modify that shared state
3. Move the test to a separate file OR add explicit setup/teardown
4. Rerun

**Playbook 4.4: Log to flakiness history**
Every flaky detection is appended to `test-results/flakiness-history.jsonl`
with `classification: flaky, flakyReason: <reason>`. The history enables
pattern detection over time (see `flakiness-analytics-schema.md`).

**Playbook 4.5: Auto-quarantine (opt-in)**
If `flakinessAnalytics.autoQuarantine.enabled=true` AND flakyRate over the
last N runs exceeds the threshold AND minRuns met → add the `@quarantine`
tag to the test. It will be skipped by default suites but runnable explicitly.

## Stop conditions

The fix loop stops when ANY of these is true:

- `maxFixAttempts` reached (default 3)
- Classification is `app_bug` AND governance blocks fix
- Playbook steps exhausted without convergence
- A fix caused a new different failure (sign of wrong classification)
- User interrupts (`Ctrl+C` or agent.stop)

On stop, produce a detailed report with all evidence and hand off to the user.

## Evidence requirements

Every classified failure MUST include:
- trace zip path
- screenshot path
- server log tail (`storage/logs/laravel.log` time-windowed around the failure;
  also `horizon.log` if jobs are dispatched) — required by `TEST-CI-001` for
  any failure that touched the backend, regardless of classification
- the last 3 commands executed
- the classification reasoning
- for CI failures: the `_ci-debug/<RUN>/` path containing the extracted
  artifact folders/files from `gh run download`, `full.log` (full `gh run
  view --log`, not the failed-step excerpt), and the Laravel logs from the
  extracted `laravel-logs*` artifact

This is mandatory before any app code change.
