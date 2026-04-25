# CI GitHub Actions template

Ready-to-adapt workflow for running Playwright via this skill in GitHub
Actions. Drop into `.github/workflows/playwright.yml` and adjust.

## Minimal workflow (smoke + critical on PR)

```yaml
name: playwright

on:
  pull_request:
    branches: [master, main]
    paths:
      - 'resources/**'
      - 'app/**'
      - 'tests/e2e/**'
      - 'playwright.config.*'
      - '.playwright-tester.json'
      - '.github/workflows/playwright.yml'
  push:
    branches: [master, main]

jobs:
  e2e:
    name: e2e (shard ${{ matrix.shard }}/${{ matrix.total }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
        total: [4]
    env:
      CI: true
      PWTEST_RUNNER_MODE: ci
      PWTEST_BASE_URL: ${{ vars.PWTEST_BASE_URL }}
      PWTEST_USER_EMAIL: ${{ secrets.PWTEST_USER_EMAIL }}
      PWTEST_USER_PASSWORD: ${{ secrets.PWTEST_USER_PASSWORD }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install deps
        run: npm ci

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ hashFiles('package-lock.json') }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium

      - name: Run smoke + critical tests
        run: |
          npx playwright test \
            --shard=${{ matrix.shard }}/${{ matrix.total }} \
            --grep="@smoke|@critical" \
            --reporter=line,html,json

      - name: Upload HTML report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-shard-${{ matrix.shard }}
          path: playwright-report/
          retention-days: 14

      - name: Upload traces and screenshots
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts-shard-${{ matrix.shard }}
          path: |
            test-results/artifacts/
            test-results/results.json
            test-results/claude-report.json
          retention-days: 14

      - name: Upload flakiness history
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: flakiness-history-shard-${{ matrix.shard }}
          path: test-results/flakiness-history.jsonl
          retention-days: 90

      # MANDATORY for TEST-CI-001 — Laravel/Horizon logs must be uploadable
      # so the AI can correlate frontend failures with backend exceptions.
      # Naming convention enforced by the rule:
      #   - single job (no matrix): "laravel-logs"
      #   - sharded matrix: "laravel-logs-shard-<N>"
      # The "laravel-logs" prefix is required so consumers can run
      #   gh run download <RUN-ID> --pattern "laravel-logs*"
      # against either layout. retention-days >= 14 (90 here for post-mortem).
      - name: Upload Laravel logs (TEST-CI-001)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: laravel-logs-shard-${{ matrix.shard }}
          path: |
            storage/logs/laravel.log
            storage/logs/horizon.log
          if-no-files-found: ignore
          retention-days: 90
```

> **Single-job (no matrix) variant**: when the workflow does not use a
> `matrix.shard`, name the artifact exactly `laravel-logs` (no shard suffix).
> The prefix `laravel-logs` is mandatory either way so the AI can run
> `gh run download --pattern "laravel-logs*"` consistently.

## Release gate workflow (nightly)

```yaml
name: playwright-release-gate

on:
  schedule:
    - cron: '0 2 * * *'  # 02:00 UTC every night
  workflow_dispatch:

jobs:
  release-gate:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    strategy:
      matrix:
        shard: [1, 2, 3, 4, 5, 6]
        total: [6]
    env:
      CI: true
      PWTEST_RUNNER_MODE: ci
      PWTEST_MODE: release-gate
      PWTEST_BASE_URL: ${{ vars.PWTEST_STAGING_URL }}
      PWTEST_USER_EMAIL: ${{ secrets.PWTEST_USER_EMAIL }}
      PWTEST_USER_PASSWORD: ${{ secrets.PWTEST_USER_PASSWORD }}
      PWTEST_VISUAL_REGRESSION: 'true'
      PWTEST_PERF_BUDGETS: 'true'

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: |
          npx playwright test \
            --shard=${{ matrix.shard }}/${{ matrix.total }} \
            --reporter=line,html,json
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: release-gate-shard-${{ matrix.shard }}
          path: |
            playwright-report/
            test-results/
          retention-days: 30

      # TEST-CI-001 mandatory artifact — Laravel logs separate from playwright artifacts
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: laravel-logs-shard-${{ matrix.shard }}
          path: |
            storage/logs/laravel.log
            storage/logs/horizon.log
          if-no-files-found: ignore
          retention-days: 30
```

## PR comment bot (merge report from all shards)

Add a second job that depends on all shards and produces a consolidated
PR comment:

```yaml
  report:
    name: Merge shard reports
    needs: e2e
    runs-on: ubuntu-latest
    if: always()
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: playwright-report-shard-*
          path: all-reports

      - name: Merge HTML reports
        run: |
          npx playwright merge-reports --reporter=html,line ./all-reports
        continue-on-error: true

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const jsonPath = 'test-results/claude-report.json';
            if (!fs.existsSync(jsonPath)) {
              core.setFailed('claude-report.json missing');
              return;
            }
            const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            const body = `## Playwright E2E report

            - **Total**: ${report.summary.total}
            - **Passed**: ${report.summary.passed}
            - **Failed**: ${report.summary.failed}
            - **Flaky**: ${report.summary.flaky}
            - **Duration**: ${(report.summary.duration / 1000).toFixed(1)}s

            ${report.failures.length > 0 ? '### Failures\n' + report.failures.map(f => `- \`${f.testId}\` — ${f.classification}`).join('\n') : ''}

            ${report.perfBudgetViolations?.length > 0 ? '### Perf budget violations\n' + report.perfBudgetViolations.map(v => `- ${v.page} ${v.metric}: ${v.actual}ms > ${v.budget}ms`).join('\n') : ''}

            HTML report: [Download artifact](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})`;

            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body
            });
```

## Secrets required

In GitHub repo settings → Secrets and variables → Actions:

- `PWTEST_USER_EMAIL` — email of the pre-created test user
- `PWTEST_USER_PASSWORD` — password of the pre-created test user
- (optional) `PWTEST_ADMIN_EMAIL` / `PWTEST_ADMIN_PASSWORD`
- (optional) `PWTEST_FLAKY_WEBHOOK_TOKEN` — for flakiness webhook push

In GitHub repo settings → Secrets and variables → Variables:

- `PWTEST_BASE_URL` — staging URL to test against
- `PWTEST_STAGING_URL` — full release gate staging URL

## Environment approval (production smoke)

If you want a manual approval gate before running against prod:

```yaml
jobs:
  prod-smoke:
    environment: production-smoke  # requires reviewer approval
    runs-on: ubuntu-latest
    env:
      PWTEST_BASE_URL: ${{ vars.PROD_URL }}
      PWTEST_MODE: smoke
    steps:
      # ... same as above, minimal scope
```

## Browser cache strategy

Playwright browsers are ~300MB. Cache them aggressively:

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('package-lock.json') }}
```

Cache hit → skip `playwright install`, saving ~2 minutes per run.

Cache key should include the Playwright version (via `package-lock.json`
hash) so upgrades invalidate the cache automatically.

## Sharding math

For N total tests and M shards:
- Each shard runs ~N/M tests
- Shards run in parallel → total wall-clock ≈ N/M × per-test time
- Ideal M = runner count you're willing to pay for
- Recommended: start with 4 shards, scale up to 8 if PR feedback
  time exceeds 10 minutes

## Failure notifications

Phase 1: use GitHub's built-in "PR check failed" notification. Phase 2:
add Slack/Teams webhook (see `phase2-roadmap.md#P2.11`).

## Environment-specific workflows

Separate workflows for:
- `playwright.yml` — PR checks (smoke + critical)
- `playwright-nightly.yml` — release-gate (visual regression + perf)
- `playwright-main.yml` — post-merge to master (full regression)
- `playwright-prod-smoke.yml` — manual, production smoke after deploy

Each with its own scope, sharding, and secrets.

## Troubleshooting CI runs

`TEST-CI-001` mandates the **full** download of artifacts and the FULL job log
before proposing any fix. Quick recipe:

```bash
RUN=$(gh run list --status=failure --limit 1 --json databaseId -q '.[0].databaseId')
mkdir -p ./_ci-debug/$RUN
gh run download $RUN --dir ./_ci-debug/$RUN
gh run view $RUN --log        > ./_ci-debug/$RUN/full.log    # required
gh run view $RUN --log-failed > ./_ci-debug/$RUN/failed.log  # triage shortcut
```

Then read in this order:

1. `full.log` — complete workflow log (NOT just failed steps)
2. HTML report artifact (`playwright-report-shard-*/`)
3. trace.zip for the failing test (`npx playwright show-trace`)
4. `claude-report.json` — classification + silentErrors
5. `laravel-logs-shard-*/storage/logs/laravel.log` — backend exceptions
6. `flakiness-history-shard-*/flakiness-history.jsonl` — already known flaky?

Reproduce locally: `PWTEST_RUNNER_MODE=ci npm run test:e2e`.

Full procedure: [`rule-ci-test-failure-analysis.md`](../../../../rules/rule-ci-test-failure-analysis.md).

## Security notes

- Never log `PWTEST_USER_PASSWORD` — GitHub Actions masks secrets but
  custom debug output can leak them if not careful
- Rotate test user credentials periodically
- Test users should have no access to production data
- Sandbox gateway keys only; never production gateway keys in CI
