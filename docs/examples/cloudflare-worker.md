# Cloudflare Workers integration example

How to use `playwright-enterprise-tester` with a Cloudflare Worker
(with Wrangler dev local emulation).

## Detection

Auto-detected when:
- `wrangler.toml` or `wrangler.jsonc` / `wrangler.json` present
- `package.json` contains `wrangler` in devDependencies

## Install

```bash
cd your-worker-project
git clone https://github.com/lopadova/playwright-enterprise-tester.git \
  .claude/plugins/playwright-enterprise-tester

node .claude/plugins/playwright-enterprise-tester/scripts/install.mjs
# Base URL: http://127.0.0.1:8787
```

## Playwright peer deps

```bash
npm install -D @playwright/test
npx playwright install chromium
```

## Config for Workers

```json
{
  "execution": {
    "baseURL": "http://127.0.0.1:8787",
    "startCommand": "wrangler dev"
  }
}
```

## `playwright.config.ts` with Wrangler webServer

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.PWTEST_BASE_URL ?? 'http://127.0.0.1:8787',
  },
  webServer: {
    command: 'wrangler dev --port 8787',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

## Testing against preview deployments (recommended for CI)

Wrangler can deploy to a unique preview URL per PR:

```bash
wrangler deploy --env preview
```

Get the URL and set it:

```bash
PWTEST_BASE_URL=https://my-worker-pr123.workers.dev
```

Preview deployments are closer to production than local `wrangler dev`.

## Worker-specific patterns

### Static assets

If your Worker uses Workers Sites or R2 for static assets, test the
served HTML:

```ts
await page.goto('/');
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
```

### Workers KV / D1 / R2

For tests that depend on storage state, either:
- Use `wrangler dev --local` with persisted state
- Seed via a test-only Worker endpoint:

```ts
await page.request.post('/_test/seed', {
  data: { kvKey: 'user:1', value: { name: 'Test User' } }
});
```

### Durable Objects

DO state persists across test runs in `--local` mode. Reset between tests:

```ts
await page.request.post('/_test/reset-do', { data: { id: 'test-room' } });
```

### Hono on Workers (common combo)

If you use Hono on Workers, the same patterns as
[bun-hono.md](bun-hono.md) apply, just with Wrangler as the runtime.

## Environment variables

Workers env vars live in `wrangler.toml`:

```toml
[vars]
API_URL = "https://api.example.com"

[env.preview.vars]
API_URL = "https://api-preview.example.com"
```

Playwright tests read their own env vars (`PWTEST_*`) separately from
Worker env vars. They're independent.

## Common Worker gotchas

### Wrangler dev slow startup

Wrangler dev takes 5-15 seconds to start. Increase Playwright's webServer
timeout:

```ts
webServer: {
  command: 'wrangler dev',
  url: 'http://127.0.0.1:8787',
  timeout: 60_000,  // 60 seconds
  reuseExistingServer: !process.env.CI,
}
```

### Ports collision

Wrangler defaults to port 8787. If another service uses it, specify:

```bash
wrangler dev --port 8788
```

And update `PWTEST_BASE_URL` accordingly.

### Cache API behavior

Workers' Cache API has different behavior in `wrangler dev` vs production.
Tests that verify caching should run against a preview deployment, not
local.

### Request body size limits

Workers have a 100MB request body limit (generous), but `wrangler dev` may
enforce different limits. Test edge cases against a real preview deploy.

## Example smoke test

```ts
import { test, expect } from '../support/console-capture';

test('worker responds @smoke', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading')).toBeVisible();
});

test('api endpoint @smoke @api', async ({ request }) => {
  const response = await request.get('/api/hello');
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.message).toBeDefined();
});

test('static asset served @smoke', async ({ page }) => {
  const response = await page.goto('/favicon.ico');
  expect(response?.ok()).toBeTruthy();
});
```

## CI workflow for Workers

### Option A — test against preview deploy

```yaml
name: Playwright E2E (Worker)
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - name: Deploy preview
        run: npx wrangler deploy --env preview
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          PWTEST_BASE_URL: https://my-worker-preview.workers.dev
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report
```

### Option B — test against wrangler dev (faster, less realistic)

```yaml
name: Playwright E2E (Worker local)
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          PWTEST_BASE_URL: http://127.0.0.1:8787
```

Playwright's `webServer` will start `wrangler dev` automatically.

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
