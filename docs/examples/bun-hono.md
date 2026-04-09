# Bun + Hono integration example

How to use `playwright-enterprise-tester` with a Bun runtime and Hono web framework.

## Detection

Auto-detected when:
- `bun.lock` or `bun.lockb` present
- `package.json` contains `hono` in dependencies

## Install

```bash
cd your-bun-hono-project
git clone https://github.com/lopadova/playwright-enterprise-tester.git \
  .claude/plugins/playwright-enterprise-tester

bun run node .claude/plugins/playwright-enterprise-tester/scripts/install.mjs
```

## Playwright on Bun

Playwright works with Bun as long as the browser install is done via Node:

```bash
bun add -d @playwright/test
bunx playwright install chromium
```

> **Note**: Playwright has some known incompatibilities with Bun for certain
> edge cases (mainly around `require`). If you hit issues, run Playwright
> through Node instead:
>
> ```bash
> npx playwright test
> ```

## Config for Bun + Hono

```json
{
  "execution": {
    "baseURL": "http://localhost:3000",
    "startCommand": "bun run dev"
  }
}
```

Typical Hono `dev` script in `package.json`:

```json
"scripts": {
  "dev": "bun run --hot src/index.ts"
}
```

## `playwright.config.ts` with Bun webServer

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.PWTEST_BASE_URL ?? 'http://localhost:3000',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

## Hono-specific patterns

### JSX renderer (SSR)

Hono with JSX returns pre-rendered HTML. Tests work like any SSR app:

```ts
await page.goto('/');
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
```

### Middleware chains

Hono middleware can set headers, cookies, auth. Tests inherit these via the
normal browser context. No special handling needed.

### HTMX or Alpine integration

If Hono serves HTMX-powered pages:

```ts
await page.getByRole('button', { name: /load more/i }).click();
// HTMX swaps the response HTML into the DOM
await expect(page.getByRole('article').nth(10)).toBeVisible();
```

## Auth with Hono

Hono doesn't ship auth by default. Common patterns:
- JWT in cookies
- Session middleware (e.g., `@hono/cookie-session`)

Test auth like any cookie-based auth:

```ts
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(process.env.PWTEST_USER_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.PWTEST_USER_PASSWORD!);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL(/\/dashboard/);
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
```

## Bun-specific gotchas

### `require` vs ESM

Playwright's test runner uses CJS in some modules. Bun defaults to ESM.
If you get `require is not defined`, ensure your test files use explicit
imports and the Playwright config has `"type": "module"` in `package.json`.

### File watching

Bun's `--hot` watcher can conflict with Playwright's reload detection. For
stable tests, run Bun without `--hot` in CI:

```bash
bun run src/index.ts  # not: bun run --hot
```

### TypeScript compilation

Bun compiles TS on the fly. No `tsc` needed before running Playwright tests.

## Example smoke test

```ts
import { test, expect } from '../support/console-capture';

test('home serves HTML @smoke', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('api endpoint works @smoke @api', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.status).toBe('ok');
});
```

## CI workflow for Bun

```yaml
name: Playwright E2E
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install
      - run: bunx playwright install --with-deps chromium
      - run: bun run build
      - run: bunx playwright test
        env:
          PWTEST_BASE_URL: http://localhost:3000
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report
```

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
