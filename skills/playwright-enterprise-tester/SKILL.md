---
name: playwright-enterprise-tester
description: >
  Enterprise-grade browser automation, E2E verification, AJAX-heavy UI testing,
  auth-protected flow testing, visual regression, and performance budget enforcement
  using Playwright Test. Autodetects Laravel, Vite, Mix, Node, Bun, Next.js and
  Cloudflare Worker contexts. Writes persistent Playwright specs, runs tests with
  rich diagnostics, classifies failures with deterministic playbooks, enforces
  silent-failure detection, reports frontend contract gaps, and emits a stable
  JSONL flakiness history for analytics dashboards. Two runner modes (local dev
  vs CI) with different defaults. 17 optional phase 2 features (cross-browser,
  axe a11y, Lighthouse, swarm mode, AI root cause analyzer, etc.), all toggleable
  independently via .playwright-tester.json. Defensive-minimal defaults, progressive
  opt-in. Never auto-triggers: invoked via /playwright-tester slash command or the
  playwright-enterprise-tester agent.
---

# Playwright Enterprise Tester

Operational spec for browser-based verification, UI regression, AJAX-heavy flows,
auth-protected journeys, visual regression, and performance budgets.

Invocation is **always explicit** via:
- `/playwright-tester` slash command
- `playwright-enterprise-tester` agent delegation
- chained follow-up from another user-defined skill (optional)

This skill never auto-triggers from description match.

---

## Architecture at a glance

```
discover → classify → configure → author → execute → diagnose → fix → report
```

The skill keeps Playwright-native config (`playwright.config.ts`) cleanly separate
from the skill policy file (`.playwright-tester.json`). Native Playwright settings
live in the former; AI policy, governance, discovery hints, runner modes,
flakiness sink, phase-tagged roadmap flags live in the latter.

See `references/runner-modes-local-vs-ci.md` for the two execution profiles.

---

## Operating modes

Choose the narrowest valid mode. If the user request is vague, infer from the
touched code area. All modes are opt-in targets; the skill never runs a broader
scope than asked.

### Phase 1 modes (always available)

| Mode | Purpose |
|---|---|
| `smoke` | Fast confidence check on main route or changed feature |
| `critical-path` | Core business flows that must always work |
| `e2e-regression` | Persistent regression suite |
| `ajax-heavy` | Pages with async rendering, infinite scroll, filters, delayed hydration |
| `auth-protected` | Login/session-dependent journeys |
| `legacy-mpa` | Server-rendered apps (Blade/ERB/Twig) with form-submit + redirect |
| `visual-regression` | Screenshot baseline comparison, opt-in |
| `perf-budget` | Core Web Vitals budgets via injected `web-vitals`, opt-in |
| `release-gate` | CI-oriented, richer diagnostics, stricter reporting |

### Phase 2 modes (opt-in via config)

| Mode | Purpose | Config toggle |
|---|---|---|
| `dynamic-scraping` | Data extraction from JS-rendered pages | `scraping.enabled` |
| `a11y-scan` | Axe accessibility scan WCAG 2.1 AA | `axeA11y.enabled` |
| `mobile-perf` | Mobile perf budgets with device emulation | `mobileDesktopMatrix.enabled` |
| `cross-browser` | Multi-browser execution | `crossBrowser.enabled` |
| `popup-checkout` | Cross-tab/popup/iframe gateway flows | `crossTabPopup.enabled` |

All phase 2 features default to `enabled: false` and activate independently.
See `references/phase2-roadmap.md` for the complete list with 17 items.

---

## Invocation

Accepted arguments (from slash command or agent prompt):

| Arg | Example | Notes |
|---|---|---|
| `mode=` | `mode=visual-regression` | Picks profile from config |
| `files=` | `files=tests/e2e/cart.spec.ts,tests/e2e/checkout.spec.ts` | CSV of file paths |
| `folders=` | `folders=tests/e2e/critical/` | CSV of folders |
| `grep=` | `grep=checkout` | Maps to `--grep` |
| `tags=` | `tags=@critical,@smoke` | Maps to `--grep "@critical|@smoke"` |
| `brand=` | `brand=mybrand` | Overrides multi-tenant matrix (if enabled) |
| `country=` | `country=us` | Overrides matrix |
| `lang=` | `lang=en` | Overrides matrix |
| `update-snapshots=` | `update-snapshots=true` | Visual regression only, forbidden in CI |
| `fix-app-code=` | `fix-app-code=true` | Requires double-confirm governance |
| `dry-run=` | `dry-run=true` | Plan only, never execute |
| `runner=` | `runner=local` \| `runner=ci` | Override autodetect |

Precedence: `files` > `folders` > `grep` > `tags` > scope inferred from `mode`
> single smoke run.

If no scope and the mode is ambiguous, ask the user. Never silently run the full
suite.

See `references/targeted-execution-scope.md` for full mapping to Playwright CLI.

---

## Discovery first

Before writing tests or running commands, inspect the repository. Do not assume
`npm run dev` or `http://localhost:3000` unless discovery confirms it.

Detect, in order:

1. **Project profile** — detect the stack and load the relevant reference:
   - Laravel: `composer.json` contains `laravel/framework` → `references/laravel-patterns.md`
   - Next.js: `next` in `package.json` dependencies → load SPA patterns
   - Nuxt: `nuxt` in `package.json` → load SPA patterns
   - Bun + Hono: `bun.lock*` + `hono` → load Node/Bun patterns
   - Cloudflare Worker: `wrangler.toml*` → Worker patterns
   - Legacy MPA: server-rendered (any server-side templating)
   - Plain Node.js: `package.json` with `express`/`fastify`/custom server

2. **Package manager** — `bun.lock*` → bun; `pnpm-lock.yaml` → pnpm;
   `yarn.lock` → yarn; else npm.

3. **Existing Playwright setup** — `playwright.config.*`, `tests/**/*.spec.*`,
   helpers, auth setup, project docs.

4. **Execution topology** — single dev server, backend + frontend dual, remote
   staging URL already running, Worker local emulation.

5. **Runner mode** — `CI=true` or `GITHUB_ACTIONS=true` → `ci`; else `local`.
   Override: `PWTEST_RUNNER_MODE=local|ci`.

Discovery output is logged in the final report (`detected stack`,
`resolved runner mode`).

---

## Configuration precedence

Resolve behavior in this order:

1. explicit user request (slash command / agent args)
2. environment overrides (`PWTEST_*` vars)
3. `.playwright-tester.json` (repo policy)
4. existing `playwright.config.*` (Playwright runtime)
5. autodetected defaults (conservative)

Env override keys are mapped in `.playwright-tester.json → envOverrides`.

---

## Defensive-minimal defaults

Only these are **always on**, non-disableable:

- `trace: on-first-retry`
- `screenshot: only-on-failure`
- `claude-report.json` JSON reporter for the fix loop
- console/pageerror/requestfailed capture (allowlist configurable)
- **PII masking forced in CI runner mode** (not disableable when `environment=ci`)

Everything else — visual regression, perf budgets, silent failure enforce,
cookie consent auto-accept, multi-tenant matrix, flakiness sink, anti-pattern
linter enforcement, app-code fix, video, HTML report, and all 17 phase 2
features — is **opt-in** via config.

Runner mode (`local` vs `ci`) controls sensible per-environment defaults; see
`references/runner-modes-local-vs-ci.md`.

---

## Async / AJAX policy

For AJAX-heavy or dynamically rendered pages:

- Prefer waiting on user-visible UI signals, not arbitrary timeouts
- Prefer Playwright locators and assertions over manual waits
- Wait for loading indicators to disappear when they are part of the UX contract
- Wait for known network responses only when clearly tied to the behavior under test
- Avoid `waitForTimeout()` unless no deterministic signal exists; document why
- Use `networkidle` sparingly, never as a universal default
- For infinite scroll or lazy-loaded content, verify progressive item count growth
- For submit flows, verify button state, request completion, and user-visible
  success/error result
- For partial page updates, verify business-relevant DOM state after the async op

Full scenario library in `references/ajax-spa-patterns.md`.
For legacy MPA (server-rendered with form redirect) see
`references/legacy-mpa-patterns.md`.

---

## Locator policy

Use in this order:

1. `getByRole()`
2. `getByLabel()`
3. `getByPlaceholder()` when appropriate
4. `getByText()` only for stable text
5. `getByTestId()`
6. CSS selectors only as a last resort

Rules:
- Never choose CSS selectors first when a semantic locator exists
- Avoid coupling tests to generated classes, CSS modules, hashed selectors, DOM depth
- If resilient locators do not exist, recommend adding stable accessibility metadata
  or test IDs
- Prefer stable user-facing semantics over implementation details
- Marketing-volatile copy should never be the only anchor — use role + test ID

---

## Silent failure detection

Capture and fail on (allowlist-configurable):

- `page.on('console')` → severity `error` not in allowlist
- `page.on('pageerror')` → always
- `page.on('requestfailed')` → not in allowlist
- HTTP status ≥ 400 not in allowlist

In `local` runner mode, these are captured and reported but do not fail the test
unless explicitly enabled. In `ci` mode, they fail the test by default.

Config: `silentFailures.*`, runtime: `support/console-capture.ts`,
`support/network-capture.ts`.

---

## Frontend contract validation (report-only, manual)

Mandatory section of the final report. The skill detects and reports:

- missing accessible names for buttons and interactive controls
- missing labels for form inputs
- missing stable `data-testid` hooks where semantics are insufficient
- missing loading completion signals
- missing success/error states that can be asserted deterministically
- excessive dependency on unstable marketing copy
- brittle selector patterns based on dynamic CSS classes
- inaccessible dialogs, modals, tabs, menus

Output format and checklist: `references/frontend-contracts-checklist.md`.

> Phase 1 does NOT integrate axe-core or automated a11y scanners. It reports
> contract gaps qualitatively so the team can fix them progressively.
> Automated a11y scanning is phase 2 (`axeA11y.enabled`, see
> `references/axe-a11y-integration.md`).

---

## Auth-protected flows

- Check whether the project already provides test credentials or seeded users
- Prefer reusable authenticated setup over repeating UI login in every test
- Never hardcode secrets in specs; read from env only
- Preserve isolation across roles
- Use Playwright `project.dependencies: ['setup']` pattern
- For flaky logins, classify whether the problem is app auth, test setup, or env

Strategy doc: `references/auth-storage-state.md`.
Template: `templates/tests/setup/auth.setup.ts.tmpl`.

Default strategy: **read-only staging with pre-created users**, credentials only
via env (`PWTEST_USER_EMAIL`, `PWTEST_USER_PASSWORD`, etc.). No runtime seeding.

---

## Test data policy

Default strategy: `readonly-staging`:

- No runtime seed/teardown
- Pre-created user accounts per role (guest/user/admin/editor) referenced via env keys
- Assertions must be idempotent (no persistent state mutation) OR roll back via admin
  API where documented
- Destructive tests forbidden in CI (`testData.forbidDestructiveTests: true`)
- Checkout / payment flows only against sandbox gateways

Alternative strategies (opt-in):
- `artisan-bridge` for Laravel projects with dedicated test commands
- `transactional` for DB-wrapped tests
- `fresh-db-per-run` for full refresh nightly runs

Details: `references/test-data-staging-strategy.md`.

---

## Visual regression (opt-in)

- `toHaveScreenshot()` with `maxDiffPixelRatio`
- Baselines versioned under `tests/e2e/__screenshots__/` (optionally per brand/country/lang)
- Masking mandatory for dynamic areas: prices, counters, dates, timers, cookie banners
- Update workflow: `--update-snapshots` requires explicit flag AND manual PR review
- CI: snapshot updates forbidden; diffs uploaded as artifacts

Full guide: `references/visual-regression-guide.md`.
Template: `templates/tests/e2e/visual-regression.spec.ts.tmpl`.

---

## Performance budgets (opt-in)

Lightweight via `web-vitals` injected into `page.evaluate`. For full Lighthouse
audits, see `references/lighthouse-ci-integration.md` (phase 2, P2.14).

- Budgets per page type in `.playwright-tester.json → perfBudgets.budgets`
- Metrics: LCP, CLS, INP, TBT, FCP
- Violations fail the test only in `critical-path` and `release-gate` modes
- Optional chain to a follow-up skill on violation

Guide: `references/perf-budgets-guide.md`.
Template: `templates/tests/e2e/perf-budget.spec.ts.tmpl`.

---

## Authoring rules

- Create focused specs by concern (one file = one concern)
- Keep tests independent; no shared mutable state between tests
- Assert business outcomes, not implementation details
- Avoid overcoupling to CSS or transient DOM structure
- Reuse helpers only when they improve clarity and stability
- Separate scraping helpers from regression assertions
- Tag tests: `@smoke`, `@critical`, `@ajax`, `@auth`, `@visual`, `@perf`,
  `@legacy-mpa`, `@a11y`, `@mobile`, `@scrape`

Recommended layout:

```
tests/
  e2e/
    smoke.spec.ts
    critical-path.spec.ts
    auth.spec.ts
    ajax-heavy.spec.ts
    visual-regression.spec.ts
    perf-budget.spec.ts
  setup/
    auth.setup.ts
  support/
    cookie-consent.ts
    console-capture.ts
    network-capture.ts
    pii-mask.ts
```

---

## Execution strategy

Run the narrowest useful scope first.

1. Changed feature scope first (from `files=` / `folders=` / `grep=`)
2. Chromium first for speed (WebKit, Firefox are phase 2 opt-in)
3. Retry with diagnostics only if needed
4. Broader scope only after local fix validation
5. All configured projects before final signoff only when the request warrants it

---

## Failure classification & autofix playbooks

Every failure is classified as one of:

1. `test_bug` — wrong locator, bad assertion, missing deterministic wait,
   brittle fixture
2. `app_bug` — broken user flow, real rendering defect, business behavior
   mismatch, client/server failure, broken auth path
3. `environment_bug` — wrong port, app did not boot, bad webServer command,
   missing dependency, unavailable service
4. `flaky` — passes on retry, intermittent async/timing, unstable locator,
   shared state leakage, animation/hydration race, backend eventual consistency

Each classification has a deterministic autofix playbook in
`references/failure-classification-playbooks.md`. The skill attempts the
playbook fix first, reruns, and escalates only on failure.

**Critical governance rule:** the skill never silently modifies application
code. App-code changes require `governance.fixAppCode=true` AND
`PWTEST_FIX_APP_CODE=true` AND a classified `app_bug` failure, with the
change logged in `test-results/app-code-changes.log`.

---

## Fix loop

Maximum fix attempts: 3 (overridable via `governance.maxFixAttempts`).

On each failure:

1. diagnose and classify via the playbook
2. prefer fixing the smallest correct surface
3. rerun the minimal affected scope first
4. rerun broader scope when local fix validated
5. report whether the test became flaky or stable

Stop at `maxFixAttempts` regardless of outcome. Report and hand off to the user.

---

## Flakiness history (stable schema, dashboard-ready)

Every run appends to `test-results/flakiness-history.jsonl` (when
`flakinessAnalytics.enabled=true` — default on in `ci` mode only).

Schema is **versioned** (`schemaVersion: 1`) and stable so a dashboard project
can consume it without migration. Optional webhook push is available.

See `references/flakiness-analytics-schema.md` for the full schema and
`scripts/flaky-rank.mjs` for the local top-N ranker utility.

---

## Custom JSON reporter (claude-report.json)

The skill generates a structured JSON reporter output at
`test-results/claude-report.json`. Claude reads this file to decide fix-loop
actions. It is the authoritative machine-readable artifact for the skill.
Schema versioned (`schemaVersion: 1`).

---

## Final report requirements

Always include:

- detected stack and runtime
- resolved runner mode (`local` / `ci`) and why
- inferred or overridden mode
- commands used
- config source precedence
- tests created or updated
- pass/fail/flaky/skipped summary
- failure classifications
- app bugs found / test bugs found / environment bugs found
- flaky tests needing attention
- silent errors captured (console/pageerror/requestfailed)
- visual regression diffs (if enabled)
- performance budget violations (if enabled)
- axe a11y violations (if P2.12 enabled)
- perf audit results (if P2.14 Lighthouse enabled)
- artifact paths: HTML report, JSON report, trace archives, screenshots,
  videos, claude-report.json, flakiness-history.jsonl
- frontend contract findings + recommended remediation
- suggested follow-up actions

---

## Non-negotiable principles

- Discovery before generation
- Repository policy before ad-hoc assumptions
- Semantic locators before CSS selectors
- Deterministic waits before arbitrary sleeps
- Classification before modification
- **App code is never modified without explicit double-confirm governance**
- **PII masking is forced in CI, never disabled**
- Persistent value over one-off execution
- Frontend contract reporting always included
- Keep Playwright-native config separate from skill-specific policy
- Never auto-trigger; always invoked explicitly

---

## Reference index

On-demand reference loading (progressive disclosure):

### Phase 1 references (core)

| Reference | Load when |
|---|---|
| `laravel-patterns.md` | Laravel project detected |
| `legacy-mpa-patterns.md` | Server-rendered MPA detected or `mode=legacy-mpa` |
| `ajax-spa-patterns.md` | `mode=ajax-heavy` or SPA framework detected |
| `visual-regression-guide.md` | `mode=visual-regression` or `visualRegression.enabled=true` |
| `perf-budgets-guide.md` | `mode=perf-budget` or `perfBudgets.enabled=true` |
| `auth-storage-state.md` | `mode=auth-protected` or auth fixture detected |
| `frontend-contracts-checklist.md` | Final report generation (always) |
| `failure-classification-playbooks.md` | Fix loop entered |
| `runner-modes-local-vs-ci.md` | Runner mode resolution |
| `flakiness-analytics-schema.md` | `flakinessAnalytics.enabled=true` |
| `targeted-execution-scope.md` | Invocation parsing |
| `test-data-staging-strategy.md` | Test data questions |
| `ci-github-actions-template.md` | CI setup requested |
| `phase2-roadmap.md` | Phase 2 features requested |
| `anti-pattern-linter.md` | Linter invoked |

### Phase 2 references (opt-in features)

| Reference | P2 item | Load when |
|---|---|---|
| `cross-tab-popup-iframe.md` | P2.01 | `crossTabPopup.enabled=true` or `mode=popup-checkout` |
| `scraping-mode-full.md` | P2.02 | `scraping.enabled=true` or `mode=dynamic-scraping` |
| `github-issue-bot.md` | P2.03 | `githubIssueBot.enabled=true` |
| `test-impact-analysis.md` | P2.04 | `testImpactAnalysis.enabled=true` |
| `linter-enforce-mode.md` | P2.05 | `linterEnforce.enabled=true` |
| `codeowners-integration.md` | P2.06 | `codeownersIntegration.enabled=true` |
| `offline-air-gapped.md` | P2.07 | `offlineAirGapped.enabled=true` |
| `test-retirement-workflow.md` | P2.08 | `quarantineWorkflow.enabled=true` |
| `ai-root-cause-analyzer.md` | P2.10 | `aiRootCauseAnalyzer.enabled=true` |
| `slack-teams-notifications.md` | P2.11 | `slackTeamsNotifications.enabled=true` |
| `axe-a11y-integration.md` | P2.12 | `axeA11y.enabled=true` or `mode=a11y-scan` |
| `lighthouse-ci-integration.md` | P2.14 | `lighthouseCiIntegration.enabled=true` |
| `mobile-desktop-matrix.md` | P2.15 | `mobileDesktopMatrix.enabled=true` or `mode=mobile-perf` |
| `cross-browser-matrix.md` | P2.16 | `crossBrowser.enabled=true` or `mode=cross-browser` |
| `gdpr-trace-scrubber.md` | P2.17 | `gdprTraceScrubber.enabled=true` |
| `swarm-mode.md` | P2.18 | `swarmMode.enabled=true` |

Dashboard (P2.09): standalone project spec, see `docs/DASHBOARD-SPEC.md`.
P2.13 (API testing) is reserved for phase 3.
