# Runner modes: local vs CI

The skill operates in one of two runner modes, resolved per run. Each mode
has its own sensible defaults; the repo config can override individual
settings but the broad profile is mode-driven.

## Detection

1. If env var `PWTEST_RUNNER_MODE` is set → use it (`local` or `ci`)
2. Else if any of `runner.autoDetectCiEnvKeys` is set to a truthy value
   (`CI=true`, `GITHUB_ACTIONS=true`, `GITLAB_CI=true`) → `ci`
3. Else → `local`

The resolved mode is always logged at the top of the final report:

```
Runner mode: ci (detected via GITHUB_ACTIONS=true)
```

## Local mode (dev PC)

Intended for: developer machines with full dev environment, access to
sandbox DB, anonymized data, debugging tools.

| Setting | Value |
|---|---|
| stubExternalServices | false |
| maskPiiInArtifacts | false |
| videoDefault | off |
| traceDefault | on-first-retry |
| screenshotDefault | only-on-failure |
| parallelWorkers | 50% of CPU |
| retries | 0 |
| reporters | line |
| flakinessSink | off |
| failOnConsoleError | false |
| allowDestructiveTests | true |
| htmlReport | false |
| requireConfirmationForScopeAll | true |

Rationale: fast feedback, minimal noise, no CI overhead. The dev can toggle
on visual regression or perf budgets via the slash command args, but default
is smoke-fast.

## CI mode (GitHub Actions or similar)

Intended for: CI runners, where stubs and mocks are the norm, GDPR masking
is enforced, and diagnostic artifacts must be rich enough to debug without
SSH.

| Setting | Value |
|---|---|
| stubExternalServices | **true** (required) |
| maskPiiInArtifacts | **true** (forced, cannot be disabled) |
| videoDefault | retain-on-failure |
| traceDefault | on-first-retry |
| screenshotDefault | only-on-failure |
| parallelWorkers | 2 (configurable, match CI CPU) |
| retries | 2 |
| reporters | line + html + json |
| flakinessSink | jsonl |
| failOnConsoleError | true |
| allowDestructiveTests | false |
| htmlReport | true |
| shardingEnabled | true |
| shardsTotal | 4 |

Rationale: CI is the release gate. It must catch silent failures (console
errors), preserve video/traces for debugging, and enforce GDPR on artifacts.

## PII masking: forced in CI

`gdpr.maskPiiInArtifactsForcedInCi: true` — even if a team member sets
`maskPiiInArtifacts.ci: false` in the config, CI mode overrides it to `true`.
This is a safety net: no PII ever leaks out of CI artifacts uploaded to
GitHub/GitLab.

Masked fields (default `gdpr.maskSelectors`):
- `input[type='email']`
- `input[name*='phone']`
- `input[name*='tax_code']`, `input[name*='codice_fiscale']`
- `input[name*='iban']`
- `input[name*='card']`, `input[name*='cvv']`
- `[data-pii]` (opt-in custom marker)

Masking applies to screenshots via `toHaveScreenshot({ mask: [...] })` and
to on-failure screenshots via a custom `mask` option in `use`.

Phase 2: network payload scrubbing in trace.zip (currently not implemented).

## Override via env vars

Any setting can be overridden at runtime:

```bash
PWTEST_RUNNER_MODE=ci PWTEST_TRACE=on npx playwright test
```

See `.playwright-tester.json → envOverrides` for the full mapping.

## Override via slash command

```
/playwright-tester mode=critical-path runner=ci
```

The slash command's `runner=` arg forces the mode, useful for local CI-like
runs.

## Per-mode mode selection

Some test modes imply runner mode adjustments:

- `release-gate`: effectively implies ci defaults even if running locally
  (retries=2, HTML report on, richer diagnostics)
- `smoke` in CI: may reduce retries from 2 to 1 for speed
- `visual-regression`: forces `--update-snapshots` to be CI-forbidden

These are documented per mode in the SKILL.md.

## Parallelism and sharding

Local:
- `--workers=50%` (half the CPUs, leaves room for other dev tasks)
- No sharding

CI:
- `--workers=2` per shard
- `--shard=X/Y` across Y runners (X=1..Y)
- Results merged at the end of the pipeline

GitHub Actions example (see `ci-github-actions-template.md`):

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx playwright test --shard=${{ matrix.shard }}/4
```

## Artifacts per mode

Local:
- traces under `test-results/artifacts/traces/` (only on retry)
- screenshots under `test-results/artifacts/screenshots/` (only on failure)
- no video
- no HTML report

CI:
- everything in local, PLUS
- video under `test-results/artifacts/videos/`
- HTML report under `playwright-report/`
- JSON report at `test-results/results.json`
- `claude-report.json` at `test-results/claude-report.json`
- flakiness JSONL at `test-results/flakiness-history.jsonl`

All uploaded as GitHub Actions artifacts via the workflow template.

## When to override mode manually

Good reasons to force `runner=ci` locally:
- reproducing a CI-only failure
- validating a fix before pushing
- running the full diagnostic bundle to debug flakiness

Good reasons to force `runner=local` in CI:
- almost never; CI mode is hardened for a reason

If you find yourself wanting `runner=local` in CI, you're probably trying to
disable GDPR masking or silent failure enforcement. Don't.
