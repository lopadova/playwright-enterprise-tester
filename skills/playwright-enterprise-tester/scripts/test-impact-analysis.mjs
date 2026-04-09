#!/usr/bin/env node
// test-impact-analysis.mjs (P2.04)
// Selects test specs based on git diff. Heuristic-based mapping from
// changed files to test files.
//
// Usage:
//   node scripts/test-impact-analysis.mjs \
//     [--config=.playwright-tester.json] \
//     [--base=master] \
//     [--output=test-results/impact-selection.json]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const configPath = resolve(args.config ?? '.playwright-tester.json');
const outputPath = resolve(args.output ?? 'test-results/impact-selection.json');

if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const impact = config.testImpactAnalysis ?? {};

if (!impact.enabled) {
  console.log('testImpactAnalysis.enabled is false. Exiting.');
  process.exit(0);
}

const baseBranch = args.base ?? impact.baseBranch ?? 'master';
const diffTarget = impact.diffTarget ?? `HEAD...${baseBranch}`;
const fallback = impact.fallbackOnEmptyDiff ?? 'all-smoke';

let changedFiles = [];
try {
  const out = execFileSync('git', ['diff', '--name-only', diffTarget], { encoding: 'utf8' });
  changedFiles = out.split('\n').map(s => s.trim()).filter(Boolean);
} catch (err) {
  console.warn(`git diff failed: ${err.message}. Falling back to empty diff.`);
}

// Simple glob pattern matcher (subset of minimatch)
function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp('^' + escaped + '$');
}

function matchesPattern(file, pattern) {
  return globToRegExp(pattern).test(file);
}

// Check alwaysRunOnChanges first
const alwaysRun = impact.alwaysRunOnChanges ?? [];
const forceAll = changedFiles.some(f => alwaysRun.some(p => matchesPattern(f, p)));

let selectedTests = new Set();
const matchedPatterns = [];

if (forceAll) {
  console.log('alwaysRunOnChanges matched. Selecting all tests.');
  selectedTests.add('**');
} else {
  for (const entry of impact.fileToTestMap ?? []) {
    const matches = changedFiles.filter(f => matchesPattern(f, entry.pattern));
    if (matches.length > 0) {
      matchedPatterns.push({ pattern: entry.pattern, files: matches });
      for (const t of entry.tests) selectedTests.add(t);
    }
  }
}

let fallbackApplied = null;
if (!forceAll && selectedTests.size === 0) {
  fallbackApplied = fallback;
  console.log(`No matches. Applying fallback: ${fallback}`);
  if (fallback === 'all-smoke') {
    // Caller should pass --grep='@smoke' alongside
    selectedTests.add('**/*.spec.ts');
  } else if (fallback === 'full') {
    selectedTests.add('**');
  }
  // 'none' → empty set
}

const output = {
  schemaVersion: 1,
  ts: new Date().toISOString(),
  base: baseBranch,
  head: 'HEAD',
  changedFiles,
  matchedPatterns,
  selectedTests: Array.from(selectedTests),
  forceAll,
  fallbackApplied
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`Changed files: ${changedFiles.length}`);
console.log(`Selected tests: ${output.selectedTests.length === 1 && output.selectedTests[0] === '**' ? 'ALL' : output.selectedTests.length}`);
if (output.selectedTests.length > 0 && output.selectedTests[0] !== '**') {
  output.selectedTests.forEach(t => console.log('  ' + t));
}
console.log(`Output: ${outputPath}`);
