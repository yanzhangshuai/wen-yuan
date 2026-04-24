# T21 Gold-Set Regression And Sample Acceptance Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on `dev_2`; do not create a new branch and do not start T20/T22.

**Goal:** Build reproducible gold-set fixtures, regression metrics, rollback-safe review-action checks, and report outputs for `儒林外史` and `三国演义` so later cutover and acceptance tasks can cite one evidence-first baseline.

**Architecture:** T21 is review-native. Fixtures use natural keys and short evidence snippets instead of DB UUIDs or screenshots. Runtime logic lives under `src/server/modules/review/evidence-review/regression/**`, while `scripts/review-regression/run-gold-set-regression.ts` stays a thin CLI wrapper. Current-state regression reads the existing review truth and projection surfaces; full-run versus incremental-rerun comparison rebuilds canonical snapshots from run-scoped claim rows plus T19 cost comparison, because projection tables do not keep run history.

**Tech Stack:** TypeScript strict, Prisma 7 existing schema, Zod, Vitest, Node CLI via `tsx`, existing T11 projection helpers, existing T12 review mutation/audit services, existing T19 cost comparison utilities.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §13.1, §13.2, §14.1, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Existing review/query/projection contracts to reuse:
  - `src/server/modules/review/evidence-review/review-query-service.ts`
  - `src/server/modules/review/evidence-review/review-mutation-service.ts`
  - `src/server/modules/review/evidence-review/review-audit-service.ts`
  - `src/server/modules/review/evidence-review/projections/index.ts`
  - `src/server/modules/review/evidence-review/projections/projection-builder.ts`
  - `src/server/modules/review/evidence-review/projections/types.ts`
  - `src/server/modules/review/evidence-review/costs/index.ts`
  - `scripts/review-regression/compare-rerun-costs.ts`
- Existing schema reality that constrains T21:
  - `prisma/schema.prisma`
  - claim tables are `runId` scoped
  - projection tables are current-state only
  - `EvidenceSpan` and `ChapterSegment` already preserve quoted text and segment references

## Preconditions

- T11, T12, T15, T16, T18, and T19 are already complete and green.
- T21 must not add Prisma migrations, new persistent tables, or a second truth model.
- T21 must not reuse `data/eval/goldset.schema.json` or `data/eval/goldset.v1.jsonl` as the review-native baseline. Those files describe an older evaluation shape and would hide the new review/projection contracts.
- Fixtures may contain only short evidence snippets already required for review traceability. Do not paste full copyrighted chapter text into JSON fixtures or markdown reports.
- `relationTypeKey` remains a plain string in fixtures, snapshots, reports, and metrics. T18 governs preset catalogs; T21 must not freeze relation types into a DB enum.
- If the local environment does not contain the required book data after `pnpm prisma:seed`, stop and record the blocker in the T21 task doc rather than fabricating reports.

## Execution Rules

- Follow strict TDD for every task: RED first, then minimal GREEN, then refactor only while staying green.
- Keep the CLI thin. Argument parsing, fixture loading, snapshot building, metrics, comparison, review-action harnessing, and report rendering all belong under `src/server/modules/review/evidence-review/regression/**`.
- Use natural keys in fixtures and report diffs:
  - `bookTitle`
  - `chapterNo`
  - `personaName`
  - `relationTypeKey`
  - `normalizedLabel`
  - `evidenceSnippet`
- Current-state regression must read the current review truth from existing review/projection data.
- Full-run versus incremental-rerun comparison must rebuild canonical snapshots from run-scoped claim rows plus T19 cost comparison. Do not compare historical outputs by reading projection tables directly.
- Review-action success rate must come from a rollback-safe harness that calls existing mutation services inside a transaction and guarantees no permanent DB writes after each scenario.
- Do not hardcode go/no-go thresholds in T21. The report must expose raw counts, percentages, and explicit mismatches. T20/T22 make cutover decisions.
- Update only the T21 task doc and the runbook after validation passes. Do not modify `.trellis/tasks/**` in this Superpowers-only flow.

## File Structure

- Create `src/server/modules/review/evidence-review/regression/contracts.ts`
  - Canonical fixture schemas, natural-key types, report DTOs, and value arrays.
- Create `src/server/modules/review/evidence-review/regression/contracts.test.ts`
  - Locks fixture validation rules and stable type/value modeling.
- Create `src/server/modules/review/evidence-review/regression/fixture-loader.ts`
  - Reads JSON fixtures from disk, validates them, and returns typed fixtures plus helpful error messages.
- Create `src/server/modules/review/evidence-review/regression/fixture-loader.test.ts`
  - Covers invalid JSON, duplicate natural keys, and both book fixtures.
- Create `src/server/modules/review/evidence-review/regression/snapshot-repository.ts`
  - Loads current review/projection rows, run-scoped claim rows, and evidence spans needed for canonical snapshots.
- Create `src/server/modules/review/evidence-review/regression/snapshot-repository.test.ts`
  - Covers natural-key resolution, stable ordering, and run-scoped reads without projection history assumptions.
- Create `src/server/modules/review/evidence-review/regression/snapshot-builder.ts`
  - Converts repository rows into canonical review snapshots and canonical run snapshots.
- Create `src/server/modules/review/evidence-review/regression/snapshot-builder.test.ts`
  - Covers canonical keys, evidence traceability, and run snapshot rebuilding via T11 helpers.
- Create `src/server/modules/review/evidence-review/regression/metrics.ts`
  - Calculates persona accuracy, relation stability, time usability, evidence traceability, and review-action success rate.
- Create `src/server/modules/review/evidence-review/regression/metrics.test.ts`
  - Locks percentage math, diff categorization, and zero-division behavior.
- Create `src/server/modules/review/evidence-review/regression/run-comparison.ts`
  - Compares full-run and rerun canonical snapshots and merges T19 cost comparison output.
- Create `src/server/modules/review/evidence-review/regression/run-comparison.test.ts`
  - Covers identical snapshots, added/removed keys, and optional cost comparison sections.
- Create `src/server/modules/review/evidence-review/regression/review-action-harness.ts`
  - Executes fixture review scenarios through `createReviewMutationService` inside forced-rollback transactions.
- Create `src/server/modules/review/evidence-review/regression/review-action-harness.test.ts`
  - Covers success/failure results, rollback guarantees, audit writes, and projection rebuild callbacks.
- Create `src/server/modules/review/evidence-review/regression/report.ts`
  - Renders markdown/json reports and computes deterministic artifact paths.
- Create `src/server/modules/review/evidence-review/regression/report.test.ts`
  - Locks report wording, artifact paths, and section ordering.
- Create `src/server/modules/review/evidence-review/regression/index.ts`
  - Re-exports the regression package.
- Create `scripts/review-regression/run-gold-set-regression.ts`
  - Thin CLI wrapper for fixture loading, regression execution, and report writing.
- Create `scripts/review-regression/run-gold-set-regression.test.ts`
  - Covers CLI argument parsing, usage errors, and top-level wiring.
- Create `tests/fixtures/review-regression/rulin-waishi.fixture.json`
  - `儒林外史` MVP fixture covering character recognition, chapter facts, identity confusion, and evidence jumps.
- Create `tests/fixtures/review-regression/sanguo-yanyi.fixture.json`
  - `三国演义` fixture covering relative/imprecise time, dynamic relations, and full-vs-rerun pressure cases.
- Create generated report directories under `docs/superpowers/reports/review-regression/**`
  - Each execution writes one timestamped directory with `summary.md` and `summary.json`.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md`
  - Mark checkpoints complete and append the execution record only after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Mark T21 complete only after validation passes.

## Fixture Modeling Decisions

Use one review-native fixture contract:

```ts
export interface ReviewRegressionFixture {
  fixtureKey: string;
  bookTitle: string;
  chapterRange: { startNo: number; endNo: number };
  personas: ReviewRegressionPersonaExpectation[];
  chapterFacts: ReviewRegressionChapterFactExpectation[];
  relations: ReviewRegressionRelationExpectation[];
  timeFacts: ReviewRegressionTimeExpectation[];
  reviewActions: ReviewRegressionActionScenario[];
}
```

Key rules:

- `fixtureKey` must be unique per JSON file and must be slug-safe because it becomes part of the report path.
- `relationTypeKey` is a string, not an enum. This keeps fixtures compatible with preset and custom relation types from T18.
- Every expectation must carry at least one `evidenceSnippet` and one `chapterNo`.
- Duplicate natural keys must be rejected at load time:
  - persona: `personaName`
  - chapter fact: `personaName + chapterNo + factLabel`
  - relation: `sourcePersonaName + targetPersonaName + relationTypeKey + direction + effectiveChapterStart + effectiveChapterEnd`
  - time fact: `personaName + normalizedLabel + chapterRangeStart + chapterRangeEnd`
  - review action: `scenarioKey`

Review-action scenarios should target natural keys, not UUIDs:

```ts
export interface ReviewRegressionActionScenario {
  scenarioKey: string;
  action:
    | "ACCEPT_CLAIM"
    | "REJECT_CLAIM"
    | "DEFER_CLAIM"
    | "EDIT_CLAIM"
    | "CREATE_MANUAL_CLAIM"
    | "RELINK_EVIDENCE"
    | "MERGE_PERSONA"
    | "SPLIT_PERSONA";
  target: {
    claimKind?: "EVENT" | "RELATION" | "TIME" | "IDENTITY";
    chapterNo?: number;
    personaName?: string;
    pair?: { sourcePersonaName: string; targetPersonaName: string; relationTypeKey?: string };
    evidenceSnippet?: string;
  };
  expected: {
    auditAction: string;
    projectionFamilies: string[];
  };
}
```

## Snapshot And Comparison Decisions

Canonical snapshots must be natural-keyed and diff-friendly:

```ts
export interface ReviewRegressionSnapshot {
  fixtureKey: string;
  bookTitle: string;
  chapterRange: { startNo: number; endNo: number };
  personas: Array<{ personaName: string; aliases: string[] }>;
  chapterFacts: Array<{ personaName: string; chapterNo: number; factLabel: string; evidenceSnippets: string[] }>;
  relations: Array<{
    sourcePersonaName: string;
    targetPersonaName: string;
    relationTypeKey: string;
    direction: string;
    effectiveChapterStart: number | null;
    effectiveChapterEnd: number | null;
    evidenceSnippets: string[];
  }>;
  timeFacts: Array<{
    personaName: string;
    normalizedLabel: string;
    timeSortKey: number | null;
    chapterRangeStart: number | null;
    chapterRangeEnd: number | null;
    evidenceSnippets: string[];
  }>;
}
```

Build two snapshot modes:

- `CURRENT_REVIEW`
  - Reads accepted/current review truth from existing claim/projection/evidence rows.
- `RUN_SCOPED`
  - Reads claim rows by `runId`, rebuilds the canonical projection view with:
    - `buildAcceptedPersonaMapping`
    - `buildPersonaChapterFacts`
    - `buildPersonaTimeFacts`
    - `buildRelationshipEdges`
    - `buildTimelineEvents`

Run comparison output must separate truth diff from cost diff:

```ts
export interface ReviewRegressionRunComparison {
  baselineRunId: string;
  candidateRunId: string;
  snapshotDiff: {
    identical: boolean;
    addedKeys: string[];
    removedKeys: string[];
    changedKeys: string[];
  };
  costComparison: ReturnType<typeof compareReviewRunCostSummaries> | null;
}
```

## Metric And Report Decisions

Metric outputs must be explicit and reusable by T20/T22:

```ts
export interface ReviewRegressionMetricSummary {
  personaAccuracy: { matched: number; missing: number; unexpected: number; accuracyPct: number | null };
  relationStability: { matched: number; missing: number; changed: number; stabilityPct: number | null };
  timeNormalizationUsability: { usable: number; unusable: number; usabilityPct: number | null };
  evidenceTraceability: { traced: number; untraced: number; traceabilityPct: number | null };
  reviewActionSuccessRate: { passed: number; failed: number; successPct: number | null };
}
```

Report output layout:

```text
docs/superpowers/reports/review-regression/<fixtureKey>-<YYYYMMDD-HHmmss>/
  summary.md
  summary.json
```

`summary.md` must include:

- command used
- fixture path
- book title and chapter range
- metric table
- missing/unexpected/changed natural keys
- review-action scenario results
- optional full-vs-rerun comparison section
- optional T19 cost comparison section

`summary.json` must include the same data in machine-readable form for T20/T22 references.

---

### Task 1: Fixture Contracts, Loader, And Two Book Fixtures

**Files:**
- Create: `src/server/modules/review/evidence-review/regression/contracts.ts`
- Create: `src/server/modules/review/evidence-review/regression/contracts.test.ts`
- Create: `src/server/modules/review/evidence-review/regression/fixture-loader.ts`
- Create: `src/server/modules/review/evidence-review/regression/fixture-loader.test.ts`
- Create: `tests/fixtures/review-regression/rulin-waishi.fixture.json`
- Create: `tests/fixtures/review-regression/sanguo-yanyi.fixture.json`

- [x] **Step 1: Write failing contract and loader tests**

Add tests proving that:

- fixture schemas reject:
  - empty `fixtureKey`
  - empty `bookTitle`
  - inverted chapter ranges
  - duplicate persona/fact/relation/time/action natural keys
  - empty `relationTypeKey`
  - empty `evidenceSnippet`
- `loadReviewRegressionFixture()` returns typed fixtures for:
  - `tests/fixtures/review-regression/rulin-waishi.fixture.json`
  - `tests/fixtures/review-regression/sanguo-yanyi.fixture.json`
- the `儒林外史` fixture contains:
  - at least one persona expectation
  - at least one chapter fact
  - at least one relation or identity-confusion pressure case
  - at least one review action scenario
- the `三国演义` fixture contains:
  - at least one time fact with imprecise or relative time
  - at least one dynamic relation case
  - at least one optional rerun comparison section input

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/contracts.test.ts \
  src/server/modules/review/evidence-review/regression/fixture-loader.test.ts \
  --coverage=false
```

- [x] **Step 2: Implement the fixture contract, loader, and both fixture files**

Implement:

- Zod-backed schemas and exported TS types in `contracts.ts`
- a loader that:
  - reads UTF-8 JSON from disk
  - validates the schema
  - normalizes snippet whitespace
  - throws natural-key-specific errors
- `rulin-waishi.fixture.json` with MVP coverage for:
  - persona recognition
  - chapter facts
  - one identity-confusion or misidentification case
  - evidence jump expectations
- `sanguo-yanyi.fixture.json` with coverage for:
  - time phases or battle-relative timing
  - direction-sensitive relations
  - one comparison-friendly rerun sample

Use this modeling pattern in `contracts.ts`:

```ts
export const reviewRegressionRelationExpectationSchema = z.object({
  sourcePersonaName: z.string().trim().min(1),
  targetPersonaName: z.string().trim().min(1),
  relationTypeKey: z.string().trim().min(1),
  direction: z.string().trim().min(1),
  effectiveChapterStart: z.number().int().positive().nullable(),
  effectiveChapterEnd: z.number().int().positive().nullable(),
  evidenceSnippets: z.array(z.string().trim().min(1)).min(1)
});
```

- [x] **Step 3: Re-run the contract and loader tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/contracts.test.ts \
  src/server/modules/review/evidence-review/regression/fixture-loader.test.ts \
  --coverage=false
```

Expected: all fixture validation and loader tests pass.

### Task 2: Snapshot Repository And Canonical Snapshot Builder

**Files:**
- Create: `src/server/modules/review/evidence-review/regression/snapshot-repository.ts`
- Create: `src/server/modules/review/evidence-review/regression/snapshot-repository.test.ts`
- Create: `src/server/modules/review/evidence-review/regression/snapshot-builder.ts`
- Create: `src/server/modules/review/evidence-review/regression/snapshot-builder.test.ts`

- [x] **Step 1: Write failing repository tests**

Add tests proving that the repository can:

- resolve `bookTitle` + `chapterRange` into live `bookId` and ordered chapter rows
- fail loudly when a fixture chapter range is missing from the current DB
- load current-state rows from existing review truth using only current tables:
  - accepted event/relation/time claims
  - `personaChapterFact`
  - `personaTimeFact`
  - `relationshipEdge`
  - `timelineEvent`
  - `EvidenceSpan`
  - `ChapterSegment`
- load run-scoped claim rows by `runId` without assuming historical projection rows exist
- return deterministic ordering for snapshot-friendly comparisons

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/snapshot-repository.test.ts \
  --coverage=false
```

- [x] **Step 2: Implement the repository**

Implement a minimal Prisma-backed repository that reads only existing models and exposes methods such as:

- `resolveFixtureContext(fixture)`
- `loadCurrentReviewRows(context)`
- `loadRunScopedClaimRows({ bookId, runId, chapterIds })`
- `loadEvidenceSpans(bookId, evidenceSpanIds)`

Constraints:

- use current tables only; do not invent a regression snapshot table
- preserve `quotedText` from `EvidenceSpan` for traceability
- keep run-scoped claim reads independent from projection tables
- return arrays pre-sorted for stable snapshot keys

- [x] **Step 3: Write failing snapshot-builder tests**

Add tests proving that the builder can:

- convert current review rows into canonical natural-key snapshots
- rebuild run-scoped snapshots from claim rows using T11 projection helpers
- attach evidence snippets to chapter facts, relations, and time facts
- exclude raw DB IDs from the final diff payloads
- preserve `relationTypeKey` strings exactly as stored

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/snapshot-builder.test.ts \
  --coverage=false
```

- [x] **Step 4: Implement the snapshot builder**

Implement:

- a current-state builder that canonicalizes existing accepted claims and projection surfaces
- a run-scoped builder that reconstructs projection truth from claim rows with:
  - `buildAcceptedPersonaMapping`
  - `buildPersonaChapterFacts`
  - `buildPersonaTimeFacts`
  - `buildRelationshipEdges`
  - `buildTimelineEvents`
- stable natural-key serializers for personas, chapter facts, relations, and time facts

Use the run-scoped build flow:

```ts
const acceptedPersonaMapping = buildAcceptedPersonaMapping({
  identityResolutionClaims,
  requiredPersonaCandidateIds
});

const relationshipEdges = buildRelationshipEdges({
  personaIdByCandidateId: acceptedPersonaMapping.personaIdByCandidateId,
  relationClaims
});
```

- [x] **Step 5: Re-run repository and snapshot-builder tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/snapshot-repository.test.ts \
  src/server/modules/review/evidence-review/regression/snapshot-builder.test.ts \
  --coverage=false
```

Expected: repository and builder tests both pass.

### Task 3: Metrics Engine And Full-Versus-Rerun Comparison

**Files:**
- Create: `src/server/modules/review/evidence-review/regression/metrics.ts`
- Create: `src/server/modules/review/evidence-review/regression/metrics.test.ts`
- Create: `src/server/modules/review/evidence-review/regression/run-comparison.ts`
- Create: `src/server/modules/review/evidence-review/regression/run-comparison.test.ts`

- [x] **Step 1: Write failing metrics and comparison tests**

Add tests proving that:

- persona accuracy reports `matched`, `missing`, `unexpected`, and `accuracyPct`
- relation stability compares source, target, `relationTypeKey`, direction, and effective chapter window
- time normalization usability reports facts as unusable when normalized label or chapter linkage is absent
- evidence traceability reports facts as untraced when no evidence snippet survives snapshot building
- review-action success rate accepts precomputed harness results and produces percentage math without division bugs
- run comparison:
  - reports `identical = true` when snapshots match
  - lists `addedKeys`, `removedKeys`, and `changedKeys` when they differ
  - includes T19 cost comparison when both summaries are supplied
  - omits cost comparison cleanly when run IDs are not supplied

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/metrics.test.ts \
  src/server/modules/review/evidence-review/regression/run-comparison.test.ts \
  --coverage=false
```

- [x] **Step 2: Implement the metrics and comparison layer**

Implement:

- `evaluateReviewRegressionFixture(expectedFixture, actualSnapshot, reviewActionSummary)`
- `compareReviewRegressionRuns({ baselineSnapshot, candidateSnapshot, baselineCostSummary, candidateCostSummary })`

Rules:

- return raw counts and explicit natural-key diffs
- round percentages consistently to one decimal place
- never fabricate a pass/fail threshold that is not present in the data
- keep `relationTypeKey` and `normalizedLabel` verbatim in mismatch output

- [x] **Step 3: Re-run metrics and comparison tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/metrics.test.ts \
  src/server/modules/review/evidence-review/regression/run-comparison.test.ts \
  --coverage=false
```

Expected: all metric and comparison tests pass.

### Task 4: Rollback-Safe Review Action Harness

**Files:**
- Create: `src/server/modules/review/evidence-review/regression/review-action-harness.ts`
- Create: `src/server/modules/review/evidence-review/regression/review-action-harness.test.ts`

- [x] **Step 1: Write failing review-action harness tests**

Add tests proving that the harness:

- resolves fixture scenarios to live targets through natural keys instead of hardcoded UUIDs
- runs `createReviewMutationService()` inside a transaction and always rolls back at the end of each scenario
- supports at least these actions:
  - `ACCEPT_CLAIM`
  - `REJECT_CLAIM`
  - `DEFER_CLAIM`
  - `EDIT_CLAIM`
  - `CREATE_MANUAL_CLAIM`
  - `RELINK_EVIDENCE`
  - `MERGE_PERSONA`
  - `SPLIT_PERSONA`
- records whether:
  - the mutation returned successfully
  - an audit log row would have been written
  - a projection rebuild was requested
- returns stable scenario-level results with failure reasons

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/review-action-harness.test.ts \
  --coverage=false
```

- [x] **Step 2: Implement the rollback-safe harness**

Implement:

- a transaction wrapper that runs one scenario and then forces rollback with a sentinel error
- a scenario resolver that can find target claims/personas by chapter number, persona name, pair, and evidence snippet
- result aggregation:
  - `passed`
  - `failed`
  - `scenarioResults[]`

Use the mutation service injection pattern already supported by T12:

```ts
const mutationService = createReviewMutationService({
  prismaClient: tx,
  auditService,
  projectionBuilder
});
```

Success criteria per scenario:

- the intended mutation path returns without domain error
- the expected audit action is emitted
- the expected projection families are requested for rebuild

- [x] **Step 3: Re-run the review-action harness tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/review-action-harness.test.ts \
  --coverage=false
```

Expected: all harness tests pass and prove rollback-safe execution.

### Task 5: Report Renderer, Package Index, And Thin CLI Runner

**Files:**
- Create: `src/server/modules/review/evidence-review/regression/report.ts`
- Create: `src/server/modules/review/evidence-review/regression/report.test.ts`
- Create: `src/server/modules/review/evidence-review/regression/index.ts`
- Create: `scripts/review-regression/run-gold-set-regression.ts`
- Create: `scripts/review-regression/run-gold-set-regression.test.ts`

- [x] **Step 1: Write failing report and CLI tests**

Add tests proving that:

- `renderReviewRegressionReport()` emits markdown with:
  - fixture metadata
  - metric table
  - mismatch sections
  - review-action scenario results
  - optional run-comparison and cost-comparison sections
- the report writer computes deterministic paths under `docs/superpowers/reports/review-regression/<fixtureKey>-<timestamp>/`
- CLI argument parsing supports:
  - `--fixture <path>`
  - `--report-dir <path>` optional
  - `--chapter-start <no>` optional
  - `--chapter-end <no>` optional
  - `--baseline-run <uuid>` optional
  - `--candidate-run <uuid>` optional
  - `--help`
- the CLI stays thin and delegates execution to the regression package

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/report.test.ts \
  scripts/review-regression/run-gold-set-regression.test.ts \
  --coverage=false
```

- [x] **Step 2: Implement the report layer, index, and thin CLI**

Implement:

- `report.ts` for markdown/json generation and directory writing
- `index.ts` that re-exports:
  - contracts
  - fixture loader
  - snapshot repository/builder
  - metrics
  - run comparison
  - review-action harness
  - report
- `run-gold-set-regression.ts` that:
  - parses args
  - loads the fixture
  - resolves current snapshot
  - optionally resolves baseline/candidate run snapshots
  - runs review-action scenarios
  - writes `summary.md` and `summary.json`
  - prints the generated artifact paths

Match the existing CLI style from `compare-rerun-costs.ts`:

```ts
export async function runGoldSetRegression(argv: string[]): Promise<number> {
  const parsedArgs = parseGoldSetRegressionArgs(argv);
  if (parsedArgs === null) {
    printUsage();
    return 0;
  }

  const regressionModule = await import("../../src/server/modules/review/evidence-review/regression/index.ts");
  // delegate to the package and disconnect prisma in finally
}
```

- [x] **Step 3: Re-run the report and CLI tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression/report.test.ts \
  scripts/review-regression/run-gold-set-regression.test.ts \
  --coverage=false
```

Expected: markdown/json rendering and CLI wiring tests pass.

### Task 6: Full Validation, Sample Reports, And T21 Closure

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Create during validation: `docs/superpowers/reports/review-regression/**`

- [x] **Step 1: Run the automated test matrix**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression \
  scripts/review-regression/run-gold-set-regression.test.ts \
  --coverage=false
pnpm type-check
pnpm exec eslint \
  src/server/modules/review/evidence-review/regression \
  scripts/review-regression/run-gold-set-regression.ts
```

Expected: all three commands pass.

- [x] **Step 2: Seed minimum local data and generate both sample reports**

Run:

```bash
pnpm prisma:seed
pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts \
  --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json \
  --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample
pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts \
  --fixture tests/fixtures/review-regression/sanguo-yanyi.fixture.json \
  --report-dir docs/superpowers/reports/review-regression/sanguo-yanyi-sample
```

Expected:

- both commands print `summary.md` and `summary.json` paths
- the generated reports can be cited later by T20 and T22

If either command fails because the target book data is missing locally, stop here, record the exact failing command and error in the T21 task doc, and do not mark T21 complete.

- [x] **Step 3: Update the task doc and runbook**

Only after Step 1 and Step 2 both pass:

- mark all T21 execution checkpoints complete in `21-gold-set-regression.md`
- append the T21 execution record with:
  - changed files
  - validation commands
  - seed command used
  - generated report paths
  - result
  - follow-up risks
  - next task
- mark T21 complete in the runbook
- set the next task to T20 because T20 explicitly depends on T21 report paths

- [x] **Step 4: Commit T21**

Run:

```bash
git add \
  src/server/modules/review/evidence-review/regression \
  scripts/review-regression/run-gold-set-regression.ts \
  scripts/review-regression/run-gold-set-regression.test.ts \
  tests/fixtures/review-regression \
  docs/superpowers/reports/review-regression \
  docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md \
  docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat(review): add gold-set regression baseline"
```

Expected: one commit contains the full T21 implementation, sample reports, and documentation closure.

## Final Validation Matrix

Run these before closing T21:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/regression \
  scripts/review-regression/run-gold-set-regression.test.ts \
  --coverage=false
pnpm type-check
pnpm exec eslint \
  src/server/modules/review/evidence-review/regression \
  scripts/review-regression/run-gold-set-regression.ts
pnpm prisma:seed
pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts \
  --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json \
  --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample
pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts \
  --fixture tests/fixtures/review-regression/sanguo-yanyi.fixture.json \
  --report-dir docs/superpowers/reports/review-regression/sanguo-yanyi-sample
```

Expected:

- unit tests, type-check, and lint are green
- both fixtures produce reproducible markdown/json reports
- current-state metrics are available for `儒林外史` and `三国演义`
- optional rerun comparison sections appear when baseline/candidate run IDs are supplied
- T21 can hand concrete report paths to T20/T22

Plan complete and saved to `docs/superpowers/plans/2026-04-23-t21-gold-set-regression-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
