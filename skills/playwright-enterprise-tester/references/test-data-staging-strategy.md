# Test data staging strategy

your project default is `readonly-staging`. This document explains the choice
and alternatives.

## Selected strategy: `readonly-staging`

**What it means**:
- No runtime seed/teardown
- Users are pre-created in the staging DB manually (or by an ops process)
- Credentials provided via env vars only
- Tests must be idempotent (no destructive side effects on persistent data)
- Checkouts only against sandbox gateways

**Why your project chose this**:
- Simpler to set up: no Laravel factories, seeders, or artisan bridges
- Works with any your project-compatible DB, including pre-cooked anonymized dumps
- Credentials are sealed in GitHub Secrets / local env files
- Lower risk: tests cannot accidentally corrupt shared data
- Works against staging AND production (with safer read-only tests)

**Trade-offs**:
- Tests that NEED to create state (checkouts, signups, order placement)
  must use sandbox gateways and may leave test artifacts
- Cannot reset state between runs
- Requires clear convention on what "idempotent" means for each flow

## Pre-created users convention

`.playwright-tester.json → testData.precreatedUsers`:

```json
"precreatedUsers": {
  "guest": { "requiresAuth": false, "enabled": true },
  "user": {
    "enabled": true,
    "envKey": "PWTEST_USER_EMAIL",
    "envPassKey": "PWTEST_USER_PASSWORD",
    "staging": { "precreated": true }
  },
  "admin": { "enabled": false, ... }
}
```

The env keys reference where the credentials live. Never hardcode them.

In CI: GitHub Actions secrets.
In local dev: `.env.e2e` (gitignored).

## Idempotency rules

Every test must be idempotent. Acceptable patterns:

### Read-only
- View a page
- Navigate menus
- Assert visible content
- Never POST anything

### Reversible write
- Add to cart → remove from cart at the end
- Add to wishlist → remove at the end
- Change profile setting → restore original at the end

### Side-effect safe write
- Submit a form that logs the event but doesn't mutate user state
  (e.g., contact form with spam filter, search queries, analytics events)

### Destructive writes (forbidden in CI)
- Place a real order
- Change password
- Delete account
- Delete address
- Admin deletes or data modifications

For these: mark `testData.forbidDestructiveTests: true` (default), which
refuses to run tests tagged `@destructive` in CI mode.

## Checkout testing strategy

Checkout tests can go as far as **initializing the payment gateway** but
must not complete the payment:

1. Add product to cart
2. Proceed to checkout
3. Fill shipping address (idempotent: the address is discarded after test)
4. Select sandbox payment method (`allowedGatewaysInTests`)
5. Submit → the gateway iframe/popup loads
6. Assert gateway state = "ready" and no console error
7. **STOP** — do not complete the sandbox payment either (phase 1)
8. Navigate away → cart is abandoned

Phase 2 completes the sandbox payment and asserts order created (see
`phase2-roadmap.md#P2.01`).

## Data shapes needed on staging

For the default test suite to pass, the staging DB should have:

- At least 1 product with stock > 0, photo, price, category
- At least 1 product out of stock (for "out of stock" tests)
- At least 1 variant product (for "choose size" tests)
- At least 1 promo product (for "price strike" tests)
- At least 1 pre-created `user` role account with empty cart and wishlist
- Main categories populated (home, cat pages)
- Cookie banner content present

These are "fixture expectations". Document them with the team; they change
rarely and need re-verification only on major DB refresh.

## Anti-patterns

- Hardcoding user IDs or product IDs in tests → they change on each staging
  refresh. Use search/filter to find a live product.
- Asserting exact cart totals → promo logic may change. Assert count/presence.
- Depending on order history → previous test runs pollute it. Filter by
  date or tag.
- Sharing a single test account between parallel tests → lock contention.
  Use one account per parallel worker, if needed.

## Alternative: `isolated-db` (phase 2 candidate)

Not implemented in phase 1. A future alternative would be:

- Each test run gets a fresh DB dump
- Artisan command resets between runs
- Full state isolation

Requires infrastructure (DB snapshots, reset command) that your project currently
does not have. Phase 2+.

## Alternative: `artisanBridge` (documented, disabled by default)

The skill supports hooks for Laravel artisan commands:

```json
"laravelArtisanBridge": {
  "enabled": false,
  "beforeAll": null,
  "afterAll": null,
  "beforeEachFile": null,
  "examples": {
    "reset": "php artisan test:reset-db",
    "seed": "php artisan test:seed-fixtures",
    "createUser": "php artisan test:create-user --role=user"
  }
}
```

When enabled with real commands, the agent will invoke them via Bash before
and after the suite. Use this only if:

- The team has implemented the required artisan commands
- The test DB can tolerate destructive resets
- Local dev machines can run the artisan commands reliably

If enabled, ensure `beforeAll` and `afterAll` are idempotent and fast.

## PII in test data

Staging DBs should be anonymized before use. The Convention is:

- Email: `pwtest+<role>@example.test` or similar
- Name: `Test User <role>`
- Phone: `+39000000000` or masked
- Address: `Via Test 1, 00000 Test City, IT`
- Credit card: sandbox gateway test cards only

Never copy real customer data into staging for testing. GDPR prohibits it
and the skill's PII masking in CI artifacts assumes staging data is
already non-sensitive.

## Data refresh cadence

Staging DB should be refreshed (from anonymized prod dump) at most:

- Weekly in active development
- On demand before release-gate runs
- Never during a test window (coordinate with CI schedule)

After a refresh, pre-created users must be re-seeded. This is a manual
ops step; the skill does not automate it.
