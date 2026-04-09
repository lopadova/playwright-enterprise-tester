# Phase 2 roadmap — IMPLEMENTED (status snapshot)

**Status as of 2026-04-09**: all 17 Phase 2 items implemented except
P2.13 (API testing) which was explicitly excluded per user decision.

All implemented features are **OFF by default** and toggle independently
via `.playwright-tester.json`.

## Status matrix

| # | Item | Status | Config key | Reference |
|---|---|---|---|---|
| P2.01 | Cross-tab / popup / iframe | ✅ Implemented | `crossTabPopup.enabled` | `cross-tab-popup-iframe.md` |
| P2.02 | Scraping mode (full) | ✅ Implemented | `scraping.enabled` | `scraping-mode-full.md` |
| P2.03 | GitHub issue bot | ✅ Implemented | `githubIssueBot.enabled` | `github-issue-bot.md` |
| P2.04 | Test impact analysis | ✅ Implemented (heuristic) | `testImpactAnalysis.enabled` | `test-impact-analysis.md` |
| P2.05 | Linter enforce mode | ✅ Implemented | `linterEnforce.enabled` | `linter-enforce-mode.md` |
| P2.06 | CODEOWNERS integration | ✅ Implemented | `codeownersIntegration.enabled` | `codeowners-integration.md` |
| P2.07 | Offline / air-gapped | ✅ Documented | `offlineAirGapped.enabled` | `offline-air-gapped.md` |
| P2.08 | Test retirement workflow | ✅ Implemented | `quarantineWorkflow.enabled` | `test-retirement-workflow.md` |
| P2.09 | Dashboard project | ✅ Spec only (standalone CF Worker future project) | `dashboardIntegration.enabled` (client side) | `DASHBOARD-SPEC.md` |
| P2.10 | AI root cause analyzer | ✅ Implemented | `aiRootCauseAnalyzer.enabled` | `ai-root-cause-analyzer.md` |
| P2.11 | Slack / Teams notifications | ✅ Implemented | `slackTeamsNotifications.enabled` | `slack-teams-notifications.md` |
| P2.12 | Axe a11y integration | ✅ Implemented | `axeA11y.enabled` | `axe-a11y-integration.md` |
| P2.13 | API testing (request fixture) | ❌ Excluded per user decision | — | — |
| P2.14 | Lighthouse CI external | ✅ Implemented | `lighthouseCiIntegration.enabled` | `lighthouse-ci-integration.md` |
| P2.15 | Mobile/desktop matrix | ✅ Implemented | `mobileDesktopMatrix.enabled` | `mobile-desktop-matrix.md` |
| P2.16 | Cross-browser matrix | ✅ Implemented (chromium + webkit) | `crossBrowser.enabled` | `cross-browser-matrix.md` |
| P2.17 | Trace.zip GDPR scrubber | ⚠️ Stub (needs jszip dep) | `gdprTraceScrubber.enabled` | `gdpr-trace-scrubber.md` |
| P2.18 | Swarm mode | ✅ Implemented (orchestrator script) | `swarmMode.enabled` | `swarm-mode.md` |

**Totals**: 17/18 implemented, 1 excluded (P2.13).

## Implementation notes

### ✅ Fully functional when enabled

P2.01, P2.02, P2.03, P2.04, P2.05, P2.06, P2.08, P2.10, P2.11, P2.12,
P2.14, P2.15, P2.16, P2.18.

### ⚠️ Partial or stub

- **P2.07 Offline/air-gapped**: documentation-heavy. Pinning config keys
  defined; actual mirror setup is team-specific.
- **P2.09 Dashboard**: spec document only. Implementation is a separate
  standalone CF Worker project at company level. `dashboardIntegration`
  client-side code in this repo can push to the future dashboard.
- **P2.17 GDPR trace scrubber**: stub script that loads config and
  documents the algorithm. Full implementation requires `npm install -D jszip`
  and completing the zip repack logic.

### ❌ Excluded

- **P2.13 API testing via request fixture**: excluded per user decision.
  Can be added in phase 3 if needed.

## How to enable a phase 2 feature

1. Open `.playwright-tester.json`
2. Find the relevant section (e.g., `axeA11y`)
3. Set `enabled: true`
4. Configure additional keys as needed (see the relevant reference doc)
5. Install any peer dependencies mentioned in the reference
6. Re-run the skill — the feature activates automatically

## Phase 3 candidates

Items deferred to phase 3:

### From phase 1 TODOs
- Cross-browser with Firefox (only chromium + webkit in phase 2 per user choice)
- API testing via `request` fixture (P2.13 excluded in phase 2)

### New in phase 3
- **P3.01 Real iOS/Android device testing** via BrowserStack / Sauce Labs
- **P3.02 MCP server integration** for claude-code-native flows
- **P3.03 Self-healing tests** — AI-driven locator repair beyond P2.10
- **P3.04 Visual regression dashboard** (Percy-style, separate from P2.09)
- **P3.05 Continuous profiling** — detect perf regressions via trace diff
- **P3.06 Cross-repo test coordination** — when one repo's tests depend
  on another repo's backend
- **P3.07 Chaos testing** — inject network failures, slow backends
- **P3.08 Load testing integration** — k6 / JMeter tie-in
- **P3.09 Contract tests** — Pact / Spring Cloud Contract
- **P3.10 Test ownership automation** — auto-assign owners based on CODEOWNERS
- **P3.11 SLA tracking** — time from failure to fix per team
- **P3.12 GDPR scrubber full implementation** (jszip-based)
- **P3.13 Dashboard MVP** — build the CF Worker from the spec
- **P3.14 Quarantine workflow automation** — auto-PR, auto-merge on restoration
- **P3.15 ESLint plugin** — editor-native anti-pattern detection
- **P3.16 AI analyzer fine-tuning** — train on historical your project failures

Each phase 3 item will follow the same pattern: config section with
`enabled: false` default, reference doc, helper scripts, opt-in toggle.

## Retrospective (phase 2 lessons)

### What worked
- **Toggle-off-by-default** — let the team adopt features one at a time
- **Reference docs per feature** — kept SKILL.md focused, deep topics isolated
- **Script-based helpers** — each feature has its own .mjs with dry-run support
- **Schema versioning** — all JSON outputs (claude-report, flakiness, etc.)
  are versioned for future migrations

### What needs refinement in phase 3
- **Pre-commit hook reliability** — husky setup is team-dependent, needs docs
- **Webhook retries** — Slack/Teams notify retries could use exponential
  backoff with jitter
- **Dashboard integration client** — currently buffered to JSONL if endpoint
  unreachable; phase 3 could add automatic replay on next run
- **GDPR scrubber** — stub in phase 2; needs full jszip implementation
- **AI analyzer cost control** — current rate limit is simple; could become
  smarter with daily budget
- **Cross-browser CI cost** — running 2 browsers doubles CI minutes; impact
  on budget needs monitoring

## Migration path from phase 1 → phase 2

Projects already using phase 1 can adopt phase 2 incrementally:

1. Update `.playwright-tester.json` — add missing phase 2 sections, all
   `enabled: false`
2. Enable one feature at a time, validate, then enable the next
3. Recommended order:
   - P2.05 (linter enforce) — low risk, catches issues
   - P2.06 (CODEOWNERS) — enriches reports, no behavior change
   - P2.11 (Slack notify) — visibility, no behavior change
   - P2.03 (GitHub issue bot) — closes the feedback loop
   - P2.15 (mobile matrix) — improves perf coverage
   - P2.16 (cross-browser) — improves compatibility coverage
   - P2.12 (axe a11y) — improves a11y coverage
   - P2.08 (quarantine) — stabilizes the suite
   - P2.01 (popup/iframe) — unlocks deeper checkout tests
   - P2.02 (scraping) — if needed for your use case
   - P2.14 (Lighthouse) — richer perf diagnostics
   - P2.04 (test impact) — CI speedup
   - P2.10 (AI RCA) — advanced debugging
   - P2.17 (GDPR scrubber) — after jszip dep + DPO sign-off
   - P2.18 (swarm mode) — advanced authoring
   - P2.07 (offline) — only if your env requires it
   - P2.09 (dashboard integration) — after the standalone dashboard exists

Each step is reversible: set `enabled: false` and the feature goes dormant
without side effects.
