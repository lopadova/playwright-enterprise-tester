# Phase 2 Features Guide

Complete guide to all 17 phase 2 features. Each feature is **independent**
and **OFF by default**.

> **Philosophy**: enable features progressively, one wave per sprint. See
> [ONBOARDING.md](ONBOARDING.md) for the suggested rollout order.

## Status matrix

| P2 | Feature | Status | Peer deps |
|---|---|---|---|
| P2.01 | Cross-tab / popup / iframe | ✅ Fully implemented | - |
| P2.02 | Scraping mode (full) | ✅ Fully implemented | - |
| P2.03 | GitHub issue bot | ✅ Fully implemented | `gh` CLI |
| P2.04 | Test impact analysis | ✅ Heuristic-based | - |
| P2.05 | Linter enforce mode | ✅ Fully implemented | `husky` (optional) |
| P2.06 | CODEOWNERS integration | ✅ Fully implemented | - |
| P2.07 | Offline / air-gapped | ✅ Documented | - |
| P2.08 | Quarantine workflow | ✅ Fully implemented | - |
| P2.09 | Dashboard integration | ✅ Client-side shipped, server is separate project | - |
| P2.10 | AI root cause analyzer | ✅ Fully implemented | Anthropic API key |
| P2.11 | Slack / Teams notify | ✅ Fully implemented | - |
| P2.12 | Axe a11y | ✅ Fully implemented | `@axe-core/playwright` |
| P2.13 | API testing via request | ❌ Deferred to phase 3 | - |
| P2.14 | Lighthouse CI | ✅ Fully implemented | `lighthouse`, `chrome-launcher` |
| P2.15 | Mobile/desktop matrix | ✅ Fully implemented | `web-vitals` |
| P2.16 | Cross-browser matrix | ✅ Fully implemented | `playwright install webkit/firefox` |
| P2.17 | GDPR trace scrubber | ⚠️ Stub (needs `jszip`) | `jszip` (for full) |
| P2.18 | Swarm mode | ✅ Fully implemented | - |

---

## P2.01 — Cross-tab / popup / iframe

Handle OAuth popups, 3DS iframes, payment gateway redirects.

**Enable**:
```json
"crossTabPopup": {
  "enabled": true,
  "iframeHandling": { "enabled": true },
  "popupHandling": { "enabled": true, "captureConsoleFromPopup": true }
}
```

**Use**: `/playwright-tester mode=popup-checkout`

**Reference**: `skills/playwright-enterprise-tester/references/cross-tab-popup-iframe.md`

---

## P2.02 — Scraping mode (full)

Data extraction with pagination, infinite scroll, modal extraction.

**Enable**:
```json
"scraping": {
  "enabled": true,
  "allowedDomains": ["example.com"],
  "robotsTxtRespect": true,
  "rateLimiting": { "enabled": true, "requestsPerSecond": 2 }
}
```

**Use**: `/playwright-tester mode=dynamic-scraping`

**Ethical guardrails**: `robotsTxtRespect`, `allowedDomains`, rate limiting.

**Reference**: `skills/playwright-enterprise-tester/references/scraping-mode-full.md`

---

## P2.03 — GitHub issue bot

Auto-create GitHub issues for classified `app_bug` failures in CI.

**Enable**:
```json
"githubIssueBot": {
  "enabled": true,
  "repository": "myorg/myrepo",
  "authTokenEnvKey": "GITHUB_TOKEN",
  "labels": ["e2e-failure", "auto-reported"],
  "deduplicateWithinHours": 24
}
```

**Requires**: `gh` CLI in CI runner, `GITHUB_TOKEN` with `issues:write`.

**Dry-run**: `node scripts/github-issue-bot.mjs --dry-run`

**Reference**: `skills/playwright-enterprise-tester/references/github-issue-bot.md`

---

## P2.04 — Test impact analysis

Run only tests affected by files changed in git diff.

**Enable**:
```json
"testImpactAnalysis": {
  "enabled": true,
  "strategy": "git-diff-heuristic",
  "baseBranch": "main",
  "fileToTestMap": [
    { "pattern": "src/cart/**/*.ts", "tests": ["tests/e2e/cart.spec.ts"] }
  ],
  "alwaysRunOnChanges": ["playwright.config.ts", ".playwright-tester.json"]
}
```

**Reference**: `skills/playwright-enterprise-tester/references/test-impact-analysis.md`

---

## P2.05 — Linter enforce mode

Anti-pattern linter with pre-commit hook.

**Enable**:
```json
"linterEnforce": {
  "enabled": true,
  "mode": "enforce",
  "failOn": ["waitForTimeoutHardcoded", "pageDollarApi", "testOnlyInCI"],
  "preCommitHook": { "enabled": true, "hookManager": "husky" }
}
```

**Install hook**:
```bash
npm install -D husky
npx husky install
cp skills/playwright-enterprise-tester/templates/.husky/pre-commit.tmpl .husky/pre-commit
chmod +x .husky/pre-commit
```

**Reference**: `skills/playwright-enterprise-tester/references/linter-enforce-mode.md`

---

## P2.06 — CODEOWNERS integration

Route failures to owner teams.

**Enable**:
```json
"codeownersIntegration": {
  "enabled": true,
  "codeownersFile": ".github/CODEOWNERS",
  "ownerToNotificationChannel": {
    "@myorg/team-frontend": "#frontend-alerts",
    "@myorg/team-backend": "#backend-alerts"
  }
}
```

**Reference**: `skills/playwright-enterprise-tester/references/codeowners-integration.md`

---

## P2.07 — Offline / air-gapped

Mirror, pin Playwright version, cache browsers.

**Enable**:
```json
"offlineAirGapped": {
  "enabled": true,
  "mirrorBaseUrl": "https://mirror.internal.example.com/playwright",
  "pinnedPlaywrightVersion": "1.48.0"
}
```

**Reference**: `skills/playwright-enterprise-tester/references/offline-air-gapped.md`

---

## P2.08 — Quarantine workflow

Automated flaky test lifecycle management.

**Enable**:
```json
"quarantineWorkflow": {
  "enabled": true,
  "flakyRateThreshold": 0.15,
  "minRuns": 20,
  "action": "tag-only"
}
```

**Actions**: `tag-only` (log), `add-tag` (edit files), `create-pr` (automated PR).

**Reference**: `skills/playwright-enterprise-tester/references/test-retirement-workflow.md`

---

## P2.09 — Dashboard integration (client)

Push test results to an external Cloudflare Worker dashboard.

**Enable**:
```json
"dashboardIntegration": {
  "enabled": true,
  "endpoint": "https://dashboard.example.com",
  "authTokenEnvKey": "PWTEST_DASHBOARD_TOKEN"
}
```

The **dashboard itself** is a separate standalone project. Complete spec:
[DASHBOARD-SPEC.md](DASHBOARD-SPEC.md).

---

## P2.10 — AI root cause analyzer

Uses Anthropic Claude API to analyze failures.

**Enable**:
```json
"aiRootCauseAnalyzer": {
  "enabled": true,
  "apiProvider": "anthropic",
  "apiKeyEnvKey": "ANTHROPIC_API_KEY",
  "model": "claude-sonnet-4-6",
  "rateLimitPerHour": 20,
  "maxTokensPerAnalysis": 4000,
  "analyzeOnClassifications": ["app_bug", "flaky"]
}
```

**Cost**: ~$0.02-0.05 per analysis with Sonnet. Mind the rate limit.

**Privacy**: Do NOT enable in CI with real production data without DPO sign-off.

**Reference**: `skills/playwright-enterprise-tester/references/ai-root-cause-analyzer.md`

---

## P2.11 — Slack / Teams notifications

Webhook-based notifications on CI failures.

**Enable**:
```json
"slackTeamsNotifications": {
  "enabled": true,
  "provider": "slack",
  "webhookUrlEnvKey": "PWTEST_NOTIFY_WEBHOOK_URL",
  "triggerOn": ["failure", "flaky-spike", "perf-budget-violation"],
  "mentionOnFailure": ["@oncall"]
}
```

**Providers**: `slack`, `teams`, `generic-webhook`.

**Reference**: `skills/playwright-enterprise-tester/references/slack-teams-notifications.md`

---

## P2.12 — Axe a11y

Automated WCAG 2.1 AA scanning via `@axe-core/playwright`.

**Enable**:
```bash
npm install -D @axe-core/playwright
```

```json
"axeA11y": {
  "enabled": true,
  "wcagTags": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  "failOnSeverity": ["critical", "serious"],
  "warnOnSeverity": ["moderate", "minor"]
}
```

**Use**: `/playwright-tester mode=a11y-scan`

**Reference**: `skills/playwright-enterprise-tester/references/axe-a11y-integration.md`

---

## P2.14 — Lighthouse CI integration

Full Lighthouse audits (performance, a11y, best-practices, SEO).

**Enable**:
```bash
npm install -D lighthouse chrome-launcher
```

```json
"lighthouseCiIntegration": {
  "enabled": true,
  "categories": ["performance", "accessibility", "best-practices", "seo"],
  "thresholds": {
    "performance": 85,
    "accessibility": 90
  },
  "pagesToAudit": [
    { "name": "home", "url": "/" }
  ]
}
```

**Reference**: `skills/playwright-enterprise-tester/references/lighthouse-ci-integration.md`

---

## P2.15 — Mobile/desktop matrix

Mobile perf with CPU/network throttling.

**Enable**:
```bash
npm install -D web-vitals
```

```json
"mobileDesktopMatrix": {
  "enabled": true,
  "devices": [
    { "name": "mobile-chrome", "device": "Pixel 7", "enabled": true },
    { "name": "desktop-chrome", "enabled": true }
  ],
  "budgetsPerDevice": {
    "mobile-chrome": { "home": { "LCP": 2500, "CLS": 0.1, "INP": 200 } },
    "desktop-chrome": { "home": { "LCP": 1500, "CLS": 0.1, "INP": 100 } }
  }
}
```

**Use**: `/playwright-tester mode=mobile-perf`

**Reference**: `skills/playwright-enterprise-tester/references/mobile-desktop-matrix.md`

---

## P2.16 — Cross-browser matrix

Multi-browser execution.

**Enable**:
```bash
npx playwright install webkit firefox
```

```json
"crossBrowser": {
  "enabled": true,
  "browsers": [
    { "name": "chromium", "enabled": true },
    { "name": "webkit", "enabled": true },
    { "name": "firefox", "enabled": false }
  ],
  "runInModes": {
    "smoke": ["chromium"],
    "critical-path": ["chromium", "webkit"],
    "release-gate": ["chromium", "webkit", "firefox"]
  }
}
```

**Use**: `/playwright-tester mode=cross-browser`

**Reference**: `skills/playwright-enterprise-tester/references/cross-browser-matrix.md`

---

## P2.17 — GDPR trace scrubber

Strip PII from `trace.zip` network payloads.

**Enable** (requires full impl):
```bash
npm install -D jszip
```

```json
"gdprTraceScrubber": {
  "enabled": true,
  "scrubOnRunnerModes": ["ci"],
  "piiPatterns": [
    { "name": "email", "regex": "[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}" },
    { "name": "credit-card", "regex": "\\b(?:\\d[ -]*?){13,16}\\b" }
  ]
}
```

⚠️ **Stub**: the shipped script documents the algorithm but does not
perform the actual zip extract/repack (requires `jszip`). Full implementation
is a phase 3 candidate.

**Reference**: `skills/playwright-enterprise-tester/references/gdpr-trace-scrubber.md`

---

## P2.18 — Swarm mode

Parallel sub-agent test authoring for complex features.

**Enable**:
```json
"swarmMode": {
  "enabled": true,
  "maxConcurrentAgents": 3,
  "concerns": [
    { "name": "happy-path", "tag": "@smoke @critical", "enabled": true },
    { "name": "validation-edge", "tag": "@validation", "enabled": true }
  ]
}
```

**Use**: `/playwright-tester swarm=true feature=checkout`

**Reference**: `skills/playwright-enterprise-tester/references/swarm-mode.md`

---

## Troubleshooting phase 2

### "Feature won't activate"

Check:
1. `<feature>.enabled: true` in `.playwright-tester.json`
2. Peer dependency installed (see table above)
3. Runner mode appropriate (some features are CI-only: `githubIssueBot`, `slackTeamsNotifications`)
4. The skill is loaded (via `/playwright-tester` or agent delegation)

### "P2 feature breaks existing tests"

Every P2 feature is **fully dormant** when `enabled: false`. If a toggle
seems to affect behavior when off, please [file an issue](https://github.com/lopadova/playwright-enterprise-tester/issues).

### "I want to enable all phase 2 features at once"

Don't. Follow the wave-by-wave rollout in [ONBOARDING.md](ONBOARDING.md).
Enabling all at once obscures which feature broke what.

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
