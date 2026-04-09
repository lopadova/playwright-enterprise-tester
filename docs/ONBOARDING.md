# Onboarding & Adoption Roadmap

This guide is the **single entry point for any developer joining a project
that uses the Playwright Enterprise Tester plugin**.

It provides:
- a Day-1 checklist (get productive in 30 minutes)
- a Week-1 plan (core skill proficient)
- a progressive rollout plan for phase 2 features (weeks 2-8+)
- role-specific paths (dev, QA, DevOps, Tech Lead)
- common onboarding pitfalls

> **TL;DR**: follow the Day-1 checklist, then run your first `/playwright-tester
> mode=smoke`. Everything else unlocks progressively as the team adopts phase 2
> features one at a time.

---

## 1. Day-1 onboarding checklist (≈30 min)

### Prerequisites (verify once)
- [ ] Node.js 20+ installed (`node -v`)
- [ ] Git repo cloned
- [ ] You have access to your staging URL
- [ ] Test user credentials obtained from ops/tech lead
- [ ] Claude Code installed with the plugin available

### Plugin installation (one-time per project)

**Option A — Marketplace install (when available):**
```bash
/plugin install playwright-enterprise-tester
```

**Option B — Manual clone:**
```bash
cd your-project
git clone https://github.com/lopadova/playwright-enterprise-tester.git \
  .claude/plugins/playwright-enterprise-tester
```

**Option C — Interactive scaffolder:**
```bash
node .claude/plugins/playwright-enterprise-tester/scripts/install.mjs
```

The interactive installer detects your stack and generates:
- `.playwright-tester.json` at the project root
- `playwright.config.ts`
- `tests/setup/auth.setup.ts`
- `tests/support/*.ts` (fixtures)
- `tests/e2e/smoke.spec.ts` (starter)
- `.env.e2e.example`
- Updated `.gitignore`

### Playwright peer deps

```bash
npm install -D @playwright/test
npx playwright install chromium
```

### Local environment

Create `.env.e2e` from the example:

```bash
cp .env.e2e.example .env.e2e
# Edit with real credentials
```

Add to `.gitignore`:
```
.env.e2e
playwright/.auth/
test-results/
playwright-report/
```

### First run (validation)

```bash
# Load env and run smoke
export $(cat .env.e2e | xargs)  # bash
npx playwright test tests/e2e/smoke.spec.ts --project=chromium
```

If it passes, you're ready for Claude Code.

### First skill invocation

In Claude Code:
```
/playwright-tester mode=smoke
```

The agent:
1. Reads `.playwright-tester.json`
2. Detects stack and runner mode
3. Runs the smoke suite
4. Produces `test-results/claude-report.json`
5. Reports back with classification + artifacts

Review the report, ask the agent questions about failures.

---

## 2. Week-1 plan (core proficiency)

### Day 2 — understand runner modes

- [ ] Read `references/runner-modes-local-vs-ci.md`
- [ ] Run: `PWTEST_RUNNER_MODE=ci /playwright-tester mode=smoke`
  (reproduce CI locally)
- [ ] Understand: trace, screenshots, PII masking, retries

### Day 3 — write your first test

- [ ] Pick a feature you know
- [ ] Copy `critical-path.spec.ts.tmpl` → your feature
- [ ] Edit routes/selectors to match your app
- [ ] Run locally, fix issues
- [ ] Commit

### Day 4 — failure classification

- [ ] Read `references/failure-classification-playbooks.md`
- [ ] Intentionally break a test (wrong selector)
- [ ] Watch the agent classify and attempt a fix
- [ ] Inspect `test-results/claude-report.json`

### Day 5 — CI integration

- [ ] Read `references/ci-github-actions-template.md`
- [ ] Verify your test passes in CI (push a branch)
- [ ] Add secrets: `PWTEST_USER_EMAIL`, `PWTEST_USER_PASSWORD`
- [ ] Check HTML report artifact link

---

## 3. Progressive phase 2 rollout (weeks 2-8+)

**Do NOT enable all 17 phase 2 features at once.** Follow this suggested
order, one wave per sprint (or per week for small teams):

### Wave A — Foundations (weeks 2-3, low risk)

| # | Feature | Why first | How to enable |
|---|---|---|---|
| 1 | **P2.05 Linter enforce** | Catches bad patterns early | `linterEnforce.enabled: true`, add staged rules to `failOn` |
| 2 | **P2.06 CODEOWNERS** | Routes failures to right team | `codeownersIntegration.enabled: true`, fill `ownerToNotificationChannel` |
| 3 | **P2.11 Slack notifications** | CI visibility | Add webhook to GitHub Secrets, `slackTeamsNotifications.enabled: true` |

**Validation after wave A**:
- Linter warnings appear in `claude-report.json`
- CI failures show owner teams
- Slack channel receives notifications

### Wave B — Visibility (weeks 4-5)

| # | Feature | Why | How |
|---|---|---|---|
| 4 | **P2.03 GitHub issue bot** | Closes feedback loop | Add `GITHUB_TOKEN`, `githubIssueBot.enabled: true` |
| 5 | **P2.08 Quarantine workflow** | Clean flaky suite | `quarantineWorkflow.enabled: true`, start with `action: tag-only` |
| 6 | **P2.04 Test impact analysis** | Speed up PR checks | Update `fileToTestMap`, `testImpactAnalysis.enabled: true` |

### Wave C — Quality (weeks 6-8)

| # | Feature | Why | How |
|---|---|---|---|
| 7 | **P2.15 Mobile/desktop matrix** | Realistic mobile perf | `npm i -D web-vitals`, `mobileDesktopMatrix.enabled: true` |
| 8 | **P2.16 Cross-browser** | Safari/Firefox coverage | `npx playwright install webkit`, `crossBrowser.enabled: true` |
| 9 | **P2.12 Axe a11y** | WCAG 2.1 AA checks | `npm i -D @axe-core/playwright`, `axeA11y.enabled: true` |
| 10 | **P2.14 Lighthouse CI** | Full Core Web Vitals | `npm i -D lighthouse chrome-launcher`, `lighthouseCiIntegration.enabled: true` |

### Wave D — Advanced (weeks 9+)

| # | Feature | Why | How |
|---|---|---|---|
| 11 | **P2.01 Cross-tab/popup/iframe** | Deeper checkout flows | `crossTabPopup.enabled: true` |
| 12 | **P2.10 AI root cause analyzer** | Faster debugging | Set `ANTHROPIC_API_KEY`, `aiRootCauseAnalyzer.enabled: true` |
| 13 | **P2.18 Swarm mode** | Parallel test authoring | `swarmMode.enabled: true` |
| 14 | **P2.02 Scraping mode** | Data extraction (if needed) | `scraping.enabled: true`, configure `allowedDomains` |

### Wave E — Compliance / niche (on demand)

| # | Feature | Why | How |
|---|---|---|---|
| 15 | **P2.17 GDPR trace scrubber** | DPO compliance | `npm i -D jszip`, complete stub, `gdprTraceScrubber.enabled: true` |
| 16 | **P2.07 Offline/air-gapped** | Restricted env | Pin version, configure mirror |
| 17 | **P2.09 Dashboard integration** | After external dashboard exists | Set `PWTEST_DASHBOARD_URL`, enable |

---

## 4. Per-role onboarding paths

### Developer (backend or frontend)

1. Day 1 checklist (§1)
2. Week 1 plan (§2) — focus on writing tests
3. Phase 2: Wave A + B (linter, CODEOWNERS, issues)
4. When touching payment flows: Wave D item #11 (P2.01 popup/iframe)
5. When writing tests for complex features: Wave D item #13 (P2.18 swarm)

### QA engineer

1. Day 1 checklist
2. Week 1 plan — focus on classification + flakiness
3. Phase 2: Wave A + B + C
4. Own: Wave B item #5 (quarantine workflow)
5. Weekly quarantine review

### DevOps / Tech Lead

1. Day 1 checklist
2. Week 1 plan — focus on runner modes + CI integration
3. Phase 2: Wave A + B + C (CI-side features)
4. Responsibilities:
   - CI workflow setup
   - Secrets management
   - Budget tuning
5. Phase 2 rollout decision per sprint
6. Phase 3 roadmap review (quarterly)

### New team member (any role)

1. Read the plugin README and architecture doc
2. Day 1 checklist
3. Pair with an experienced team member for first real test
4. First PR: a simple smoke test
5. After 2-3 weeks: start contributing to phase 2 adoption

---

## 5. Common onboarding pitfalls

| Issue | Symptom | Fix |
|---|---|---|
| Missing `@playwright/test` | `Cannot find module '@playwright/test'` | `npm install -D @playwright/test` |
| Missing browsers | `Executable doesn't exist at ...` | `npx playwright install chromium` |
| Wrong baseURL | `ECONNREFUSED` | Check `PWTEST_BASE_URL` or `playwright.config.ts` |
| Missing env vars | `PWTEST_USER_EMAIL is not set` | Load `.env.e2e` before running |
| Storage state missing | Auth tests fail | Run setup project: `npx playwright test --project=setup` |
| Phase 2 feature not activating | Silently disabled | Check `.playwright-tester.json` → `<feature>.enabled: true` |
| CI fails, local passes | Timing or stubs | Reproduce: `PWTEST_RUNNER_MODE=ci npm run test:e2e` |
| PII in CI artifacts | GDPR concern | Verify `runner.modes.ci.maskPiiInArtifacts: true` (forced in CI) |

---

## 6. Team adoption checklist (Tech Lead)

**Before declaring "phase 1 adopted":**
- [ ] All devs ran the Day-1 checklist
- [ ] At least 10 tests committed
- [ ] CI workflow active on PR checks
- [ ] GitHub Secrets configured
- [ ] Weekly test review in team standup

**Before declaring "wave A adopted":**
- [ ] Linter violations = 0 in reports
- [ ] CODEOWNERS file complete
- [ ] Slack notifications working

**Before declaring "wave B adopted":**
- [ ] GitHub issue bot created at least 1 issue
- [ ] Quarantine candidates reviewed
- [ ] Test impact map maintained

...and so on for waves C, D, E.

---

## 7. Decision log

Keep a decision log at `docs/playwright-tester-adoption-log.md`:

```markdown
# Adoption log

## 2026-04-09 — Phase 1 rollout
Enabled: core skill, no phase 2.
Owner: @tech-lead
Status: in progress

## 2026-04-16 — Wave A
Enabled: linterEnforce, codeownersIntegration, slackTeamsNotifications.
Blockers: Slack webhook URL pending.
Owner: @devops

## 2026-04-23 — Wave B
Enabled: githubIssueBot (dry-run first), quarantineWorkflow (tag-only).
...
```

This prevents re-debating decisions and helps future team members
understand the adoption history.

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
