# Auth storage state

Load when `mode=auth-protected` or tests require a logged-in user.

## Pattern: Playwright setup project

Playwright supports "setup projects" that run once before dependent test
projects. The setup project logs in as each role and saves the storage state
(cookies + localStorage) to a file. Dependent projects load that state so
each test starts already authenticated.

## your project strategy: read-only staging with pre-created users

The project's test data strategy is `readonly-staging`. This means:

- no runtime user creation
- users are pre-created in the staging DB manually
- credentials are injected via env vars only
- `.playwright-tester.json → testData.precreatedUsers` lists the roles and
  the env key names for each

```json
"precreatedUsers": {
  "guest": { "requiresAuth": false, "enabled": true },
  "user": {
    "enabled": true,
    "envKey": "PWTEST_USER_EMAIL",
    "envPassKey": "PWTEST_USER_PASSWORD"
  },
  "admin": { "enabled": false, ... }
}
```

The test reads `process.env.PWTEST_USER_EMAIL` / `process.env.PWTEST_USER_PASSWORD`
at setup time. Missing env → setup project fails loudly with a clear error.

## Setup project layout

```
playwright.config.ts       // declares 'setup' project + dependent projects
tests/
  setup/
    auth.setup.ts          // logs in each enabled role, saves storage state
playwright/.auth/          // gitignored, holds storage state per role
  user.json
  admin.json
```

## playwright.config.ts fragment

```ts
projects: [
  {
    name: 'setup',
    testMatch: /auth\.setup\.ts/,
  },
  {
    name: 'chromium-user',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'playwright/.auth/user.json',
    },
    dependencies: ['setup'],
    testMatch: /.*\.user\.spec\.ts/,
  },
  {
    name: 'chromium-admin',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'playwright/.auth/admin.json',
    },
    dependencies: ['setup'],
    testMatch: /.*\.admin\.spec\.ts/,
  },
  {
    name: 'chromium-guest',
    use: { ...devices['Desktop Chrome'] },
    testMatch: /.*\.guest\.spec\.ts/,
  },
],
```

## auth.setup.ts structure

```ts
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authDir = path.join(__dirname, '..', '..', 'playwright', '.auth');

setup('authenticate user', async ({ page }) => {
  const email = process.env.PWTEST_USER_EMAIL;
  const password = process.env.PWTEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('PWTEST_USER_EMAIL/PWTEST_USER_PASSWORD not set');
  }

  await page.goto('/account/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await Promise.all([
    page.waitForURL(/\/account|\/dashboard/),
    page.getByRole('button', { name: /accedi|login/i }).click(),
  ]);
  await expect(page.getByRole('link', { name: /logout|esci/i })).toBeVisible();

  await page.context().storageState({ path: path.join(authDir, 'user.json') });
});

setup('authenticate admin', async ({ page }) => {
  const email = process.env.PWTEST_ADMIN_EMAIL;
  const password = process.env.PWTEST_ADMIN_PASSWORD;
  if (!email || !password) {
    // admin may be disabled in this env; skip cleanly
    setup.skip();
  }
  // ... same flow, saves to admin.json
});
```

## Isolation guarantees

Each test that uses `storageState: 'playwright/.auth/user.json'` starts with
a fresh browser context loaded from that file. Cookies and localStorage are
isolated per test — one test cannot pollute another's state.

BUT: the underlying user account is shared. If a test modifies the user's
profile (changes password, adds an address), subsequent tests see the change.
This breaks isolation at the data level.

**Rule**: tests using authenticated state must be idempotent OR clean up
after themselves via an explicit teardown (a "reset" action at the end).

## Never hardcode secrets

The skill's governance forbids hardcoded secrets in spec files. Always read
from `process.env`. In CI, use GitHub Secrets or equivalent:

```yaml
# .github/workflows/playwright.yml
env:
  PWTEST_USER_EMAIL: ${{ secrets.PWTEST_USER_EMAIL }}
  PWTEST_USER_PASSWORD: ${{ secrets.PWTEST_USER_PASSWORD }}
```

In local development, use `.env.e2e` (gitignored). The skill reads env files
listed in `discovery.envFiles`.

## Multiple roles in one test

Sometimes a test needs to simulate two users (e.g., admin approves a request
from a regular user). Playwright supports multiple contexts:

```ts
test('admin approves user request', async ({ browser }) => {
  const userCtx = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
  const adminCtx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });

  const userPage = await userCtx.newPage();
  const adminPage = await adminCtx.newPage();

  // User creates request
  await userPage.goto('/account/requests/new');
  // ...

  // Admin approves
  await adminPage.goto('/admin/requests');
  // ...
});
```

## Storage state expiration

Storage state files are generated once per test run (by the setup project).
If a session expires mid-run (e.g., Laravel session TTL < test suite duration),
tests fail with redirect to login.

Mitigations:
- Keep suite runs under the session TTL
- Re-run setup project before long suites
- Extend TTL in the test environment via Laravel config
- Handle 401/302 in a test helper that re-authenticates on the fly

For Laravel projects, configure `session.lifetime` in `.env.testing` to cover the
longest expected suite run.

## Debugging auth failures

If setup project fails:

1. Check env vars are set: `echo $PWTEST_USER_EMAIL`
2. Check the credentials manually in a browser
3. Check middleware isn't blocking (`VerifyUserAgentAndIp` may reject tests)
4. Read the trace from `test-results/` for the setup step

If setup passes but tests fail:
- Storage state path mismatch → check `playwright.config.ts` projects
- Session cookie name mismatch → check `profile.laravel.sessionCookieName`
- Multi-country URL redirect → check `PWTEST_COUNTRY` / `PWTEST_LANG`

## Template

See `templates/tests/setup/auth.setup.ts.tmpl`.
