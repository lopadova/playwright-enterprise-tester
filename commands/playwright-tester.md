---
description: "Invoke the playwright-enterprise-tester skill to write, run and fix Playwright E2E tests. Supports modes smoke/critical-path/ajax-heavy/auth-protected/visual-regression/perf-budget/legacy-mpa/release-gate plus 5 phase 2 modes (dynamic-scraping/a11y-scan/mobile-perf/cross-browser/popup-checkout). Scope selectable by file, folder, glob, tag, or mode. Multi-stack autodetect. Defensive-minimal defaults, 17 opt-in phase 2 features via .playwright-tester.json."
---

# /playwright-tester

Invoke the `playwright-enterprise-tester` agent to work on your project's
Playwright E2E tests.

This slash command is a thin wrapper that:
1. Parses user arguments
2. Resolves the runner mode (`local` or `ci`)
3. Loads the `playwright-enterprise-tester` skill
4. Delegates execution to the dedicated agent

## Arguments

Pass arguments as `key=value` pairs separated by spaces. None are required.

| Argument | Example | Description |
|---|---|---|
| `mode=` | `mode=critical-path` | Operating mode (default: `smoke`) |
| `files=` | `files=tests/e2e/cart.spec.ts,tests/e2e/checkout.spec.ts` | CSV of spec file paths |
| `folders=` | `folders=tests/e2e/critical/,tests/e2e/smoke/` | CSV of folders |
| `grep=` | `grep=checkout` | Playwright `--grep` pattern |
| `tags=` | `tags=@critical,@smoke` | Tag list (mapped to `--grep`) |
| `brand=` | `brand=mybrand` | Override multi-tenant brand |
| `country=` | `country=us` | Override multi-tenant country |
| `lang=` | `lang=en` | Override multi-tenant language |
| `update-snapshots=` | `update-snapshots=true` | Visual regression only, forbidden in CI |
| `fix-app-code=` | `fix-app-code=true` | Requires double-confirm governance |
| `dry-run=` | `dry-run=true` | Plan without executing |
| `runner=` | `runner=local` or `runner=ci` | Override autodetect |

### Scope precedence

`files` > `folders` > `grep` > `tags` > scope inferred from `mode` > single smoke run.

If no args are passed and the scope is ambiguous, the agent asks for
confirmation before running. The full suite is never executed silently.

## Operating modes

### Phase 1 modes (always available)

| Mode | When to use |
|---|---|
| `smoke` | Fast check on main route or recently modified feature |
| `critical-path` | Core business flows that must always work |
| `e2e-regression` | Full regression suite |
| `ajax-heavy` | Pages with async rendering, infinite scroll, filters, hydration |
| `auth-protected` | Login-dependent flows |
| `legacy-mpa` | Server-rendered MPA (Blade/ERB/Twig/etc.) with form submit + redirect |
| `visual-regression` | Screenshot baseline comparison (opt-in) |
| `perf-budget` | Core Web Vitals budgets (opt-in) |
| `release-gate` | CI pre-release, rich diagnostics, matrix runs |

### Phase 2 modes (opt-in via config)

| Mode | When to use | Config toggle |
|---|---|---|
| `dynamic-scraping` | Data extraction from JS-rendered pages | `scraping.enabled` |
| `a11y-scan` | WCAG 2.1 AA accessibility check | `axeA11y.enabled` |
| `mobile-perf` | Mobile-emulated perf budgets | `mobileDesktopMatrix.enabled` |
| `cross-browser` | Multi-browser execution | `crossBrowser.enabled` |
| `popup-checkout` | Cross-tab/popup/iframe gateway flows | `crossTabPopup.enabled` |

## Examples

```
/playwright-tester mode=smoke
/playwright-tester mode=critical-path files=tests/e2e/checkout.spec.ts
/playwright-tester mode=ajax-heavy folders=tests/e2e/catalog/
/playwright-tester mode=visual-regression tags=@critical
/playwright-tester mode=perf-budget files=tests/e2e/home.spec.ts
/playwright-tester dry-run=true mode=release-gate
/playwright-tester mode=visual-regression update-snapshots=true
/playwright-tester mode=a11y-scan
/playwright-tester mode=cross-browser tags=@smoke
```

## Workflow

After parsing arguments, the command loads the `playwright-enterprise-tester`
skill and delegates to the agent, which follows the standard workflow:

**discover → configure → author → execute → diagnose → fix → report → chain**

Full specification: skill `SKILL.md`.

## Guardrails

These conditions trigger automatic STOP with user confirmation:

- `scope=all` in `local` runner mode (dangerous)
- `update-snapshots=true` in `ci` runner mode (always forbidden)
- `fix-app-code=true` without `governance.allowAppCodeChangesWhenExplicitlyEnabled=true`
- `mode=dynamic-scraping` on domains not in the `scraping.allowedDomains` list

## Chained skills

Users can configure follow-up skills in `.playwright-tester.json`:

```json
"skillInvocation": {
  "chainedSkills": {
    "onFrontendChange": "your-perf-review-skill",
    "onPerfBudgetViolation": "your-perf-review-skill"
  }
}
```

When configured, the agent suggests (or triggers) the follow-up skill after
relevant runs. No specific follow-up is hardcoded — the plugin is stack-agnostic.

## Configuration

All options are controlled by `.playwright-tester.json` (repo policy) + env
overrides (`PWTEST_*`). See:
- `references/runner-modes-local-vs-ci.md`
- `references/targeted-execution-scope.md`
- `docs/CONFIGURATION.md` (full parameter reference)
