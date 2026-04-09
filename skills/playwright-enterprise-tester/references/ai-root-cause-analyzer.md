# AI root cause analyzer (P2.10)

Load when `aiRootCauseAnalyzer.enabled=true`.

Uses the Anthropic Claude API to read trace.zip + source code + claude-report
for a failed test and propose root cause analysis with suggested fix patches.

## Why

Phase 1 classification playbooks cover common patterns deterministically.
For complex failures, a human reads the trace manually. Phase 2 adds an
optional AI layer that does the first pass analysis and proposes fixes,
saving developer time.

## Config

```json
"aiRootCauseAnalyzer": {
  "enabled": false,
  "apiProvider": "anthropic",
  "apiKeyEnvKey": "ANTHROPIC_API_KEY",
  "model": "claude-sonnet-4-6",
  "maxTokensPerAnalysis": 4000,
  "analyzeOnClassifications": ["app_bug", "flaky"],
  "includeSources": ["trace", "screenshot", "pageDom", "nearbySourceFiles"],
  "maxSourceFilesIncluded": 5,
  "outputPath": "test-results/ai-rca.json",
  "dryRun": false,
  "rateLimitPerHour": 20,
  "_cost_note": "Each analysis costs tokens. Use dryRun=true to preview without calling the API."
}
```

## How it works

1. After a failed run, `scripts/ai-root-cause.mjs` reads `claude-report.json`
2. Filters failures by `analyzeOnClassifications`
3. For each failure:
   a. Extracts the trace.zip and finds the failing step
   b. Captures the DOM snapshot at failure time
   c. Reads nearby source files (up to `maxSourceFilesIncluded`)
   d. Assembles a prompt with all context
   e. Calls the Claude API with the prompt
   f. Parses the response for root cause + suggested fix
4. Writes `test-results/ai-rca.json` with the analyses
5. Enriches `claude-report.json → failures[].aiAnalysis` with a summary

## Prompt template

```
You are a senior QA engineer analyzing a Playwright test failure. Based on
the following evidence, identify the root cause and propose a minimal fix.

## Test that failed
File: {file}:{line}
Title: {testTitle}
Classification (heuristic): {classification}

## Error message
{error}

## DOM snapshot at failure
{domSnippet}

## Nearby source files
{sourceExcerpts}

## Previous failures for this test
{historySummary}

## Task
1. Identify the most likely root cause (1 sentence)
2. Classify as: test_bug | app_bug | environment_bug | flaky (may differ
   from heuristic classification)
3. Propose a minimal fix as a code patch (unified diff format)
4. Estimate confidence (0-100%)

Respond in JSON:
{
  "rootCause": "...",
  "classification": "...",
  "suggestedFix": "...",
  "patch": "--- a/... \n+++ b/...",
  "confidence": 85,
  "reasoning": "..."
}
```

## Output schema

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-09T10:00:00Z",
  "model": "claude-sonnet-4-6",
  "totalAnalyses": 3,
  "totalTokensUsed": 12450,
  "estimatedCostUsd": 0.37,
  "analyses": [
    {
      "testId": "tests/e2e/cart.spec.ts::add to cart",
      "originalClassification": "flaky",
      "aiClassification": "test_bug",
      "rootCause": "Missing wait on cart counter update after async add",
      "suggestedFix": "Replace waitForTimeout(2000) with waitFor(getByTestId('cart-count').not.toHaveText(...))",
      "patch": "--- a/tests/e2e/cart.spec.ts\n+++ b/tests/e2e/cart.spec.ts\n@@ ...",
      "confidence": 92,
      "reasoning": "The trace shows..."
    }
  ]
}
```

## Governance

**The AI proposes, the human disposes.** The analyzer NEVER applies the
patch automatically. It only writes suggestions to the output file.

The `governance.fixAppCode` rules from phase 1 still apply: app code
changes require the 4-condition guardrail. AI-proposed patches are
subject to the same governance.

## Cost control

Each analysis costs tokens. For context:
- Input: ~3000 tokens (trace + DOM + source files)
- Output: ~500 tokens (analysis)
- Cost per analysis: ~$0.02-0.05 with Sonnet

Controls:
- `rateLimitPerHour: 20` — max 20 analyses per hour
- `maxTokensPerAnalysis: 4000` — hard cap on output
- `analyzeOnClassifications` — only analyze selected failure types
- `dryRun: true` — show what would be sent without calling

For CI, consider enabling only on failures in `critical-path` or
`release-gate` modes to limit cost.

## Privacy

The prompt includes:
- Test source code (sent to Claude API)
- DOM snapshot (may include user data if test was running with real data)
- Source file excerpts

**Do NOT enable on tests running against production data with real PII.**
In CI with `gdpr.maskPiiInArtifacts=true`, the DOM snapshot is scrubbed
via the same PII masking before being sent.

Check with your DPO (Data Protection Officer) before enabling in CI.

## Fallback

If the API call fails (rate limit, network, auth):
- Log the error
- Mark the failure as `aiAnalysis: null`
- Continue with the rest of the report
- Never block the build on AI analyzer errors

## Dry run

```bash
node scripts/ai-root-cause.mjs --dry-run
```

Prints the prompts that would be sent without actually calling the API.
Useful for:
- Estimating cost
- Reviewing the prompt quality
- Debugging input assembly

## Phase 3 candidates

- Fine-tuning on your repo's historical failures for better accuracy
- Multi-turn conversations for interactive debugging
- Integration with IDE for "analyze this failure" on-demand
- Caching analyses by error hash to avoid re-analyzing same failure
- Team feedback loop: devs rate AI suggestions, improve prompts
