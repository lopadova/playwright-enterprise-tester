#!/usr/bin/env node
// swarm-orchestrator.mjs (P2.18)
// Orchestrates parallel sub-agents for test authoring by concern.
// This is a STUB script that produces the concern task specs.
// The actual sub-agent spawning happens in the Claude Code main thread
// via the Agent tool, reading this script's output as a plan.
//
// Usage:
//   node scripts/swarm-orchestrator.mjs --feature=checkout

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
const swarmConfig = config.swarmMode ?? {};

if (!swarmConfig.enabled) {
  console.log('swarmMode.enabled is false. Exiting.');
  process.exit(0);
}

const feature = args.feature;
if (!feature) {
  console.error('--feature is required (e.g., --feature=checkout)');
  process.exit(1);
}

const concerns = (swarmConfig.concerns ?? []).filter(c => c.enabled);
const maxConcurrent = swarmConfig.maxConcurrentAgents ?? 3;
const mergeStrategy = swarmConfig.mergeStrategy ?? 'concatenate-specs';

const agentTasks = concerns.map((concern, i) => ({
  agentIndex: i,
  concern: concern.name,
  tag: concern.tag,
  batchWave: Math.floor(i / maxConcurrent),
  outputFile: `tests/e2e/${feature}.${concern.name}.spec.ts`,
  prompt: `You are the ${concern.name} sub-agent for the playwright-enterprise-tester swarm.

Task: write Playwright E2E tests for the feature "${feature}" focusing on the "${concern.name}" concern.

Requirements:
- Tests must be tagged with: ${concern.tag}
- Output file: tests/e2e/${feature}.${concern.name}.spec.ts
- Read any existing tests/e2e/${feature}*.spec.ts to avoid duplicating scenarios
- Follow the skill's locator policy (getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > CSS)
- Follow the skill's async policy (no waitForTimeout, prefer UI contracts)
- Assert business outcomes, not implementation details
- Keep each test independent

Do NOT execute the tests. The orchestrator will run the combined suite after all concerns complete.

Return a JSON summary:
{
  "concern": "${concern.name}",
  "filesCreated": ["tests/e2e/${feature}.${concern.name}.spec.ts"],
  "scenarios": ["scenario 1", "scenario 2"],
  "assumptions": [],
  "openQuestions": []
}`
}));

const plan = {
  schemaVersion: 1,
  swarmRunId: `swarm-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
  ts: new Date().toISOString(),
  feature,
  mergeStrategy,
  maxConcurrentAgents: maxConcurrent,
  concernsEnabled: concerns.map(c => c.name),
  agentTasks,
  instructions: [
    `1. Main thread: use Agent tool to spawn sub-agents (subagent_type=playwright-enterprise-tester)`,
    `2. Spawn them in waves of ${maxConcurrent} at a time (batchWave field)`,
    `3. Pass each agent the 'prompt' field`,
    `4. Collect their return values into swarm-results.json`,
    `5. Merge spec files per ${mergeStrategy}`,
    `6. Run the combined suite: npx playwright test tests/e2e/${feature}.*.spec.ts`
  ]
};

mkdirSync('test-results', { recursive: true });
const planPath = 'test-results/swarm-plan.json';
writeFileSync(planPath, JSON.stringify(plan, null, 2));

console.log(`Swarm plan written to ${planPath}`);
console.log(`Feature: ${feature}`);
console.log(`Concerns enabled: ${plan.concernsEnabled.join(', ')}`);
console.log(`Total agents: ${agentTasks.length}`);
console.log(`Waves: ${Math.max(...agentTasks.map(t => t.batchWave)) + 1} (max ${maxConcurrent} concurrent)`);
console.log('\nNext step: main Claude thread reads this plan and spawns agents via the Agent tool.');
