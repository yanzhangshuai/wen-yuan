# Review Regression Report: rulin-waishi-mvp

Generated at: 2026-04-24T14:41:39.626Z
Command: `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample --baseline-run 1a000000-0000-4000-8000-000000000001 --candidate-run 1a000000-0000-4000-8000-000000000002`

## Fixture
- Fixture path: tests/fixtures/review-regression/rulin-waishi.fixture.json
- Book: 儒林外史
- Chapter range: 3-4

## Metrics
| Metric | Matched/Passed | Missing/Failed | Changed/Unexpected | Percent |
| --- | ---: | ---: | ---: | ---: |
| Persona accuracy | 3 | 0 | 0 | 100% |
| Relation stability | 2 | 0 | 0 | 100% |
| Time usability | 1 | 0 | 0 | 100% |
| Evidence traceability | 4 | 0 | 0 | 100% |
| Review action success | 2 | 0 | 0 | 100% |

## Mismatches
### Missing keys
- None

### Unexpected keys
- None

### Changed keys
- None

## Review Actions
| Scenario | Result | Audit action | Message |
| --- | --- | --- | --- |
| merge-title-alias-into-fan-jin | pass | MERGE_PERSONA | passed |
| defer-fan-jin-status-fact | pass | DEFER | passed |

## Run Comparison
- Runs: 1a000000-0000-4000-8000-000000000001 -> 1a000000-0000-4000-8000-000000000002
- Snapshot identical: yes
### Added keys
- None

### Removed keys
- None

### Changed keys
- None

## Cost Comparison
```json
{
  "baseline": {
    "runId": "1a000000-0000-4000-8000-000000000001",
    "bookId": "10000000-0000-4000-8000-000000000001",
    "trigger": "REVIEW_REGRESSION_SAMPLE",
    "scope": "FULL_BOOK",
    "rerunReason": null,
    "totals": {
      "promptTokens": 0,
      "completionTokens": 0,
      "totalTokens": 0,
      "estimatedCostMicros": "0",
      "durationMs": 0,
      "skippedCount": 0
    },
    "stages": [
      {
        "stageKey": "STAGE_A",
        "status": "SUCCEEDED",
        "chapterStartNo": 3,
        "chapterEndNo": 4,
        "promptTokens": 0,
        "completionTokens": 0,
        "totalTokens": 0,
        "estimatedCostMicros": "0",
        "durationMs": 0,
        "skippedCount": 0
      }
    ]
  },
  "candidate": {
    "runId": "1a000000-0000-4000-8000-000000000002",
    "bookId": "10000000-0000-4000-8000-000000000001",
    "trigger": "REVIEW_REGRESSION_SAMPLE",
    "scope": "FULL_BOOK",
    "rerunReason": null,
    "totals": {
      "promptTokens": 0,
      "completionTokens": 0,
      "totalTokens": 0,
      "estimatedCostMicros": "0",
      "durationMs": 0,
      "skippedCount": 0
    },
    "stages": [
      {
        "stageKey": "STAGE_A",
        "status": "SUCCEEDED",
        "chapterStartNo": 3,
        "chapterEndNo": 4,
        "promptTokens": 0,
        "completionTokens": 0,
        "totalTokens": 0,
        "estimatedCostMicros": "0",
        "durationMs": 0,
        "skippedCount": 0
      }
    ]
  },
  "delta": {
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0,
    "estimatedCostMicros": "0",
    "durationMs": 0,
    "skippedCount": 0
  },
  "savings": {
    "totalTokenSavingsPct": null,
    "costSavingsPct": null,
    "durationSavingsPct": null
  },
  "stageCoverage": {
    "baselineStageKeys": [
      "STAGE_A"
    ],
    "candidateStageKeys": [
      "STAGE_A"
    ],
    "skippedStageKeys": []
  }
}
```

## Artifacts
- Markdown: docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md
- JSON: docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json