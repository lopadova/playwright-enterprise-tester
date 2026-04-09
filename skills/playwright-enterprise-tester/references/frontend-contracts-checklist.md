# Frontend contracts checklist

Always included in the final report. The skill detects gaps and recommends
remediation. No automated axe scan in phase 1 — this is manual/qualitative.

## What is a "frontend contract"?

A set of stable, test-friendly conventions the frontend exposes so automation
can target elements without coupling to implementation details. Good contracts
make tests survive refactors; missing contracts force tests to use brittle
CSS selectors that break on every build.

## The 8 categories

### 1. Accessible names on interactive controls

Every button, link, input must have an accessible name. `getByRole` relies on it.

| Bad | Good |
|---|---|
| `<button>🛒</button>` | `<button aria-label="Add to cart">🛒</button>` |
| `<a href="/x"><img src="..."/></a>` | `<a href="/x" aria-label="Prodotto ABC"><img alt="ABC"/></a>` |
| `<input type="text" id="q"/>` | `<label for="q">Cerca</label><input id="q"/>` |

Finding: "Interactive control X has no accessible name."
Fix: Add `aria-label`, `aria-labelledby`, or a visible `<label>`.

### 2. Form labels

Every input must be associated with a label via `<label for>` or
`aria-labelledby`. Playwright's `getByLabel` will not find unlabeled inputs.

Finding: "Input N in form F has no associated label."
Fix: Add `<label for="...">` or `aria-label`.

### 3. Stable test IDs where semantics aren't enough

When a control cannot be targeted semantically (generic icon, repeating
element, dynamic text), add `data-testid="stable-name"`.

Naming convention: `data-testid="{scope}-{element}-{variant}"`.

Examples:
- `data-testid="cart-count"`
- `data-testid="pdp-add-to-cart"`
- `data-testid="checkout-step-2-next"`

Finding: "Element N is targetable only by CSS nth-child or dynamic class."
Fix: Add `data-testid` with a stable name.

### 4. Loading completion signals

Async content must have a deterministic "done loading" signal. Options:
- a skeleton that disappears
- a spinner with `role="status"` that hides on complete
- a count increasing
- a specific element appearing

Finding: "AJAX result grid X has no visible loading signal."
Fix: Add a skeleton with `data-testid="loading-X"` that the test can wait on.

### 5. Success/error states deterministically assertable

After any async action (submit, add, delete), the result must be visible:
- `role="status"` for success messages
- `role="alert"` for errors
- a visible toast/snackbar with stable selector
- a page redirect to a clearly asserted URL

Finding: "Submit action X has no visible success state."
Fix: Add a toast/alert/redirect that the test can assert on.

### 6. Marketing copy stability

Tests should not depend on volatile marketing strings. If the test uses
`getByText('Aggiungi ora!')`, a marketing update to `'Acquista subito'` breaks it.

Finding: "Test X asserts on marketing copy likely to change."
Fix: Use `getByRole('button')` with a stable accessible name, OR add a
`data-testid` for the test.

### 7. CSS selector brittleness

Hashed CSS classes (`.sc-a1b2c3`), utility-first classes (`.bg-red-500 px-4`),
deeply nested descendant selectors are brittle and change on every rebuild.

Finding: "Test X uses CSS selector coupled to build-generated classes."
Fix: Replace with semantic locator or `data-testid`.

### 8. Inaccessible dialogs/modals/tabs

Custom dialogs without `role="dialog"`, tabs without `role="tablist"/"tab"/"tabpanel"`,
menus without `role="menu"` are invisible to `getByRole`.

Finding: "Custom dialog X lacks role=dialog and aria-labelledby."
Fix: Add ARIA roles per WAI-ARIA Authoring Practices.

## Report format

The skill appends a section to `claude-report.json → frontendContractFindings`:

```json
"frontendContractFindings": [
  {
    "severity": "high",
    "type": "missing-label",
    "location": "tests/e2e/account.spec.ts:42",
    "selectorUsed": "input[name='email']",
    "recommendation": "Add <label for='email-input'> to the email input in account/profile.blade.php"
  },
  {
    "severity": "medium",
    "type": "css-brittleness",
    "location": "tests/e2e/home.spec.ts:18",
    "selectorUsed": ".sc-hero-cta-primary",
    "recommendation": "Add data-testid='hero-cta' to the hero CTA button"
  }
]
```

Severity levels:
- **high**: test cannot be written safely without this fix
- **medium**: test works today but will break on next refactor
- **low**: minor improvement, not blocking

## Included in the final report (mandatory section)

```
## Frontend contract findings

### Already good
- PDP Add to cart button: role=button with aria-label ✓
- Cart count badge: data-testid="cart-count" ✓
- Login form inputs: properly labeled ✓

### Missing (3 high, 2 medium)
1. [HIGH] Home hero CTA — no accessible name, only an icon
   → Add aria-label="Scopri la collezione"
   → File: resources/views/frontend/default/home/hero.blade.php:24
2. [HIGH] Cookie banner accept — uses .cc-btn CSS class from vendor library
   → Add data-testid="cookie-accept-all"
   → File: resources/views/frontend/default/layouts/cookie-banner.blade.php:15
...

### Impact on test resilience
Without these fixes, the following tests are at risk of breaking on next
CSS refactor: tests/e2e/home.spec.ts, tests/e2e/smoke.spec.ts.

### Recommended remediation priority
1. Fix the HIGH items before the next release (block 3 tests)
2. Fix MEDIUM items within the sprint
3. LOW items can be addressed during routine maintenance
```

## Automation boundary

This checklist is intentionally **manual/qualitative** in phase 1. The skill
identifies gaps while authoring tests (it notices a locator it cannot resolve
semantically) and reports them.

Phase 2 candidate: integrate `@axe-core/playwright` to run an automated a11y
scan per page and include axe results in the findings.
