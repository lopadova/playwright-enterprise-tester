# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-09

Initial release of the `playwright-enterprise-tester` Claude Code plugin.

### Added

**Core skill (Phase 1)**
- Skill `playwright-enterprise-tester` with complete operational spec
- Agent `playwright-enterprise-tester` for delegated test authoring/execution
- Slash command `/playwright-tester` with fine-grained invocation
- Config file `.playwright-tester.json` (schema version 2)
- Two runner modes: `local` (dev PC) and `ci` (GitHub Actions)
- Multi-stack autodetect: Laravel, Vite, Mix, Node, Bun, Cloudflare Workers, monorepos
- Defensive-minimal defaults (trace, screenshot, JSON reporter, silent failure capture, PII masking in CI)
- Locator policy with enforced order (getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > CSS)
- Async policy forbidding `waitForTimeout` as default
- Failure classification with 4 types and deterministic autofix playbooks
- Governance: app code fix requires 4-condition double-confirm
- Flakiness history with versioned JSONL schema
- Custom JSON reporter (`claude-report.json`) for fix loop
- Frontend contracts report (manual, qualitative)
- Multi-tenant brand × country × language matrix (opt-in)
- Visual regression via `toHaveScreenshot` (opt-in)
- Performance budgets via injected `web-vitals` (opt-in)
- 15 reference documentation files covering all core patterns
- 11 starter templates (spec files, fixtures, setup, support helpers)
- 4 helper scripts (detect-stack, parse-playwright-json, classify-failure, flaky-rank)

**Phase 2 features (17 opt-in, all OFF by default)**
- P2.01 Cross-tab / popup / iframe gateway flows
- P2.02 Full scraping mode with paginate/infinite-scroll/modal helpers
- P2.03 Auto-create GitHub issues for `app_bug` failures in CI
- P2.04 Test impact analysis from git diff (heuristic-based)
- P2.05 Anti-pattern linter enforce mode with pre-commit hook
- P2.06 CODEOWNERS integration for failure routing
- P2.07 Offline / air-gapped environment support
- P2.08 Test retirement / quarantine workflow
- P2.09 Dashboard integration (client side, push to external Cloudflare Worker)
- P2.10 AI root cause analyzer (Anthropic Claude API)
- P2.11 Slack / Teams / generic webhook notifications
- P2.12 Axe a11y scanning (WCAG 2.1 AA via `@axe-core/playwright`)
- P2.14 Lighthouse CI integration for full Core Web Vitals audits
- P2.15 Mobile/desktop perf matrix with CPU/network throttling
- P2.16 Cross-browser matrix (chromium + webkit + firefox)
- P2.17 GDPR trace.zip PII scrubber (stub, needs `jszip` for full impl)
- P2.18 Swarm mode with parallel sub-agent test authoring
- 16 additional reference documentation files for phase 2 features
- 10 starter templates for phase 2 features
- 11 helper scripts for phase 2 features

**Documentation**
- Marketplace landing `README.md`
- `docs/ONBOARDING.md` — Day-1 checklist, week-1 plan, progressive phase 2 rollout, per-role paths
- `docs/CONFIGURATION.md` — complete `.playwright-tester.json` parameter reference
- `docs/PHASE-2-FEATURES.md` — detailed activation guide for each phase 2 feature
- `docs/PHASE-3-ROADMAP.md` — future features and deferred items
- `docs/DASHBOARD-SPEC.md` — complete spec for standalone dashboard Cloudflare Worker
- `docs/ARCHITECTURE.md` — deep dive into plugin architecture
- `docs/MIGRATION.md` — adopting the plugin mid-project
- `docs/examples/laravel.md` — Laravel integration example
- `docs/examples/nextjs.md` — Next.js integration example
- `docs/examples/bun-hono.md` — Bun + Hono integration example
- `docs/examples/cloudflare-worker.md` — Cloudflare Worker integration example
- `CONTRIBUTING.md` — contribution guidelines
- `LICENSE` (MIT)

### Not implemented

- **P2.13 API testing via request fixture** — reserved for phase 3
- **P2.17 full scrubber implementation** — stub shipped; full impl requires `jszip`

### Known limitations

- Firefox cross-browser works but requires explicit `npx playwright install firefox`
- The dashboard project (P2.09) is spec-only in this plugin; a standalone
  implementation is needed to consume the pushed data
- AI RCA (P2.10) costs tokens per analysis; configure `rateLimitPerHour` carefully

## [Unreleased]

See [docs/PHASE-3-ROADMAP.md](docs/PHASE-3-ROADMAP.md) for planned features.
