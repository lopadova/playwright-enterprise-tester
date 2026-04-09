# CODEOWNERS integration (P2.06)

Load when `codeownersIntegration.enabled=true`.

Maps test files and source files to owner teams via `.github/CODEOWNERS`,
so failure notifications can be routed to the right team.

## Why

Phase 1 produces a generic failure report. On a large team, everyone gets
paged for every failure. Phase 2 routes notifications per owner team using
the existing `.github/CODEOWNERS` file as the source of truth.

## Config

```json
"codeownersIntegration": {
  "enabled": false,
  "codeownersFile": ".github/CODEOWNERS",
  "ownerToNotificationChannel": {
    "@myorg/frontend-team": "#frontend-alerts",
    "@myorg/cart-team": "#cart-alerts",
    "@myorg/checkout-team": "#checkout-alerts",
    "@myorg/platform-team": "#platform-alerts"
  },
  "fallbackOwner": "@myorg/platform-team",
  "includeOwnerInReport": true,
  "notifyOnFailureOnly": true
}
```

## How it works

1. `scripts/codeowners-resolve.mjs` reads `.github/CODEOWNERS` and builds
   a path-to-owners index
2. For each failure in `claude-report.json`, resolves the owner of the
   test file AND of the source files touched in the diff
3. Deduplicates owners (unique team set per failure)
4. Enriches `claude-report.json → failures[].owners` with the list
5. When `slackTeamsNotifications` is also enabled, routes the message to
   the team's channel

## CODEOWNERS file example

```
# .github/CODEOWNERS
/tests/e2e/cart.spec.ts           @myorg/cart-team
/tests/e2e/checkout.spec.ts       @myorg/checkout-team
/tests/e2e/home.spec.ts           @myorg/frontend-team
/app/Domain/Cart/                 @myorg/cart-team @myorg/platform-team
/app/Domain/Checkout/             @myorg/checkout-team @myorg/platform-team
/resources/frontend/              @myorg/frontend-team
*                                 @myorg/platform-team
```

The last matching pattern wins (GitHub convention). The resolver follows
the same rules.

## Report enrichment

After enrichment, `claude-report.json → failures` looks like:

```json
{
  "failures": [
    {
      "testId": "tests/e2e/cart.spec.ts::add to cart",
      "file": "tests/e2e/cart.spec.ts",
      "classification": "app_bug",
      "owners": ["@myorg/cart-team"],
      "notificationChannels": ["#cart-alerts"],
      ...
    }
  ]
}
```

## Notification routing

When combined with `slackTeamsNotifications` (P2.11), each failure is
sent to the owner's channel instead of a generic alert channel.

Example flow:
```
Failure in cart.spec.ts → owner: @myorg/cart-team → channel: #cart-alerts
Failure in checkout.spec.ts → owner: @myorg/checkout-team → channel: #checkout-alerts
```

The same Slack message format but targeted.

## GitHub issue assignment

When combined with `githubIssueBot` (P2.03), the owner team is assigned
to the auto-created issue:

```json
{
  "assignees": ["@myorg/cart-team"],
  "labels": ["e2e-failure", "cart"]
}
```

GitHub will notify the team automatically via their notification settings.

## Fallback owner

If no CODEOWNERS rule matches a file, the `fallbackOwner` is used.
Typically this is the platform or infra team who owns everything
un-owned.

## Limitations

- CODEOWNERS syntax has edge cases (escaping, negation); the resolver
  supports the common syntax, not exotic features
- Multiple owners per pattern are supported; all get notified
- Team membership is not expanded; the channel mapping is the source
  of truth for "who to notify"

## Phase 3 candidates

- GraphQL query to GitHub to expand team members for direct Slack DMs
- Ownership-based test quarantine (only owner can quarantine their tests)
- Per-owner dashboards showing their test health
- SLA tracking per team (time to fix after failure)
