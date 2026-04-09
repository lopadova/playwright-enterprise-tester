# GitHub issue bot (P2.03)

Load when `githubIssueBot.enabled=true`.

Auto-creates GitHub issues for classified `app_bug` failures in CI with
trace, screenshot, reproduction steps, and classification evidence.

## Why

Phase 1 stopped at "classify and stop" for `app_bug` failures. The team
had to manually create issues from the CI logs. Phase 2 closes the loop:
CI failure → classified `app_bug` → issue created automatically → team
notified via GitHub mentions.

## Config

```json
"githubIssueBot": {
  "enabled": false,
  "triggerClassifications": ["app_bug"],
  "minRunnerMode": "ci",
  "repository": null,
  "authTokenEnvKey": "GITHUB_TOKEN",
  "labels": ["e2e-failure", "auto-reported", "playwright"],
  "assignees": [],
  "titleTemplate": "[E2E {runner}] {classification}: {testTitle}",
  "deduplicateWithinHours": 24,
  "dryRun": false,
  "attachArtifactUrls": true
}
```

| Key | Meaning |
|---|---|
| `triggerClassifications` | Which failure types trigger issue creation |
| `minRunnerMode` | `ci` only by default (no issues from dev PCs) |
| `repository` | `owner/repo`; null = use `GITHUB_REPOSITORY` env |
| `authTokenEnvKey` | Env key holding a GitHub token with `issues:write` scope |
| `labels` | Labels applied to new issues |
| `assignees` | GitHub usernames (optional) |
| `titleTemplate` | Placeholders: `{runner}`, `{classification}`, `{testTitle}`, `{file}`, `{commit}` |
| `deduplicateWithinHours` | Avoid spamming: don't create a new issue if a matching one exists |
| `dryRun` | Print the issue that would be created, don't actually create |
| `attachArtifactUrls` | Include links to trace/screenshot CI artifacts |

## How it works

1. After a CI run, `parse-playwright-json.mjs` produces `claude-report.json`
2. `scripts/github-issue-bot.mjs` reads the report
3. For each failure with classification matching `triggerClassifications`,
   it checks for an existing open issue with the same title (deduplication)
4. If none exists, creates a new issue via `gh api` CLI OR direct REST call
5. Attaches artifact URLs from the GitHub Actions run
6. Logs the created issue numbers in `test-results/github-issues-created.json`

## Issue body template

```markdown
## Test failure: {testTitle}

- **File**: `{file}:{line}`
- **Classification**: {classification}
- **Applied playbook**: {appliedPlaybook}
- **Suggested fix**: {suggestedFix}
- **Run**: [GitHub Actions run {runId}]({runUrl})
- **Commit**: {commitSha}
- **Branch**: `{branch}`
- **Runner mode**: {runner}

### Error message

```
{error}
```

### Artifacts

- [Trace archive]({traceUrl})
- [Screenshot]({screenshotUrl})
- [Video]({videoUrl})
- [HTML report]({htmlReportUrl})

### Reproduction

```bash
PWTEST_BASE_URL={baseUrl} npx playwright test {file} --project=chromium
```

### Classification evidence

See `test-results/claude-report.json` for the full classification
details and playbook trace.

---
*Auto-reported by playwright-enterprise-tester bot*
```

## Deduplication strategy

Before creating an issue, the bot queries open issues with the same
`testId` in the title. If found AND `updated_at` is within
`deduplicateWithinHours`, it adds a comment instead of creating a new issue:

```markdown
**Recurring failure** at commit {commitSha} (run #{runId}).

Same classification, same test. Check if the original fix was effective.
```

## Invocation

From `.github/workflows/playwright.yml`:

```yaml
- name: Report app_bug failures as GitHub issues
  if: failure()
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    node .claude/skills/playwright-enterprise-tester/scripts/github-issue-bot.mjs \
      --report=test-results/claude-report.json \
      --run-url="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
```

## Token scopes required

The `GITHUB_TOKEN` needs:
- `issues:write`
- `pull-requests:read` (to link related PRs)

The default `${{ secrets.GITHUB_TOKEN }}` provided by GitHub Actions
covers this when the repo's workflow permissions include issues.

Set workflow-level:
```yaml
permissions:
  issues: write
  contents: read
```

## Dry run

Test without creating real issues:

```bash
node scripts/github-issue-bot.mjs --report=test-results/claude-report.json --dry-run
```

Prints the issue payload JSON to stdout without calling the GitHub API.

## Phase 3 candidates

- Auto-link to related PRs touching the same files
- Auto-assign based on CODEOWNERS (integration with P2.06)
- Close the issue automatically when the same test passes in a later run
- GraphQL query for smarter deduplication (e.g., by label + test ID)
