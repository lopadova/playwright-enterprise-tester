# Axe a11y integration (P2.12)

Load when `axeA11y.enabled=true` or `mode=a11y-scan`.

Automated accessibility scanning via `@axe-core/playwright`. Complements
the manual frontend contract report from phase 1.

## Why recovered in phase 2

Phase 1 intentionally excluded automated a11y scanning (user decision).
Phase 2 recovers it because:
- EU Accessibility Act enforcement increases pressure on e-commerce
- Axe is the industry standard and reliable
- Critical/serious violations are non-negotiable

## Config

```json
"axeA11y": {
  "enabled": false,
  "axePackage": "@axe-core/playwright",
  "wcagTags": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  "failOnSeverity": ["critical", "serious"],
  "warnOnSeverity": ["moderate", "minor"],
  "includePagesInModes": ["a11y-scan", "release-gate"],
  "excludeSelectors": [
    ".cookie-banner",
    "[data-a11y-exempt]"
  ],
  "rules": { "disable": [], "enable": [] },
  "outputPath": "test-results/axe-violations.json",
  "attachReportToHtmlReport": true
}
```

## Installation

```bash
npm install -D @axe-core/playwright
```

## Fixture

The skill provides a fixture at `tests/support/axe-fixture.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ makeAxeBuilder: () => AxeBuilder }>({
  makeAxeBuilder: async ({ page }, use) => {
    const builder = () => new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('.cookie-banner')
      .exclude('[data-a11y-exempt]');
    await use(builder);
  },
});

export { expect };
```

## Scan test

```ts
import { test, expect } from '../support/axe-fixture';

test('home a11y scan @a11y', async ({ page, makeAxeBuilder }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const results = await makeAxeBuilder().analyze();

  const critical = results.violations.filter(v =>
    ['critical', 'serious'].includes(v.impact ?? '')
  );

  if (critical.length > 0) {
    console.log(JSON.stringify(critical, null, 2));
  }

  expect(critical).toEqual([]);
});
```

## Severity levels

Axe defines 4 impact levels:

| Level | Examples | Default action |
|---|---|---|
| critical | Missing `<html lang>`, button with no name | **FAIL** |
| serious | Missing alt text on informative image, insufficient color contrast | **FAIL** |
| moderate | Heading order skipped, duplicate IDs | WARN |
| minor | Empty heading, landmark not unique | WARN |

Configurable via `failOnSeverity` and `warnOnSeverity` in the config.

## Excluding sections

Some elements are out of the team's control (vendor cookie banner, embedded
third-party widgets). Exclude them via:

```ts
new AxeBuilder({ page }).exclude('.cookie-banner').exclude('iframe[src*="vendor"]')
```

Or globally via `axeA11y.excludeSelectors` in the config.

**Never exclude real app components** to silence violations. Fix the
violation instead.

## Disabling specific rules

Some rules have known false positives in certain layouts. Disable them
per project:

```json
"rules": {
  "disable": ["color-contrast-enhanced"],
  "enable": []
}
```

Document every disabled rule with a comment explaining why.

## Integration with frontend contracts

Phase 1 produces a manual frontend contract report. Phase 2 axe output is
merged into the same section:

```json
"frontendContractFindings": [
  ...
],
"axeViolations": [
  {
    "rule": "button-name",
    "impact": "critical",
    "nodes": [
      { "html": "<button>...</button>", "target": [".hero-cta"] }
    ]
  }
]
```

Both sections appear in the final report.

## Modes

- **`mode=a11y-scan`** — dedicated mode, runs a11y scan on all pages
  tagged `@a11y`
- **`mode=release-gate`** — includes a11y scan if `axeA11y.enabled=true`
- Other modes: not run by default, enable via tag

## Tagging

```ts
test('home a11y @a11y @critical', async ({ page, makeAxeBuilder }) => { ... });
```

## Output schema

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-09T10:00:00Z",
  "pagesScanned": 12,
  "violations": [
    {
      "rule": "button-name",
      "impact": "critical",
      "description": "Ensures buttons have discernible text",
      "helpUrl": "https://dequeuniversity.com/rules/axe/...",
      "nodes": [
        {
          "html": "<button class=\"icon-cart\">...</button>",
          "target": [".icon-cart"],
          "pageUrl": "/"
        }
      ]
    }
  ],
  "summary": {
    "critical": 0,
    "serious": 2,
    "moderate": 5,
    "minor": 3
  }
}
```

## Phase 3 candidates

- axe-core with custom rules per project
- Visual indicators in HTML report (highlight violating elements)
- Trend tracking via flakiness JSONL
- Integration with Pa11y for additional coverage
- VPAT / ACR report generation
