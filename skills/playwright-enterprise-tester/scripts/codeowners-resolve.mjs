#!/usr/bin/env node
// codeowners-resolve.mjs (P2.06)
// Enriches claude-report.json with owner teams from .github/CODEOWNERS.
//
// Usage:
//   node scripts/codeowners-resolve.mjs --report=test-results/claude-report.json

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const reportPath = resolve(args.report ?? 'test-results/claude-report.json');
const configPath = resolve(args.config ?? '.playwright-tester.json');

if (!existsSync(reportPath)) {
  console.error(`Report not found: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const coConfig = config.codeownersIntegration ?? {};

if (!coConfig.enabled) {
  console.log('codeownersIntegration.enabled is false. Exiting.');
  process.exit(0);
}

const coFile = coConfig.codeownersFile ?? '.github/CODEOWNERS';
if (!existsSync(coFile)) {
  console.warn(`CODEOWNERS file not found at ${coFile}`);
  process.exit(0);
}

// Parse CODEOWNERS
const rawLines = readFileSync(coFile, 'utf8').split('\n');
const rules = [];
for (const raw of rawLines) {
  const line = raw.replace(/#.*$/, '').trim();
  if (!line) continue;
  const parts = line.split(/\s+/);
  const pattern = parts[0];
  const owners = parts.slice(1).filter(Boolean);
  if (owners.length === 0) continue;
  rules.push({ pattern, owners });
}

// Simple glob → regex (GitHub CODEOWNERS subset)
function patternToRegex(pattern) {
  let p = pattern;
  // Leading / means repo-relative (not anchored to any subdir)
  if (!p.startsWith('/') && !p.startsWith('*')) p = '**/' + p;
  p = p.replace(/^\//, '');
  const escaped = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp('^' + escaped + (p.endsWith('/') ? '.*' : '') + '$');
}

const compiledRules = rules.map(r => ({ ...r, regex: patternToRegex(r.pattern) }));

function resolveOwners(file) {
  // Last matching rule wins (GitHub convention)
  let lastMatch = null;
  for (const r of compiledRules) {
    if (r.regex.test(file)) lastMatch = r;
  }
  return lastMatch?.owners ?? [coConfig.fallbackOwner ?? '@platform-team'];
}

// Enrich failures
for (const failure of report.failures ?? []) {
  const owners = resolveOwners(failure.file);
  failure.owners = owners;
  if (coConfig.ownerToNotificationChannel) {
    failure.notificationChannels = owners
      .map(o => coConfig.ownerToNotificationChannel[o])
      .filter(Boolean);
  }
}

writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Enriched ${report.failures?.length ?? 0} failures with owner teams.`);
