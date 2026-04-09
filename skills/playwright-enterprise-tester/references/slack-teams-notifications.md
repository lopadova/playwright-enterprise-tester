# Slack / Teams notifications (P2.11)

Load when `slackTeamsNotifications.enabled=true`.

Sends notifications to Slack, Teams, or a generic webhook when tests fail
in CI. Routes per owner team when combined with CODEOWNERS integration (P2.06).

## Config

```json
"slackTeamsNotifications": {
  "enabled": false,
  "provider": "slack",
  "availableProviders": ["slack", "teams", "generic-webhook"],
  "webhookUrl": null,
  "webhookUrlEnvKey": "PWTEST_NOTIFY_WEBHOOK_URL",
  "triggerOn": ["failure", "flaky-spike", "perf-budget-violation"],
  "mentionOnFailure": [],
  "includeArtifactLinks": true,
  "includeClassification": true,
  "minRunnerMode": "ci",
  "retryOnSendFailure": 2,
  "dryRun": false
}
```

## Providers

### Slack

Uses Slack incoming webhooks (create one at https://api.slack.com/apps).

Message format: Slack Block Kit with color-coded attachment:
- red for `failure`
- yellow for `flaky-spike`
- orange for `perf-budget-violation`

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "E2E test failure" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Test:*\n`{testId}`" },
        { "type": "mrkdwn", "text": "*Classification:*\n{classification}" },
        { "type": "mrkdwn", "text": "*Branch:*\n{branch}" },
        { "type": "mrkdwn", "text": "*Commit:*\n{commit}" }
      ]
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": {...}, "url": "{runUrl}" },
        { "type": "button", "text": {...}, "url": "{htmlReportUrl}" }
      ]
    }
  ]
}
```

### Teams

Uses Teams incoming webhook (via Microsoft 365 connector).

Message format: AdaptiveCard with the same fields.

### Generic webhook

Sends a plain JSON POST with the event payload:

```json
{
  "schemaVersion": 1,
  "event": "failure",
  "ts": "2026-04-09T10:00:00Z",
  "repo": "myorg/myrepo",
  "runId": "...",
  "branch": "master",
  "commit": "9e2809c",
  "testId": "...",
  "classification": "app_bug",
  "artifactUrls": {
    "trace": "...",
    "screenshot": "...",
    "htmlReport": "..."
  }
}
```

Useful for custom integrations, ops dashboards, pager systems.

## Trigger events

- **`failure`** — any classified failure in the run
- **`flaky-spike`** — flaky rate jumped above historical baseline
- **`perf-budget-violation`** — perf budget violated in critical modes

Configure which events to trigger via `triggerOn`.

## Mention routing

Global mentions (ping specific users/channels):
```json
"mentionOnFailure": ["@oncall", "@platform-team"]
```

Per-owner mentions (via CODEOWNERS integration):
```json
// codeownersIntegration.ownerToNotificationChannel already handled
// slackTeamsNotifications routes to the per-owner channel automatically
```

## Rate limiting

The script deduplicates notifications within a run to avoid spam:
- If 10 tests in the same file fail, send 1 message with all 10
- Group by owner team when CODEOWNERS is active

## Retry

On webhook send failure, retry up to `retryOnSendFailure` times with
exponential backoff. If all retries fail, log the error and continue.
Never block the build on notification failures.

## Dry run

```bash
node scripts/slack-teams-notify.mjs --dry-run --report=test-results/claude-report.json
```

Prints the messages that would be sent without actually sending.

## CI invocation

```yaml
- name: Notify team on failure
  if: failure() && github.ref == 'refs/heads/master'
  env:
    PWTEST_NOTIFY_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  run: |
    node .claude/skills/playwright-enterprise-tester/scripts/slack-teams-notify.mjs \
      --report=test-results/claude-report.json \
      --run-url="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
```

## Phase 3 candidates

- Interactive Slack buttons (acknowledge, reassign, open issue)
- Daily digest instead of per-failure spam
- Threaded replies for recurring failures
- Slack workflow triggers for auto-escalation
