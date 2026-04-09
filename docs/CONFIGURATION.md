# Configuration Reference

Every parameter in `.playwright-tester.json` explained. This is the single
source of truth for plugin behavior. The file lives at your project root.

> **Quick rule**: anything not listed here as "always on" defaults to OFF.
> Enable features progressively (see [ONBOARDING.md](ONBOARDING.md)).

## Top-level fields

```json
{
  "$schema": "https://example.local/schemas/playwright-tester.schema.json",
  "schemaVersion": 2,
  "version": 4,
  "phase": 2,
  "enabled": true,
  "_doc": "Repo-level policy for the playwright-enterprise-tester plugin. ..."
}
```

| Field | Type | Meaning |
|---|---|---|
| `$schema` | string | JSON Schema URL (for editor validation) |
| `schemaVersion` | int | Schema version (currently `2`) |
| `version` | int | Config file version (currently `4`) |
| `phase` | int | Feature phase level (`1` or `2`) |
| `enabled` | bool | Global kill switch for the plugin |

## `profile.laravel`

Activates Laravel-specific helpers when `composer.json` contains `laravel/framework`.

```json
"profile": {
  "laravel": {
    "enabled": true,
    "detectWhen": { "composerPackages": ["laravel/framework"], "files": ["artisan"] },
    "legacyMpaMode": true,
    "csrfMetaSelector": "meta[name='csrf-token']",
    "sessionCookieName": "laravel_session"
  }
}
```

## `mode`

```json
"mode": {
  "default": "smoke",
  "enabledModes": ["smoke", "critical-path", "e2e-regression", ...],
  "allowAutoInference": true,
  "preferNarrowestValidScope": true
}
```

| Key | Meaning |
|---|---|
| `default` | Used when no explicit mode arg |
| `enabledModes` | Whitelist of allowed modes |
| `allowAutoInference` | Let the skill infer mode from scope |
| `preferNarrowestValidScope` | Narrowest valid mode wins on conflict |

## `runner` (critical)

Two-mode execution profile. See
`skills/playwright-enterprise-tester/references/runner-modes-local-vs-ci.md`.

```json
"runner": {
  "autoDetect": true,
  "autoDetectCiEnvKeys": ["CI", "GITHUB_ACTIONS", "GITLAB_CI"],
  "activeModeOverrideEnvKey": "PWTEST_RUNNER_MODE",
  "modes": {
    "local": { ... },
    "ci":    { ... }
  }
}
```

### `runner.modes.local` (dev machine defaults)

| Key | Default | Meaning |
|---|---|---|
| `videoDefault` | `off` | Video recording |
| `traceDefault` | `on-first-retry` | Trace recording |
| `screenshotDefault` | `only-on-failure` | Screenshot policy |
| `parallelWorkers` | `50%` | Parallelism |
| `retries` | `0` | Retry count |
| `reporters` | `["line"]` | Reporters |
| `failOnConsoleError` | `false` | Silent failure enforcement |
| `maskPiiInArtifacts` | `false` | PII masking |
| `htmlReport` | `false` | HTML report |

### `runner.modes.ci` (CI defaults)

| Key | Default | Meaning |
|---|---|---|
| `videoDefault` | `retain-on-failure` | |
| `traceDefault` | `on-first-retry` | |
| `screenshotDefault` | `only-on-failure` | |
| `parallelWorkers` | `2` | |
| `retries` | `2` | |
| `reporters` | `["line", "html", "json"]` | |
| `failOnConsoleError` | `true` | **enforced** |
| `maskPiiInArtifacts` | `true` | **forced** (cannot disable) |
| `maskPiiInArtifactsForced` | `true` | Hard lock |
| `htmlReport` | `true` | |
| `shardingEnabled` | `true` | |
| `shardsTotal` | `4` | |

## `governance`

App code fix guardrails.

```json
"governance": {
  "fixTestsOnly": true,
  "fixAppCode": false,
  "allowAppCodeChangesWhenExplicitlyEnabled": false,
  "doubleConfirmAppCodeChanges": true,
  "requireClassificationBeforeAppChanges": true,
  "maxFixAttempts": 3,
  "stopAfterMaxFixAttempts": true,
  "reportAllTouchedFiles": true,
  "appCodeChangeLog": "test-results/app-code-changes.log"
}
```

**To allow app code fixes**, ALL of:
1. `governance.fixAppCode=true`
2. `governance.allowAppCodeChangesWhenExplicitlyEnabled=true`
3. `PWTEST_FIX_APP_CODE=true` in env
4. Slash command arg `fix-app-code=true`
5. Classification must be `app_bug` with trace + log evidence

Every app-code file touched is appended to `appCodeChangeLog`.

## `discovery`

Multi-stack autodetect hints. Usually you don't touch this.

## `execution`

Playwright execution overrides.

```json
"execution": {
  "baseURL": null,
  "startCommand": null,
  "frontendCommand": null,
  "browserProject": "chromium",
  "reuseExistingServer": true,
  "remoteBaseUrlEnvKeys": ["APP_URL", "PLAYWRIGHT_BASE_URL", "PWTEST_BASE_URL", "BASE_URL"]
}
```

## `playwrightDefaults`

Native Playwright settings translated into `playwright.config.ts`.

```json
"playwrightDefaults": {
  "timeoutMs": 30000,
  "expectTimeoutMs": 7000,
  "navigationTimeoutMs": 30000,
  "actionTimeoutMs": 10000,
  "fullyParallel": true,
  "forbidOnlyInCI": true,
  "outputDir": "test-results/artifacts"
}
```

## `multiTenant`

Matrix of brand × country × language (opt-in).

```json
"multiTenant": {
  "enabled": false,
  "brands": [{ "name": "mybrand", "subdomain": "www" }],
  "countries": ["us"],
  "languages": ["en"],
  "baseUrlTemplate": "https://{brand}.{country}.example.com/{language}",
  "matrixStrategy": "critical-only"
}
```

## `testData`

Test data strategy. Default: `readonly-staging`.

```json
"testData": {
  "strategy": "readonly-staging",
  "precreatedUsers": {
    "guest": { "requiresAuth": false, "enabled": true },
    "user": {
      "enabled": true,
      "envKey": "PWTEST_USER_EMAIL",
      "envPassKey": "PWTEST_USER_PASSWORD"
    },
    "admin": { "enabled": false, ... }
  },
  "forbidDestructiveTests": true,
  "checkoutSandboxGatewaysOnly": true,
  "allowedGatewaysInTests": ["stripe-test", "paypal-sandbox"]
}
```

## `asyncPolicy`

Async handling rules.

```json
"asyncPolicy": {
  "enabled": true,
  "preferUiSignals": true,
  "forbidWaitForTimeout": true,
  "waitForTimeoutMaxMs": 1000,
  "requireBusinessOutcomeAssertionAfterAsyncAction": true
}
```

## `locatorPolicy`

```json
"locatorPolicy": {
  "preferredOrder": ["getByRole", "getByLabel", "getByPlaceholder", "getByText", "getByTestId", "css"],
  "forbidCssAsFirstChoice": true,
  "testIdAttribute": "data-testid"
}
```

## `silentFailures`

Console/pageerror/requestfailed detection.

```json
"silentFailures": {
  "enforce": "per-runner-mode",
  "failOnPageError": true,
  "failOnHttpStatusGte": 400,
  "allowlist": [
    { "type": "requestfailed", "urlRegex": "/favicon\\.ico$" },
    { "type": "console", "messageRegex": "^\\[HMR\\]" }
  ]
}
```

## `gdpr`

PII masking. **Forced in CI** (`maskPiiInArtifactsForcedInCi: true`).

```json
"gdpr": {
  "maskPiiInArtifacts": { "local": false, "ci": true },
  "maskPiiInArtifactsForcedInCi": true,
  "maskSelectors": ["input[type='email']", "[data-pii]", ...]
}
```

## `visualRegression` (opt-in, phase 1)

```json
"visualRegression": {
  "enabled": false,
  "maxDiffPixelRatio": 0.01,
  "maskingSelectors": [".price", ".cart-count", ".timer", ".countdown"],
  "baselineDir": "tests/e2e/__screenshots__",
  "updateRequiresExplicitFlag": true,
  "ciUpdateForbidden": true
}
```

## `perfBudgets` (opt-in, phase 1)

```json
"perfBudgets": {
  "enabled": false,
  "source": "web-vitals-injected",
  "budgets": {
    "home":     { "LCP": 2500, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 1800 },
    "pdp":      { "LCP": 2500, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 1800 },
    "cart":     { "LCP": 2500, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 1800 },
    "checkout": { "LCP": 3000, "CLS": 0.1, "INP": 200, "TBT": 400, "FCP": 2000 }
  },
  "failOnBudgetExceededInModes": ["critical-path", "release-gate"],
  "chainPagespeedReviewOnFailure": true
}
```

## `flakinessAnalytics` (JSONL sink)

```json
"flakinessAnalytics": {
  "enabled": false,
  "sink": "jsonl",
  "jsonlPath": "test-results/flakiness-history.jsonl",
  "rollupPath": "test-results/flakiness-rollup.json",
  "retentionDays": 30,
  "schemaVersion": 1,
  "webhook": { "enabled": false, "url": null, "authEnvKey": "PWTEST_FLAKY_WEBHOOK_TOKEN" }
}
```

## Phase 2 sections (all opt-in, OFF default)

Full details for each phase 2 feature in
[PHASE-2-FEATURES.md](PHASE-2-FEATURES.md). Config key summary:

| P2 | Key | What it controls |
|---|---|---|
| P2.01 | `crossTabPopup` | Cross-tab/popup/iframe handling |
| P2.02 | `scraping` | Full scraping mode |
| P2.03 | `githubIssueBot` | Auto-create GitHub issues |
| P2.04 | `testImpactAnalysis` | Git-diff heuristic test selection |
| P2.05 | `linterEnforce` | Anti-pattern linter enforce mode |
| P2.06 | `codeownersIntegration` | CODEOWNERS failure routing |
| P2.07 | `offlineAirGapped` | Offline environment support |
| P2.08 | `quarantineWorkflow` | Test quarantine workflow |
| P2.09 | `dashboardIntegration` | Dashboard push client |
| P2.10 | `aiRootCauseAnalyzer` | AI root cause (Claude API) |
| P2.11 | `slackTeamsNotifications` | Slack/Teams notify |
| P2.12 | `axeA11y` | Axe a11y scanning |
| P2.14 | `lighthouseCiIntegration` | Lighthouse CI |
| P2.15 | `mobileDesktopMatrix` | Mobile/desktop perf matrix |
| P2.16 | `crossBrowser` | Cross-browser matrix |
| P2.17 | `gdprTraceScrubber` | GDPR trace.zip scrubber |
| P2.18 | `swarmMode` | Swarm parallel sub-agents |

## `skillInvocation`

```json
"skillInvocation": {
  "autoTriggerViaDescription": false,
  "slashCommand": "/playwright-tester",
  "agent": "playwright-enterprise-tester",
  "chainedSkills": {
    "onFrontendChange": null,
    "onPerfBudgetViolation": null
  }
}
```

Users wire `chainedSkills` to their own follow-up skills if desired.

## `envOverrides`

Mapping of `PWTEST_*` env vars to config paths. Full list in the config file.

## Validation

Validate your config with Node:

```bash
node -e "
const c = JSON.parse(require('fs').readFileSync('.playwright-tester.json','utf8'));
console.log('version:', c.version);
console.log('phase:', c.phase);
console.log('OK');
"
```

## Reference

For the complete default values and all comments, inspect the template at
`templates/.playwright-tester.json.tmpl` in the plugin installation.

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
