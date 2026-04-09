# Laravel patterns

Load when a Laravel project is detected (`composer.json` contains
`laravel/framework` AND `artisan` file exists).

## Detection

The skill activates Laravel-specific helpers when:

```json
{
  "composerPackages": ["laravel/framework"],
  "files": ["artisan", "composer.json"]
}
```

Sub-profiles within Laravel:
- **Laravel + Vite**: `vite.config.*` present → modern asset pipeline
- **Laravel + Mix**: `webpack.mix.js` + `public/mix-manifest.json` → legacy asset pipeline
- **Laravel Livewire**: `livewire/livewire` in composer.json → reactive components
- **Laravel Inertia**: `inertiajs/inertia-laravel` in composer.json → SPA hybrid
- **Laravel Blade only**: no JS framework hints → classic MPA

## Boot commands (discovery hints)

Playwright `webServer` can be configured to one of:

```bash
# Preferred: app already running
php artisan serve --host=127.0.0.1 --port=8000

# Alternative: composer dev script (if defined)
composer run dev

# Fallback: built-in PHP server
php -S 127.0.0.1:8000 -t public
```

Typical base URLs: `http://127.0.0.1:8000`, `http://localhost:8000`.

If a remote staging URL is configured via env (`APP_URL`,
`PLAYWRIGHT_BASE_URL`), prefer it and skip local boot.

## CSRF token extraction

Laravel forms require a CSRF token. For form-submit flows (non-AJAX),
the token is in a meta tag and a hidden input:

```html
<meta name="csrf-token" content="...">
<form method="POST">
  <input type="hidden" name="_token" value="...">
  ...
</form>
```

Playwright tests that bypass UI with direct API calls must extract the
token first:

```ts
await page.goto('/');
const token = await page.locator("meta[name='csrf-token']").getAttribute('content');

await page.request.post('/api/endpoint', {
  headers: {
    'X-CSRF-TOKEN': token!,
    'X-Requested-With': 'XMLHttpRequest'
  },
  data: {...},
});
```

Config the meta selector via `profile.laravel.csrfMetaSelector` in
`.playwright-tester.json` if your project uses a custom name.

## Session cookie

Laravel sessions use a named cookie (default: `laravel_session`, but
often customized). After login:

```ts
const cookies = await context.cookies();
const session = cookies.find(c => c.name === 'laravel_session');
expect(session).toBeDefined();
```

Configure the cookie name via `profile.laravel.sessionCookieName`:

```json
"profile": {
  "laravel": {
    "enabled": true,
    "sessionCookieName": "my_app_session"
  }
}
```

## Common middleware considerations

Laravel apps often have middleware that affects tests:

### CSRF middleware (`VerifyCsrfToken`)

All POST/PUT/PATCH/DELETE requests require the `_token` field or
`X-CSRF-TOKEN` header. Form tests get this automatically if they fill
the `_token` input; direct API calls must extract it.

### Authentication middleware (`auth`)

Routes behind `auth` middleware require a logged-in session. Use the
auth storage state pattern (see `auth-storage-state.md`).

### Rate limiting (`throttle`)

Test suites that hit the same endpoint repeatedly can trigger rate
limiting. Either:
- Disable throttle in testing env (`RateLimiter::for('api', ...)`)
- Space tests with explicit waits
- Use different test accounts to bypass per-IP limits

### Custom app middleware

Some Laravel apps ship custom middleware: user-agent checks, IP
whitelists, multi-tenancy, locale detection. These can block
Playwright tests.

Common workarounds:
- Override `userAgent` in `playwright.config.ts → use.userAgent`
- Whitelist Playwright IPs in the middleware's testing branch
- Set env vars that disable the middleware in testing mode

Check your project's `app/Http/Middleware/` for non-standard middleware
and adapt accordingly.

## Multi-language / multi-country routing

Many Laravel apps use locale prefixes: `/en/cart`, `/it/cart`, etc.
If your project has this, configure the base URL to include the prefix:

```bash
PWTEST_BASE_URL=https://app.example.com/en
```

Or configure `multiTenant` section in `.playwright-tester.json` to
parameterize per-locale runs.

## Full page cache (optional)

Some Laravel apps use full-page HTML caching (e.g., SuperCache, Laravel
Cache Response). Cached pages may:
- Serve different content on warm vs cold cache
- Strip session cookies for anonymous users
- Have longer TTLs that invalidate between tests

If your project uses page caching, either:
- Bypass the cache in testing env (via middleware)
- Use a cache-busting query param (`?_t=<timestamp>`)
- Warm the cache before the test with a preliminary request

## Asset versioning (Mix)

`public/mix-manifest.json` maps assets to versioned URLs. Do not assert
on asset URLs; they change on every rebuild. Assert on visible UI state.

## Asset versioning (Vite)

`vite.config.*` with `@vitejs/plugin-react` or similar. Vite dev server
runs on port 5173 by default. In tests, the Laravel backend should
already have built assets (`npm run build`), OR you need to run
`npm run dev` alongside `php artisan serve`.

Configure `webServer` in `playwright.config.ts` with both commands:

```ts
webServer: [
  { command: 'php artisan serve --port=8000', url: 'http://localhost:8000' },
  { command: 'npm run dev', url: 'http://localhost:5173' }
]
```

## Livewire

Livewire components use AJAX for re-rendering. Tests must wait on the
post-render DOM state, not on navigation:

```ts
await page.getByRole('button', { name: /submit/i }).click();
// Livewire sends a POST to /livewire/message/* and re-renders the component
await expect(page.getByRole('alert')).toBeVisible();
```

Livewire uses the `wire:` attribute prefix which can be used as a
stable selector fallback when semantic locators aren't available:

```ts
await page.locator('[wire\\:click="save"]').click();
```

## Inertia

Inertia wraps your app as a SPA but uses Laravel routes. Navigation
happens client-side but URLs change. Tests can use `waitForURL`
normally:

```ts
await Promise.all([
  page.waitForURL(/\/dashboard/),
  page.getByRole('link', { name: /dashboard/i }).click()
]);
```

Inertia's `$page` prop is accessible via `window.__inertia` for
debugging but should not be used in tests (implementation detail).

## Helpful artisan commands (optional)

If the team enables `testData.artisanBridge`, conventional commands:

```bash
php artisan test:reset-db
php artisan test:seed-fixtures
php artisan test:create-user --role=user --email=test@example.com
```

These don't exist by default in Laravel — you define them yourself.
The bridge is opt-in.

## Test data strategies for Laravel

Three common approaches:

### 1. Readonly staging (recommended)

Use a dedicated staging environment with pre-created users. No runtime
seed. Tests must be idempotent. See `test-data-staging-strategy.md`.

### 2. Transactional tests

If you can run Playwright against a local DB, wrap each test in a
transaction that rolls back:

```php
// In a custom testing route
Route::post('/_testing/begin-transaction', function () {
  DB::beginTransaction();
});
Route::post('/_testing/rollback', function () {
  DB::rollBack();
});
```

Tests call these endpoints via `page.request.post()` at the beginning
and end.

### 3. Database refresh between runs

Use `php artisan migrate:fresh --seed` between CI runs. Slow but
guarantees clean state. Not suitable for PR checks, only for nightly
full suite runs.

## Environment files

Laravel projects typically have:
- `.env` (development)
- `.env.testing` (for PHPUnit/Pest)
- `.env.local`

For Playwright, create a dedicated `.env.e2e`:

```bash
# .env.e2e
PWTEST_BASE_URL=http://localhost:8000
PWTEST_USER_EMAIL=pwtest+user@example.test
PWTEST_USER_PASSWORD=your-test-password
```

Add to `.gitignore`. Load before running tests.

## Phase 3 candidates for Laravel

- Automated artisan bridge with conventional commands generator
- Livewire-specific test helpers
- Inertia route introspection
- Laravel Breeze / Jetstream auth flow templates
- Tenancy for Laravel (Stancl/Tenancy) multi-tenant helpers
