# Scraping mode full implementation (P2.02)

Load when `scraping.enabled=true` or `mode=dynamic-scraping`.

Phase 1 had scraping declared but minimal. Phase 2 delivers a complete
scraping mode with extraction helpers, pagination patterns, output formats,
and ethical guardrails.

## Scope

Scraping mode is for **data extraction from JS-rendered pages**, not for
regression testing. Use cases:

- Collecting competitor catalog / pricing
- Extracting dashboard data behind login
- Harvesting content from pages where static HTML is incomplete
- Building training datasets

**It is NOT for:**
- Testing your own app (use E2E regression modes)
- High-volume scraping (rate limited, intentional)
- Unauthorized access

## Ethical guardrails (enforced)

1. **`robotsTxtRespect: true`** — skill reads `/robots.txt` and refuses to
   scrape disallowed paths
2. **`allowedDomains: []`** — empty means allowed domains must be
   explicitly listed per project
3. **Rate limiting** — `requestsPerSecond: 2` default, configurable
4. **Custom user agent** — identifies the scraper with a contact email
5. **No bypass of auth walls** — `authenticatedScraping` opt-in only
6. **Terms of service awareness** — scraper logs a warning if the domain
   is in a known ToS-restrictive list (to be maintained per project)

If any guardrail is violated, the scraper refuses to run and reports why.

## Config reference

```json
"scraping": {
  "enabled": false,
  "allowDynamicScrapingMode": true,
  "outputFormat": "json",
  "supportedOutputFormats": ["json", "csv", "ndjson"],
  "outputDir": "test-results/scraping",
  "patterns": {
    "pagination": { "enabled": true, "maxPages": 20, "pageParam": "page" },
    "infiniteScroll": { "enabled": true, "maxScrolls": 15, "itemCountStableIterations": 2 },
    "modalExtraction": { "enabled": true, "openDelayMs": 300 },
    "lazyLoadedImages": { "enabled": true, "scrollBeforeExtract": true }
  },
  "resilientSelectors": {
    "preferSemantic": true,
    "autoRepairOnDrift": true,
    "maxLocatorFallbacks": 3
  },
  "rateLimiting": {
    "enabled": true,
    "requestsPerSecond": 2,
    "jitterMs": 500
  },
  "authenticatedScraping": {
    "enabled": false,
    "reuseStorageState": true,
    "storageStatePath": "playwright/.auth/user.json"
  },
  "allowedDomains": [],
  "robotsTxtRespect": true,
  "userAgent": "PlaywrightEnterpriseScraper/1.0 (+contact@example.com)"
}
```

## Scenario library

### Scenario 1: category listing with pagination

```ts
import { test, expect } from '@playwright/test';
import { ScrapingHelper } from '../support/scraping-helpers';

test('scrape category listing @scrape', async ({ page }) => {
  const helper = new ScrapingHelper(page, {
    output: 'test-results/scraping/category-products.json',
    format: 'json',
  });

  await page.goto('/c/scarpe');
  await helper.checkRobotsTxtOrThrow();

  const products = await helper.scrapePagination({
    itemSelector: '[data-testid="product-card"]',
    extractFn: async (card) => ({
      name: await card.getByRole('heading').textContent(),
      priceText: await card.locator('.price').textContent(),
      url: await card.getByRole('link').getAttribute('href'),
      imgSrc: await card.getByRole('img').getAttribute('src'),
    }),
    nextPageSelector: "a[rel='next']",
    maxPages: 10,
  });

  await helper.writeOutput(products);
  expect(products.length).toBeGreaterThan(0);
});
```

### Scenario 2: infinite scroll

```ts
test('scrape infinite scroll feed @scrape', async ({ page }) => {
  const helper = new ScrapingHelper(page, {
    output: 'test-results/scraping/feed.ndjson',
    format: 'ndjson',
  });

  await page.goto('/feed');

  const items = await helper.scrapeInfiniteScroll({
    itemSelector: 'article.post',
    extractFn: async (post) => ({
      title: await post.getByRole('heading').textContent(),
      author: await post.getByTestId('author').textContent(),
      date: await post.locator('time').getAttribute('datetime'),
    }),
    maxScrolls: 15,
    stableForIterations: 2,
  });

  await helper.writeOutput(items);
});
```

### Scenario 3: modal detail extraction

```ts
test('scrape modal details @scrape', async ({ page }) => {
  const helper = new ScrapingHelper(page, { output: 'test-results/scraping/details.json' });

  await page.goto('/c/offerte');
  const cards = await page.getByRole('article').all();

  const details = [];
  for (const card of cards) {
    await helper.throttle(); // respect rate limit
    await card.getByRole('button', { name: /dettagli/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    details.push({
      title: await dialog.getByRole('heading', { level: 2 }).textContent(),
      description: await dialog.locator('.description').textContent(),
      specs: await dialog.locator('.specs li').allTextContents(),
    });

    await dialog.getByRole('button', { name: /chiudi/i }).click();
    await expect(dialog).toBeHidden();
  }

  await helper.writeOutput(details);
});
```

### Scenario 4: authenticated scraping (opt-in)

```ts
// Requires .playwright-tester.json → scraping.authenticatedScraping.enabled=true
test.use({ storageState: 'playwright/.auth/user.json' });

test('scrape authenticated dashboard @scrape @auth', async ({ page }) => {
  const helper = new ScrapingHelper(page, { output: 'test-results/scraping/dashboard.json' });

  await page.goto('/account/dashboard');
  await expect(page.getByRole('heading', { name: /benvenuto/i })).toBeVisible();

  const data = await helper.extractTable('[data-testid="orders-table"]');
  await helper.writeOutput(data);
});
```

## Output formats

- **`json`** — single file with array of records
- **`csv`** — flat records, headers from first record
- **`ndjson`** — one JSON object per line (streaming-friendly)

```js
// json
[{"name":"...","price":"..."}, {...}, ...]

// csv
name,price
"Product A","29.90"

// ndjson
{"name":"Product A","price":"29.90"}
{"name":"Product B","price":"49.90"}
```

## Locator drift repair

When `resilientSelectors.autoRepairOnDrift=true`, the helper tries up to
`maxLocatorFallbacks` alternative locators before failing. Strategy:

1. Original semantic locator (e.g., `getByRole('article')`)
2. `getByTestId` fallback if `data-testid` present
3. CSS fallback based on class pattern
4. Reports the drift in the final output

If all fallbacks fail, the helper skips that element with a warning,
rather than aborting the whole scrape.

## Rate limiting

`helper.throttle()` sleeps for `1000/requestsPerSecond + random(jitterMs)`
ms between HTTP requests. This is the scraper's primary ethical guardrail.

Never disable rate limiting on third-party sites. For your own sites,
you can raise it.

## Robots.txt compliance

```ts
await helper.checkRobotsTxtOrThrow();
```

This fetches `/robots.txt` and throws if the current path matches a
`Disallow:` rule. The scraper always runs this check before scraping
external domains.

For internal your project domains, you can whitelist in
`scraping.allowedDomains`.

## Output directory structure

```
test-results/scraping/
├── category-products.json
├── feed.ndjson
├── details.json
├── dashboard.json
└── scraping-run.log
```

The log file includes:
- domains accessed
- total requests made
- rate limiting waits
- locator drifts repaired
- skipped elements (with reasons)

## Anti-patterns

- Scraping logged-in user data of third parties (GDPR violation)
- Scraping at > 10 req/s without explicit permission
- Ignoring robots.txt
- Reusing production auth cookies for scraping (risk of account
  suspension or ToS violation)
- Building persistent datasets without a clear retention policy

## Phase 3 candidates

- Browser pool for parallel scraping across contexts
- Distributed scraping across multiple shards
- Captcha handling (2captcha-style API integration)
- Rotating proxies support
- Data diff across runs (what changed since last scrape)
- Automatic schema inference from scraped data
