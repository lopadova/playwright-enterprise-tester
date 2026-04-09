#!/usr/bin/env node
// install.mjs — interactive installer for playwright-enterprise-tester plugin.
// Scaffolds .playwright-tester.json + playwright.config.ts + tests/ directory
// in the target project.
//
// Usage:
//   node scripts/install.mjs           interactive mode
//   node scripts/install.mjs --yes     accept all defaults (non-interactive)
//   node scripts/install.mjs --dry-run print what would be written
//
// Uses Node built-ins only: no external dependencies.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..');
const TARGET = process.cwd();

const args = process.argv.slice(2);
const nonInteractive = args.includes('--yes') || args.includes('-y');
const dryRun = args.includes('--dry-run');

function log(...a) { console.log(...a); }
function warn(...a) { console.warn('[warn]', ...a); }
function err(...a) { console.error('[err]', ...a); }

async function prompt(rl, question, defaultValue) {
  if (nonInteractive) return defaultValue;
  const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function promptBool(rl, question, defaultYes = false) {
  if (nonInteractive) return defaultYes;
  const suffix = defaultYes ? ' [Y/n]' : ' [y/N]';
  const answer = (await rl.question(`${question}${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

function fileExists(p) { try { return statSync(p).isFile(); } catch { return false; } }
function dirExists(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

function detectStack() {
  const hints = [];
  const composer = fileExists(join(TARGET, 'composer.json'))
    ? JSON.parse(readFileSync(join(TARGET, 'composer.json'), 'utf8'))
    : null;
  const pkg = fileExists(join(TARGET, 'package.json'))
    ? JSON.parse(readFileSync(join(TARGET, 'package.json'), 'utf8'))
    : null;

  if (composer?.require?.['laravel/framework'] || fileExists(join(TARGET, 'artisan'))) hints.push('laravel');
  if (fileExists(join(TARGET, 'webpack.mix.js'))) hints.push('laravel-mix');
  if (fileExists(join(TARGET, 'vite.config.ts')) || fileExists(join(TARGET, 'vite.config.js'))) hints.push('vite');
  if (pkg?.dependencies?.next || pkg?.devDependencies?.next) hints.push('nextjs');
  if (pkg?.dependencies?.nuxt || pkg?.devDependencies?.nuxt) hints.push('nuxt');
  if (fileExists(join(TARGET, 'bun.lock')) || fileExists(join(TARGET, 'bun.lockb'))) hints.push('bun');
  if (fileExists(join(TARGET, 'wrangler.toml')) || fileExists(join(TARGET, 'wrangler.json'))) hints.push('cloudflare-worker');
  if (fileExists(join(TARGET, 'pnpm-workspace.yaml')) || fileExists(join(TARGET, 'turbo.json')) || fileExists(join(TARGET, 'nx.json'))) hints.push('monorepo');
  if (pkg) hints.push('node');

  return { hints, composer, pkg };
}

function writeFile(target, content) {
  if (dryRun) {
    log(`[dry-run] would write ${target} (${content.length} bytes)`);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  log(`  wrote ${relative(TARGET, target)}`);
}

function copyTemplate(srcRel, dstRel) {
  const src = join(PLUGIN_ROOT, srcRel);
  const dst = join(TARGET, dstRel);
  if (!fileExists(src)) {
    warn(`template missing: ${src}`);
    return false;
  }
  if (fileExists(dst)) {
    warn(`${dstRel} already exists, skipping`);
    return false;
  }
  if (dryRun) {
    log(`[dry-run] would copy ${srcRel} -> ${dstRel}`);
    return true;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  log(`  copied ${dstRel}`);
  return true;
}

async function main() {
  log('========================================');
  log('  playwright-enterprise-tester installer');
  log('========================================');
  log('');
  log(`Target project: ${TARGET}`);
  log(`Plugin root:    ${PLUGIN_ROOT}`);
  log('');

  const stack = detectStack();
  log('Detected stack hints:', stack.hints.join(', ') || '(none)');
  log('');

  const rl = createInterface({ input, output });

  try {
    // Collect basic info
    const baseUrl = await prompt(rl, 'Base URL for tests', 'http://localhost:3000');
    const userEmailEnv = await prompt(rl, 'Env var name for test user email', 'PWTEST_USER_EMAIL');
    const userPassEnv = await prompt(rl, 'Env var name for test user password', 'PWTEST_USER_PASSWORD');

    log('');
    log('Phase 2 features (all OFF by default, toggle later in .playwright-tester.json):');
    const enableLinter = await promptBool(rl, '  Enable anti-pattern linter enforce (P2.05)?', false);
    const enableCodeowners = await promptBool(rl, '  Enable CODEOWNERS integration (P2.06)?', false);
    const enableSlack = await promptBool(rl, '  Enable Slack/Teams notifications (P2.11)?', false);
    const enableAxe = await promptBool(rl, '  Enable Axe a11y (P2.12)?', false);
    const enableCrossBrowser = await promptBool(rl, '  Enable cross-browser matrix (P2.16)?', false);
    const enableMobileMatrix = await promptBool(rl, '  Enable mobile/desktop perf matrix (P2.15)?', false);
    const enableVisual = await promptBool(rl, '  Enable visual regression (phase 1 opt-in)?', false);
    const enablePerf = await promptBool(rl, '  Enable performance budgets (phase 1 opt-in)?', false);

    log('');
    log('Generating files...');

    // 1. Load the config template
    const configTplPath = join(PLUGIN_ROOT, 'templates', '.playwright-tester.json.tmpl');
    if (!fileExists(configTplPath)) {
      err(`Config template not found at ${configTplPath}`);
      process.exit(1);
    }
    const configRaw = readFileSync(configTplPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Apply user choices
    if (config.testData?.precreatedUsers?.user) {
      config.testData.precreatedUsers.user.envKey = userEmailEnv;
      config.testData.precreatedUsers.user.envPassKey = userPassEnv;
    }
    if (config.execution) {
      config.execution.baseURL = baseUrl;
    }
    if (enableLinter && config.linterEnforce) config.linterEnforce.enabled = true;
    if (enableCodeowners && config.codeownersIntegration) config.codeownersIntegration.enabled = true;
    if (enableSlack && config.slackTeamsNotifications) config.slackTeamsNotifications.enabled = true;
    if (enableAxe && config.axeA11y) config.axeA11y.enabled = true;
    if (enableCrossBrowser && config.crossBrowser) config.crossBrowser.enabled = true;
    if (enableMobileMatrix && config.mobileDesktopMatrix) config.mobileDesktopMatrix.enabled = true;
    if (enableVisual && config.visualRegression) config.visualRegression.enabled = true;
    if (enablePerf && config.perfBudgets) config.perfBudgets.enabled = true;

    // 2. Write .playwright-tester.json
    writeFile(join(TARGET, '.playwright-tester.json'), JSON.stringify(config, null, 2));

    // 3. Copy playwright.config.ts if missing
    if (!fileExists(join(TARGET, 'playwright.config.ts')) && !fileExists(join(TARGET, 'playwright.config.js'))) {
      copyTemplate('templates/playwright.config.ts.tmpl', 'playwright.config.ts');
    } else {
      warn('playwright.config.ts/js already exists, skipping');
    }

    // 4. Copy test skeleton templates
    const skillTpl = 'skills/playwright-enterprise-tester/templates';
    const filesToCopy = [
      [`${skillTpl}/tests/setup/auth.setup.ts.tmpl`, 'tests/setup/auth.setup.ts'],
      [`${skillTpl}/tests/support/cookie-consent.ts.tmpl`, 'tests/support/cookie-consent.ts'],
      [`${skillTpl}/tests/support/console-capture.ts.tmpl`, 'tests/support/console-capture.ts'],
      [`${skillTpl}/tests/support/network-capture.ts.tmpl`, 'tests/support/network-capture.ts'],
      [`${skillTpl}/tests/support/pii-mask.ts.tmpl`, 'tests/support/pii-mask.ts'],
      [`${skillTpl}/tests/e2e/smoke.spec.ts.tmpl`, 'tests/e2e/smoke.spec.ts'],
    ];
    for (const [src, dst] of filesToCopy) {
      copyTemplate(src, dst);
    }

    // 5. Create .env.e2e example
    const envExample = `# .env.e2e — local test credentials (add to .gitignore)
${userEmailEnv}=pwtest+user@example.test
${userPassEnv}=change-me-to-real-password
PWTEST_BASE_URL=${baseUrl}
`;
    writeFile(join(TARGET, '.env.e2e.example'), envExample);

    // 6. Suggest .gitignore additions
    const gitignoreAdditions = `
# playwright-enterprise-tester
/test-results
/playwright-report
/playwright/.auth
.env.e2e
`;
    if (fileExists(join(TARGET, '.gitignore'))) {
      const current = readFileSync(join(TARGET, '.gitignore'), 'utf8');
      if (!current.includes('playwright-enterprise-tester')) {
        if (!dryRun) {
          writeFileSync(join(TARGET, '.gitignore'), current + gitignoreAdditions);
          log('  appended to .gitignore');
        } else {
          log('[dry-run] would append to .gitignore');
        }
      }
    } else {
      writeFile(join(TARGET, '.gitignore'), gitignoreAdditions.trim() + '\n');
    }

    log('');
    log('========================================');
    log('  Installation complete');
    log('========================================');
    log('');
    log('Next steps:');
    log('');
    log('1. Install Playwright peer deps:');
    log('   npm install -D @playwright/test');
    log('   npx playwright install chromium');
    log('');
    if (enableAxe) log('2. Install @axe-core/playwright: npm install -D @axe-core/playwright');
    if (enablePerf) log('3. Install web-vitals: npm install -D web-vitals');
    if (enableCrossBrowser) log('4. Install additional browsers: npx playwright install webkit firefox');
    log('');
    log('5. Copy .env.e2e.example to .env.e2e and fill in real credentials');
    log('');
    log('6. In Claude Code, run:');
    log('   /playwright-tester mode=smoke');
    log('');
    log('7. Read the onboarding guide:');
    log(`   ${relative(TARGET, join(PLUGIN_ROOT, 'docs/ONBOARDING.md'))}`);
    log('');
    log('Happy testing!');
  } finally {
    rl.close();
  }
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
