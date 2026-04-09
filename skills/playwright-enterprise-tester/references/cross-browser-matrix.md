# Cross-browser matrix (P2.16)

Load when `crossBrowser.enabled=true` or `mode=cross-browser`.

Cross-browser testing beyond chromium. Phase 2 ships with
**chromium + webkit** (Safari/iOS coverage), Firefox disabled by default
per user choice.

## Why webkit (not firefox)

User decision: e-commerce traffic is dominated by Chrome (~65%) and
Safari (~25% via iOS). Firefox is ~3%, not worth the extra CI time.

WebKit in Playwright simulates Safari's rendering engine. It's not
bit-identical to Safari on macOS/iOS (different system fonts, minor
CSS quirks), but catches most webkit-specific bugs.

## Config

```json
"crossBrowser": {
  "enabled": false,
  "browsers": [
    { "name": "chromium", "enabled": true, "project": "chromium" },
    { "name": "webkit", "enabled": true, "project": "webkit" },
    { "name": "firefox", "enabled": false, "project": "firefox" }
  ],
  "runInModes": {
    "smoke": ["chromium"],
    "critical-path": ["chromium", "webkit"],
    "release-gate": ["chromium", "webkit"],
    "nightly": ["chromium", "webkit"]
  },
  "webkitSpecificNotes": {
    "baselineForVisualRegression": "separate per browser",
    "thirdPartyCompatibility": "Some analytics scripts may fail in webkit ITP mode"
  }
}
```

## Installation

```bash
npx playwright install webkit
```

This downloads the webkit browser bundle (~300MB).

## Playwright config

```ts
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  // firefox disabled
  // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
]
```

## Running cross-browser

```bash
# All enabled browsers
npx playwright test --project=chromium --project=webkit

# Or shorthand
npx playwright test
```

Playwright will run tests across all configured projects.

## Per-mode execution

From config `runInModes`:

- `smoke` → chromium only (fast PR feedback)
- `critical-path` → chromium + webkit
- `release-gate` → chromium + webkit (nightly)
- `nightly` → chromium + webkit

The skill honors this mapping when invoking Playwright.

## Visual regression baselines

Cross-browser visual regression requires **separate baselines per browser**:

```
tests/e2e/__screenshots__/
├── chromium/
│   └── home-hero.png
├── webkit/
│   └── home-hero.png
```

Playwright automatically suffixes snapshot names with the project name.
No action needed beyond enabling cross-browser mode.

## Webkit-specific gotchas

### ITP (Intelligent Tracking Prevention)

Safari blocks third-party cookies and some analytics scripts. In webkit
project, these may fail silently. Use `silentFailures.allowlist` to
tolerate expected failures:

```json
"silentFailures.allowlist": [
  { "type": "requestfailed", "urlRegex": "googletagmanager.com" },
  { "type": "requestfailed", "urlRegex": "segment.io" }
]
```

### Form autofill

Safari has more aggressive form autofill. Tests that type into fields
should clear first:

```ts
await page.getByLabel(/email/i).clear();
await page.getByLabel(/email/i).fill('user@test.example');
```

### Date picker

Safari's native date picker differs from Chrome's. Avoid testing native
date UI; use explicit `fill('2026-04-09')` on `<input type="date">`.

### Font rendering

Fonts render slightly differently. Visual regression baselines will need
separate baselines per browser (handled automatically).

### Service workers

Safari ITP limits service worker lifetime. Tests that rely on SW state
persistence may fail.

## CI matrix

```yaml
strategy:
  matrix:
    project: [chromium, webkit]
    shard: [1, 2, 3, 4]
steps:
  - run: npx playwright test --project=${{ matrix.project }} --shard=${{ matrix.shard }}/4
```

8 parallel jobs (2 browsers × 4 shards).

## Fallback to chromium only

If webkit has compatibility issues that block the release, disable it
temporarily:

```json
"browsers": [
  { "name": "chromium", "enabled": true },
  { "name": "webkit", "enabled": false },
  { "name": "firefox", "enabled": false }
]
```

Tests still run, but only on chromium.

## Phase 3 candidates

- Firefox enabled (if traffic share justifies it)
- Real iOS device testing via BrowserStack/Sauce Labs integration
- Safari on macOS (vs webkit-in-Linux)
- Edge/IE legacy testing (unlikely for modern your project)
