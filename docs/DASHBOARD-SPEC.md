# Playwright Dashboard Spec (P2.09)

Complete specification for a **standalone company-wide dashboard** that
aggregates Playwright test data from multiple multi-project repos.

> **Status**: SPEC ONLY. No runtime code in this repo. Will be implemented
> as a separate project (Cloudflare Worker app) at company level.

---

## Table of contents

1. [Goals](#1-goals)
2. [Non-goals](#2-non-goals)
3. [Architecture](#3-architecture)
4. [Tech stack](#4-tech-stack)
5. [Data ingestion contract](#5-data-ingestion-contract)
6. [Data model (D1 schema)](#6-data-model)
7. [API endpoints](#7-api-endpoints)
8. [Frontend views](#8-frontend-views)
9. [KPI queries](#9-kpi-queries)
10. [Authentication & multi-tenancy](#10-auth-and-multi-tenancy)
11. [Deployment](#11-deployment)
12. [Retention and privacy](#12-retention-and-privacy)
13. [Integration with playwright-enterprise-tester](#13-integration)
14. [Implementation milestones](#14-milestones)
15. [Cost estimate](#15-cost-estimate)

---

## 1. Goals

- **Cross-repo aggregation**: collect flakiness + run data from every
  multi-project repo that uses the `playwright-enterprise-tester` skill
- **Company KPIs**: expose test health metrics (flaky rate, pass rate,
  duration trends, top failing features)
- **Trend analysis**: detect regressions over time, before they become
  chronic
- **Team accountability**: per-owner team dashboards showing their
  test health
- **Actionable**: identify top candidates for quarantine, fix, or deletion
- **Cost-efficient**: run on Cloudflare Workers edge (no dedicated server)

## 2. Non-goals

- NOT a test runner (tests still run in CI on each repo)
- NOT a secrets store (credentials stay in GitHub Secrets)
- NOT a replacement for GitHub Actions (the dashboard consumes, not produces)
- NOT a PII processor (all PII is scrubbed before ingestion)
- NOT a real-time monitoring tool (eventually-consistent is fine)

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  multi-project repos (N)                                        │
│                                                                 │
│  repo1/  repo2/  repo3/  ...                                    │
│    │       │       │                                           │
│    ▼       ▼       ▼                                           │
│  playwright-enterprise-tester skill runs in CI                  │
│    │                                                            │
│    └─── produces ──→  claude-report.json                        │
│                        flakiness-history.jsonl                  │
│                        test-results/...                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ HTTP POST (dashboardIntegration.endpoint)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker                                              │
│                                                                 │
│  POST /api/ingest/run         ← receives run data from repos   │
│  POST /api/ingest/flakiness   ← receives flakiness JSONL rows  │
│                                                                 │
│  GET  /api/kpi/overview       ← aggregate KPIs                 │
│  GET  /api/kpi/flaky/top      ← top N flaky tests              │
│  GET  /api/kpi/by-owner       ← team breakdown                 │
│  GET  /api/runs/recent        ← recent runs list               │
│  GET  /api/runs/{runId}       ← run detail                     │
│                                                                 │
│  GET  /                        ← static HTML dashboard         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare D1 (SQLite at edge)                                 │
│                                                                 │
│  Tables: repos, runs, tests, flakiness, failures, owners       │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Tech stack

- **Runtime**: Cloudflare Worker (JavaScript/TypeScript, edge)
- **Database**: Cloudflare D1 (SQLite, serverless)
- **Storage** (large artifacts URLs only): Cloudflare R2 (optional)
- **Auth**: Bearer tokens per repo, JWT for admin UI
- **Frontend**: Static HTML + vanilla JS + Chart.js (no framework, small bundle)
- **Deploy**: `wrangler deploy`
- **CI** (of the dashboard itself): GitHub Actions with `wrangler`

Why CF Workers:
- Zero-cost at low volume (generous free tier)
- Global edge = low latency from any repo
- D1 = SQLite with no maintenance
- Fits "serverless, low-ops" company requirement

## 5. Data ingestion contract

### `POST /api/ingest/run`

Called by `dashboardIntegration` feature in the skill after each run.

**Headers**:
```
Authorization: Bearer <repo-token>
Content-Type: application/json
```

**Body** (versioned schema):

```json
{
  "schemaVersion": 1,
  "repoIdentifier": "project/project-laravel",
  "runId": "2026-04-09-abc123",
  "ts": "2026-04-09T10:00:00Z",
  "runnerMode": "ci",
  "commit": "9e2809c",
  "branch": "master",
  "mode": "critical-path",
  "shard": "1/4",
  "summary": {
    "total": 42,
    "passed": 40,
    "failed": 1,
    "flaky": 1,
    "skipped": 0,
    "durationMs": 185000
  },
  "failures": [
    {
      "testId": "tests/e2e/cart.spec.ts::add to cart",
      "file": "tests/e2e/cart.spec.ts",
      "classification": "flaky",
      "flakyReason": "network_race",
      "owners": ["@project/cart-team"]
    }
  ],
  "perfBudgetViolations": [],
  "axeViolations": [],
  "visualDiffs": []
}
```

**Response**:
```json
{ "accepted": true, "runId": "2026-04-09-abc123" }
```

### `POST /api/ingest/flakiness`

Called to push JSONL flakiness entries (batch).

**Body**:
```json
{
  "schemaVersion": 1,
  "repoIdentifier": "project/project-laravel",
  "entries": [
    { ... JSONL entry 1 ... },
    { ... JSONL entry 2 ... }
  ]
}
```

## 6. Data model

### Table `repos`

```sql
CREATE TABLE repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL UNIQUE,  -- e.g., "project/project-laravel"
  display_name TEXT NOT NULL,
  token_hash TEXT NOT NULL,          -- bcrypt hash of bearer token
  created_at TEXT NOT NULL,
  last_ingest_at TEXT
);
```

### Table `runs`

```sql
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  run_id TEXT NOT NULL,              -- the runId from the skill
  ts TEXT NOT NULL,
  runner_mode TEXT NOT NULL,         -- 'local' | 'ci'
  commit TEXT,
  branch TEXT,
  mode TEXT,                         -- smoke | critical-path | ...
  shard TEXT,
  total INTEGER,
  passed INTEGER,
  failed INTEGER,
  flaky INTEGER,
  skipped INTEGER,
  duration_ms INTEGER,
  raw_report_json TEXT,              -- stringified claude-report subset
  INDEX idx_repo_ts (repo_id, ts DESC),
  INDEX idx_branch_ts (repo_id, branch, ts DESC)
);
```

### Table `tests`

```sql
CREATE TABLE tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  test_id TEXT NOT NULL,             -- "tests/e2e/cart.spec.ts::add to cart"
  file TEXT NOT NULL,
  title TEXT NOT NULL,
  owners TEXT,                       -- JSON array of CODEOWNERS
  tags TEXT,                         -- JSON array of tags
  UNIQUE(repo_id, test_id)
);
```

### Table `flakiness_entries`

```sql
CREATE TABLE flakiness_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  test_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  status TEXT NOT NULL,              -- passed | failed | flaky
  classification TEXT,
  flaky_reason TEXT,
  retries INTEGER DEFAULT 0,
  duration_ms INTEGER,
  INDEX idx_repo_test_ts (repo_id, test_id, ts DESC),
  INDEX idx_repo_ts (repo_id, ts DESC)
);
```

### Table `failures`

```sql
CREATE TABLE failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  test_id TEXT NOT NULL,
  classification TEXT NOT NULL,
  error_message TEXT,
  trace_url TEXT,
  screenshot_url TEXT,
  owners TEXT,                       -- JSON array
  INDEX idx_run (run_id)
);
```

### Table `perf_budget_violations`

```sql
CREATE TABLE perf_budget_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  page_type TEXT NOT NULL,           -- home | pdp | cart | ...
  metric TEXT NOT NULL,              -- LCP | CLS | INP | TBT | FCP
  budget_ms INTEGER,
  actual_ms INTEGER,
  INDEX idx_run (run_id)
);
```

## 7. API endpoints

### Ingestion

- `POST /api/ingest/run` — ingest a completed test run
- `POST /api/ingest/flakiness` — ingest flakiness JSONL batch

### Read (public, read-only with session)

- `GET /api/kpi/overview?repo=X&days=30` — aggregate KPIs
- `GET /api/kpi/flaky/top?repo=X&limit=10&days=14` — top flaky tests
- `GET /api/kpi/by-owner?repo=X` — per-team breakdown
- `GET /api/kpi/trend?repo=X&metric=passRate&days=30` — time series
- `GET /api/runs/recent?repo=X&limit=20` — recent runs list
- `GET /api/runs/{runId}` — full run detail
- `GET /api/tests/{testId}/history?repo=X` — test-specific history
- `GET /api/repos` — list all repos

### Admin (authenticated)

- `POST /api/admin/repos` — register a new repo + generate token
- `DELETE /api/admin/repos/{id}` — delete repo
- `POST /api/admin/repos/{id}/rotate-token` — rotate bearer token

## 8. Frontend views

Static HTML + vanilla JS, minimal dependencies.

### Home `/`

- Total repos
- Total runs in last 7/30 days
- Overall pass rate
- Top 5 flaky tests (cross-repo)
- Perf budget violation count

### Repo detail `/repo/{identifier}`

- Pass rate chart (30 days)
- Flaky rate chart (30 days)
- Recent runs table
- Top flaky tests for this repo
- Classification breakdown (test_bug / app_bug / env_bug / flaky)
- Owner team breakdown

### Test detail `/repo/{id}/test/{testId}`

- Run history timeline
- Status distribution
- Flaky reasons (when flagged)
- Latest failure trace URL
- Owner team

### Team dashboard `/repo/{id}/owner/{team}`

- Tests owned
- Pass rate for this team's tests
- Top failing tests
- SLA (time to fix after failure)

## 9. KPI queries

### Overall pass rate (last 30 days)

```sql
SELECT
  SUM(passed) * 1.0 / SUM(total) AS pass_rate
FROM runs
WHERE repo_id = ? AND ts > datetime('now', '-30 days');
```

### Top flaky tests

```sql
SELECT
  test_id,
  COUNT(*) as total_runs,
  SUM(CASE WHEN classification = 'flaky' THEN 1 ELSE 0 END) as flaky_count,
  SUM(CASE WHEN classification = 'flaky' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as flaky_rate
FROM flakiness_entries
WHERE repo_id = ? AND ts > datetime('now', '-14 days')
GROUP BY test_id
HAVING total_runs >= 5
ORDER BY flaky_rate DESC
LIMIT 10;
```

### By owner team

```sql
SELECT
  json_each.value as owner,
  COUNT(DISTINCT failures.id) as failure_count
FROM failures
JOIN runs ON failures.run_id = runs.id
JOIN json_each(failures.owners)
WHERE runs.repo_id = ? AND runs.ts > datetime('now', '-30 days')
GROUP BY owner
ORDER BY failure_count DESC;
```

### Perf budget trend

```sql
SELECT
  DATE(runs.ts) as day,
  perf_budget_violations.page_type,
  AVG(perf_budget_violations.actual_ms) as avg_actual
FROM perf_budget_violations
JOIN runs ON perf_budget_violations.run_id = runs.id
WHERE runs.repo_id = ? AND runs.ts > datetime('now', '-30 days')
GROUP BY day, page_type
ORDER BY day;
```

## 10. Auth and multi-tenancy

### Ingestion auth

Each repo has its own bearer token:
- Generated by admin via `POST /api/admin/repos`
- Stored in the repo's GitHub Secrets as `PWTEST_DASHBOARD_TOKEN`
- Passed in `Authorization: Bearer <token>` on every ingest call
- Token is hashed (bcrypt) in the `repos` table
- Rotatable via `POST /api/admin/repos/{id}/rotate-token`

### Read auth

Two levels:
1. **Public read**: anyone at the company can see aggregate KPIs (sign-in
   with SSO / Google Workspace / Azure AD)
2. **Admin**: manage repos, rotate tokens — restricted to platform team

Use Cloudflare Zero Trust or a simple JWT flow via a third-party provider.

### Multi-tenancy

Each repo is a "tenant". Tokens scoped to one repo. Cross-repo queries
only for admin users.

## 11. Deployment

### Wrangler config

```toml
# wrangler.toml
name = "playwright-dashboard"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[[d1_databases]]
binding = "DB"
database_name = "playwright-dashboard"
database_id = "..."

[vars]
ENVIRONMENT = "production"

[env.staging]
name = "playwright-dashboard-staging"
```

### Deploy command

```bash
wrangler deploy
```

### Migrations

```bash
wrangler d1 migrations apply playwright-dashboard
```

## 12. Retention and privacy

### Retention

- `runs` and `failures`: 180 days then delete
- `flakiness_entries`: 90 days then delete
- `perf_budget_violations`: 180 days
- Nightly cron Worker deletes old rows

### Privacy

- **No PII in ingested data**. The skill already scrubs PII in CI mode
  before producing the reports. Dashboard assumes ingested data is clean.
- Trace/screenshot URLs point to GitHub Actions artifacts (not mirrored
  in the dashboard)
- GDPR: team leads can request full deletion of a specific repo's data
  via admin UI
- No cookies for end users beyond SSO session

## 13. Integration

### In the playwright-enterprise-tester skill

Already scaffolded in phase 2 config:

```json
"dashboardIntegration": {
  "enabled": false,
  "endpoint": null,
  "endpointEnvKey": "PWTEST_DASHBOARD_URL",
  "authTokenEnvKey": "PWTEST_DASHBOARD_TOKEN",
  "pushOnEvents": ["run-complete"],
  "includeFlakinessRollup": true,
  "includeClaudeReport": true,
  "repoIdentifier": "my-project",
  "schemaVersion": 1
}
```

When enabled and `PWTEST_DASHBOARD_URL` + `PWTEST_DASHBOARD_TOKEN` set in CI,
the skill POSTs the run data after each complete run.

Implementation script: `.claude/skills/playwright-enterprise-tester/scripts/dashboard-push.mjs`
(to be written in phase 2 scripts batch, even though the dashboard itself
is spec-only).

### Fail-safe

If the dashboard endpoint is unreachable:
- Log the error
- Buffer the payload in `test-results/dashboard-pending.jsonl`
- Retry on next run
- Never block CI on dashboard unavailability

## 14. Milestones

### Milestone 1: MVP (~2 weeks)

- Worker scaffolded with wrangler
- D1 database created
- Migrations applied
- `POST /api/ingest/run` working
- `GET /api/kpi/overview` working
- Static home page rendering basic stats
- One repo (Project) integrated and pushing data

### Milestone 2: KPIs (~1 week)

- Flakiness trend queries
- Top flaky tests view
- Repo detail page
- Chart.js integration
- Per-owner breakdown

### Milestone 3: Admin (~1 week)

- Admin UI to register repos and rotate tokens
- SSO integration
- Nightly cron for data retention

### Milestone 4: Alerts (~1 week)

- Email/Slack alerts on regression
- Per-team SLA tracking
- Exportable CSV/JSON reports

### Milestone 5: Cross-repo (~2 weeks)

- Onboard additional multi-project repos
- Cross-repo KPIs on home page
- Multi-tenant access control hardened

## 15. Cost estimate

Cloudflare Workers free tier:
- 100,000 requests/day free
- 10GB D1 storage free

Expected volume:
- 1 repo × 10 runs/day = 10 requests/day
- 10 repos × 10 runs/day = 100 requests/day
- Each run ~5KB ingested = 500KB/day

Well under free tier. Paid tier only needed if the company grows to 100+
repos or adds real-time analytics.

**Estimated monthly cost**: $0 (free tier) for phase 1-2, ~$5-10/month
for phase 3+ with advanced features.

## Appendix A: Out of scope for MVP

- Real-time websocket updates
- Historical data migration from existing JSONL files
- Export to Prometheus / Grafana
- PR comment bot (the existing skill's bot already does this)
- User-provided dashboards / custom queries

## Appendix B: Open questions for the implementer

- [ ] Which SSO provider? (Google Workspace, Azure AD, custom?)
- [ ] Where to store trace artifacts beyond GitHub Actions retention? (R2?)
- [ ] Rate limiting strategy on ingestion endpoint?
- [ ] Multi-region D1 replication needed?
- [ ] Alerting: Slack, Teams, email, PagerDuty?
- [ ] Custom domain or `*.workers.dev`?

These are to be decided during implementation by the team taking on the
dashboard project.

---

*This specification is the single source of truth for the dashboard's
design. The implementer should start from this document and refine via
PRs to the dashboard repo.*

*Last updated: 2026-04-09*
