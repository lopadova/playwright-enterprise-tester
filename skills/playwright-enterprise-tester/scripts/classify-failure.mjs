#!/usr/bin/env node
// classify-failure.mjs
// Apply deterministic failure classification playbooks.
//
// Usage:
//   node scripts/classify-failure.mjs \
//     --report=test-results/claude-report.json \
//     [--write]  (apply classifications back to the report)

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const reportPath = resolve(args.report ?? 'test-results/claude-report.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

// Playbook matchers, ordered by specificity
const PLAYBOOKS = [
  {
    id: 'env:connection_refused',
    classification: 'environment_bug',
    match: (err) => /econnrefused|err_connection_refused|connect.*refused/i.test(err ?? ''),
    suggestedFix: 'Check the baseURL port. The app may not be running. Try: curl --head $BASE_URL',
    appliedPlaybook: 'Playbook 1.1: scan ports [8000, 8080, 8787, 3000, 5173]',
  },
  {
    id: 'env:missing_dependency',
    classification: 'environment_bug',
    match: (err) => /cannot find module|module not found|\bexecutable.*not found/i.test(err ?? ''),
    suggestedFix: 'Install missing dependency. Check package.json and run npm ci / playwright install',
    appliedPlaybook: 'Playbook 1.3: verify Playwright + browser install',
  },
  {
    id: 'test:locator_drift',
    classification: 'test_bug',
    match: (err) => /timed out .* waiting for (locator|selector)|locator\.\w+:.*timeout/i.test(err ?? ''),
    suggestedFix: 'Locator likely drifted. Open trace.zip and find the target via accessible name. Replace with getByRole / getByLabel / getByTestId.',
    appliedPlaybook: 'Playbook 2.1: locator drift rank',
  },
  {
    id: 'test:missing_wait',
    classification: 'test_bug',
    match: (err) => /expected.*to be visible|element is not visible|not attached/i.test(err ?? ''),
    suggestedFix: 'Add a deterministic wait on the business signal before asserting. Do not use waitForTimeout.',
    appliedPlaybook: 'Playbook 2.2: missing deterministic wait',
  },
  {
    id: 'app:server_error',
    classification: 'app_bug',
    match: (err) => /\b5\d{2}\b|internal server error|exception/i.test(err ?? ''),
    suggestedFix: 'Check Laravel logs (storage/logs/laravel.log). This is an application error and the skill will NOT modify app code without governance.fixAppCode=true.',
    appliedPlaybook: 'Playbook 3.1: STOP, governance check required',
  },
  {
    id: 'flaky:retry_pass',
    classification: 'flaky',
    match: (err, result) => (result?.retry ?? 0) > 0 && result?.status === 'passed',
    suggestedFix: 'Identify the timing race. Replace networkidle / timeouts with deterministic signals.',
    appliedPlaybook: 'Playbook 4.2: stabilize waits',
  },
];

function applyPlaybook(failure) {
  const err = failure.error ?? '';
  for (const playbook of PLAYBOOKS) {
    if (playbook.match(err, failure)) {
      return {
        classification: playbook.classification,
        suggestedFix: playbook.suggestedFix,
        appliedPlaybook: playbook.appliedPlaybook,
      };
    }
  }
  return {
    classification: failure.classification ?? 'unknown',
    suggestedFix: 'Manual investigation required. Review the trace and server logs.',
    appliedPlaybook: null,
  };
}

let changed = 0;
for (const failure of report.failures ?? []) {
  const playbook = applyPlaybook(failure);
  if (failure.classification !== playbook.classification
      || failure.suggestedFix !== playbook.suggestedFix) {
    Object.assign(failure, playbook);
    changed++;
  }
}

console.log(`Classified ${changed} failures.`);
for (const f of report.failures ?? []) {
  console.log(`  ${f.testId} → ${f.classification}${f.appliedPlaybook ? ' (' + f.appliedPlaybook + ')' : ''}`);
}

if (args.write) {
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Updated ${reportPath}`);
}
