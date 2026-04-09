#!/usr/bin/env node
// slack-teams-notify.mjs (P2.11)
// Sends notifications to Slack / Teams / generic webhook on failures.
// Uses fetch() (no shell, no SDK).
//
// Usage:
//   node scripts/slack-teams-notify.mjs --report=test-results/claude-report.json [--run-url=...] [--dry-run]

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const configPath = resolve('.playwright-tester.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const notifyConfig = config.slackTeamsNotifications ?? {};

if (!notifyConfig.enabled) {
  console.log('slackTeamsNotifications.enabled is false. Exiting.');
  process.exit(0);
}

const reportPath = resolve(args.report ?? 'test-results/claude-report.json');
const runUrl = args['run-url'] ?? process.env.GITHUB_RUN_URL ?? '';
const dryRun = args['dry-run'] === true || notifyConfig.dryRun === true;
const provider = notifyConfig.provider ?? 'slack';
const webhookUrl = notifyConfig.webhookUrl ?? process.env[notifyConfig.webhookUrlEnvKey ?? 'PWTEST_NOTIFY_WEBHOOK_URL'];

if (!existsSync(reportPath)) {
  console.error(`Report not found: ${reportPath}`);
  process.exit(1);
}
if (!dryRun && !webhookUrl) {
  console.error('Webhook URL not set.');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const failures = report.failures ?? [];
const perfViolations = report.perfBudgetViolations ?? [];

if (failures.length === 0 && perfViolations.length === 0) {
  console.log('No failures or violations. Nothing to notify.');
  process.exit(0);
}

function buildSlackPayload() {
  const color = failures.length > 0 ? '#E01E5A' : '#ECB22E';
  const title = failures.length > 0
    ? `E2E test failure (${failures.length})`
    : `Perf budget violation (${perfViolations.length})`;

  const fields = [
    { title: 'Branch', value: report.branch ?? 'unknown', short: true },
    { title: 'Commit', value: (report.commit ?? 'unknown').slice(0, 7), short: true },
    { title: 'Runner', value: report.runner ?? 'unknown', short: true },
    { title: 'Passed / Total', value: `${report.summary?.passed ?? 0} / ${report.summary?.total ?? 0}`, short: true }
  ];

  const failureList = failures.slice(0, 5)
    .map(f => `• \`${f.testId}\` — ${f.classification}`)
    .join('\n');

  return {
    attachments: [{
      color,
      title,
      fields,
      text: failureList || 'Perf violations detected',
      actions: runUrl ? [{ type: 'button', text: 'View run', url: runUrl }] : []
    }]
  };
}

function buildTeamsPayload() {
  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    themeColor: 'E01E5A',
    summary: `E2E failures: ${failures.length}`,
    sections: [{
      activityTitle: `E2E test report`,
      facts: [
        { name: 'Branch', value: report.branch ?? 'unknown' },
        { name: 'Commit', value: report.commit ?? 'unknown' },
        { name: 'Failures', value: String(failures.length) },
        { name: 'Perf violations', value: String(perfViolations.length) }
      ],
      text: failures.slice(0, 5).map(f => `- ${f.testId} (${f.classification})`).join('\n')
    }],
    potentialAction: runUrl ? [{
      '@type': 'OpenUri',
      name: 'View run',
      targets: [{ os: 'default', uri: runUrl }]
    }] : []
  };
}

function buildGenericPayload() {
  return {
    schemaVersion: 1,
    event: failures.length > 0 ? 'failure' : 'perf-budget-violation',
    ts: new Date().toISOString(),
    runId: report.runId,
    runner: report.runner,
    commit: report.commit,
    branch: report.branch,
    runUrl,
    summary: report.summary,
    failureCount: failures.length,
    perfViolationCount: perfViolations.length,
    failures: failures.slice(0, 10)
  };
}

const payload = provider === 'slack' ? buildSlackPayload()
              : provider === 'teams' ? buildTeamsPayload()
              : buildGenericPayload();

if (dryRun) {
  console.log('[DRY RUN] Would POST to:', webhookUrl || '(no URL)');
  console.log('[DRY RUN] Payload:');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const retries = notifyConfig.retryOnSendFailure ?? 2;
let attempt = 0;
let success = false;

while (attempt <= retries && !success) {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (resp.ok) {
      console.log(`Notification sent (${provider}).`);
      success = true;
    } else {
      console.warn(`Attempt ${attempt + 1} failed: ${resp.status} ${await resp.text()}`);
      attempt++;
      if (attempt <= retries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  } catch (err) {
    console.warn(`Attempt ${attempt + 1} error: ${err.message}`);
    attempt++;
    if (attempt <= retries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
}

if (!success) {
  console.error(`Failed to send notification after ${retries + 1} attempts. Continuing anyway.`);
}
