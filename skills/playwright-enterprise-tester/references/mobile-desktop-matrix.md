# Mobile / desktop matrix (P2.15)

Load when `mobileDesktopMatrix.enabled=true` or `mode=mobile-perf`.

Separate perf budgets and device emulation for mobile vs desktop. Extends
phase 1 `perfBudgets` which used a single budget per page type.

## Why

your project has ~60% mobile traffic, but phase 1 used a single budget assuming
average device. Phase 2 splits into:
- **mobile-chrome** (Pixel 7 emulation, 4x CPU throttle, slow-3g network)
- **desktop-chrome** (1920x1080, no throttle)
- **tablet-chrome** (optional, iPad)

Each device has its own budget targets.

## Config

```json
"mobileDesktopMatrix": {
  "enabled": false,
  "devices": [
    { "name": "desktop-chrome", "viewport": { "width": 1920, "height": 1080 }, "deviceScaleFactor": 1, "enabled": true },
    { "name": "mobile-chrome", "device": "Pixel 7", "enabled": true },
    { "name": "tablet-chrome", "device": "iPad (gen 7) landscape", "enabled": false }
  ],
  "budgetsPerDevice": {
    "desktop-chrome": {
      "home":     { "LCP": 1500, "CLS": 0.1, "INP": 100, "TBT": 200, "FCP": 1200 },
      "pdp":      { "LCP": 1500, "CLS": 0.1, "INP": 100, "TBT": 200, "FCP": 1200 },
      ...
    },
    "mobile-chrome": {
      "home":     { "LCP": 2500, "CLS": 0.1, "INP": 200, "TBT": 300, "FCP": 1800 },
      ...
    }
  },
  "throttling": {
    "mobile": { "cpuSlowdown": 4, "network": "slow-3g" },
    "desktop": { "cpuSlowdown": 1, "network": "none" }
  }
}
```

## Device emulation

Playwright supports device emulation natively:

```ts
import { devices } from '@playwright/test';

test.use({ ...devices['Pixel 7'] });
```

The fixture `multi-device.fixture.ts` picks the active device from env:

```ts
const activeDevice = process.env.PWTEST_DEVICE ?? 'desktop-chrome';
```

## CPU / network throttling

Phase 1 perf budget tests ran on localhost without throttling, so results
were unrealistically fast. Phase 2 adds:

```ts
await context.route('**/*', (route) => route.continue());
const client = await page.context().newCDPSession(page);
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  downloadThroughput: 1.5 * 1024 * 1024 / 8,
  uploadThroughput: 750 * 1024 / 8,
  latency: 150,
});
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
```

These CDP calls apply realistic mobile throttling.

## Playwright projects per device

Add projects in `playwright.config.ts`:

```ts
projects: [
  {
    name: 'desktop-chrome',
    use: { viewport: { width: 1920, height: 1080 } },
    testMatch: /.*\.perf\.spec\.ts/,
  },
  {
    name: 'mobile-chrome',
    use: { ...devices['Pixel 7'] },
    testMatch: /.*\.perf\.spec\.ts/,
  },
],
```

Run both:
```bash
npx playwright test --project=desktop-chrome --project=mobile-chrome
```

## Budget resolution

The fixture resolves the budget based on active device AND page type:

```ts
const device = process.env.PWTEST_DEVICE ?? 'desktop-chrome';
const pageType = resolvePageType(url);
const budget = config.mobileDesktopMatrix.budgetsPerDevice[device][pageType];
```

## Test template

```ts
import { test, expect } from '@playwright/test';
import { collectWebVitals, assertBudget } from '../support/perf-helpers';

test('home mobile perf @perf @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const vitals = await collectWebVitals(page);
  assertBudget(vitals, 'home', 'mobile-chrome');
});
```

## Tagging

- `@perf @desktop` — runs only with desktop project
- `@perf @mobile` — runs only with mobile project
- `@perf` — runs on all enabled devices

## Phase 3 candidates

- Per-device visual regression baselines
- Battery consumption metrics (where supported)
- More realistic device profiles (Galaxy S9, low-end Android)
- 4G vs 3G vs slow-3g comparison across same page
