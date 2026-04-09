# AJAX and SPA async patterns

Load when `mode=ajax-heavy` or a client-side framework is detected.

## Principle: business signals, not network signals

Waiting on `networkidle` is fragile: third-party trackers, websockets, polling,
and long-lived fetches never resolve. Always prefer a **visible UI contract**
over network-level waits.

Good signals:
- a button becomes enabled/disabled
- a skeleton disappears
- an element count increases (infinite scroll)
- a toast appears
- a URL fragment changes
- a specific API response completes

Bad signals:
- `networkidle` as universal default
- `waitForTimeout(2000)`
- polling `page.evaluate(() => document.readyState === 'complete')` alone

## Pattern 1: filter change + async results refresh

```ts
await page.getByLabel(/categoria/i).selectOption('scarpe');
// Wait for either the result count to change or the first card to belong to the new category
await expect(page.getByRole('article').first()).toContainText(/scarpa|sneaker/i);
```

Or, if the app exposes a loading indicator:

```ts
await page.getByLabel(/categoria/i).selectOption('scarpe');
await expect(page.getByRole('status', { name: /caricamento/i })).toBeHidden();
```

Combine with `waitForResponse` only when you know a specific endpoint gates the
visible change:

```ts
const responsePromise = page.waitForResponse(r =>
  r.url().includes('/api/products') && r.status() === 200
);
await page.getByLabel(/categoria/i).selectOption('scarpe');
await responsePromise;
await expect(page.getByRole('article').first()).toContainText(/scarpa|sneaker/i);
```

## Pattern 2: infinite scroll

Assert progressive growth, not a specific final count:

```ts
const initial = await page.getByRole('article').count();
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await expect.poll(
  async () => await page.getByRole('article').count(),
  { timeout: 10000 }
).toBeGreaterThan(initial);
```

Do not hardcode an expected count; the feed may change.

## Pattern 3: delayed hydration / skeleton to content

```ts
// Skeleton is visible first
await expect(page.getByTestId('skeleton')).toBeVisible();
// Real content replaces it
await expect(page.getByTestId('skeleton')).toBeHidden();
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
```

## Pattern 4: toast/snackbar after submit

```ts
await page.getByRole('button', { name: /salva/i }).click();
// Button transitions to disabled during the request
await expect(page.getByRole('button', { name: /salva/i })).toBeDisabled();
// Toast appears
await expect(page.getByRole('status')).toContainText(/salvato/i);
// Button returns to enabled
await expect(page.getByRole('button', { name: /salva/i })).toBeEnabled();
```

Testing all three phases makes the test robust to both instant and delayed
responses.

## Pattern 5: partial cart refresh

```ts
const count = await page.getByTestId('cart-count').textContent();
await page.getByRole('button', { name: /aggiungi/i }).click();
await expect(page.getByTestId('cart-count')).not.toHaveText(count ?? '');
```

## Pattern 6: lazy-loaded tabs

The first time a tab is opened, its content loads asynchronously:

```ts
await page.getByRole('tab', { name: /recensioni/i }).click();
await expect(page.getByRole('tabpanel')).toContainText(/recensioni|valutazioni/i);
```

## Pattern 7: dependent selects (country → region)

```ts
await page.getByLabel(/paese/i).selectOption('IT');
// Region select populates asynchronously
await expect(page.getByLabel(/regione/i).locator('option').nth(1)).toHaveText(/abruzzo|piemonte|.../);
await page.getByLabel(/regione/i).selectOption('Lombardia');
```

Assert that the dependent select has populated before interacting with it.

## Pattern 8: modals with async content

```ts
await page.getByRole('button', { name: /dettagli/i }).click();
const dialog = page.getByRole('dialog');
await expect(dialog).toBeVisible();
// Content inside loads async
await expect(dialog.getByRole('heading', { name: /specifiche/i })).toBeVisible();
```

## Pattern 9: debounced search input

```ts
await page.getByRole('searchbox').fill('scarp');
// Debounce is typically 300-500ms; wait for a stable result count
await expect.poll(
  async () => (await page.getByRole('listitem').count()) > 0,
  { timeout: 5000 }
).toBeTruthy();
```

## Pattern 10: websocket / server-sent events

If the app uses a websocket for live updates (cart, notifications, stock), do
not wait on `networkidle` — it never resolves. Wait on the UI state change
caused by the WS message:

```ts
// Trigger action from another tab or admin panel
// Wait for the UI here to reflect the push
await expect(page.getByTestId('stock-status')).toHaveText(/esaurito|fuori stock/i);
```

## Anti-patterns

- `await page.waitForLoadState('networkidle')` as a default on every `goto`
- `await page.waitForTimeout(5000)` to "let things settle"
- Chained `page.evaluate` loops to poll internal state
- Asserting on CSS classes that toggle during CSS animations (they flicker)

## `expect.poll` vs `waitFor`

- `expect.poll(async () => ..., { timeout })`: repeatedly evaluate a function
  until it satisfies the matcher or the timeout expires. Best for "I want this
  count/state to become X".
- `locator.waitFor({ state })`: wait for a locator to attach/detach/visible.
  Best for "I want this element to appear".
- `page.waitForResponse(urlOrFn)`: wait for a network response. Best when a
  specific endpoint gates the visible change.

Use the narrowest one that fits. `expect.poll` is the most flexible but also
the most verbose; reach for it only when simpler matchers don't apply.
