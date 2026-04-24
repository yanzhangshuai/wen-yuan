# Review Regression Report: sanguo-yanyi-standard

Generated at: 2026-04-24T05:04:59.545Z
Command: `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/sanguo-yanyi.fixture.json --report-dir docs/superpowers/reports/review-regression/sanguo-yanyi-sample`

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

## Artifacts
- Markdown: docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md
- JSON: docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json