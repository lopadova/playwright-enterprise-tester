# Next.js integration example

How to use `playwright-enterprise-tester` on a Next.js 14+ project (App Router
or Pages Router).

## Detection

Auto-detected when:
- `package.json` contains `next` in dependencies or devDependencies
- `next.config.js` / `next.config.mjs` present

## Install

```bash
cd your-nextjs-project
git clone https://github.com/lopadova/playwright-enterprise-tester.git \
  .claude/plugins/playwright-enterprise-tester

node .claude/plugins/playwright-enterprise-tester/scripts/install.mjs
# Base URL: http://localhost:3000
```

## Playwright peer deps

```bash
npm install -D @playwright/test
npx playwright install chromium
```

## Config tweaks for Next.js

```json
{
  "execution": {
    "baseURL": "http://localhost:3000",
    "startCommand": "npm run dev"
  },
  "asyncPolicy": {
    "preferUiSignals": true
  }
}
```

## `playwright.config.ts` with webServer

Next.js auto-starts via `webServer`:

```ts
export default defineConfig({
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.PWTEST_BASE_URL ?? 'http://localhost:3000',
  }
});
```

For dev mode (faster):

```ts
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
}
```

## Next.js-specific patterns

### Server components (App Router)

Server components render on the server. Tests interact with the rendered
HTML + client hydration. Wait for hydration before interacting:

```ts
await page.goto('/dashboard');
// Wait for hydration by checking a client-side interaction
await expect(page.getByRole('button', { name: /log out/i })).toBeEnabled();
```

### Client components with Suspense

Suspense boundaries show fallback UI first. Wait for the real content:

```ts
await page.goto('/products');
// Fallback shows "Loading..."
// Real content has the heading
await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();
```

### `next/image`

Images are optimized and may load async. Wait for visibility, not src:

```ts
await expect(page.getByRole('img', { name: /product photo/i })).toBeVisible();
```

### API routes (App Router)

Test API routes via Playwright's `request` fixture (phase 3 integration):

```ts
test('api returns products', async ({ request }) => {
  const response = await request.get('/api/products');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.length).toBeGreaterThan(0);
});
```

### `router.push` navigations

Next.js client navigations change the URL. Use `waitForURL`:

```ts
await Promise.all([
  page.waitForURL(/\/dashboard/),
  page.getByRole('link', { name: /dashboard/i }).click()
]);
```

### Middleware

If you have `middleware.ts` that redirects based on auth, ensure your test
has the right cookies/headers.

## Auth with NextAuth.js

NextAuth sessions use a JWT or database session cookie. For tests:

```ts
// tests/setup/auth.setup.ts
setup('authenticate via credentials provider', async ({ page }) => {
  await page.goto('/api/auth/signin');
  await page.getByLabel(/email/i).fill(process.env.PWTEST_USER_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.PWTEST_USER_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
```

Alternative: bypass UI login with a programmatic session:

```ts
setup('seed session directly', async ({ request }) => {
  // Call a test-only API route that creates a session
  await request.post('/api/_test/session', {
    data: { userId: 1 }
  });
  // Extract the cookie and save
});
```

## Common Next.js gotchas

### Hydration mismatch warnings

If tests fail with console errors about hydration, your component has
server/client rendering differences. Fix the app, not the test.

### ISR / SSG pages

Incremental Static Regeneration may serve stale data. Force revalidation:

```ts
await page.goto('/?_ts=' + Date.now());
```

Or use `res.revalidate()` in a test-only API route.

### Environment variables

Next.js exposes `NEXT_PUBLIC_*` vars to the client bundle. For tests:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api
PWTEST_BASE_URL=http://localhost:3000
PWTEST_USER_EMAIL=pwtest+user@example.test
PWTEST_USER_PASSWORD=...
```

### Turbopack dev server

Next.js 15+ with Turbopack dev has different startup behavior. The plugin
autodetects and uses the right command.

## Example smoke test

`tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '../support/console-capture';

test('home loads @smoke', async ({ page, consoleCapture }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(consoleCapture.pageErrors).toEqual([]);
});

test('navigation works @smoke', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/about/),
    page.getByRole('link', { name: /about/i }).click()
  ]);
  await expect(page.getByRole('heading', { name: /about/i })).toBeVisible();
});
```

## CI workflow for Next.js

```yaml
name: Playwright E2E
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npx playwright test
        env:
          PWTEST_BASE_URL: http://localhost:3000
          PWTEST_USER_EMAIL: ${{ secrets.PWTEST_USER_EMAIL }}
          PWTEST_USER_PASSWORD: ${{ secrets.PWTEST_USER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report
```

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
