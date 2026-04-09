# Visual regression guide

Load when `mode=visual-regression` or `visualRegression.enabled=true`.

## What it is

Playwright's native `toHaveScreenshot()` compares the current page/element
screenshot against a versioned baseline. On failure, it produces a diff image
that highlights the changed pixels.

Baselines live under `tests/e2e/__screenshots__/{test-file}/{platform}/...` or
in the your project multi-tenant layout:
`tests/e2e/__screenshots__/{brand}/{country}/{lang}/...`.

## When to use it

Visual regression is valuable for:
- critical landing pages (home, PDP, PLP, cart, checkout)
- design system components in isolation
- post-refactor sanity checks (HTML/CSS rewrite)
- pixel-perfect marketing pages

It is NOT valuable for:
- highly dynamic pages (live feeds, timers, counters)
- pages full of personalization
- content that changes every deploy (editorial, promos)

## Principle: mask aggressively

Before taking a baseline, identify every dynamic area and mask it. If you do
not mask, your baseline becomes stale after the first promo or counter tick.

Default masking selectors (from `.playwright-tester.json → visualRegression.maskingSelectors`):

- `.price`
- `.cart-count`
- `.countdown`
- `.cookie-banner`
- `[data-dynamic]`
- `.timer`
- `.live-badge`

Add project-specific selectors as needed:

```ts
await expect(page).toHaveScreenshot('home.png', {
  mask: [
    page.locator('.price'),
    page.locator('[data-dynamic]'),
    page.locator('.timer'),
    page.locator('.cookie-banner'),
  ],
  maxDiffPixelRatio: 0.01,
});
```

## Baseline creation workflow

1. Write the test with `toHaveScreenshot('name.png', {...})`
2. Run once locally without a baseline → Playwright saves the baseline
3. Review the generated baseline visually before committing
4. Commit the baseline under version control
5. Subsequent runs compare against the committed baseline

**Never** auto-accept baselines in CI. The `--update-snapshots` flag is:
- allowed in `local` runner mode only
- forbidden in `ci` runner mode (enforced by the skill)
- requires an explicit flag `update-snapshots=true` in the slash command
- requires manual PR review before merge

## Multi-tenant baselines

Different brands/countries/languages have different visual baselines. The test
fixture resolves the baseline path via the active matrix dimensions:

```ts
test('home hero', async ({ page, brand, country, lang }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot(`${brand}-${country}-${lang}-home.png`, {
    mask: [...defaultMasks(page)],
    maxDiffPixelRatio: 0.01,
  });
});
```

This creates N baselines for N combinations. Use the matrix strategy setting
(`multiTenant.matrixStrategy: critical-only`) to avoid combinatorial explosion.

## Threshold tuning

`maxDiffPixelRatio` is the fraction of pixels allowed to differ. Start tight
(0.01 = 1%) and loosen only if fonts or anti-aliasing cause noise.

Alternative: `threshold` (0..1) on per-pixel color comparison. Default 0.2 is
usually fine.

Avoid `toHaveScreenshot` without either setting; an exact match is too strict
for real-world rendering.

## Full page vs viewport vs element

- `toHaveScreenshot()` without arg: screenshots the viewport
- `{ fullPage: true }`: screenshots the entire scrollable page
- `locator.toHaveScreenshot()`: screenshots one element

For hero sections, prefer element screenshots. For layout regression, use
full page. For above-the-fold checks, use viewport.

## Browser and OS drift

Visual baselines are OS-specific: a baseline taken on macOS will not match
on Linux due to font rendering. Playwright includes the platform in the
baseline path automatically.

In CI, use a consistent OS (Ubuntu latest) for all baseline generation and
comparison. Do not mix local (Windows/macOS) and CI baselines.

Strategy for your project: generate baselines **only from CI** on a single OS.
Local developers do not commit baselines; they run in comparison mode only.

## Handling diffs in PR

On failure, Playwright generates three files under `test-results/`:
- `actual.png` — the current render
- `expected.png` — the committed baseline
- `diff.png` — the highlighted difference

The skill uploads all three as CI artifacts and links them in the PR comment.

When the diff is intentional (design change):
1. Run locally: `npx playwright test --update-snapshots=true tests/e2e/your-spec.ts`
2. Commit the new baseline with a clear commit message
3. PR reviewer must visually verify the new baseline before approving

When the diff is a bug:
1. Fix the application code to restore the intended visual
2. Re-run the test; baseline comparison should pass

## Anti-patterns

- Screenshotting the entire page without masking → flaky baselines
- Tight threshold (< 0.005) → false positives from font hinting
- Loose threshold (> 0.05) → real regressions hidden
- Baselines in git without PR review → visual drift over time
- Taking baselines in headed mode then comparing in headless → inconsistent
- Mixing OS for baseline generation → diffs that can't be reproduced

## Template

See `templates/tests/e2e/visual-regression.spec.ts.tmpl` for a ready-to-use
starter.

## Phase 2 candidates

- Cross-browser baselines (Firefox/WebKit)
- Visual regression dashboard with hosted diffs (Percy, Chromatic)
- Auto-retry with tolerance escalation
- Font loading stabilization helpers
- Animation freeze before screenshot (`animations: 'disabled'` is already in
  Playwright, but phase 2 adds smart detection)
