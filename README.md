# Playwright Enterprise Tester

**An enterprise-grade Playwright E2E testing plugin for [Claude Code](https://claude.com/claude-code).**

Write, run, diagnose, and fix Playwright tests through a battle-tested AI agent
that enforces locator best practices, async policies, failure classification,
silent failure detection, PII masking, and 17 opt-in enterprise features.
Multi-stack: works out of the box on Laravel, Next.js, Bun, Cloudflare Workers,
and any Node-based web app.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Playwright](https://img.shields.io/badge/Playwright-1.40+-45ba4b.svg)](https://playwright.dev/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-8B5CF6.svg)](https://claude.com/claude-code)

---

## Why this plugin

Three problems every team faces with Playwright at scale:

1. **AI wastes tokens driving the browser live**. Every session starts from
   scratch, no persistence, no repeatability.
2. **Suites rot without governance**. Flaky tests, brittle CSS selectors,
   no failure classification, no observability, manual app fixes creep in.
3. **Setup is stack-specific and incomplete**. Generic Playwright guides miss
   Laravel CSRF, Next.js hydration, Bun dev servers, Cloudflare Worker
   emulation, cross-browser quirks, accessibility, and performance budgets.

This plugin solves all three by shipping:

- **A persistent skill** (`playwright-enterprise-tester`) with a complete
  operational spec — locator policy, async patterns, governance rules,
  classification playbooks
- **A dedicated subagent** (`playwright-enterprise-tester`) that handles
  discover → configure → author → execute → diagnose → fix → report
- **A slash command** (`/playwright-tester`) with fine-grained invocation
  (files, folders, tags, modes, brands, runners)
- **A policy config file** (`.playwright-tester.json`) with 17 opt-in phase 2
  features, all toggle-independent, all OFF by default
- **31 reference docs** with patterns, playbooks, scenarios, troubleshooting
- **21 starter templates** for specs, fixtures, setup, helpers
- **15 helper scripts** for classification, flakiness, linting, notifications,
  AI analysis, and more

## Feature highlights

### Phase 1 (always on)

- **Multi-stack autodetect** — Laravel, Vite, Mix, Node, Bun, Cloudflare
  Workers, monorepos
- **Two runner modes** — `local` (dev PC) vs `ci` (GitHub Actions) with
  different defaults per environment
- **Defensive-minimal defaults** — only trace, screenshot, JSON reporter,
  silent-failure capture, and PII masking (in CI) are always on
- **Locator policy** — enforced order `getByRole > getByLabel > getByPlaceholder
  > getByText > getByTestId > CSS`
- **Async policy** — no `waitForTimeout`, no `networkidle` as default, business
  signals only
- **Failure classification** — 4 types (`test_bug`, `app_bug`, `environment_bug`,
  `flaky`) with deterministic autofix playbooks
- **Governance** — app code changes require 4-condition double-confirm guardrail
- **Flakiness history** — stable JSONL schema (versioned) for analytics
- **Frontend contracts report** — manual/qualitative a11y findings
- **Silent failure detection** — console, pageerror, requestfailed with
  allowlist
- **PII masking** — forced in CI, scrubs screenshots
- **Custom JSON reporter** (`claude-report.json`) — machine-readable for the
  fix loop
- **Multi-tenant matrix** — brand × country × language (opt-in)
- **Visual regression** — `toHaveScreenshot` with baseline management (opt-in)
- **Performance budgets** — web-vitals injected, per-page-type LCP/CLS/INP/FCP
  (opt-in)

### Phase 2 (17 opt-in features, all OFF by default)

| # | Feature | Config toggle |
|---|---|---|
| P2.01 | Cross-tab / popup / iframe gateway flows | `crossTabPopup.enabled` |
| P2.02 | Scraping mode with helpers (paginate/infinite/modal) | `scraping.enabled` |
| P2.03 | Auto-create GitHub issues for app_bug failures | `githubIssueBot.enabled` |
| P2.04 | Test impact analysis from git diff | `testImpactAnalysis.enabled` |
| P2.05 | Anti-pattern linter enforce mode + pre-commit hook | `linterEnforce.enabled` |
| P2.06 | CODEOWNERS integration for failure routing | `codeownersIntegration.enabled` |
| P2.07 | Offline / air-gapped environment support | `offlineAirGapped.enabled` |
| P2.08 | Test retirement / quarantine workflow | `quarantineWorkflow.enabled` |
| P2.09 | Dashboard integration (client push to external worker) | `dashboardIntegration.enabled` |
| P2.10 | AI root cause analyzer (Anthropic Claude API) | `aiRootCauseAnalyzer.enabled` |
| P2.11 | Slack / Teams / generic webhook notifications | `slackTeamsNotifications.enabled` |
| P2.12 | Axe a11y scanning (WCAG 2.1 AA, `@axe-core/playwright`) | `axeA11y.enabled` |
| P2.14 | Lighthouse CI integration (full audits) | `lighthouseCiIntegration.enabled` |
| P2.15 | Mobile/desktop perf matrix with throttling | `mobileDesktopMatrix.enabled` |
| P2.16 | Cross-browser matrix (chromium + webkit + firefox) | `crossBrowser.enabled` |
| P2.17 | GDPR trace.zip PII scrubber | `gdprTraceScrubber.enabled` |
| P2.18 | Swarm mode (parallel sub-agent test authoring) | `swarmMode.enabled` |

Each feature is **fully dormant when disabled** (no side effects, no scripts
run) and **independently activatable**.

## Quick install

### Option A: Claude Code plugin marketplace (recommended)

```bash
# In Claude Code (once the plugin is in the marketplace)
/plugin install playwright-enterprise-tester
```

### Option B: Manual install

```bash
# 1. Clone the plugin into your project's .claude directory
cd your-project
git clone https://github.com/lopadova/playwright-enterprise-tester.git \
  .claude/plugins/playwright-enterprise-tester

# 2. Copy the config template to your project root
cp .claude/plugins/playwright-enterprise-tester/templates/.playwright-tester.json.tmpl \
   .playwright-tester.json

# 3. Install Playwright peer deps
npm install -D @playwright/test
npx playwright install chromium

# 4. In Claude Code, the skill / agent / command auto-discover
```

### Option C: Interactive installer (scaffolds everything)

```bash
node .claude/plugins/playwright-enterprise-tester/scripts/install.mjs
```

The interactive installer:
- Detects your stack (Laravel / Next.js / Bun / Node / CF Worker)
- Asks for base URL, test user credentials, enabled phase 2 features
- Generates `.playwright-tester.json` with sensible defaults
- Creates `playwright.config.ts` from template
- Creates `tests/e2e/`, `tests/setup/`, `tests/support/` skeleton
- Prints next steps

## Your first test

```bash
# In Claude Code
/playwright-tester mode=smoke
```

The agent:
1. Reads `.playwright-tester.json`
2. Detects your stack and runner mode
3. Runs the smoke suite with defensive defaults
4. Produces `test-results/claude-report.json`
5. Reports back with a structured summary

Example invocations:

```bash
# Fast smoke check
/playwright-tester mode=smoke

# Critical path on a specific file
/playwright-tester mode=critical-path files=tests/e2e/cart.spec.ts

# Visual regression with snapshot update (local only)
/playwright-tester mode=visual-regression update-snapshots=true

# Cross-browser release gate
/playwright-tester mode=release-gate runner=ci

# Dry run to preview
/playwright-tester dry-run=true mode=critical-path

# Accessibility scan (requires P2.12 enabled)
/playwright-tester mode=a11y-scan

# Mobile perf budgets (requires P2.15 enabled)
/playwright-tester mode=mobile-perf
```

## Supported stacks

Tested and documented patterns for:

- **Laravel** (Blade, Livewire, Inertia, with Mix or Vite) — `docs/examples/laravel.md`
- **Next.js** 14+ — `docs/examples/nextjs.md`
- **Bun + Hono** — `docs/examples/bun-hono.md`
- **Cloudflare Workers + Wrangler** — `docs/examples/cloudflare-worker.md`
- **Any Node.js web app** (Express, Fastify, custom server)
- **Monorepos** (pnpm workspaces, Turborepo, Nx)

Not on the list? The plugin works with any Playwright-compatible project —
just point `baseURL` at it.

## Runner modes

| Setting | `local` | `ci` |
|---|---|---|
| trace | on-first-retry | on-first-retry |
| screenshot | only-on-failure | only-on-failure |
| video | off | retain-on-failure |
| retries | 0 | 2 |
| workers | 50% CPU | 2 (or per-shard) |
| reporters | line | line + html + json |
| HTML report | off | on |
| Silent failures | captured | **enforced** |
| PII masking | optional | **forced** |

Autodetect: `CI=true` or `GITHUB_ACTIONS=true` → `ci`; else `local`.
Override: `PWTEST_RUNNER_MODE=local|ci`.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Developer or CI workflow                                      │
└───────────────────┬────────────────────────────────────────────┘
                    │ /playwright-tester or agent delegation
                    ▼
┌────────────────────────────────────────────────────────────────┐
│  playwright-enterprise-tester agent                            │
│  discover → configure → author → execute → diagnose → fix      │
└───┬──────────┬──────────┬──────────┬──────────┬────────────────┘
    │          │          │          │          │
    ▼          ▼          ▼          ▼          ▼
 SKILL.md  references/ templates/  scripts/  .playwright-tester.json
                                                │
                                                │ reads → translates
                                                ▼
                                        playwright.config.ts
                                                │
                                                ▼
                                        npx playwright test
                                                │
                                                ▼
                               HTML report │ JSON │ trace │ video
                                                │
                                                ▼
                            claude-report.json + flakiness-history.jsonl
```

## Documentation

| Document | Purpose |
|---|---|
| [README.md](README.md) | You are here — marketplace landing page |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Day-1 checklist, week-1 plan, progressive phase 2 rollout, per-role paths |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every `.playwright-tester.json` parameter explained |
| [docs/PHASE-2-FEATURES.md](docs/PHASE-2-FEATURES.md) | All 17 phase 2 features with enable instructions |
| [docs/PHASE-3-ROADMAP.md](docs/PHASE-3-ROADMAP.md) | Future features and deferred items |
| [docs/DASHBOARD-SPEC.md](docs/DASHBOARD-SPEC.md) | Complete spec for a standalone dashboard Cloudflare Worker |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Deep dive into the plugin architecture |
| [docs/MIGRATION.md](docs/MIGRATION.md) | Upgrading from older versions or adopting mid-project |
| [docs/examples/](docs/examples/) | Per-stack integration examples |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Configuration in one glance

Everything is controlled by `.playwright-tester.json` at the project root.
Structure (simplified):

```json
{
  "version": 4,
  "schemaVersion": 2,
  "phase": 2,
  "enabled": true,
  "runner": {
    "modes": {
      "local": { /* dev defaults */ },
      "ci":    { /* ci defaults, PII masking forced */ }
    }
  },
  "governance": { "fixAppCode": false, "maxFixAttempts": 3 },
  "locatorPolicy": { "preferredOrder": ["getByRole", "getByLabel", "..."] },
  "asyncPolicy":   { "forbidWaitForTimeout": true },
  "visualRegression":   { "enabled": false },
  "perfBudgets":        { "enabled": false },
  "crossTabPopup":      { "enabled": false },
  "scraping":           { "enabled": false },
  "githubIssueBot":     { "enabled": false },
  "testImpactAnalysis": { "enabled": false },
  "linterEnforce":      { "enabled": false },
  "codeownersIntegration": { "enabled": false },
  "offlineAirGapped":   { "enabled": false },
  "quarantineWorkflow": { "enabled": false },
  "aiRootCauseAnalyzer":{ "enabled": false },
  "slackTeamsNotifications": { "enabled": false },
  "axeA11y":            { "enabled": false },
  "lighthouseCiIntegration": { "enabled": false },
  "mobileDesktopMatrix": { "enabled": false },
  "crossBrowser":       { "enabled": false },
  "gdprTraceScrubber":  { "enabled": false },
  "swarmMode":          { "enabled": false },
  "dashboardIntegration": { "enabled": false }
}
```

Full parameter reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Frontend best practices (team contract for stable tests)

> **Read this if you ship frontend code in a project that uses this plugin.**
> Tests break far more often because of fragile markup than because of bad
> Playwright code. The rules below are the **contract** the frontend must
> respect so the test suite survives refactors, copy changes, CSS rewrites
> and component-library upgrades.
>
> Deep reference (with severity, report format, automation boundary):
> [frontend-contracts-checklist.md](skills/playwright-enterprise-tester/references/frontend-contracts-checklist.md).

### Locator hierarchy (enforced by the plugin)

The plugin (and the agent) selects locators in this exact order. **Use the
highest in the list that works**, drop one level only when the level above
genuinely cannot be applied:

1. `getByRole()` — semantic, accessibility-driven, the most resilient
2. `getByLabel()` — for form fields with a real `<label>`
3. `getByPlaceholder()` — only when there is no label (last-resort for inputs)
4. `getByText()` — only for **stable** copy (not marketing-volatile)
5. `getByTestId()` — explicit, stable contract via `data-testid`
6. CSS selector — **last resort**, requires justification

The anti-pattern linter (`P2.05`) will flag tests that violate this order.

### A. Semantically stable UI

Buttons, links, inputs, dialogs, checkboxes must expose **roles** and
**accessible names** that don't depend on CSS classes or DOM structure.
This is what makes `getByRole()` survive refactors.

**Wrong**

```html
<div class="btn-primary" onclick="addToCart()">🛒</div>
<div class="modal-wrapper-v2">...</div>
<span class="form-input"><input type="text" /></span>
```

**Right**

```html
<button type="button" aria-label="Add to cart">🛒</button>
<div role="dialog" aria-labelledby="checkout-title">
  <h2 id="checkout-title">Checkout</h2>
  ...
</div>
<label for="email">Email</label>
<input id="email" type="email" name="email" />
```

Test code that survives refactors:

```ts
await page.getByRole('button', { name: 'Add to cart' }).click();
await expect(page.getByRole('dialog', { name: 'Checkout' })).toBeVisible();
await page.getByLabel('Email').fill('user@example.com');
```

### B. Form fields must be properly labeled

Every input needs a real `<label for>` association or an equivalent
accessible attribute. Without it `getByLabel()` cannot find the field.

**Wrong**

```html
<span>Email</span>
<input type="email" name="email" />
```

**Right**

```html
<label for="email">Email</label>
<input id="email" type="email" name="email" />

<!-- or, when no visual label is desired -->
<input type="search" aria-label="Site search" />
```

### C. `data-testid` is a stable testing contract — not a fallback dump

When semantics are not enough (icon-only buttons, repeating list items,
highly dynamic widgets), add `data-testid` **on critical business nodes only**
and treat it as a public API of the frontend.

**Naming convention:** `data-testid="{scope}-{element}-{variant}"`.

**Wrong**

```html
<!-- random, internal, framework-generated -->
<button class="sc-a8b21f">Pay</button>
<div id="react-root-42-checkout-btn-1">...</div>
```

**Right**

```html
<button type="button" data-testid="checkout-submit">Pay now</button>
<li data-testid="cart-item" data-testid-id="sku-1234">...</li>
<div data-testid="address-form-city">...</div>
```

```ts
await page.getByTestId('checkout-submit').click();
const items = page.getByTestId('cart-item');
await expect(items).toHaveCount(3);
```

**Rules:**

- never use **CSS classes** as test hooks
- never use **framework-generated IDs** as test hooks
- if you change internal markup but keep `data-testid` stable, the suite survives
- removing or renaming a `data-testid` is a **breaking change** — coordinate with QA

### D. Don't anchor tests to volatile marketing copy

CTAs maintained by marketing change frequently. `getByText('Buy now!')` will
break the day someone ships `'Shop the collection'`.

**Wrong**

```ts
// ❌ marketing-volatile
await page.getByText('🔥 Limited offer — Buy now!').click();
```

**Right**

```html
<button type="button" aria-label="Buy now" data-testid="pdp-buy-now">
  🔥 Limited offer — Buy now!
</button>
```

```ts
// ✅ accessible name + stable testid
await page.getByRole('button', { name: 'Buy now' }).click();
// or
await page.getByTestId('pdp-buy-now').click();
```

`getByText()` is fine for **stable** content (page titles, fixed labels),
not for editorial copy.

### E. No selectors based on generated/hashed CSS classes

CSS Modules, CSS-in-JS, Tailwind utility classes, Emotion, styled-components,
component libraries — all produce hashed or rebuild-volatile classes.

**Wrong**

```ts
await page.locator('.sc-a1b2c3').click();
await page.locator('div.bg-red-500.px-4.py-2 > span').click();
await page.locator('#__next > main > div:nth-child(3) > button').click();
```

**Right**

```ts
await page.getByRole('button', { name: 'Confirm order' }).click();
await page.getByTestId('order-confirm').click();
```

### F. Loading / success / error states must be observable

Tests need a deterministic signal that an async action finished. Don't rely
on animations, `setTimeout`, or "things look done now". Expose state.

**Wrong**

```html
<div class="spinner-anim"></div> <!-- no role, no testid, just CSS -->
<div class="toast">Saved</div>   <!-- no role, no anchor -->
```

**Right**

```html
<!-- loading -->
<div role="status" aria-live="polite" data-testid="orders-loading">
  Loading orders…
</div>

<!-- success -->
<div role="status" data-testid="save-success">Profile saved</div>

<!-- error -->
<div role="alert" data-testid="checkout-error">
  Payment was declined
</div>

<!-- submit button reflects state -->
<button type="submit" data-testid="checkout-submit" disabled>
  Processing…
</button>
```

```ts
await page.getByTestId('checkout-submit').click();
await expect(page.getByRole('status', { name: /profile saved/i })).toBeVisible();
// or
await expect(page.getByTestId('save-success')).toBeVisible();
```

### G. Async stability on SPAs (React, Vue, Livewire, Inertia, Alpine)

Playwright auto-waits on locators, but only if the UI exposes a real
"finished" signal. Do **not** make tests guess.

**Wrong**

```ts
await page.click('#submit');
await page.waitForTimeout(2000); // ❌ forbidden by the async policy
expect(await page.locator('.row').count()).toBe(5);
```

**Right**

```ts
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByTestId('results-row')).toHaveCount(5);
// auto-waits up to the timeout, no sleeps
```

If you have a list that streams in, expose a `data-testid="results-loaded"`
flag the test can wait on, or wait on a count assertion as above.

### H. Accessible dialogs, tabs and menus

Custom widgets without ARIA roles are **invisible** to `getByRole`, forcing
the test back to CSS. Add the roles.

**Wrong**

```html
<div class="my-modal open">
  <div class="my-modal-body">...</div>
</div>
```

**Right**

```html
<div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
     data-testid="confirm-dialog">
  <h2 id="confirm-title">Delete account?</h2>
  <button type="button">Cancel</button>
  <button type="button">Delete</button>
</div>
```

```ts
const dialog = page.getByRole('dialog', { name: 'Delete account?' });
await expect(dialog).toBeVisible();
await dialog.getByRole('button', { name: 'Delete' }).click();
```

### Team rules at a glance

| ✅ Do | ❌ Don't |
|---|---|
| Use semantic HTML (`<button>`, `<label>`, `<dialog>`) | Use `<div onclick>` with CSS classes |
| Give every interactive control an accessible name | Rely on icons / emojis only |
| Associate every input with a real `<label for>` | Use `<span>` or visual proximity as the label |
| Add `data-testid` on business-critical nodes | Sprinkle `data-testid` on every element |
| Treat `data-testid` as a public API (review changes) | Rename/remove a testid without telling QA |
| Use `getByRole` first, `getByTestId` for the rest | Fall back to CSS or `nth-child` selectors |
| Expose loading/success/error via `role` or `data-testid` | Use animations / timers as the only signal |
| Use stable copy for `getByText` | Anchor tests to marketing-volatile strings |

### How the plugin enforces this

- **Locator policy** in `.playwright-tester.json` → declarative preferred order
- **Anti-pattern linter** (`P2.05 linterEnforce`) → fails tests that violate it
- **Frontend contracts report** → every run lists missing labels, missing
  testids and CSS-coupled selectors with severity (`high` / `medium` / `low`)
- **Failure classification** → distinguishes a real `app_bug` from a `test_bug`
  caused by a contract violation, so the right team owns the fix

If you adopt these rules, your test suite will survive almost every refactor
and your `frontendContractFindings` section will stay green.

## Progressive adoption

Don't enable all 17 phase 2 features at once. Suggested order (see
[docs/ONBOARDING.md](docs/ONBOARDING.md) for details):

1. **Wave A — Foundations**: P2.05 Linter, P2.06 CODEOWNERS, P2.11 Slack
2. **Wave B — Visibility**: P2.03 GitHub issues, P2.08 Quarantine, P2.04 Test impact
3. **Wave C — Quality**: P2.15 Mobile matrix, P2.16 Cross-browser, P2.12 Axe, P2.14 Lighthouse
4. **Wave D — Advanced**: P2.01 Popup/iframe, P2.10 AI RCA, P2.18 Swarm, P2.02 Scraping
5. **Wave E — Niche**: P2.17 GDPR scrubber, P2.07 Offline, P2.09 Dashboard

One wave per sprint is a reasonable pace.

## Governance

**The agent never silently modifies application code.** App code changes
require ALL of:

1. `governance.fixAppCode=true` in `.playwright-tester.json`
2. `governance.allowAppCodeChangesWhenExplicitlyEnabled=true`
3. `PWTEST_FIX_APP_CODE=true` in the process env
4. A classified `app_bug` failure with trace + log evidence
5. User confirmation via the slash command arg `fix-app-code=true`

Every app-code file touched is logged in `test-results/app-code-changes.log`.

This is enterprise-critical: the plugin is safe to deploy in teams where
silent AI patches would be unacceptable.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Reporting bugs
- Proposing new features
- Adding stack examples
- Extending reference docs
- Writing new helper scripts

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Acknowledgments

Built on top of [Playwright](https://playwright.dev/) by Microsoft.
Designed for [Claude Code](https://claude.com/claude-code) by Anthropic.

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
