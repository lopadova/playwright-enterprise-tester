# Offline / air-gapped environment (P2.07)

Load when `offlineAirGapped.enabled=true` or when the environment cannot
download Playwright browsers from the CDN.

## Why

Some enterprise environments (security-restricted networks, air-gapped
runners, on-prem CI) cannot reach the Playwright CDN. Phase 2 adds
documented patterns and scripts to:

- Pin Playwright and browser versions
- Use a local mirror for browser downloads
- Detect offline mode and fail fast with clear error

## Config

```json
"offlineAirGapped": {
  "enabled": false,
  "mirrorBaseUrl": null,
  "pinnedPlaywrightVersion": "1.48.0",
  "pinnedChromiumRevision": null,
  "localBrowserCachePath": "~/.cache/ms-playwright",
  "skipDownloadIfCached": true,
  "offlineModeEnvKey": "PWTEST_OFFLINE"
}
```

## Pinning Playwright

Lock the version in `package.json`:

```json
{
  "devDependencies": {
    "@playwright/test": "1.48.0"
  }
}
```

Do NOT use `^` or `~`; exact version only.

## Pinning browsers

Playwright ships browser revisions tied to the Playwright version. To
pin the chromium revision:

1. Run `npx playwright install --dry-run chromium` to see the revision
2. Record it in `.playwright-tester.json → offlineAirGapped.pinnedChromiumRevision`
3. Commit the revision in the config

Verification script checks the installed revision matches on every run:

```bash
node scripts/verify-playwright-pin.mjs
```

## Local mirror setup

For air-gapped environments, host a mirror of the Playwright browser
tarballs on an internal server:

1. Download the browser tarballs from the public CDN
   (`https://playwright.azureedge.net/builds/chromium/...`)
2. Upload them to your internal mirror
3. Set `PLAYWRIGHT_DOWNLOAD_HOST` env var to point to your mirror:

```bash
export PLAYWRIGHT_DOWNLOAD_HOST=https://mirror.internal.example.com/playwright
npx playwright install chromium
```

The skill config `mirrorBaseUrl` is a documentation hint; the actual
download uses the env var.

## Browser cache detection

When `skipDownloadIfCached=true`, the install script checks the local
cache and skips download if the browser is already present:

```bash
if [ -d "$HOME/.cache/ms-playwright/chromium-*" ]; then
  echo "Chromium already cached, skipping download"
else
  npx playwright install chromium
fi
```

## Air-gapped CI workflow

```yaml
- name: Check browser cache
  id: cache-check
  run: |
    if [ -d "$HOME/.cache/ms-playwright/chromium-1091" ]; then
      echo "cached=true" >> $GITHUB_OUTPUT
    fi

- name: Install from internal mirror
  if: steps.cache-check.outputs.cached != 'true'
  env:
    PLAYWRIGHT_DOWNLOAD_HOST: https://mirror.internal.example.com/playwright
  run: npx playwright install chromium

- name: Run tests
  env:
    PWTEST_OFFLINE: 'true'
  run: npx playwright test
```

## Offline mode detection

When `PWTEST_OFFLINE=true`, the skill:
- Refuses to install new browsers
- Refuses to download web-vitals or axe-core from CDN (must be bundled)
- Refuses to call external webhooks unless explicitly whitelisted
- Warns if any feature requires network access that's not mirrored

## CDN dependencies to bundle locally

Phase 2 features that currently load from CDN:
- `web-vitals` (perf budgets) → bundle as local npm dep
- `@axe-core/playwright` (a11y scan) → already local npm dep
- Any fonts or assets → check templates for CDN URLs

To bundle locally:

```bash
npm install --save-dev web-vitals @axe-core/playwright
```

Then update fixtures to import from node_modules instead of CDN.

## Installing Playwright without CDN

For fully air-gapped setups where even npm is not reachable:

1. On a connected machine, run:
   ```bash
   npm pack @playwright/test@1.48.0
   npx playwright install chromium
   tar czf playwright-cache.tgz ~/.cache/ms-playwright/
   ```
2. Transfer both tarballs to the air-gapped machine
3. Extract the cache to `~/.cache/ms-playwright/`
4. Install the npm package:
   ```bash
   npm install playwright-test-1.48.0.tgz
   ```

## Phase 3 candidates

- Docker image with pre-installed Playwright + browsers for air-gapped runners
- Automated mirror sync script
- Playwright version audit (flag outdated version in PR comments)
- Support for corporate proxies with authentication
