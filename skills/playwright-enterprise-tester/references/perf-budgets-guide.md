# Performance budgets guide

Load when `mode=perf-budget` or `perfBudgets.enabled=true`.

## Philosophy

users may have a dedicated pagespeed review skill for full Core Web
Vitals audits. This skill's `perf-budget` mode is **lightweight, in-test,
runtime-measured** — it catches regressions early, during E2E runs, without
needing a separate Lighthouse CI pipeline.

The two work together:
- `perf-budget` mode: fast guardrail inside Playwright tests
- the user-configured chained skill: full audit on demand or as chained follow-up

## Technique: web-vitals injected at runtime

The skill injects the `web-vitals` library (bundled locally in the support
fixture, not from CDN) into each page and reads the metrics after navigation.

```ts
import { onLCP, onCLS, onINP, onTTFB, onFCP } from 'web-vitals';

// Injected into the page via page.evaluate(...)
// Collected via window.__pwWebVitals = {...}
```

Metrics collected:
- **LCP** — Largest Contentful Paint
- **CLS** — Cumulative Layout Shift
- **INP** — Interaction to Next Paint (replaces FID)
- **FCP** — First Contentful Paint
- **TBT** — Total Blocking Time (derived from long tasks)

## Budget definition

Budgets live in `.playwright-tester.json → perfBudgets.budgets`. Each page
type has its own budget:

```json
"perfBudgets": {
  "enabled": false,
  "budgets": {
    "home": { "LCP": 2500, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 1800 },
    "pdp":  { "LCP": 2500, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 1800 },
    "plp":  { "LCP": 2800, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 2000 },
    "cart": { "LCP": 2500, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 1800 },
    "checkout": { "LCP": 3000, "CLS": 0.1, "INP": 200, "TBT": 400, "FCP": 2000 }
  }
}
```

Values are in milliseconds except CLS (unitless). Align these with the your project
targets from `CLAUDE.md → the configured follow-up skill`:

| Metric | Mobile target | Desktop target |
|---|---|---|
| LCP | < 2500ms | < 1500ms |
| INP | < 200ms | < 100ms |
| CLS | < 0.1 | < 0.1 |
| TBT | < 300ms | < 200ms |

Phase 1 uses a single budget per page type. Phase 2: separate mobile/desktop
budgets via Playwright device emulation.

## Pass/fail semantics

Budget violations fail the test only in these modes:

```json
"failOnBudgetExceededInModes": ["critical-path", "release-gate"]
```

In other modes (smoke, ajax-heavy, ...), violations are captured and reported
as warnings in `claude-report.json`, but do not fail the test.

Rationale: dev flow prioritizes fixing functional bugs; perf is enforced at
the critical-path gate and release gate only.

## Chain to the configured follow-up skill

When a budget is violated in `critical-path` or `release-gate` AND
`perfBudgets.chainPagespeedReviewOnFailure=true`, the skill automatically
invokes the configured follow-up skill with the failing files as scope. This gives the
developer a full audit without manual invocation.

See `.claude/rules/rule-chain-pagespeed-after-frontend-tests.md`.

## Measurement pitfalls

### LCP jitter on cold cache

The first load of a page from a cold cache always reports worse LCP than
subsequent loads. In tests:

- always warm the cache with an initial `page.goto` before the measurement
- OR measure the cold load specifically (e.g., `test('cold home LCP')`)

Do not mix cold and warm measurements in the same test.

### INP measurement requires interaction

INP is measured on real user interactions (click, key press). A page that
loads and is never interacted with has no INP. For meaningful INP:

```ts
await page.goto('/');
await page.getByRole('button', { name: /menu/i }).click();  // trigger INP
// Now read web-vitals — INP is populated
```

### CLS accumulates until the page is closed

CLS keeps accumulating as long as the page is alive. Assert CLS only at a
stable state (after scroll, after all images loaded), not immediately after
load.

### Third-party scripts distort metrics

External scripts (Segment, Algolia, Magnews, SalesManago) add CPU time and
may trigger layout shifts. In CI, with `runner.modes.ci.stubExternalServices=true`,
these should be stubbed to return empty. In local, they run for real, which
may cause budget violations that are not the team's fault.

Use `-no-third-party` tag or `stubExternalServices` flag to exclude them.

## Per-page type resolution

The fixture resolves which budget applies based on the URL path:

```ts
function resolveBudget(url: string, budgets: Record<string, Budget>): Budget {
  const path = new URL(url).pathname;
  if (path === '/' || path.match(/^\/(it|en|fr|de)\/?$/)) return budgets.home;
  if (path.match(/\/p\//)) return budgets.pdp;
  if (path.match(/\/c\//)) return budgets.plp;
  if (path.match(/\/cart/)) return budgets.cart;
  if (path.match(/\/checkout/)) return budgets.checkout;
  return budgets.home; // default
}
```

Customize the URL pattern matching in the fixture to match your routes.

## Reporting

Violations are written to `claude-report.json → perfBudgetViolations`:

```json
"perfBudgetViolations": [
  { "page": "pdp", "url": "/p/scarpa-123", "metric": "LCP", "budget": 2500, "actual": 3120 }
]
```

The final report includes a table per page type with pass/fail per metric.

## Anti-patterns

- Running perf tests on an unprepared local machine (CPU busy, network slow)
  → unreliable
- Measuring before the LCP element has rendered → falsely low LCP
- Asserting a hard threshold without allowing for CI variance → flaky
- Using networkidle as a proxy for "page ready" → misleading metrics
- Mixing perf tests with functional tests in the same spec → slow both

## Template

See `templates/tests/e2e/perf-budget.spec.ts.tmpl` for a starter.

## Phase 2 candidates

- Lighthouse CI integration for full audit reports
- Mobile vs desktop budgets via device emulation matrix
- Historical trend tracking (via the flakiness JSONL sink, extended)
- Alert when budget consistently violated over N runs
- Integration with Real User Monitoring (RUM) data
