#!/usr/bin/env node
// github-issue-bot.mjs (P2.03)
// Auto-creates GitHub issues for classified app_bug failures in CI.
// Uses execFileSync (no shell) to prevent command injection from report data.
//
// Usage:
//   node scripts/github-issue-bot.mjs \
//     --report=test-results/claude-report.json \
//     --run-url=https://github.com/owner/repo/actions/runs/123 \
//     [--dry-run]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const reportPath = resolve(args.report ?? 'test-results/claude-report.json');
const runUrl = args['run-url'] ?? process.env.GITHUB_RUN_URL ?? '';
const dryRun = args['dry-run'] === true || process.env.GITHUB_ISSUE_BOT_DRY_RUN === 'true';
const repo = args.repo ?? process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!existsSync(reportPath)) {
  console.error(`Report not found: ${reportPath}`);
  process.exit(1);
}
if (!dryRun && !token) {
  console.error('GITHUB_TOKEN is required unless --dry-run is set');
  process.exit(1);
}
if (!dryRun && !repo) {
  console.error('repo (or GITHUB_REPOSITORY env) is required unless --dry-run is set');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const createdIssues = [];

// execFile with array args: no shell, no injection risk
function gh(argv) {
  return execFileSync('gh', argv, { encoding: 'utf8' });
}

for (const failure of report.failures ?? []) {
  if (failure.classification !== 'app_bug') continue;

  const title = `[E2E ${report.runner}] ${failure.classification}: ${failure.title ?? failure.testId}`;
  const body = `## Test failure: ${failure.title ?? failure.testId}

- **File**: \`${failure.file}${failure.line ? ':' + failure.line : ''}\`
- **Classification**: ${failure.classification}
- **Applied playbook**: ${failure.appliedPlaybook ?? 'none'}
- **Suggested fix**: ${failure.suggestedFix ?? 'n/a'}
- **Run**: [GitHub Actions](${runUrl})
- **Commit**: \`${report.commit ?? 'unknown'}\`
- **Branch**: \`${report.branch ?? 'unknown'}\`
- **Runner mode**: ${report.runner}

### Error

\`\`\`
${(failure.error ?? '').slice(0, 2000)}
\`\`\`

### Artifacts
- Trace: ${failure.artifacts?.trace ?? 'n/a'}
- Screenshot: ${failure.artifacts?.screenshot ?? 'n/a'}
- Video: ${failure.artifacts?.video ?? 'n/a'}

---
*Auto-reported by playwright-enterprise-tester bot*`;

  if (dryRun) {
    console.log(`[DRY RUN] Would create issue:\n  Title: ${title}\n  Body length: ${body.length}`);
    createdIssues.push({ title, dryRun: true });
    continue;
  }

  // Deduplication: check if an issue with the same title is open
  try {
    const existing = gh([
      'issue', 'list',
      '--repo', repo,
      '--state', 'open',
      '--search', title,
      '--json', 'number,title',
      '--limit', '5'
    ]);
    const found = JSON.parse(existing).find(i => i.title === title);
    if (found) {
      console.log(`Issue already exists: #${found.number} (${title})`);
      gh([
        'issue', 'comment', String(found.number),
        '--repo', repo,
        '--body', `Recurring failure at commit ${report.commit}. See run: ${runUrl}`
      ]);
      continue;
    }
  } catch (err) {
    console.warn(`Deduplication check failed, proceeding: ${err.message}`);
  }

  try {
    const tempBodyPath = 'test-results/issue-body.md';
    writeFileSync(tempBodyPath, body);
    const result = gh([
      'issue', 'create',
      '--repo', repo,
      '--title', title,
      '--body-file', tempBodyPath,
      '--label', 'e2e-failure,auto-reported,playwright'
    ]);
    console.log(`Created: ${result.trim()}`);
    createdIssues.push({ title, url: result.trim() });
  } catch (err) {
    console.error(`Failed to create issue: ${err.message}`);
  }
}

writeFileSync('test-results/github-issues-created.json', JSON.stringify({
  schemaVersion: 1,
  ts: new Date().toISOString(),
  total: createdIssues.length,
  issues: createdIssues
}, null, 2));

console.log(`\nCreated ${createdIssues.length} issue(s).`);
