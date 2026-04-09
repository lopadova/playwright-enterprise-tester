#!/usr/bin/env node
// ai-root-cause.mjs (P2.10)
// AI-powered root cause analysis via Anthropic Claude API.
// Uses fetch() directly (no child_process, no SDK dependency).
//
// Usage:
//   node scripts/ai-root-cause.mjs [--report=test-results/claude-report.json] [--dry-run]

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
const aiConfig = config.aiRootCauseAnalyzer ?? {};

if (!aiConfig.enabled) {
  console.log('aiRootCauseAnalyzer.enabled is false. Exiting.');
  process.exit(0);
}

const reportPath = resolve(args.report ?? 'test-results/claude-report.json');
const dryRun = args['dry-run'] === true || aiConfig.dryRun === true;
const apiKey = process.env[aiConfig.apiKeyEnvKey ?? 'ANTHROPIC_API_KEY'];
const model = aiConfig.model ?? 'claude-sonnet-4-6';
const maxTokens = aiConfig.maxTokensPerAnalysis ?? 4000;
const triggerOn = new Set(aiConfig.analyzeOnClassifications ?? ['app_bug', 'flaky']);

if (!existsSync(reportPath)) {
  console.error(`Report not found: ${reportPath}`);
  process.exit(1);
}
if (!dryRun && !apiKey) {
  console.error(`${aiConfig.apiKeyEnvKey} env var is required unless --dry-run is set`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const analyses = [];
let totalTokens = 0;

async function callClaude(prompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!resp.ok) {
    throw new Error(`API call failed: ${resp.status} ${await resp.text()}`);
  }
  return await resp.json();
}

function buildPrompt(failure) {
  return `You are a senior QA engineer analyzing a Playwright test failure.

## Test that failed
File: ${failure.file}${failure.line ? ':' + failure.line : ''}
Title: ${failure.title ?? failure.testId}
Heuristic classification: ${failure.classification}

## Error message
${(failure.error ?? 'No error message').slice(0, 1500)}

## Applied playbook
${failure.appliedPlaybook ?? 'none'}

## Task
Identify the most likely root cause and propose a minimal fix.

Respond in JSON only:
{
  "rootCause": "one sentence",
  "classification": "test_bug | app_bug | environment_bug | flaky",
  "suggestedFix": "short description",
  "confidence": 0-100,
  "reasoning": "your analysis"
}`;
}

const failuresToAnalyze = (report.failures ?? []).filter(f => triggerOn.has(f.classification));

for (const failure of failuresToAnalyze) {
  const prompt = buildPrompt(failure);
  if (dryRun) {
    console.log(`\n[DRY RUN] Would analyze: ${failure.testId}`);
    console.log(`  Prompt length: ${prompt.length} chars`);
    analyses.push({ testId: failure.testId, dryRun: true, promptLength: prompt.length });
    continue;
  }

  try {
    const result = await callClaude(prompt);
    const responseText = result.content?.[0]?.text ?? '';
    totalTokens += (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);

    let parsed = null;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch {}
    }

    analyses.push({
      testId: failure.testId,
      originalClassification: failure.classification,
      aiClassification: parsed?.classification ?? null,
      rootCause: parsed?.rootCause ?? null,
      suggestedFix: parsed?.suggestedFix ?? null,
      confidence: parsed?.confidence ?? null,
      reasoning: parsed?.reasoning ?? responseText.slice(0, 500)
    });

    console.log(`Analyzed: ${failure.testId} -> ${parsed?.classification ?? 'unparsed'}`);
  } catch (err) {
    console.error(`Analysis failed for ${failure.testId}: ${err.message}`);
    analyses.push({ testId: failure.testId, error: err.message });
  }
}

const output = {
  schemaVersion: 1,
  ts: new Date().toISOString(),
  model,
  dryRun,
  totalAnalyses: analyses.length,
  totalTokensUsed: totalTokens,
  analyses
};

const outputPath = resolve(aiConfig.outputPath ?? 'test-results/ai-rca.json');
mkdirSync(resolve(outputPath, '..'), { recursive: true });
writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`\nAnalyzed ${analyses.length} failure(s). Tokens used: ${totalTokens}`);
console.log(`Output: ${outputPath}`);
