# Migration Guide

How to adopt the plugin in an existing project, or upgrade between versions.

## From nothing (fresh project)

See [ONBOARDING.md](ONBOARDING.md) §1 Day-1 checklist. Quickest path:

```bash
node .claude/plugins/playwright-enterprise-tester/scripts/install.mjs
```

## From existing Playwright setup

If you already have `playwright.config.ts` and some `tests/e2e/*.spec.ts`:

### Step 1: inventory

```bash
# What Playwright version?
npx playwright --version

# What tests exist?
find tests/e2e -name "*.spec.ts" -o -name "*.spec.js" | wc -l

# What's in the config?
cat playwright.config.ts | grep -E "baseURL|reporter|projects"
```

### Step 2: install the plugin

```bash
git clone https://github.com/lopadova/playwright-enterprise-tester.git \
  .claude/plugins/playwright-enterprise-tester
```

### Step 3: create `.playwright-tester.json`

Start from the template without wiping your `playwright.config.ts`:

```bash
cp .claude/plugins/playwright-enterprise-tester/templates/.playwright-tester.json.tmpl \
   .playwright-tester.json
```

Edit the key sections:
- `execution.baseURL`: set to your actual URL
- `testData.precreatedUsers.user.envKey`: your env var name
- `profile.laravel.enabled` (if Laravel): `true`

### Step 4: keep your existing tests

The plugin does NOT modify existing specs. It adds:
- Helpers in `tests/support/` (if you want the silent failure detection, etc.)
- A `tests/setup/auth.setup.ts` (if you want reusable storage state)

Pick and choose from `skills/playwright-enterprise-tester/templates/` — copy
only the helpers you need.

### Step 5: first invocation

```
/playwright-tester mode=smoke files=tests/e2e/your-existing.spec.ts
```

The agent respects your existing tests and reports without modifying them
(unless you ask).

### Step 6: gradually adopt phase 2

Follow [ONBOARDING.md](ONBOARDING.md) §3 progressive rollout.

## From another E2E testing tool

### From Cypress

- **Spec syntax**: Cypress uses `cy.get()` → Playwright uses `page.locator()` and
  semantic locators. Rewrite is needed (no auto-conversion).
- **Network mocking**: Cypress `cy.intercept()` → Playwright `page.route()`.
- **Config**: `cypress.config.ts` → `playwright.config.ts` + `.playwright-tester.json`.
- **Tests location**: typically `cypress/e2e/` → `tests/e2e/`.

Migration is not automated. Plan 1-2 weeks per 100 tests for rewrite.

### From Selenium / WebdriverIO

- **Driver**: Selenium → Playwright native (Chromium, WebKit, Firefox)
- **API**: `driver.findElement` → `page.locator()`
- **Waits**: explicit waits → Playwright auto-waiting on locators
- **Speed**: Playwright is typically 2-5x faster

Plan 2-4 weeks per 100 tests for rewrite.

### From Puppeteer

- **API**: Puppeteer's `page.$()` → Playwright's `page.locator()` (Puppeteer
  API still works in Playwright for gradual migration)
- **Tests framework**: Playwright Test is built-in; Puppeteer needs Jest/Mocha
- **Migration tool**: consider https://github.com/puppeteer/puppeteer ↔ Playwright
  cheatsheet

## Version migrations

### v1.0.0 → v1.1.0 (future)

*TBD when v1.1.0 is released.*

### Config schema migrations

When `schemaVersion` bumps, the plugin provides a migration script:

```bash
node .claude/plugins/playwright-enterprise-tester/scripts/migrate-config.mjs \
  --from=1 --to=2
```

(Script will be added when needed.)

## Upgrading the plugin itself

```bash
cd .claude/plugins/playwright-enterprise-tester
git pull origin main
```

Or use a specific version tag:

```bash
git checkout v1.1.0
```

After upgrading:
1. Check `CHANGELOG.md` for breaking changes
2. Re-validate your `.playwright-tester.json` (`node -c` or JSON lint)
3. If `schemaVersion` bumped, run the migration script
4. Run `/playwright-tester mode=smoke` to verify

## Downgrading

```bash
cd .claude/plugins/playwright-enterprise-tester
git checkout v1.0.0
```

Note: config changes you made for newer versions may not be compatible with
older versions. Keep a backup of `.playwright-tester.json` before upgrading.

## Rollback plan

If the plugin causes issues:

1. **Disable globally**: set `enabled: false` at the top of `.playwright-tester.json`
2. **Disable specific feature**: set `<feature>.enabled: false`
3. **Uninstall**: remove `.claude/plugins/playwright-enterprise-tester/`
4. **Your tests continue working**: Playwright itself is independent of the plugin.
   Your specs in `tests/e2e/` run via `npx playwright test` as always.

The plugin is additive — removing it leaves your project in a working state.

## Troubleshooting migration

### "Tests break after enabling P2 feature X"

Disable that feature, verify tests pass, then re-enable with more specific
config. If the bug persists, [open an issue](https://github.com/lopadova/playwright-enterprise-tester/issues).

### "Schema version mismatch"

The plugin refuses to load if `schemaVersion` is too old/new. Run the
migration script or update the plugin.

### "Can't find `.playwright-tester.json.tmpl`"

The template is at
`.claude/plugins/playwright-enterprise-tester/templates/.playwright-tester.json.tmpl`.
If missing, reinstall the plugin.

## Getting help

- [GitHub Discussions](https://github.com/lopadova/playwright-enterprise-tester/discussions)
- [GitHub Issues](https://github.com/lopadova/playwright-enterprise-tester/issues)

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
