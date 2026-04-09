# GDPR trace scrubber (P2.17)

Load when `gdprTraceScrubber.enabled=true`.

Post-run scrubber that opens `trace.zip` archives and removes PII from
captured network request/response bodies before artifacts are uploaded.

## Why

Phase 1 handles screenshot masking via `toHaveScreenshot({ mask: [...] })`
which hides PII visually in screenshots. But trace.zip contains the full
network log: request bodies, response bodies, cookies, headers. If PII
leaks into these, it can end up in GitHub Actions artifacts where
anyone with repo access can see it.

Phase 2 adds a scrubbing step that:
1. Reads trace.zip after the run
2. Finds all `.network` entries
3. Applies regex-based PII scrubbing to request/response bodies
4. Re-packs the trace.zip (or writes a `.scrubbed.zip` variant)

## Config

```json
"gdprTraceScrubber": {
  "enabled": false,
  "scrubOnRunnerModes": ["ci"],
  "scrubRequestBodies": true,
  "scrubResponseBodies": true,
  "piiPatterns": [
    { "name": "email",             "regex": "[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}" },
    { "name": "iban",              "regex": "[A-Z]{2}\\d{2}[A-Z0-9]{1,30}" },
    { "name": "italian-tax-code",  "regex": "[A-Z]{6}\\d{2}[A-Z]\\d{2}[A-Z]\\d{3}[A-Z]" },
    { "name": "credit-card",       "regex": "\\b(?:\\d[ -]*?){13,16}\\b" },
    { "name": "phone",             "regex": "\\+?\\d{1,3}[\\s-]?\\d{2,4}[\\s-]?\\d{3,4}[\\s-]?\\d{3,4}" }
  ],
  "scrubReplacement": "[REDACTED]",
  "scrubMetadataFields": ["authorization", "cookie", "set-cookie", "x-api-key"],
  "inPlace": false,
  "outputSuffix": ".scrubbed.zip",
  "dryRun": false
}
```

## How it works

1. Post-run hook runs `scripts/gdpr-trace-scrubber.mjs`
2. For each `test-results/artifacts/traces/*.zip`:
   a. Unzip to temp directory
   b. Find all `*.network` files (Playwright trace internal format)
   c. Parse network entries (JSONL)
   d. For each entry:
      - Scrub request headers matching `scrubMetadataFields`
      - Scrub response headers matching `scrubMetadataFields`
      - Apply regex patterns to request body
      - Apply regex patterns to response body
   e. Re-pack as new zip
   f. If `inPlace=true`, replace original; else write `.scrubbed.zip` variant

## Scrub process

### Headers

```
before:
  authorization: Bearer eyJhbGc...
  cookie: session=abc123; user_id=456

after:
  authorization: [REDACTED]
  cookie: [REDACTED]
```

### Request body

```json
// before
{"email":"user@example.com","password":"s3cr3t","card":"4111 1111 1111 1111"}

// after
{"email":"[REDACTED]","password":"s3cr3t","card":"[REDACTED]"}
```

Note: `password` is not in the PII patterns by default (passwords are
arguably not PII but secrets). Add a pattern if you want to scrub them:

```json
{ "name": "password", "regex": "\"password\"\\s*:\\s*\"[^\"]+\"" }
```

### Response body

Same process as request body. Applies to JSON, HTML, plain text.
Binary responses (images, videos) are left alone.

## Runner mode gating

`scrubOnRunnerModes: ["ci"]` — scrub only in CI mode. In local dev,
the trace is kept raw for debugging (dev already has access to the
data anyway).

## Dry run

```bash
node scripts/gdpr-trace-scrubber.mjs --dry-run --trace=test-results/artifacts/traces/cart-1.zip
```

Prints what would be scrubbed without writing. Useful for tuning regex
patterns.

## Output

```json
{
  "schemaVersion": 1,
  "ts": "2026-04-09T10:00:00Z",
  "filesScrubbed": 12,
  "scrubs": [
    {
      "file": "cart-1.zip",
      "entriesScrubbed": 45,
      "patternMatches": {
        "email": 8,
        "iban": 0,
        "credit-card": 2
      },
      "headersScrubbed": 24,
      "outputPath": "test-results/artifacts/traces/cart-1.scrubbed.zip"
    }
  ]
}
```

## Limitations

- Regex-based: may have false positives (e.g., a string that looks like
  an IBAN but isn't)
- Does NOT scrub binary content (images in multipart uploads)
- Does NOT scrub nested encoded data (base64 bodies, encrypted JWTs)
- Re-packing large trace.zip is CPU intensive

## Integration with CI

```yaml
- name: Scrub trace PII
  if: always() && failure()
  run: |
    node .claude/skills/playwright-enterprise-tester/scripts/gdpr-trace-scrubber.mjs \
      --trace-dir=test-results/artifacts/traces/ \
      --in-place

- name: Upload scrubbed artifacts
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: traces-scrubbed
    path: test-results/artifacts/traces/
```

## Privacy policy integration

Coordinate with your DPO (Data Protection Officer):
- Document which PII patterns are scrubbed
- Document where scrubbed artifacts are stored (GitHub Actions, S3)
- Document retention policy (GitHub default: 90 days)
- Document access controls (who can download CI artifacts)

## Phase 3 candidates

- ML-based PII detection (more accurate than regex)
- Format-aware scrubbing (HAR parser, gRPC, GraphQL)
- Scrub metadata embedded in screenshots (EXIF)
- Secure delete of original unscrubbed trace (if requested)
- Compliance dashboard showing scrub coverage
