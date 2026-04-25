# Review Regression Report: sanguo-yanyi-standard

Generated at: 2026-04-24T14:41:40.142Z
Command: `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/sanguo-yanyi.fixture.json --report-dir docs/superpowers/reports/review-regression/sanguo-yanyi-sample --baseline-run 2a000000-0000-4000-8000-000000000001 --candidate-run 2a000000-0000-4000-8000-000000000002`

## Fixture
- Fixture path: tests/fixtures/review-regression/sanguo-yanyi.fixture.json
- Book: 三国演义
- Chapter range: 21-43

## Metrics
| Metric | Matched/Passed | Missing/Failed | Changed/Unexpected | Percent |
| --- | ---: | ---: | ---: | ---: |
| Persona accuracy | 3 | 0 | 0 | 100% |
| Relation stability | 3 | 0 | 0 | 100% |
| Time usability | 2 | 0 | 0 | 100% |
| Evidence traceability | 7 | 0 | 0 | 100% |
| Review action success | 1 | 0 | 0 | 100% |

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
| edit-liu-cao-dynamic-relation | pass | EDIT | passed |

## Run Comparison
- Runs: 2a000000-0000-4000-8000-000000000001 -> 2a000000-0000-4000-8000-000000000002
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
    "runId": "2a000000-0000-4000-8000-000000000001",
    "bookId": "10000000-0000-4000-8000-000000000002",
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
        "chapterStartNo": 21,
        "chapterEndNo": 43,
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
    "runId": "2a000000-0000-4000-8000-000000000002",
    "bookId": "10000000-0000-4000-8000-000000000002",
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
        "chapterStartNo": 21,
        "chapterEndNo": 43,
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
- Markdown: docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md
- JSON: docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json