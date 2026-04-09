# Architecture Deep Dive

Complete architectural overview of the `playwright-enterprise-tester` plugin.

## High-level architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Developer or CI workflow                                      │
└───────────────────┬────────────────────────────────────────────┘
                    │ /playwright-tester or agent delegation
                    ▼
┌────────────────────────────────────────────────────────────────┐
│  Slash command (commands/playwright-tester.md)                 │
│  - Parses args                                                 │
│  - Resolves runner mode                                        │
│  - Loads skill and delegates to agent                          │
└───────────────────┬────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────────┐
│  Agent (agents/playwright-enterprise-tester.md)                │
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
                                                │
                                                ▼
                            classify-failure.mjs + fix loop
                                                │
                                                ▼
                         Optional chained skill (Slack, GitHub issue, RCA, ...)
```

## Plugin directory structure

```
playwright-enterprise-tester/
├── .claude-plugin/
│   └── plugin.json                    ← plugin manifest
│
├── commands/
│   └── playwright-tester.md           ← slash command
│
├── agents/
│   └── playwright-enterprise-tester.md  ← subagent
│
├── skills/
│   └── playwright-enterprise-tester/
│       ├── SKILL.md                   ← main skill spec
│       ├── references/                ← 31 reference docs
│       │   ├── laravel-patterns.md
│       │   ├── legacy-mpa-patterns.md
│       │   ├── ajax-spa-patterns.md
│       │   ├── ...
│       │   └── phase2-roadmap.md
│       ├── templates/                 ← 21 starter templates
│       │   ├── playwright.config.ts.tmpl
│       │   ├── tests/setup/auth.setup.ts.tmpl
│       │   ├── tests/support/*.tmpl
│       │   ├── tests/e2e/*.tmpl
│       │   └── .husky/pre-commit.tmpl
│       └── scripts/                   ← 15 helper scripts
│           ├── detect-stack.mjs
│           ├── parse-playwright-json.mjs
│           ├── classify-failure.mjs
│           ├── flaky-rank.mjs
│           ├── github-issue-bot.mjs (P2.03)
│           ├── test-impact-analysis.mjs (P2.04)
│           ├── lint-tests.mjs (P2.05)
│           ├── codeowners-resolve.mjs (P2.06)
│           ├── quarantine-manager.mjs (P2.08)
│           ├── ai-root-cause.mjs (P2.10)
│           ├── slack-teams-notify.mjs (P2.11)
│           ├── lighthouse-runner.mjs (P2.14)
│           ├── gdpr-trace-scrubber.mjs (P2.17)
│           ├── swarm-orchestrator.mjs (P2.18)
│           └── dashboard-push.mjs (P2.09)
│
├── templates/                         ← project-init templates
│   ├── .playwright-tester.json.tmpl
│   └── playwright.config.ts.tmpl
│
├── scripts/
│   └── install.mjs                    ← interactive installer
│
├── docs/                              ← plugin documentation
│   ├── ONBOARDING.md
│   ├── CONFIGURATION.md
│   ├── PHASE-2-FEATURES.md
│   ├── PHASE-3-ROADMAP.md
│   ├── DASHBOARD-SPEC.md
│   ├── ARCHITECTURE.md               ← this file
│   ├── MIGRATION.md
│   └── examples/
│       ├── laravel.md
│       ├── nextjs.md
│       ├── bun-hono.md
│       └── cloudflare-worker.md
│
├── README.md                          ← marketplace landing
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── .gitignore
```

## Separation of concerns

| Concern | Lives in | Edited by |
|---|---|---|
| AI policy, governance, feature toggles | `.playwright-tester.json` (project root) | Tech lead / DevOps |
| Playwright runtime config | `playwright.config.ts` (project root) | Developers |
| Operational skill spec | `skills/.../SKILL.md` | Plugin maintainers |
| Pattern libraries | `skills/.../references/` | Plugin maintainers + community |
| Starter templates | `skills/.../templates/` | Plugin maintainers |
| Helper scripts | `skills/.../scripts/` | Plugin maintainers |
| Individual test specs | `tests/e2e/*.spec.ts` (project) | Developers |
| CI workflow | `.github/workflows/playwright.yml` | DevOps |

## Data flow

### Phase 1 flow (core)

```
User → slash command
       ↓
       Agent loads skill
       ↓
       Agent reads .playwright-tester.json
       ↓
       Agent resolves runner mode (local or ci)
       ↓
       Agent writes/updates spec files in tests/
       ↓
       Agent runs: npx playwright test <scope>
       ↓
       Playwright produces: HTML, JSON, trace, screenshots, video
       ↓
       parse-playwright-json.mjs transforms JSON → claude-report.json
       ↓
       classify-failure.mjs applies playbooks
       ↓
       Agent reads claude-report.json, reports to user
```

### Phase 2 flow extensions

When phase 2 features are enabled, additional steps are injected:

- **P2.03 (GitHub issues)**: post-run → `github-issue-bot.mjs` creates issues
- **P2.06 (CODEOWNERS)**: pre-report → `codeowners-resolve.mjs` enriches failures with owners
- **P2.10 (AI RCA)**: post-classify → `ai-root-cause.mjs` deep analysis
- **P2.11 (Slack)**: post-report → `slack-teams-notify.mjs` sends notification
- **P2.09 (Dashboard)**: post-report → `dashboard-push.mjs` pushes to CF Worker
- **P2.17 (GDPR)**: pre-artifact-upload → `gdpr-trace-scrubber.mjs` scrubs trace.zip
- **P2.08 (Quarantine)**: weekly cron → `quarantine-manager.mjs` flags chronic flaky
- **P2.18 (Swarm)**: pre-author → `swarm-orchestrator.mjs` produces concern plan

All extensions are independent and gated by their own `enabled: true` flag.

## Runner mode resolution

```
1. PWTEST_RUNNER_MODE env set?       → use it
2. CI=true or GITHUB_ACTIONS=true?   → ci mode
3. Otherwise                          → local mode
```

Once resolved, the agent loads defaults from `.playwright-tester.json →
runner.modes.<mode>`.

In CI mode, certain flags are **locked** and cannot be overridden:
- `maskPiiInArtifacts: true` (forced by `maskPiiInArtifactsForcedInCi`)
- `failOnConsoleError: true`
- `allowDestructiveTests: false`

## Configuration precedence

```
1. Slash command args         ← highest priority
2. Environment variables (PWTEST_*)
3. .playwright-tester.json    ← project policy
4. playwright.config.ts       ← Playwright runtime
5. Plugin defaults            ← lowest priority
```

## Governance model

The plugin is **safe by default**:

- `fixAppCode: false` (hard default)
- `allowAppCodeChangesWhenExplicitlyEnabled: false` (second gate)
- `doubleConfirmAppCodeChanges: true`
- `maxFixAttempts: 3`

To allow app code fixes, ALL these must be satisfied:
1. Config: `fixAppCode=true` AND `allowAppCodeChangesWhenExplicitlyEnabled=true`
2. Env: `PWTEST_FIX_APP_CODE=true`
3. Arg: `fix-app-code=true` in the slash command
4. Classification: failure must be `app_bug` with evidence (trace + log)
5. User confirmation via `AskUserQuestion` tool

Every app-code file touched is appended to `test-results/app-code-changes.log`.

## Schema versioning

The plugin ships three versioned schemas:

| Schema | File | Current version | Purpose |
|---|---|---|---|
| Config | `.playwright-tester.json` | `schemaVersion: 2` | Breaking changes bump this |
| claude-report | `test-results/claude-report.json` | `schemaVersion: 1` | Fix loop artifact |
| flakiness JSONL | `test-results/flakiness-history.jsonl` | `schemaVersion: 1` | Historical analytics |

Breaking changes require:
- Bump `schemaVersion`
- Document in `MIGRATION.md`
- Provide auto-migration script if possible

## Extensibility

Users can extend the plugin without forking:

1. **Custom chained skills**: wire to `skillInvocation.chainedSkills`
2. **Custom linter rules**: add to `linterEnforce.failOn`/`warnOn`
3. **Custom PII patterns**: add to `gdpr.maskSelectors`, `gdprTraceScrubber.piiPatterns`
4. **Custom file-to-test map**: `testImpactAnalysis.fileToTestMap`
5. **Custom notification templates**: override in `slackTeamsNotifications.titleTemplate`
6. **Custom perf budgets**: `perfBudgets.budgets.<pageType>`
7. **Custom device profiles**: `mobileDesktopMatrix.devices`
8. **Custom owner routing**: `codeownersIntegration.ownerToNotificationChannel`

All customizations live in `.playwright-tester.json` — no plugin code changes.

## Security model

| Risk | Mitigation |
|---|---|
| PII leakage in artifacts | Forced masking in CI runner mode |
| Silent app code changes | 5-condition guardrail |
| Secrets in config | All secrets via env vars, never in config |
| Third-party webhook abuse | Rate limiting, retry budget, dry-run mode |
| Scraping abuse | Robots.txt respect, allowedDomains, rate limit |
| AI API cost explosion | rateLimitPerHour, maxTokensPerAnalysis |
| Destructive tests in CI | `forbidDestructiveTests: true` by default |
| Snapshot updates in CI | Hard forbidden (`ciUpdateForbidden: true`) |

## Dependencies

### Required (peer)
- `@playwright/test >= 1.40.0`

### Optional (per feature)
| Feature | Dep |
|---|---|
| Phase 1 perf budgets | `web-vitals >= 3` |
| P2.05 pre-commit | `husky >= 9` |
| P2.12 Axe a11y | `@axe-core/playwright >= 4.8` |
| P2.14 Lighthouse | `lighthouse >= 11`, `chrome-launcher >= 1` |
| P2.17 GDPR scrubber (full) | `jszip >= 3.10` |

All helper scripts use Node.js built-ins only. No runtime deps beyond the above.

## Performance characteristics

| Operation | Typical duration |
|---|---|
| Agent discover phase | ~2 seconds |
| Write a smoke spec | ~5 seconds |
| Run smoke suite (10 tests) | 30-60 seconds |
| Parse Playwright JSON → claude-report | <1 second |
| Classify failures | <1 second per failure |
| GitHub issue creation | ~2 seconds per issue |
| AI RCA (Claude API) | ~5-15 seconds per failure |
| Slack webhook send | <1 second |
| Quarantine analysis | ~2 seconds |

## Plugin lifecycle

1. **Install**: `scripts/install.mjs` scaffolds the target project
2. **Configure**: edit `.playwright-tester.json` per project needs
3. **Invoke**: via `/playwright-tester` or agent delegation
4. **Execute**: agent runs the workflow
5. **Report**: `claude-report.json` + human report
6. **Iterate**: user adjusts tests, re-invokes
7. **Evolve**: progressively enable phase 2 features

## Related projects

- **Playwright**: https://playwright.dev/
- **Claude Code**: https://claude.com/claude-code
- **web-vitals**: https://github.com/GoogleChrome/web-vitals
- **@axe-core/playwright**: https://github.com/dequelabs/axe-core-npm
- **Lighthouse**: https://github.com/GoogleChrome/lighthouse

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
