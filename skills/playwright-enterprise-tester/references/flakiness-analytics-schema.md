# Flakiness analytics schema

Stable data format for test run history. Designed to be consumed by a
future dashboard project without migration.

## Purpose

Phase 1 produces raw data only: JSONL append-only + rollup JSON. No
dashboard, no UI. The schema is versioned (`schemaVersion: 1`) so a
dashboard built later can consume it as-is.

## File locations

```
test-results/flakiness-history.jsonl     ← append-only, one line per test run
test-results/flakiness-rollup.json       ← aggregated stats, rewritten each run
```

Both are git-ignored by default.

## JSONL entry schema (per test run)

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-08T19:54:00.123Z",
  "runId": "2026-04-08T195400Z-abc123",
  "runner": "ci",
  "shard": "1/4",
  "commit": "9e2809c9b8",
  "branch": "master",
  "user": "lopad",
  "testId": "tests/e2e/cart.spec.ts::adds product and shows toast",
  "file": "tests/e2e/cart.spec.ts",
  "title": "adds product and shows toast",
  "project": "chromium",
  "brand": "mybrand",
  "country": "it",
  "lang": "it",
  "status": "passed",
  "finalStatus": "passed",
  "attempts": [
    { "attempt": 1, "status": "failed", "durationMs": 4200, "error": "timeout waiting for selector" },
    { "attempt": 2, "status": "passed", "durationMs": 3100 }
  ],
  "retries": 1,
  "durationMs": 7300,
  "classification": "flaky",
  "flakyReason": "network_race",
  "failureMessage": null,
  "artifacts": {
    "trace": "test-results/artifacts/traces/cart-1.zip",
    "screenshot": null,
    "video": null,
    "claudeReport": "test-results/claude-report.json"
  },
  "tags": ["@critical", "@ajax"]
}
```

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| schemaVersion | int | yes | Schema version (1) |
| ts | ISO 8601 string | yes | Timestamp of the test completion |
| runId | string | yes | Unique id of the full run (shared across tests in one run) |
| runner | enum `local\|ci` | yes | Runner mode |
| shard | string | no | Shard id (e.g., "1/4") if sharding enabled |
| commit | string | no | Git SHA short |
| branch | string | no | Git branch name |
| user | string | no | OS user running local; omitted in CI |
| testId | string | yes | Unique test identifier (file::title) |
| file | string | yes | Test file path |
| title | string | yes | Test title |
| project | string | yes | Playwright project (e.g., "chromium") |
| brand | string | no | Active multi-tenant brand |
| country | string | no | Active country |
| lang | string | no | Active language |
| status | enum `passed\|failed\|timedOut\|skipped\|interrupted` | yes | Final status on the last attempt |
| finalStatus | same | yes | Normalized final status ignoring retries |
| attempts | array | yes | Per-attempt details |
| retries | int | yes | Number of retries (attempts.length - 1) |
| durationMs | int | yes | Total wall-clock duration across attempts |
| classification | enum `test_bug\|app_bug\|environment_bug\|flaky\|none` | yes | Classified failure type; "none" if passed without retry |
| flakyReason | string | no | Reason for flaky (network_race, hydration, ...) |
| failureMessage | string | no | Last error message if failed |
| artifacts | object | yes | Paths to generated artifacts |
| tags | array | no | Test tags (@smoke, @critical, ...) |

## Rollup JSON schema

Rewritten at the end of each run, aggregating the last `retentionDays` of data:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-04-08T19:54:00.123Z",
  "windowDays": 30,
  "totalRuns": 142,
  "tests": [
    {
      "testId": "tests/e2e/cart.spec.ts::adds product and shows toast",
      "file": "tests/e2e/cart.spec.ts",
      "title": "adds product and shows toast",
      "totalRuns": 42,
      "passed": 38,
      "failed": 1,
      "flaky": 3,
      "skipped": 0,
      "flakyRate": 0.0714,
      "failureRate": 0.0238,
      "lastRun": "2026-04-08T19:54:00Z",
      "lastFailures": [
        { "ts": "2026-04-05T10:12:00Z", "classification": "flaky", "reason": "network_race" }
      ],
      "quarantineRecommended": false
    }
  ]
}
```

## Sinks

Two sinks, both optional:

### JSONL sink (local or CI file append)

```json
"flakinessAnalytics": {
  "enabled": false,
  "sink": "jsonl",
  "jsonlPath": "test-results/flakiness-history.jsonl"
}
```

Append-only, one line per test. Script `flaky-rank.mjs` reads it for top-N.

### Webhook sink (optional, for dashboard project)

```json
"webhook": {
  "enabled": false,
  "url": "https://dashboard.example.com/api/flakiness/ingest",
  "method": "POST",
  "authEnvKey": "PWTEST_FLAKY_WEBHOOK_TOKEN",
  "payloadFormat": "rollup",
  "onEvents": ["flaky-detected", "quarantine-triggered"]
}
```

Auth token read from env key (never stored in config). Payload is either
the single new JSONL entry (`payloadFormat: "entry"`) or the updated
rollup (`payloadFormat: "rollup"`).

The webhook is POSTed from `scripts/parse-playwright-json.mjs` after the
run, so it does not block Playwright itself.

## Retention

`retentionDays` (default 30). Before each run, old JSONL entries are pruned
via a simple tail operation (keep lines where `ts > now - retentionDays`).

Rollup is recomputed from the pruned JSONL each run.

## Quarantine workflow (opt-in)

```json
"autoQuarantine": {
  "enabled": false,
  "flakyRateThreshold": 0.15,
  "minRuns": 10,
  "action": "tag-only"
}
```

When enabled, after each run, tests whose rollup flakyRate exceeds threshold
(and have at least `minRuns` runs) are flagged. Actions:

- `tag-only`: skill reports the list, no file changes
- `add-tag`: skill edits the spec to add `@quarantine` tag
- `skip`: skill edits the spec to add `test.skip(...)` with a link to evidence

Phase 1 uses `tag-only` as safe default; phase 2 may auto-apply `add-tag`
with PR creation.

## Privacy / GDPR

The JSONL contains no PII — only test metadata. Failure messages are
captured as-is; if a test error message includes user data (rare but
possible), it is NOT scrubbed by default. Teams with strict GDPR should
add a scrubber in the webhook sink before pushing to external dashboards.

Phase 2 candidate: automated PII scrub on `failureMessage` field.

## Example queries (for future dashboard)

"Top 10 flakiest tests in the last 7 days":
```
filter ts > now-7d
group by testId
compute flakyRate = flaky / totalRuns
order by flakyRate desc
limit 10
```

"Tests that regressed from stable to flaky this week":
```
compare rollup @ now vs rollup @ now-7d
where flakyRate_now > 0.15 AND flakyRate_then < 0.05
```

"Flakiness by brand/country matrix":
```
group by brand, country
compute avg(flakyRate)
```

These can be computed client-side over the JSONL; no backend required.

## Integration with existing tools

The JSONL format is compatible with:
- jq one-liners for ad-hoc queries
- grep for specific testId
- a simple DuckDB query against `read_json_auto('flakiness-history.jsonl')`
- Grafana Loki / Elasticsearch ingestion via filebeat

## Phase 2 candidates

- Dashboard project (separate repo) that consumes the JSONL
- AI-powered root cause analyzer that reads trace.zip + history
- Trend alerts (Slack/email) on regression
- Cross-repo rollup (aggregate across all your project repositories)
- KPI scorecards per team/owner
