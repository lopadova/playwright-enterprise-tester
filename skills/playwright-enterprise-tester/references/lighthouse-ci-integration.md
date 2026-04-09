# Lighthouse CI integration (P2.14)

Load when `lighthouseCiIntegration.enabled=true`.

External Lighthouse runs for full Core Web Vitals audits. Complements the
phase 1 `perf-budget` mode which uses `web-vitals` injected at runtime.

## Why both?

- **`perf-budget` (phase 1)**: lightweight, inline, fast feedback during
  regular E2E runs. Budget checks only.
- **`lighthouse-ci` (phase 2)**: full audit with performance, accessibility,
  best-practices, and SEO categories. Heavier, slower, runs less often
  (e.g., nightly release-gate).

They are not redundant: use both for different granularities.

## Config

```json
"lighthouseCiIntegration": {
  "enabled": false,
  "lighthousePackage": "lighthouse",
  "mode": "standalone-job",
  "availableModes": ["standalone-job", "inline-test", "post-run-hook"],
  "chromeFlags": ["--headless=new", "--no-sandbox", "--disable-gpu"],
  "categories": ["performance", "accessibility", "best-practices", "seo"],
  "thresholds": {
    "performance": 85,
    "accessibility": 90,
    "best-practices": 85,
    "seo": 90
  },
  "pagesToAudit": [
    { "name": "home", "url": "/" },
    { "name": "pdp", "url": "/p/example-product" },
    { "name": "plp", "url": "/c/example-category" },
    { "name": "cart", "url": "/cart" }
  ],
  "outputDir": "test-results/lighthouse",
  "runFrequency": "release-gate-only"
}
```

## Modes

### `standalone-job` (recommended)

Dedicated CI job that runs after the Playwright tests pass:

```yaml
jobs:
  e2e:
    # ... playwright tests

  lighthouse:
    needs: e2e
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: |
          node .claude/skills/playwright-enterprise-tester/scripts/lighthouse-runner.mjs \
            --base-url=${{ vars.PWTEST_STAGING_URL }} \
            --output-dir=test-results/lighthouse
      - uses: actions/upload-artifact@v4
        with:
          name: lighthouse-reports
          path: test-results/lighthouse/
```

### `inline-test`

Runs Lighthouse as a Playwright test. Requires Chrome flags compatibility.
Slower per-test but easier to integrate.

### `post-run-hook`

Runs Lighthouse after the main test suite, regardless of test success/fail.
Good for always collecting metrics, even on failure.

## Thresholds

Each category has a 0-100 score. The thresholds define minimum acceptable:

```json
"thresholds": {
  "performance": 85,
  "accessibility": 90,
  "best-practices": 85,
  "seo": 90
}
```

Below threshold → the job fails and the report is uploaded for inspection.

## Pages to audit

Each page in `pagesToAudit` is audited with full Lighthouse. Keep the list
focused on critical pages:
- home (landing)
- pdp (top selling product)
- plp (top category)
- cart (checkout funnel entry)

Avoid auditing every page; Lighthouse is expensive (~1 minute per page).

## Output

For each page, Lighthouse produces:
- `home.report.html` — visual report
- `home.report.json` — machine-readable
- `home.lhr.json` — raw Lighthouse Result

All in `test-results/lighthouse/`.

## Integration with HTML report

When `perfBudgets.chainPagespeedReviewOnFailure=true` (phase 1), a
Lighthouse run is triggered on perf budget violation. Results are merged
into the final claude-report:

```json
"lighthouseResults": [
  { "page": "home", "performance": 87, "accessibility": 92, ... }
]
```

## Consistency tips

Lighthouse is sensitive to environment:
- Always run on the same OS (Ubuntu latest)
- Always run on the same CPU tier (use a dedicated runner size if budget allows)
- Warm the cache before measurement (run the URL twice, discard first)
- Avoid running in parallel with other jobs
- Use throttling config: "simulatedThrottling": true for reproducibility

## Run frequency

`runFrequency: release-gate-only` — don't run on every PR, only on:
- Nightly scheduled workflow
- Release branches
- Manual dispatch

Running Lighthouse on every PR adds ~5-10 minutes per run and generates
noise from minor fluctuations.

## Phase 3 candidates

- Lighthouse CI server with historical trends (separate from your project)
- Auto-comment on PRs when metrics regress
- A/B comparison between two URLs (current vs baseline)
- Integration with real-user monitoring (RUM) data
