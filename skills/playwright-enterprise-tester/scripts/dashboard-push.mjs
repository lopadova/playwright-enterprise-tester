#!/usr/bin/env node
// dashboard-push.mjs (P2.09 client side)
// Pushes run data to the company-wide dashboard endpoint (CF Worker).
// Dashboard itself is a separate project (see DASHBOARD-SPEC.md).
//
// Usage:
//   node scripts/dashboard-push.mjs --report=test-results/claude-report.json

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const configPath = resolve('.playwright-tester.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const dashConfig = config.dashboardIntegration ?? {};

if (!dashConfig.enabled) {
  console.log('dashboardIntegration.enabled is false. Exiting.');
  process.exit(0);
}

const endpoint = dashConfig.endpoint ?? process.env[dashConfig.endpointEnvKey ?? 'PWTEST_DASHBOARD_URL'];
const token = process.env[dashConfig.authTokenEnvKey ?? 'PWTEST_DASHBOARD_TOKEN'];
const repoIdentifier = dashConfig.repoIdentifier ?? process.env.GITHUB_REPOSITORY ?? 'unknown';
const reportPath = resolve(args.report ?? 'test-results/claude-report.json');
const dryRun = args['dry-run'] === true;

if (!existsSync(reportPath)) {
  console.error(`Report not found: ${reportPath}`);
  process.exit(1);
}

if (!dryRun && (!endpoint || !token)) {
  console.warn('Dashboard endpoint or token not configured. Buffering payload locally.');
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));

const payload = {
  schemaVersion: dashConfig.schemaVersion ?? 1,
  repoIdentifier,
  runId: report.runId,
  ts: report.timestamp ?? new Date().toISOString(),
  runnerMode: report.runner,
  commit: report.commit,
  branch: report.branch,
  mode: report.resolvedMode,
  summary: report.summary,
  failures: (report.failures ?? []).map(f => ({
    testId: f.testId,
    file: f.file,
    classification: f.classification,
    flakyReason: f.flakyReason,
    owners: f.owners
  })),
  perfBudgetViolations: report.perfBudgetViolations ?? [],
  axeViolations: report.axeViolations ?? [],
  visualDiffs: report.visualDiffs ?? []
};

if (dryRun) {
  console.log('[DRY RUN] Would POST to:', endpoint ?? '(no endpoint)');
  console.log('[DRY RUN] Payload:');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

// Buffer fallback: if endpoint unreachable, append to pending queue
const pendingPath = 'test-results/dashboard-pending.jsonl';
mkdirSync('test-results', { recursive: true });

async function push() {
  if (!endpoint || !token) {
    appendFileSync(pendingPath, JSON.stringify(payload) + '\n');
    console.log(`Buffered to ${pendingPath} (endpoint/token not set).`);
    return;
  }

  try {
    const resp = await fetch(`${endpoint.replace(/\/$/, '')}/api/ingest/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (resp.ok) {
      console.log('Dashboard push OK.');
    } else {
      console.warn(`Dashboard push failed: ${resp.status}. Buffering.`);
      appendFileSync(pendingPath, JSON.stringify(payload) + '\n');
    }
  } catch (err) {
    console.warn(`Dashboard push error: ${err.message}. Buffering.`);
    appendFileSync(pendingPath, JSON.stringify(payload) + '\n');
  }
}

await push();
