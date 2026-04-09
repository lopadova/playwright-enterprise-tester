# Laravel integration example

How to use `playwright-enterprise-tester` on a Laravel 10+ project.

## Detection

The plugin auto-detects Laravel when:
- `composer.json` contains `laravel/framework`
- `artisan` file exists at repo root

Sub-profiles:
- **Laravel + Vite**: `vite.config.js` present
- **Laravel + Mix**: `webpack.mix.js` present
- **Laravel Livewire**: `livewire/livewire` in composer.json
- **Laravel Inertia**: `inertiajs/inertia-laravel` in composer.json

## Install

```bash
cd your-laravel-project
git clone https://github.com/lopadova/playwright-enterprise-tester.git \
  .claude/plugins/playwright-enterprise-tester

node .claude/plugins/playwright-enterprise-tester/scripts/install.mjs
```

Answer the prompts:
- Base URL: `http://localhost:8000` (or your `APP_URL`)
- User email env: `PWTEST_USER_EMAIL`
- User password env: `PWTEST_USER_PASSWORD`

## Playwright peer deps

```bash
npm install -D @playwright/test
npx playwright install chromium
```

## Config tweaks for Laravel

Edit `.playwright-tester.json`:

```json
{
  "profile": {
    "laravel": {
      "enabled": true,
      "legacyMpaMode": true,
      "csrfMetaSelector": "meta[name='csrf-token']",
      "sessionCookieName": "laravel_session"
    }
  },
  "execution": {
    "baseURL": "http://localhost:8000",
    "startCommand": "php artisan serve --host=127.0.0.1 --port=8000"
  }
}
```

If you use Vite, also run the asset dev server:

```json
"execution": {
  "frontendCommand": "npm run dev"
}
```

## Pre-created test users

In Laravel tinker or a seeder:

```php
use App\Models\User;
use Illuminate\Support\Facades\Hash;

User::create([
  'email' => 'pwtest+user@example.test',
  'password' => Hash::make(env('PWTEST_USER_PASSWORD')),
  'name' => 'Playwright Test User',
]);
```

Set the env vars:
```bash
# .env.e2e
PWTEST_USER_EMAIL=pwtest+user@example.test
PWTEST_USER_PASSWORD=your-secure-password
PWTEST_BASE_URL=http://localhost:8000
```

## Auth setup with CSRF

The `tests/setup/auth.setup.ts` template handles CSRF automatically
because Laravel forms include the meta tag. The setup logs in via the UI
and saves `playwright/.auth/user.json`.

## Running tests

```bash
# Start Laravel
php artisan serve

# In another terminal: load env and run smoke
export $(cat .env.e2e | xargs)
/playwright-tester mode=smoke
```

## Common Laravel gotchas

### CSRF token mismatch (419 error)

Cause: session cookie not preserved between pages.

Fix: ensure `playwright.config.ts` has the right context:

```ts
use: {
  baseURL: process.env.PWTEST_BASE_URL ?? 'http://localhost:8000',
  storageState: 'playwright/.auth/user.json',
}
```

And that the Laravel session driver supports cookies (not just server-side
sessions tied to IP/UA).

### `VerifyUserAgentAndIp` or custom middleware blocking tests

If your app has custom middleware that checks user agent or IP, whitelist
Playwright:

```php
// in the middleware
if ($request->userAgent() && str_contains($request->userAgent(), 'Playwright')) {
  return $next($request);
}
```

And set in `playwright.config.ts`:

```ts
use: {
  userAgent: 'Mozilla/5.0 (Playwright/1.48 Enterprise Tester)'
}
```

### SuperCache / full-page cache serving stale data

Bypass the cache during tests:

```ts
await page.goto('/?_nocache=' + Date.now());
```

Or configure a cache-bypass header recognized by your cache middleware.

### Multi-locale routing (`/en/`, `/it/`)

If your Laravel app uses locale prefixes:

```bash
PWTEST_BASE_URL=http://localhost:8000/en
```

Or use the plugin's multi-tenant matrix (P2 opt-in):

```json
"multiTenant": {
  "enabled": true,
  "baseUrlTemplate": "http://localhost:8000/{language}",
  "languages": ["en", "it"]
}
```

### Livewire components

Livewire re-renders via POST to `/livewire/message/*`. Tests should wait on
the resulting DOM change, not on a navigation:

```ts
await page.getByRole('button', { name: /save/i }).click();
// Livewire updates the component; wait for the business signal
await expect(page.getByRole('alert')).toBeVisible();
```

### Inertia pages

Inertia navigations change the URL but don't trigger full page loads.
`waitForURL` still works:

```ts
await Promise.all([
  page.waitForURL(/\/dashboard/),
  page.getByRole('link', { name: /dashboard/i }).click()
]);
```

## Example smoke test

`tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '../support/console-capture';

test('home page loads @smoke', async ({ page, consoleCapture }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(consoleCapture.pageErrors).toEqual([]);
});

test('login form is present @smoke', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});
```

## CI workflow for Laravel

`.github/workflows/playwright.yml`:

```yaml
name: Playwright E2E
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: testing
        ports: ['3306:3306']
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.2' }
      - run: composer install
      - run: php artisan migrate --seed
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: php artisan serve &
      - run: npx playwright test
        env:
          PWTEST_USER_EMAIL: ${{ secrets.PWTEST_USER_EMAIL }}
          PWTEST_USER_PASSWORD: ${{ secrets.PWTEST_USER_PASSWORD }}
          PWTEST_BASE_URL: http://localhost:8000
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report
```

## Further reading

- [`references/laravel-patterns.md`](../../skills/playwright-enterprise-tester/references/laravel-patterns.md) — deep dive
- [`references/auth-storage-state.md`](../../skills/playwright-enterprise-tester/references/auth-storage-state.md)
- [`ONBOARDING.md`](../ONBOARDING.md) — full onboarding guide

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
