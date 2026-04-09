#!/usr/bin/env node
// detect-stack.mjs
// Multi-stack autodetect helper. Output: JSON to stdout.
// Usage: node scripts/detect-stack.mjs [--root=<path>]

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);
const root = resolve(args.root ?? process.cwd());

function fileExists(p) { try { return statSync(p).isFile(); } catch { return false; } }
function dirExists(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

function readJsonSafe(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function detectPackageManager() {
  if (fileExists(join(root, 'bun.lock')) || fileExists(join(root, 'bun.lockb'))) return 'bun';
  if (fileExists(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(join(root, 'yarn.lock'))) return 'yarn';
  if (fileExists(join(root, 'package-lock.json'))) return 'npm';
  return 'npm';
}

function detectRuntime() {
  const hints = [];

  const composer = readJsonSafe(join(root, 'composer.json'));
  const hasLaravel = composer?.require?.['laravel/framework']
    || composer?.['require-dev']?.['laravel/framework'];

  const hasArtisan = fileExists(join(root, 'artisan'));
  const hasDomain = dirExists(join(root, 'app/Domain'));

  if (hasLaravel || hasArtisan) hints.push('laravel');

  if (fileExists(join(root, 'webpack.mix.js')) || fileExists(join(root, 'public/mix-manifest.json'))) {
    hints.push('laravel-mix');
  }

  if (
    fileExists(join(root, 'vite.config.js')) ||
    fileExists(join(root, 'vite.config.ts')) ||
    fileExists(join(root, 'vite.config.mjs')) ||
    fileExists(join(root, 'vite.config.cjs'))
  ) {
    hints.push('vite');
  }

  if (
    fileExists(join(root, 'wrangler.toml')) ||
    fileExists(join(root, 'wrangler.json')) ||
    fileExists(join(root, 'wrangler.jsonc'))
  ) {
    hints.push('cloudflare-worker');
  }

  if (
    fileExists(join(root, 'pnpm-workspace.yaml')) ||
    fileExists(join(root, 'turbo.json')) ||
    fileExists(join(root, 'nx.json'))
  ) {
    hints.push('monorepo');
  }

  const pkg = readJsonSafe(join(root, 'package.json'));
  if (pkg) hints.push('node');

  const hasLaravelProfile = hasLaravel && (hasDomain || fileExists(join(root, 'webpack.mix.js')));
  if (hasLaravelProfile) hints.push('laravel-profile');

  return { hints, hasLaravelProfile, composer, package: pkg };
}

function detectRunnerMode() {
  if (process.env.PWTEST_RUNNER_MODE) return process.env.PWTEST_RUNNER_MODE;
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') return 'ci';
  return 'local';
}

function detectPlaywright() {
  const present = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs']
    .some((f) => fileExists(join(root, f)));
  const testDir = dirExists(join(root, 'tests/e2e'));
  const pkg = readJsonSafe(join(root, 'package.json'));
  const hasDep = !!pkg?.devDependencies?.['@playwright/test'] || !!pkg?.dependencies?.['@playwright/test'];
  return { configPresent: present, testDirPresent: testDir, depInstalled: hasDep };
}

function detectEnvFiles() {
  const candidates = [
    '.env', '.env.local', '.env.development',
    '.env.test', '.env.testing', '.env.playwright', '.env.e2e'
  ];
  return candidates.filter((f) => fileExists(join(root, f)));
}

const result = {
  schemaVersion: 1,
  root,
  packageManager: detectPackageManager(),
  runtime: detectRuntime(),
  runnerMode: detectRunnerMode(),
  playwright: detectPlaywright(),
  envFilesFound: detectEnvFiles(),
  timestamp: new Date().toISOString(),
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
