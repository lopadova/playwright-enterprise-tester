#!/usr/bin/env node
// quarantine-manager.mjs (P2.08)
// Analyzes flakiness rollup and identifies quarantine candidates.
// Action modes: tag-only (default) | add-tag | skip-with-comment | create-pr
//
// Usage:
//   node scripts/quarantine-manager.mjs [--action=tag-only] [--window-days=14]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const configPath = resolve('.playwright-tester.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const qConfig = config.quarantineWorkflow ?? {};

if (!qConfig.enabled) {
  console.log('quarantineWorkflow.enabled is false. Exiting.');
  process.exit(0);
}

const action = args.action ?? qConfig.action ?? 'tag-only';
const windowDays = parseInt(args['window-days'] ?? qConfig.windowDays ?? 14, 10);
const threshold = parseFloat(qConfig.flakyRateThreshold ?? 0.15);
const minRuns = parseInt(qConfig.minRuns ?? 20, 10);

const historyPath = config.flakinessAnalytics?.jsonlPath ?? 'test-results/flakiness-history.jsonl';

if (!existsSync(historyPath)) {
  console.error(`No flakiness history at ${historyPath}`);
  process.exit(1);
}

const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
const lines = readFileSync(historyPath, 'utf8').split('\n').filter(Boolean);

const byTest = new Map();

for (const line of lines) {
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  if (!entry.ts || new Date(entry.ts).getTime() < cutoff) continue;
  if (!byTest.has(entry.testId)) {
    byTest.set(entry.testId, { testId: entry.testId, file: entry.file, title: entry.title, runs: 0, flaky: 0, failed: 0 });
  }
  const s = byTest.get(entry.testId);
  s.runs++;
  if (entry.classification === 'flaky') s.flaky++;
  if (entry.finalStatus === 'failed') s.failed++;
}

const candidates = Array.from(byTest.values())
  .filter(s => s.runs >= minRuns)
  .map(s => ({ ...s, flakyRate: s.flaky / s.runs }))
  .filter(s => s.flakyRate >= threshold)
  .sort((a, b) => b.flakyRate - a.flakyRate);

const output = {
  schemaVersion: 1,
  ts: new Date().toISOString(),
  windowDays,
  threshold,
  minRuns,
  action,
  candidates,
  totalCandidates: candidates.length
};

mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/quarantine-candidates.json', JSON.stringify(output, null, 2));

console.log(`Found ${candidates.length} quarantine candidate(s):\n`);
for (const c of candidates) {
  console.log(`  ${(c.flakyRate * 100).toFixed(1)}%  ${c.runs} runs  ${c.testId}`);
}

if (action === 'tag-only') {
  console.log('\nAction: tag-only. No files modified.');
  console.log('Review test-results/quarantine-candidates.json and decide next steps.');
  process.exit(0);
}

if (action === 'add-tag') {
  let modified = 0;
  for (const c of candidates) {
    if (!existsSync(c.file)) continue;
    let content = readFileSync(c.file, 'utf8');
    const testName = c.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(test\\([\\s]*['"\`])(${testName})(['"\`])`, 'g');
    const newContent = content.replace(regex, (m, a, b, d) => {
      if (b.includes('@quarantine')) return m;
      return `${a}${b} @quarantine${d}`;
    });
    if (newContent !== content) {
      writeFileSync(c.file, newContent);
      modified++;
      console.log(`Tagged: ${c.file} :: ${c.title}`);
    }
  }
  console.log(`\nAction: add-tag. ${modified} file(s) modified.`);
}

if (action === 'skip-with-comment' || action === 'create-pr') {
  console.log(`\nAction: ${action} not implemented in this script.`);
  console.log('Use action=tag-only or action=add-tag, or implement the PR flow manually.');
}
