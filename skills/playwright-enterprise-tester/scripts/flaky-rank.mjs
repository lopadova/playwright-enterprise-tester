#!/usr/bin/env node
// flaky-rank.mjs
// Read flakiness JSONL history and print top-N flaky tests over a time window.
//
// Usage:
//   node scripts/flaky-rank.mjs \
//     [--input=test-results/flakiness-history.jsonl] \
//     [--days=30] \
//     [--top=10] \
//     [--min-runs=5]

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const input = resolve(args.input ?? 'test-results/flakiness-history.jsonl');
const days = parseInt(args.days ?? '30', 10);
const top = parseInt(args.top ?? '10', 10);
const minRuns = parseInt(args['min-runs'] ?? '5', 10);

if (!existsSync(input)) {
  console.error(`No history file at ${input}. Enable flakinessAnalytics.sink=jsonl in .playwright-tester.json.`);
  process.exit(1);
}

const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
const lines = readFileSync(input, 'utf8').split('\n').filter(Boolean);

const byTest = new Map();

for (const line of lines) {
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  if (!entry.ts || new Date(entry.ts).getTime() < cutoff) continue;

  const key = entry.testId;
  if (!byTest.has(key)) {
    byTest.set(key, {
      testId: key,
      file: entry.file,
      title: entry.title,
      runs: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      lastFailure: null,
    });
  }
  const stats = byTest.get(key);
  stats.runs++;
  if (entry.classification === 'flaky') stats.flaky++;
  if (entry.finalStatus === 'passed') stats.passed++;
  else if (entry.finalStatus === 'failed') {
    stats.failed++;
    stats.lastFailure = entry.ts;
  }
}

const ranked = Array.from(byTest.values())
  .filter(s => s.runs >= minRuns)
  .map(s => ({
    ...s,
    flakyRate: s.runs > 0 ? s.flaky / s.runs : 0,
    failureRate: s.runs > 0 ? s.failed / s.runs : 0,
  }))
  .sort((a, b) => b.flakyRate - a.flakyRate)
  .slice(0, top);

if (ranked.length === 0) {
  console.log(`No tests met the minimum ${minRuns} runs threshold in the last ${days} days.`);
  process.exit(0);
}

console.log(`Top ${ranked.length} flaky tests in the last ${days} days (min ${minRuns} runs):\n`);
console.log('Rank  Flaky%  Fail%  Runs  Test');
console.log('----  ------  -----  ----  --------------------------------------------');
ranked.forEach((t, i) => {
  const rank = String(i + 1).padEnd(4);
  const flakyPct = (t.flakyRate * 100).toFixed(1).padStart(5) + '%';
  const failPct = (t.failureRate * 100).toFixed(1).padStart(4) + '%';
  const runs = String(t.runs).padStart(4);
  console.log(`${rank}  ${flakyPct}  ${failPct}  ${runs}  ${t.testId}`);
});
console.log();
console.log('Tip: tests with flakyRate > 15% are candidates for investigation or quarantine.');
