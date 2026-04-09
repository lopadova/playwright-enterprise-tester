#!/usr/bin/env node
// lighthouse-runner.mjs (P2.14)
// Standalone Lighthouse runner for full Core Web Vitals audits.
// Requires `lighthouse` npm package to be installed separately.
//
// Usage:
//   node scripts/lighthouse-runner.mjs --base-url=https://staging.example.com

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const configPath = resolve('.playwright-tester.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const lhConfig = config.lighthouseCiIntegration ?? {};

if (!lhConfig.enabled) {
  console.log('lighthouseCiIntegration.enabled is false. Exiting.');
  process.exit(0);
}

const baseUrl = args['base-url'] ?? process.env.PWTEST_BASE_URL;
if (!baseUrl) {
  console.error('--base-url or PWTEST_BASE_URL required');
  process.exit(1);
}

const outputDir = resolve(lhConfig.outputDir ?? 'test-results/lighthouse');
mkdirSync(outputDir, { recursive: true });

let lighthouse, launchChromium;
try {
  const lhMod = await import('lighthouse');
  lighthouse = lhMod.default;
  const chromeLauncher = await import('chrome-launcher');
  launchChromium = chromeLauncher.launch;
} catch (err) {
  console.error(`lighthouse or chrome-launcher not installed: ${err.message}`);
  console.error('Run: npm install -D lighthouse chrome-launcher');
  process.exit(1);
}

const results = [];
let chrome;

try {
  chrome = await launchChromium({ chromeFlags: lhConfig.chromeFlags ?? ['--headless=new', '--no-sandbox'] });
  const flags = {
    logLevel: 'error',
    output: ['json', 'html'],
    onlyCategories: lhConfig.categories ?? ['performance', 'accessibility', 'best-practices', 'seo'],
    port: chrome.port
  };

  for (const page of lhConfig.pagesToAudit ?? []) {
    const url = new URL(page.url, baseUrl).toString();
    console.log(`Auditing ${page.name}: ${url}`);
    const runnerResult = await lighthouse(url, flags);

    const scores = {};
    for (const cat of Object.values(runnerResult.lhr.categories)) {
      scores[cat.id] = Math.round((cat.score ?? 0) * 100);
    }

    const violations = [];
    for (const [catId, threshold] of Object.entries(lhConfig.thresholds ?? {})) {
      if ((scores[catId] ?? 0) < threshold) {
        violations.push({ category: catId, score: scores[catId], threshold });
      }
    }

    results.push({ page: page.name, url, scores, violations });

    writeFileSync(join(outputDir, `${page.name}.report.json`), JSON.stringify(runnerResult.lhr, null, 2));
    writeFileSync(join(outputDir, `${page.name}.report.html`), runnerResult.report[1]);
  }
} finally {
  if (chrome) await chrome.kill();
}

const summary = {
  schemaVersion: 1,
  ts: new Date().toISOString(),
  baseUrl,
  totalAudited: results.length,
  results,
  hasViolations: results.some(r => r.violations.length > 0)
};

writeFileSync(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nLighthouse audit complete. ${results.length} page(s) audited.`);
console.log(`Violations: ${results.filter(r => r.violations.length > 0).length}`);

if (summary.hasViolations) {
  process.exit(1);
}
