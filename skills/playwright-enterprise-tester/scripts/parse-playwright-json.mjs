#!/usr/bin/env node
// parse-playwright-json.mjs
// Transform Playwright JSON reporter output → claude-report.json (stable schema).
//
// Usage:
//   node scripts/parse-playwright-json.mjs \
//     --input=test-results/results.json \
//     --output=test-results/claude-report.json \
//     [--runner=local|ci] [--run-id=<id>] [--commit=<sha>] [--branch=<name>]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const input = resolve(args.input ?? 'test-results/results.json');
const output = resolve(args.output ?? 'test-results/claude-report.json');
const runnerMode = args.runner ?? (process.env.CI ? 'ci' : 'local');
const runId = args['run-id'] ?? new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 8);
const commit = args.commit ?? process.env.GITHUB_SHA ?? null;
const branch = args.branch ?? process.env.GITHUB_REF_NAME ?? null;

if (!existsSync(input)) {
  console.error(`Input file not found: ${input}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, 'utf8'));

function classifyFailure(test, result) {
  // Heuristic classification based on error text
  const err = result.errors?.[0]?.message ?? result.error?.message ?? '';
  const errLower = err.toLowerCase();

  if (errLower.includes('econnrefused') || errLower.includes('err_connection_refused')) {
    return { type: 'environment_bug', reason: 'connection_refused' };
  }
  if (errLower.includes('cannot find module') || errLower.includes('module not found')) {
    return { type: 'environment_bug', reason: 'missing_dependency' };
  }
  if (errLower.includes('timed out waiting for selector') || errLower.includes('locator.') && errLower.includes('timeout')) {
    return { type: 'test_bug', reason: 'locator_drift' };
  }
  if (errLower.includes('expect(') && errLower.includes('received')) {
    return { type: 'test_bug', reason: 'bad_assertion' };
  }
  if (result.status === 'passed' && (result.retry ?? 0) > 0) {
    return { type: 'flaky', reason: 'passes_on_retry' };
  }
  if (errLower.includes('500') || errLower.includes('internal server error')) {
    return { type: 'app_bug', reason: 'server_error' };
  }
  return { type: 'unknown', reason: null };
}

function extractArtifacts(result) {
  const artifacts = { trace: null, screenshot: null, video: null };
  (result.attachments ?? []).forEach((a) => {
    if (a.contentType?.includes('zip') || a.name === 'trace') artifacts.trace = a.path;
    if (a.contentType?.startsWith('image/') || a.name?.includes('screenshot')) artifacts.screenshot = a.path;
    if (a.contentType?.startsWith('video/') || a.name?.includes('video')) artifacts.video = a.path;
  });
  return artifacts;
}

function walkSuites(suites, parent = '') {
  const results = [];
  for (const suite of suites ?? []) {
    const title = parent ? `${parent} > ${suite.title}` : suite.title;
    if (suite.specs) {
      for (const spec of suite.specs) {
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            results.push({
              testId: `${spec.file}::${spec.title}`,
              file: spec.file,
              title: spec.title,
              suite: title,
              status: result.status,
              durationMs: result.duration,
              retry: result.retry ?? 0,
              error: result.errors?.[0]?.message ?? null,
              errorLocation: result.errors?.[0]?.location ?? null,
              attachments: result.attachments ?? [],
              tags: spec.tags ?? [],
            });
          }
        }
      }
    }
    if (suite.suites) {
      results.push(...walkSuites(suite.suites, title));
    }
  }
  return results;
}

const allResults = walkSuites(raw.suites ?? []);

const summary = {
  total: allResults.length,
  passed: allResults.filter(r => r.status === 'passed').length,
  failed: allResults.filter(r => r.status === 'failed' || r.status === 'timedOut').length,
  flaky: allResults.filter(r => r.status === 'passed' && r.retry > 0).length,
  skipped: allResults.filter(r => r.status === 'skipped').length,
  duration: allResults.reduce((s, r) => s + (r.durationMs ?? 0), 0),
};

const failures = allResults
  .filter(r => r.status === 'failed' || r.status === 'timedOut')
  .map(r => {
    const classification = classifyFailure(r, r);
    return {
      testId: r.testId,
      file: r.file,
      title: r.title,
      line: r.errorLocation?.line ?? null,
      classification: classification.type,
      flakyReason: null,
      error: r.error,
      artifacts: extractArtifacts(r),
      suggestedFix: null,
      appliedPlaybook: null,
    };
  });

const flaky = allResults
  .filter(r => r.status === 'passed' && r.retry > 0)
  .map(r => ({
    testId: r.testId,
    file: r.file,
    title: r.title,
    retries: r.retry,
    flakyReason: 'passes_on_retry',
  }));

const report = {
  schemaVersion: 1,
  runId,
  runner: runnerMode,
  commit,
  branch,
  detectedStack: {},
  resolvedMode: process.env.PWTEST_MODE ?? null,
  commandsUsed: [],
  summary,
  failures,
  flaky,
  silentErrors: [],
  visualDiffs: [],
  perfBudgetViolations: [],
  frontendContractFindings: [],
  antiPatternFindings: [],
  touchedFiles: [],
  appCodeChanges: [],
  timestamp: new Date().toISOString(),
};

writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`claude-report.json written to ${output}`);
console.log(`Summary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.flaky} flaky`);
