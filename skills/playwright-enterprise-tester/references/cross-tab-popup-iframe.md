# Cross-tab / popup / iframe handling (P2.01)

Load when `crossTabPopup.enabled=true` or the test involves payment gateways,
OAuth, 3DS, or any flow that opens a new tab, popup, or iframe.

## Why this matters

Phase 1 stopped at "gateway initialized, no console error, end test" for
checkout flows. Phase 2 extends this with:

- Full handling of `BrowserContext.waitForEvent('page')` for new tabs/popups
- Frame switching for embedded 3DS / payment iframes (Stripe, PayPal, Braintree)
- OAuth popup flows (Google login, Facebook login)
- Satispay, Scalapay, Amazon Pay redirect flows

All of it is **opt-in** via `.playwright-tester.json → crossTabPopup.enabled`.

## Config reference

```json
"crossTabPopup": {
  "enabled": false,
  "waitForNewPageTimeoutMs": 15000,
  "iframeHandling": {
    "enabled": true,
    "waitForFrameLoadMs": 3000,
    "knownGatewayFrames": [
      { "name": "stripe-3ds", "urlRegex": "js\\.stripe\\.com|hooks\\.stripe\\.com" },
      { "name": "paypal-checkout", "urlRegex": "paypal\\.com" },
      ...
    ]
  },
  "popupHandling": {
    "enabled": true,
    "autoClosePopupsAfterInit": false,
    "captureConsoleFromPopup": true,
    "popupReadySelector": "[data-gateway-state='ready']"
  },
  "oauthFlows": { "enabled": false, "providers": [] },
  "checkoutCheckpointMode": {
    "stopAtGatewayInit": false,
    "stopAtIframeLoaded": false,
    "completeSandboxPayment": false
  }
}
```

## Pattern 1: new popup (payment gateway)

```ts
import { test, expect } from '@playwright/test';

test('checkout opens payment popup @critical @p2', async ({ page, context }) => {
  await page.goto('/checkout');
  await page.getByRole('button', { name: /paga con paypal/i }).click();

  // Wait for the new popup page
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 15000 }),
    page.getByRole('button', { name: /conferma/i }).click(),
  ]);

  await popup.waitForLoadState('domcontentloaded');
  expect(popup.url()).toMatch(/paypal\.com|paypalobjects\.com/);

  // Capture console errors from popup too (silent failure detection)
  const popupErrors: string[] = [];
  popup.on('pageerror', (err) => popupErrors.push(err.message));

  // Wait for the PayPal login form to be visible
  await expect(popup.getByRole('button', { name: /accedi|log in/i })).toBeVisible({ timeout: 10000 });

  expect(popupErrors).toEqual([]);
});
```

## Pattern 2: 3DS iframe (Stripe)

```ts
test('3DS iframe loads without errors @critical @p2', async ({ page }) => {
  await page.goto('/checkout');
  await fillPaymentForm(page, { card: '4000000000003220' }); // 3DS required test card
  await page.getByRole('button', { name: /paga/i }).click();

  // Stripe.js injects an iframe for 3DS
  const stripeFrame = page.frameLocator("iframe[name^='__privateStripeFrame']").first();
  await expect(stripeFrame.locator('body')).toBeVisible({ timeout: 15000 });

  // The 3DS challenge iframe is nested
  const challengeFrame = page.frameLocator("iframe[name='stripe-challenge-frame']");
  // Wait for it to be attached (the 3DS modal is open)
  await expect(challengeFrame.locator('body')).toBeVisible({ timeout: 15000 }).catch(() => {
    // If the test card doesn't require challenge, skip
  });

  // At this point, phase 2 STOPS unless completeSandboxPayment is enabled
  // Do not interact with real 3DS flow (would require OTP, etc.)
});
```

## Pattern 3: OAuth popup (Google login)

```ts
test('google oauth popup opens @auth @p2', async ({ page, context }) => {
  await page.goto('/account/login');

  const [oauthPopup] = await Promise.all([
    context.waitForEvent('page', { timeout: 10000 }),
    page.getByRole('button', { name: /log in with google/i }).click(),
  ]);

  await oauthPopup.waitForLoadState('domcontentloaded');
  expect(oauthPopup.url()).toContain('accounts.google.com');

  // Phase 1 STOPPED here. Phase 2 can optionally complete the flow if configured.
  // Completing real Google auth requires dedicated test accounts with MFA disabled.
  // Most teams just verify the popup opens.
});
```

## Pattern 4: iframe checkpoint mode

When `checkoutCheckpointMode.stopAtIframeLoaded=true`, the fixture
auto-checks that the gateway iframe is loaded and errors-free, then stops.

```ts
import { test, expect } from '../support/popup-3ds.fixture';

test('checkout stops at iframe loaded @p2 @checkpoint', async ({ page, gatewayCheckpoint }) => {
  await page.goto('/checkout');
  await fillBaseForm(page);
  await page.getByRole('button', { name: /paga/i }).click();

  // Fixture waits for any known gateway iframe (configured in config)
  const frame = await gatewayCheckpoint.waitForGatewayFrame();
  expect(frame.name).toMatch(/stripe|paypal|braintree/);
  expect(gatewayCheckpoint.popupErrors).toEqual([]);
});
```

The fixture loops through `crossTabPopup.iframeHandling.knownGatewayFrames`
and returns the first one that loads within `waitForFrameLoadMs`.

## Pattern 5: sandbox payment completion (opt-in, rare)

```json
"checkoutCheckpointMode": {
  "completeSandboxPayment": true
}
```

When enabled, the fixture attempts to complete a sandbox payment. This
requires:
- Sandbox gateway test cards
- Known iframe structure per gateway
- Dedicated helper per gateway (`fillStripeSandbox`, `fillPaypalSandbox`, etc.)

Helpers live in `tests/support/sandbox-gateways/`. Only ship helpers for
gateways actively tested.

Phase 2 ships a skeleton helper for Stripe sandbox in
`templates/tests/support/sandbox-gateways/stripe.ts.tmpl`.

## Gotchas

### Popups and headless mode

Some gateways detect headless mode and refuse to show the popup. Workarounds:
- Use `chromium` with `headless: false` in a dedicated visible project
- Use a `userAgent` override to look like a real Chrome
- Stub the detection script with `page.addInitScript(...)` to override
  `navigator.webdriver`

### Iframe sandbox attributes

Some iframes have `sandbox="allow-scripts"` without `allow-same-origin`.
Playwright can interact with these, but you cannot access the window object
from the outer page. Use `frameLocator(...)` exclusively.

### Cross-origin iframe console capture

Console messages from cross-origin iframes are NOT captured by
`page.on('console')`. To capture them, use the frame's own context:

```ts
const frame = page.frameLocator('iframe[name=stripe]');
const frameHandle = await frame.owner();
const framePage = (await frameHandle?.contentFrame())?.page();
framePage?.on('console', (msg) => { ... });
```

### Popup window close timing

Gateways sometimes close their own popups after success. Use
`popup.on('close', ...)` to detect and handle gracefully:

```ts
popup.on('close', () => {
  console.log('Payment popup closed by gateway');
});
```

## Silent failure capture extension

When `popupHandling.captureConsoleFromPopup=true`, the fixture attaches
the same silent failure capture logic to every new popup. Errors from
popups are merged into the main test's silent errors report.

## Phase 3 candidates

- Automated 3DS challenge completion with test OTPs
- Google/Facebook OAuth full flow with dedicated test accounts
- WebAuthn / passkey test flows
- Apple Pay / Google Pay sandbox integration
