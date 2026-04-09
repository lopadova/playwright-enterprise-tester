# Phase 3 Roadmap

Features deferred to phase 3 or emerged as natural evolutions from phase 2.

## Deferred from phase 2

### P2.13 — API testing via `request` fixture

Direct API tests using Playwright's `request` fixture. Useful for:
- Seed/teardown via API endpoints
- Bypass-login flows
- Contract testing

**Why deferred**: pattern different from browser testing, needs dedicated docs,
increases plugin surface. Re-evaluate based on demand.

### P2.17 — Full GDPR trace scrubber

Phase 2 ships a stub. Full implementation requires:
- `jszip` dependency
- Unzip → parse `.network` entries → scrub bodies → repack
- Post-run hook integration
- DPO sign-off checklist

## New phase 3 candidates

| # | Item | Why phase 3 |
|---|---|---|
| **P3.01** | Real iOS/Android device testing (BrowserStack, Sauce Labs) | External paid services, budget decision |
| **P3.02** | MCP server integration | Depends on MCP protocol maturity |
| **P3.03** | Self-healing tests (auto locator repair loop) | Extension of P2.10 AI RCA, high risk, needs tuning |
| **P3.04** | Visual regression hosted dashboard (Percy-style) | Separate service, overlaps with P2.09 |
| **P3.05** | Continuous profiling with trace diff | Technically complex, needs trace history DB |
| **P3.06** | Cross-repo test coordination | Monorepo-specific, depends on team structure |
| **P3.07** | Chaos testing (Toxiproxy integration) | Niche, not critical for stable apps |
| **P3.08** | Load testing integration (k6, JMeter) | Different scope from E2E correctness |
| **P3.09** | Contract tests (Pact, Spring Cloud Contract) | Backend-to-backend, outside browser scope |
| **P3.10** | Auto-assign owners from CODEOWNERS on PR | Extension of P2.06, needs GitHub write scope |
| **P3.11** | SLA tracking (time-to-fix per team) | Depends on P2.09 dashboard being operational |
| **P3.12** | Full GDPR scrubber (jszip-based) | Completion of P2.17 stub |
| **P3.13** | Dashboard MVP build | Implementation of DASHBOARD-SPEC.md |
| **P3.14** | Quarantine auto-PR workflow | Extension of P2.08 from `tag-only` to `create-pr` |
| **P3.15** | ESLint plugin (editor-native anti-pattern) | Separate npm package |
| **P3.16** | AI analyzer fine-tuning on historical data | Requires curated dataset + training |
| **P3.17** | Visual regression AI diff filtering | Reduce false positives from font/aa changes |
| **P3.18** | Test health scorecard per team | Depends on dashboard |
| **P3.19** | Auto-generate `fileToTestMap` via static analysis | AST-based dependency graph |
| **P3.20** | Playwright UI mode integration | Helper for local debugging |

## Why this division

Phase 2 was drawn at "implementable in-repo with npm deps, toggle-independent,
no breaking changes". Everything requiring:

1. **External paid services** → phase 3
2. **Separate projects** (e.g., dashboard, ESLint plugin) → phase 3
3. **Maturity dependencies** (e.g., MCP protocol) → phase 3
4. **High-complexity AI loops** (self-healing) → phase 3

## How to propose a phase 3 item

1. Open a [discussion](https://github.com/lopadova/playwright-enterprise-tester/discussions)
2. Describe the use case and impact
3. Estimate complexity (XS/S/M/L/XL)
4. Propose a phase (3 vs "might fit in 2")
5. Wait for feedback before starting implementation

## Contributing to phase 3

Phase 3 items are open to community contributions. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for the process.

Priority order (suggested):

1. **Low complexity, high value**: P3.12 (full scrubber), P3.15 (ESLint plugin)
2. **Medium, community-driven**: P3.13 (dashboard build), P3.20 (UI mode)
3. **High complexity**: P3.01 (real devices), P3.03 (self-healing), P3.05 (profiling)

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
