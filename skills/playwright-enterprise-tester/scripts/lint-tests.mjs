#!/usr/bin/env node
// lint-tests.mjs (P2.05)
// Anti-pattern linter for Playwright test files.
// Phase 2: enforce mode support.
//
// Usage:
//   node scripts/lint-tests.mjs [--mode=warn-only|enforce] <files...>
//
// For staged files in a pre-commit hook, pipe the list:
//   git diff --cached --name-only --diff-filter=ACM '*.spec.ts' | xargs -r node scripts/lint-tests.mjs
//
// Or pass a glob directory; the script will walk it:
//   node scripts/lint-tests.mjs --scan=tests/e2e

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const modeArg = args.find(a => a.startsWith('--mode='))?.split('=')[1];
const scanArg = args.find(a => a.startsWith('--scan='))?.split('=')[1];
const targetFiles = args.filter(a => !a.startsWith('--'));

const configPath = resolve('.playwright-tester.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const linterConfig = config.linterEnforce ?? config.antiPatternLinter ?? {};
const mode = modeArg ?? linterConfig.mode ?? 'warn-only';
const failOn = new Set(linterConfig.failOn ?? []);
const warnOn = new Set(linterConfig.warnOn ?? [
  'waitForTimeoutHardcoded', 'cssFirstChoice', 'nthChildSelector',
  'volatileTextMatcher', 'pageDollarApi', 'testOnlyInCI',
  'skipWithoutIssueRef', 'hardcodedCredentials'
]);

const RULES = [
  {
    id: 'waitForTimeoutHardcoded',
    regex: /page\.waitForTimeout\(\s*(\d+)/g,
    test: (m) => parseInt(m[1], 10) > 1000,
    msg: 'waitForTimeout > 1000ms is forbidden; use deterministic signal'
  },
  {
    id: 'pageDollarApi',
    regex: /page\.\$\$?\(/g,
    msg: 'page.$/page.$$ is deprecated; use page.locator()'
  },
  {
    id: 'testOnlyInCI',
    regex: /test\.only\b|test\.describe\.only\b/g,
    msg: 'test.only blocks CI; remove before commit'
  },
  {
    id: 'skipWithoutIssueRef',
    regex: /test\.skip\s*\(/g,
    test: (_m, line) => !/(PROJ-\d+|#\d+|TODO|FIXME)/.test(line),
    msg: 'test.skip requires an issue ref comment (e.g., PROJ-1234)'
  },
  {
    id: 'nthChildSelector',
    regex: /nth-child\(|nth-of-type\(|\.nth\(\s*\d+\s*\)/g,
    msg: 'nth-child/nth-of-type is brittle; filter by content or data-testid'
  },
  {
    id: 'hardcodedCredentials',
    regex: /(password|email)\s*:\s*['"][^'"]{3,}['"]/gi,
    test: (_m, line) => !/process\.env/.test(line),
    msg: 'Hardcoded credentials forbidden; use process.env.PWTEST_*'
  }
];

function walkDir(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    try {
      if (statSync(full).isDirectory()) out.push(...walkDir(full));
      else if (/\.(spec|test)\.(ts|js|mjs)$/.test(name)) out.push(full);
    } catch {}
  }
  return out;
}

function collectFiles() {
  if (targetFiles.length > 0) return targetFiles.filter(existsSync);
  if (scanArg) return walkDir(scanArg);
  // Default: scan common directories
  return [...walkDir('tests/e2e'), ...walkDir('tests')].filter((v, i, a) => a.indexOf(v) === i);
}

const violations = [];
const files = collectFiles();

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (/playwright-lint-disable\b(?!-)/.test(content)) continue;

  const lines = content.split('\n');
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let m;
    while ((m = rule.regex.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      const line = lines[lineNum - 1] ?? '';

      if (lines[lineNum - 2]?.includes(`playwright-lint-disable-next-line ${rule.id}`)) continue;
      if (rule.test && !rule.test(m, line)) continue;

      const severity = failOn.has(rule.id) ? 'error' : warnOn.has(rule.id) ? 'warn' : 'info';
      violations.push({
        rule: rule.id,
        severity,
        file,
        line: lineNum,
        snippet: line.trim().slice(0, 160),
        recommendation: rule.msg
      });
    }
  }
}

const errors = violations.filter(v => v.severity === 'error');
const warnings = violations.filter(v => v.severity === 'warn');

const output = {
  schemaVersion: 1,
  ts: new Date().toISOString(),
  mode,
  filesScanned: files.length,
  violations,
  summary: { total: violations.length, errors: errors.length, warnings: warnings.length }
};

mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/lint-violations.json', JSON.stringify(output, null, 2));

for (const v of violations) {
  const tag = v.severity === 'error' ? '[ERROR]' : v.severity === 'warn' ? '[WARN] ' : '[INFO] ';
  console.log(`${tag} ${v.file}:${v.line}  ${v.rule}`);
  console.log(`        ${v.snippet}`);
  console.log(`        -> ${v.recommendation}`);
}

console.log(`\nScanned ${files.length} file(s). ${errors.length} error(s), ${warnings.length} warning(s).`);

if (mode === 'enforce' && errors.length > 0) {
  console.error('\nLinter failed in enforce mode.');
  process.exit(1);
}
