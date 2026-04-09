# Legacy MPA patterns (Blade + jQuery + Alpine)

Load this when the Laravel profile is active or `mode=legacy-mpa` is requested.

## What "legacy MPA" means here

A Multi-Page App where:

- most navigations are full-page reloads (GET → HTML → render)
- forms submit via `<form method="POST">` and respond with a `302 Location`
- jQuery handles progressive enhancement (toggles, modals, AJAX bits)
- Alpine handles small interactive widgets (dropdowns, tabs, cart drawer)
- there is no client-side router; the server is the source of truth

This is the opposite of an SPA with client-side hydration and async URL
transitions. The patterns below encode the differences.

## Pattern 1: form submit with redirect

SPA pattern (wrong for legacy MPA):

```ts
// WRONG for legacy MPA
await page.getByRole('button', { name: /invia/i }).click();
await expect(page.getByText(/grazie/i)).toBeVisible(); // assumes in-place update
```

Legacy MPA pattern (correct):

```ts
await Promise.all([
  page.waitForURL(/\/grazie|\/thank-you/),        // wait for redirect target
  page.getByRole('button', { name: /invia/i }).click(),
]);
// now we are on the new page; assert its content
await expect(page.getByRole('heading', { name: /grazie|thank you/i })).toBeVisible();
```

Use `Promise.all([waitForURL(...), click()])` to avoid race conditions where
the click happens after `waitForURL` starts watching but before the navigation
actually fires.

## Pattern 2: CSRF token with direct POST

For test-only API calls (e.g., seed a cart state via an admin endpoint), extract
the CSRF from the current page first:

```ts
await page.goto('/');
const csrf = await page.locator("meta[name='csrf-token']").getAttribute('content');

const response = await page.request.post('/cart/add', {
  headers: {
    'X-CSRF-TOKEN': csrf!,
    'X-Requested-With': 'XMLHttpRequest', // Laravel needs this to return JSON
  },
  form: { sku: 'ABC123', qty: 1 },
});
expect(response.ok()).toBeTruthy();
```

Never embed a CSRF in a test fixture; always read it from the live page.

## Pattern 3: jQuery ready signal

your project pages fire jQuery-dependent behavior on `$(document).ready`. If a test
interacts with the page before ready, clicks can be lost.

Safe wait:

```ts
await page.waitForFunction(() => {
  const $ = (window as any).jQuery;
  return typeof $ === 'function' && $.isReady === true;
}, null, { timeout: 5000 });
```

Better: wait for a **visible UI contract** that jQuery sets up, like a form
field gaining a class, a button becoming enabled, or a skeleton disappearing.
UI contracts are more reliable than polling internal globals.

## Pattern 4: Alpine init signal

Alpine replaces `x-cloak` elements on init:

```html
<div x-data="{...}" x-cloak>...</div>
```

`x-cloak` is styled `display: none` until Alpine processes the directive.
Waiting for the element to become visible is a clean Alpine readiness signal:

```ts
await expect(page.locator('[x-data]').first()).toBeVisible();
```

Or explicitly:

```ts
await page.waitForFunction(() => {
  const el = document.querySelector('[x-data]');
  return el && window.getComputedStyle(el).display !== 'none';
});
```

## Pattern 5: full-page reload vs partial AJAX update

A page can mix both. The cart example:

- Clicking "Add to cart" on the PDP may trigger an AJAX POST + partial
  re-render of the mini-cart
- Clicking "Proceed to checkout" from the mini-cart triggers a full-page navigate

The test must match each behavior:

```ts
// Partial AJAX: no URL change, wait for mini-cart count
const countBefore = await page.getByTestId('cart-count').textContent();
await page.getByRole('button', { name: /add to cart/i }).click();
await expect(page.getByTestId('cart-count')).not.toHaveText(countBefore ?? '');

// Full navigate: wait for new URL
await Promise.all([
  page.waitForURL(/\/checkout/),
  page.getByRole('link', { name: /proceed to checkout/i }).click(),
]);
```

## Pattern 6: flash messages after redirect

Laravel's `session()->flash()` pattern puts a message in the session for the
NEXT request. After a POST-redirect-GET flow, the flash message is visible
on the destination page:

```ts
await Promise.all([
  page.waitForURL('/cart'),
  page.getByRole('button', { name: /aggiungi/i }).click(),
]);
// The flash message is on the cart page now
await expect(page.getByRole('alert').first()).toContainText(/added to cart/i);
```

## Pattern 7: page cache invalidation

your project's SuperCache serves full-page cached HTML. Two pitfalls:

1. **Cold vs warm cache differences**: the first request may differ from later
   ones (cookie stripping, personalization). Tests that need a consistent
   state should either warm the cache before the test or bypass it.
2. **Stale state after a write**: after a POST that modifies data, the next
   GET may serve the cached (old) version. Bypass via cache-busting query
   param or via header:

```ts
await page.goto('/pagina?_nocache=' + Date.now());
```

## Pattern 8: redirect chains

Laravel may chain redirects: POST → 302 → GET /a → 302 → GET /b. Playwright's
`waitForURL(regex)` handles the chain; do not split it into multiple waits.

```ts
await Promise.all([
  page.waitForURL(/\/account\/dashboard/, { timeout: 15000 }),
  page.getByRole('button', { name: /accedi/i }).click(),
]);
```

## Pattern 9: inline validation errors

Laravel form validation re-renders the same view with `$errors` injected.
The errors appear as inline text near the failing field:

```html
<span class="invalid-feedback">Il campo email e' obbligatorio.</span>
```

Test pattern:

```ts
await page.getByRole('button', { name: /invia/i }).click();
await expect(page.getByText(/il campo email e.*obbligatorio/i)).toBeVisible();
```

Avoid asserting the exact copy: Laravel's validation messages are translatable,
so match a pattern or use `data-testid`.

## Anti-patterns to avoid

- `page.waitForTimeout(2000)` instead of waiting for a real signal
- Asserting on CSS class that jQuery toggles during animation (use the final
  visible state instead)
- Clicking a submit button with `{ force: true }` to "fix" a test (usually
  means the page is not ready)
- Expecting `networkidle` on a page with polling (websocket, long-poll
  heartbeats, third-party trackers) — it never resolves

## When to use `mode=legacy-mpa`

Activate this mode when:

- You are testing a Blade page with no client-side framework
- The test flow is "fill form, submit, assert on the next page"
- There is no SPA router or hydration step

If the page has heavy AJAX within the same URL (e.g., filters that update
results without navigation), use `mode=ajax-heavy` instead.

If the page has both (typical your project page), the skill picks `legacy-mpa` as
the base mode and applies `ajax-heavy` patterns only where relevant.
