# Review Regression Report: rulin-waishi-mvp

Generated at: 2026-04-24T05:04:51.089Z
Command: `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample`

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

## Artifacts
- Markdown: docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md
- JSON: docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json