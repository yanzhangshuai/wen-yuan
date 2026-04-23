# T19 Incremental Rerun And Cost Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on `dev_2`; do not create a new branch and do not start T20/T21/T22.

**Goal:** Add evidence-review-specific incremental rerun planning, explainable rerun previews, and cost observability/comparison so small edits stop defaulting to full-book full-stage reruns.

**Architecture:** T19 does not replace the existing orchestration layer and does not mutate the legacy `src/server/modules/analysis/runs/retry-planner.ts` into a second architecture. Instead it adds an evidence-review rerun planner that understands dirty-set dimensions, minimum safe stage policies, local projection rebuild scopes, and explicit cache/invalidation metadata. Review mutations stay projection-only and local. Chapter text, KB, and relation-catalog changes produce explainable downstream stage plans. Cost APIs live under `/api/admin/review/**` and reuse T04 run/stage observability rather than extending the legacy `/api/admin/analysis-jobs/**` admin cost endpoint.

**Tech Stack:** TypeScript strict, Prisma 7 existing schema from T04, Next.js App Router admin routes, Zod, Vitest, existing T11 projection builder, existing T12 review mutation contracts, existing T15/T16 review admin route conventions.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §7, §10, §11, §13.2, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Existing execution and projection contracts to reuse:
  - `src/server/modules/analysis/runs/retry-planner.ts`
  - `src/server/modules/analysis/runs/run-service.ts`
  - `src/server/modules/analysis/runs/stage-run-service.ts`
  - `src/server/modules/review/evidence-review/projections/types.ts`
  - `src/server/modules/review/evidence-review/projections/projection-builder.ts`
  - `src/server/modules/review/evidence-review/review-mutation-service.ts`
- Existing admin route conventions to match:
  - `src/app/api/admin/review/_shared.ts`
  - `src/app/api/admin/review/persona-chapter-matrix/route.ts`
  - `src/app/api/admin/review/persona-time-matrix/route.ts`
  - `src/app/api/admin/analysis-jobs/[jobId]/cost-summary/route.ts`

## Preconditions

- T04 already created the required observability fields on `AnalysisRun`, `AnalysisStageRun`, and `LlmRawOutput`.
- T11 `projection-builder.ts` already supports local rebuild scopes:
  - `FULL_BOOK`
  - `CHAPTER`
  - `PERSONA`
  - `TIME_SLICE`
  - `RELATION_EDGE`
  - `PROJECTION_ONLY`
- T12 `review-mutation-service.ts` already performs direct local projection rebuild after manual review mutations. T19 must not reintroduce LLM reruns for those actions.
- T19 is not allowed to add a new Prisma model or migration just to store rerun plans or cost comparisons. Cache/invalidation metadata lives in DTOs and services for now.
- T19 is not allowed to break or replace the legacy `analysis-jobs` cost-summary route. The new cost surface is review-specific and additive.

## Execution Rules

- Follow strict TDD for every task: write a failing test, observe RED, implement the minimum code, verify GREEN, then refactor while staying green.
- Keep the old `src/server/modules/analysis/runs/retry-planner.ts` as the lightweight failed-stage retry helper introduced in T04. T19 adds a separate evidence-review planner under `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/**`.
- Do not build a new top-level orchestrator in T19. This task is about planning, explaining, and comparing rerun scope, not about replacing `runAnalysisJob`.
- Review mutations must never plan Stage A/A+/B/B.5/C reruns. They must resolve to projection-only local rebuild plans.
- Reuse `ProjectionRebuildScope` from T11 instead of inventing a second local projection-scope model.
- Use existing T04 hashes and stage metadata when available. If required dirty-set inputs are unavailable from current schema or services, stop and record the blocker rather than guessing.
- Cost summary and comparison APIs must be explainable:
  - token usage
  - monetary cost
  - stage duration
  - skipped counts
  - rerun reason label
  - full run vs incremental rerun comparison
- Because T19 does not add new persistent rerun-reason tables, `rerunReason` in historical cost summaries is a normalized label derived from existing run metadata and stage coverage. The authoritative full reasoning lives in the rerun-plan preview DTO.
- Prefer route-local auth/envelope patterns already used by `/api/admin/review/**`.
- Update the T19 task doc and runbook only after all validation commands pass.
- Make one T19 commit only after code, tests, task doc, and runbook are all green.

## File Structure

- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/types.ts`
  - Canonical change kinds, dirty-set shapes, stage keys, plan DTOs, and helper value arrays.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/types.test.ts`
  - Lock value arrays, DTO discriminants, and stable modeling rules.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy.ts`
  - Map change kinds to minimum required stages and projection families.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy.test.ts`
  - Cover review mutation, chapter text, KB change, and relation-catalog policy.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set.ts`
  - Build and normalize dirty-set dimensions from change payloads.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set.test.ts`
  - Cover dimension derivation, dedupe, ordering, and display-only relation-catalog behavior.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository.ts`
  - Read chapter metadata, latest successful run/stage summaries, and stage hash metadata needed for explainable plans.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository.test.ts`
  - Cover repository delegate contracts and null-safe behavior.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.ts`
  - Build explainable rerun plans from change input + dirty set + stage policy + repository metadata.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.test.ts`
  - Cover all required planning scenarios and cache/invalidation metadata.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.ts`
  - Convert internal plan details into reviewer/admin-friendly reason lines and affected-range summaries.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.test.ts`
  - Lock human-readable explanation output.
- Create `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/index.ts`
  - Re-export the planner package.
- Create `src/server/modules/review/evidence-review/costs/types.ts`
  - Review-facing cost summary/comparison DTOs.
- Create `src/server/modules/review/evidence-review/costs/cost-summary-service.ts`
  - Aggregate one run's stage usage, durations, skipped counts, and derived rerun reason label.
- Create `src/server/modules/review/evidence-review/costs/cost-summary-service.test.ts`
  - Cover token/cost aggregation, duration math, null-cost handling, and rerun reason derivation.
- Create `src/server/modules/review/evidence-review/costs/cost-comparison-service.ts`
  - Compare baseline full run vs candidate incremental run.
- Create `src/server/modules/review/evidence-review/costs/cost-comparison-service.test.ts`
  - Cover savings math, null baselines, and stage coverage differences.
- Create `src/server/modules/review/evidence-review/costs/report.ts`
  - Render a compact CLI/report summary for regression use.
- Create `src/server/modules/review/evidence-review/costs/report.test.ts`
  - Lock report wording and percentage formatting.
- Create `src/server/modules/review/evidence-review/costs/index.ts`
  - Re-export the costs package.
- Create `src/app/api/admin/review/rerun-plan/route.ts`
  - `POST` route that validates a change payload and returns an explainable rerun plan.
- Create `src/app/api/admin/review/rerun-plan/route.test.ts`
  - Cover auth, validation, and planner delegation.
- Create `src/app/api/admin/review/cost-summary/route.ts`
  - `GET` route that returns one review run's cost summary.
- Create `src/app/api/admin/review/cost-summary/route.test.ts`
  - Cover auth, query parsing, not-found handling, and service delegation.
- Create `src/app/api/admin/review/cost-comparison/route.ts`
  - `GET` route that compares a baseline run with an incremental candidate run.
- Create `src/app/api/admin/review/cost-comparison/route.test.ts`
  - Cover auth, query parsing, and comparison payload shape.
- Create `scripts/review-regression/compare-rerun-costs.ts`
  - Thin CLI wrapper that prints the tested comparison report for a baseline and candidate run pair.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`
  - Mark checkpoints and append execution record only after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Mark T19 complete only after validation passes.

## Rerun Modeling Decisions

Use one explicit change-input union. Do not overload the old retry-plan types:

```ts
export type EvidenceReviewRerunChange =
  | {
      changeKind: "REVIEW_MUTATION";
      bookId: string;
      reason: string;
      runId?: string | null;
      claimFamilies?: string[];
      projectionScopes: ProjectionRebuildScope[];
      projectionFamilies?: ProjectionFamily[];
    }
  | {
      changeKind: "CHAPTER_TEXT_CHANGE";
      bookId: string;
      reason: string;
      previousRunId?: string | null;
      chapterIds: string[];
      segmentIds?: string[];
    }
  | {
      changeKind: "KNOWLEDGE_BASE_CHANGE";
      bookId: string;
      reason: string;
      previousRunId?: string | null;
      kbChangeKinds: Array<
        "ALIAS_RULE"
        | "PERSONA_HINT"
        | "RELATION_NORMALIZATION"
        | "BAN_MERGE_HINT"
      >;
      affectedEntryIds: string[];
    }
  | {
      changeKind: "RELATION_CATALOG_CHANGE";
      bookId: string;
      reason: string;
      previousRunId?: string | null;
      relationTypeKeys: string[];
      impactMode: "DISPLAY_ONLY" | "NORMALIZATION_RULE";
    };
```

Dirty-set dimensions must be first-class and stable:

```ts
export interface EvidenceReviewDirtySet {
  bookId: string;
  runIds: string[];
  chapterIds: string[];
  segmentIds: string[];
  claimFamilies: string[];
  personaCandidateIds: string[];
  projectionSlices: ProjectionRebuildScope[];
  projectionFamilies: ProjectionFamily[];
}
```

The plan DTO must separate execution mode from projection-scope kind:

```ts
export interface EvidenceReviewRerunPlan {
  bookId: string;
  changeKind: EvidenceReviewRerunChange["changeKind"];
  executionMode: "PROJECTION_ONLY" | "PIPELINE_RERUN";
  reason: string;
  expectedStages: string[];
  affectedRange: {
    runIds: string[];
    chapterIds: string[];
    chapterNos: number[];
    segmentIds: string[];
    claimFamilies: string[];
    personaCandidateIds: string[];
    projectionScopes: ProjectionRebuildScope[];
    projectionFamilies: ProjectionFamily[];
  };
  stagePlans: Array<{
    stageKey: string;
    scopeKind: "LOCAL_CHAPTER" | "FULL_BOOK" | "PROJECTION_REBUILD";
    chapterIds: string[];
    preservePreviousOutputs: boolean;
  }>;
  cache: {
    invalidateStageKeys: string[];
    preserveStageKeys: string[];
    invalidatedProjectionFamilies: ProjectionFamily[];
    comparableBaselineRunId: string | null;
  };
  explanation: {
    summary: string;
    lines: string[];
  };
}
```

Stage policy rules must be hard-coded and covered by tests:

- `REVIEW_MUTATION`
  - execution mode: `PROJECTION_ONLY`
  - expected stages: `["STAGE_D"]`
  - rebuild scope: local `ProjectionRebuildScope[]` supplied by caller
- `CHAPTER_TEXT_CHANGE`
  - local extraction: `STAGE_0`, `STAGE_A`, `STAGE_A_PLUS`
  - whole-book resolution chain: `STAGE_B`, `STAGE_B5`, `STAGE_C`, `STAGE_D`
- `KNOWLEDGE_BASE_CHANGE`
  - start at `STAGE_A_PLUS`
  - then `STAGE_B`, `STAGE_B5`, `STAGE_C`, `STAGE_D`
- `RELATION_CATALOG_CHANGE`
  - `DISPLAY_ONLY`: projection-only rebuild of `relationship_edges`
  - `NORMALIZATION_RULE`: `STAGE_A_PLUS`, `STAGE_B`, `STAGE_B5`, `STAGE_C`, `STAGE_D`

## Cost Modeling Decisions

T19 adds review-native cost DTOs instead of reusing the legacy analysis-job admin payload:

```ts
export interface ReviewRunCostSummaryDto {
  runId: string;
  bookId: string;
  trigger: string;
  scope: string;
  rerunReason: string | null;
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostMicros: bigint;
    durationMs: number;
    skippedCount: number;
  };
  stages: Array<{
    stageKey: string;
    status: string;
    chapterStartNo: number | null;
    chapterEndNo: number | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostMicros: bigint;
    durationMs: number;
    skippedCount: number;
  }>;
}

export interface ReviewRunCostComparisonDto {
  baseline: ReviewRunCostSummaryDto;
  candidate: ReviewRunCostSummaryDto;
  delta: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostMicros: bigint;
    durationMs: number;
    skippedCount: number;
  };
  savings: {
    totalTokenSavingsPct: number | null;
    costSavingsPct: number | null;
    durationSavingsPct: number | null;
  };
  stageCoverage: {
    baselineStageKeys: string[];
    candidateStageKeys: string[];
    skippedStageKeys: string[];
  };
}
```

Reason derivation rules:

- Use `AnalysisRun.trigger` first.
- Refine with observed stage coverage when possible.
- Return reviewer-friendly labels such as:
  - `Projection-only rebuild`
  - `Chapter-local extraction + full-book resolution`
  - `Knowledge-base driven re-resolution`
  - `Relation catalog display refresh`
- If no safe label can be derived, return `null` instead of inventing a false explanation.

## Route Decisions

Add review-admin routes only:

- `POST /api/admin/review/rerun-plan`
  - body: `EvidenceReviewRerunChange`
  - response: `EvidenceReviewRerunPlan`
- `GET /api/admin/review/cost-summary?runId=...`
  - response: `ReviewRunCostSummaryDto`
- `GET /api/admin/review/cost-comparison?baselineRunId=...&candidateRunId=...`
  - response: `ReviewRunCostComparisonDto`

Do not add these concerns to `review-api-schemas.ts`. They are admin control-plane routes, not claim-edit/query routes.

---

### Task 1: Rerun Planner Contracts And Stage Policy

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/types.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/index.ts`

- [ ] **Step 1: Write failing contract and policy tests**

Add tests proving that:

- the stable rerun stage universe is exactly:
  - `STAGE_0`
  - `STAGE_A`
  - `STAGE_A_PLUS`
  - `STAGE_B`
  - `STAGE_B5`
  - `STAGE_C`
  - `STAGE_D`
- `EvidenceReviewRerunChange` is modeled as the four explicit change kinds above
- `REVIEW_MUTATION` maps to projection-only execution and `["STAGE_D"]`
- `CHAPTER_TEXT_CHANGE` maps to `STAGE_0/A/A_PLUS/B/B5/C/D`
- `KNOWLEDGE_BASE_CHANGE` maps to `STAGE_A_PLUS/B/B5/C/D`
- `RELATION_CATALOG_CHANGE` with `DISPLAY_ONLY` maps to projection-only `relationship_edges`
- `RELATION_CATALOG_CHANGE` with `NORMALIZATION_RULE` maps to `STAGE_A_PLUS/B/B5/C/D`

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/types.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the minimum contract and policy layer**

Implement:

- exported stable value arrays for change kinds and stage keys
- plan DTO types
- stage-policy helpers that return execution mode, expected stages, and affected projection families

Do not add repository access or explanation formatting yet.

- [ ] **Step 3: Re-run the contract tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/types.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy.test.ts \
  --coverage=false
```

Expected: all tests pass.

### Task 2: Dirty-Set Builder

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set.test.ts`

- [ ] **Step 1: Write failing dirty-set tests**

Add tests proving that the dirty-set builder:

- preserves local `projectionScopes` for `REVIEW_MUTATION`
- deduplicates and stable-sorts `chapterIds`, `segmentIds`, `claimFamilies`, and `projectionFamilies`
- records `runId` or `previousRunId` when present
- builds `projectionFamilies = ["relationship_edges"]` for display-only relation-catalog changes
- does not silently create fake `personaCandidateIds` or fake `segmentIds`

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the minimum dirty-set builder**

Implement a pure builder that accepts `EvidenceReviewRerunChange` and returns a normalized `EvidenceReviewDirtySet`.

Rules:

- `projectionSlices` must retain caller-supplied local scopes for `REVIEW_MUTATION`
- `chapterIds`/`segmentIds` remain empty arrays when the payload does not provide them
- `RELATION_CATALOG_CHANGE` with `DISPLAY_ONLY` must not mark LLM-stage dirty ranges
- all returned arrays must be deterministic for snapshot-friendly tests

- [ ] **Step 3: Re-run the dirty-set tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set.test.ts \
  --coverage=false
```

Expected: all tests pass.

### Task 3: Repository For Chapter Metadata And Baseline Run Context

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add tests proving that the repository can:

- load chapter numbers for a set of `chapterIds`
- load the latest successful run for a book, or `null`
- load latest successful stage runs for a run and stage-key set
- expose `inputHash`, `outputHash`, `chapterStartNo`, `chapterEndNo`, token metrics, and skipped counts
- behave safely when delegates are absent in lightweight unit tests

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the repository**

Implement a minimal Prisma-backed repository that reads only existing tables:

- `chapter`
- `analysisRun`
- `analysisStageRun`

Do not write new tables and do not add mutation behavior.

- [ ] **Step 3: Re-run the repository tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository.test.ts \
  --coverage=false
```

Expected: all tests pass.

### Task 4: Core Planner For Review Mutation And Chapter Text Change

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.test.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.test.ts`

- [ ] **Step 1: Write failing planner tests for review mutation and chapter text**

Add tests proving that:

- a `REVIEW_MUTATION` plan:
  - returns `executionMode = "PROJECTION_ONLY"`
  - returns `expectedStages = ["STAGE_D"]`
  - keeps the exact local `projectionScopes`
  - invalidates only projection families
  - preserves prior upstream stage outputs
- a `CHAPTER_TEXT_CHANGE` plan:
  - returns `executionMode = "PIPELINE_RERUN"`
  - plans `STAGE_0`, `STAGE_A`, `STAGE_A_PLUS` as local chapter work
  - plans `STAGE_B`, `STAGE_B5`, `STAGE_C`, `STAGE_D` as whole-book follow-up
  - includes `chapterNos` from repository metadata
  - explains why chapter-local extraction still requires whole-book resolution

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the minimum planner and explanation formatter**

Implement:

- `createEvidenceReviewRerunPlanner`
- internal stage-plan construction
- cache/invalidation metadata
- human-readable explanation summary and lines

Do not implement KB/relation-catalog special cases yet beyond stubs required to compile.

- [ ] **Step 3: Re-run the planner tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.test.ts \
  --coverage=false
```

Expected: review-mutation and chapter-text cases are green.

### Task 5: Extend Planner For KB Change And Relation Catalog Change

**Files:**
- Modify: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.test.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.test.ts`

- [ ] **Step 1: Write failing tests for KB and relation-catalog scenarios**

Add tests proving that:

- `KNOWLEDGE_BASE_CHANGE` starts at `STAGE_A_PLUS` and never backtracks into `STAGE_0`
- KB changes explain that alias/normalization recall changed while raw chapter text did not
- `RELATION_CATALOG_CHANGE` with `DISPLAY_ONLY` plans projection-only `relationship_edges` rebuild
- `RELATION_CATALOG_CHANGE` with `NORMALIZATION_RULE` plans `STAGE_A_PLUS/B/B5/C/D`
- plan explanations mention affected relation type keys for catalog changes

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the remaining planner behavior**

Extend the planner so that:

- KB changes generate whole-book downstream resolution plans from `STAGE_A_PLUS`
- display-only relation-catalog changes rebuild only `relationship_edges`
- normalization-rule relation-catalog changes rerun from `STAGE_A_PLUS`
- cache metadata explicitly lists preserved stage keys vs invalidated stage keys

- [ ] **Step 3: Re-run the rerun-planner suite**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner \
  --coverage=false
```

Expected: the full rerun-planner package passes.

- [ ] **Step 4: Review checkpoint**

Before moving to cost services, confirm:

- no Prisma schema or migration files changed
- no edits were made to `src/server/modules/review/evidence-review/review-mutation-service.ts`
- no edits were made to `src/server/modules/analysis/jobs/runAnalysisJob.ts`

Run:

```bash
git diff --name-only -- prisma src/server/modules/review/evidence-review/review-mutation-service.ts src/server/modules/analysis/jobs/runAnalysisJob.ts
```

Expected: only the new rerun-planner files appear.

### Task 6: Review Run Cost Summary Service

**Files:**
- Create: `src/server/modules/review/evidence-review/costs/types.ts`
- Create: `src/server/modules/review/evidence-review/costs/cost-summary-service.ts`
- Create: `src/server/modules/review/evidence-review/costs/cost-summary-service.test.ts`
- Create: `src/server/modules/review/evidence-review/costs/index.ts`

- [ ] **Step 1: Write failing cost-summary tests**

Add tests proving that the summary service:

- loads one run plus its stage runs
- aggregates prompt/completion/total tokens
- sums `estimatedCostMicros`
- computes stage duration from `startedAt`/`finishedAt`
- sums `skippedCount`
- derives a safe `rerunReason` label from trigger + stage coverage
- returns `null` instead of a fake reason when metadata is insufficient

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/costs/cost-summary-service.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the cost-summary service**

Use existing `analysisRun` and `analysisStageRun` rows only. Do not add a new write path.

Rules:

- prefer run-level token totals when present
- still expose stage-level rows for explainability
- when run-level totals are zero but stage rows have values, derive totals from stage rows
- keep bigint monetary fields as bigint inside the server-side DTO layer

- [ ] **Step 3: Re-run the cost-summary tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/costs/cost-summary-service.test.ts \
  --coverage=false
```

Expected: all tests pass.

### Task 7: Cost Comparison Service And Report Renderer

**Files:**
- Create: `src/server/modules/review/evidence-review/costs/cost-comparison-service.ts`
- Create: `src/server/modules/review/evidence-review/costs/cost-comparison-service.test.ts`
- Create: `src/server/modules/review/evidence-review/costs/report.ts`
- Create: `src/server/modules/review/evidence-review/costs/report.test.ts`
- Modify: `src/server/modules/review/evidence-review/costs/index.ts`

- [ ] **Step 1: Write failing comparison and report tests**

Add tests proving that:

- comparison uses two `ReviewRunCostSummaryDto` inputs
- delta fields are candidate minus baseline
- savings percentages are `null` when baseline totals are zero
- stage coverage lists baseline stage keys, candidate stage keys, and skipped stage keys
- the report renderer prints:
  - baseline reason
  - candidate reason
  - token/cost/duration delta
  - savings percentages when available

Run RED:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/costs/cost-comparison-service.test.ts \
  src/server/modules/review/evidence-review/costs/report.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the comparison and report helpers**

Implement pure helpers only. Do not add route code yet.

- [ ] **Step 3: Re-run the comparison and report tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/costs/cost-comparison-service.test.ts \
  src/server/modules/review/evidence-review/costs/report.test.ts \
  --coverage=false
```

Expected: all tests pass.

### Task 8: Admin Routes For Rerun Plan And Cost Controls

**Files:**
- Create: `src/app/api/admin/review/rerun-plan/route.ts`
- Create: `src/app/api/admin/review/rerun-plan/route.test.ts`
- Create: `src/app/api/admin/review/cost-summary/route.ts`
- Create: `src/app/api/admin/review/cost-summary/route.test.ts`
- Create: `src/app/api/admin/review/cost-comparison/route.ts`
- Create: `src/app/api/admin/review/cost-comparison/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests proving that:

- all three routes require admin auth
- `POST /api/admin/review/rerun-plan` validates the discriminated change payload and delegates to the planner
- `GET /api/admin/review/cost-summary` requires `runId`
- `GET /api/admin/review/cost-comparison` requires both `baselineRunId` and `candidateRunId`
- route envelopes match the existing `/api/admin/review/**` format

Run RED:

```bash
pnpm exec vitest run \
  src/app/api/admin/review/rerun-plan/route.test.ts \
  src/app/api/admin/review/cost-summary/route.test.ts \
  src/app/api/admin/review/cost-comparison/route.test.ts \
  --coverage=false
```

- [ ] **Step 2: Implement the routes**

Rules:

- match the existing `requestId` / `startedAt` / `okJson` / `failJson` conventions
- keep Zod validation local to these routes or a route-local helper
- do not modify `review-api-schemas.ts`
- do not touch `/api/admin/analysis-jobs/[jobId]/cost-summary`

- [ ] **Step 3: Re-run the route tests**

Run:

```bash
pnpm exec vitest run \
  src/app/api/admin/review/rerun-plan/route.test.ts \
  src/app/api/admin/review/cost-summary/route.test.ts \
  src/app/api/admin/review/cost-comparison/route.test.ts \
  --coverage=false
```

Expected: all route tests pass.

- [ ] **Step 4: Review checkpoint**

Run:

```bash
git diff --name-only -- src/app/api/admin/analysis-jobs
```

Expected: no changes under the legacy analysis-job admin route tree.

### Task 9: Regression Script, Validation, And Task Closure

**Files:**
- Create: `scripts/review-regression/compare-rerun-costs.ts`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Add the CLI script**

Create a thin wrapper around the tested comparison/report helpers.

Required CLI arguments:

- `--baseline-run <uuid>`
- `--candidate-run <uuid>`

Behavior:

- load both summaries through the new cost services
- print the report text from `report.ts`
- exit non-zero on missing args or missing runs

- [ ] **Step 2: Verify the script interface**

Run:

```bash
pnpm exec ts-node --esm scripts/review-regression/compare-rerun-costs.ts --help
```

Expected: help/usage output is printed without type or import failures.

- [ ] **Step 3: Run the package-level targeted test suites**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner \
  src/server/modules/review/evidence-review/costs \
  src/app/api/admin/review/rerun-plan/route.test.ts \
  src/app/api/admin/review/cost-summary/route.test.ts \
  src/app/api/admin/review/cost-comparison/route.test.ts \
  --coverage=false
```

Expected: all T19-related tests pass.

- [ ] **Step 4: Run lint and type-check for the touched surface**

Run:

```bash
pnpm exec eslint \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner \
  src/server/modules/review/evidence-review/costs \
  src/app/api/admin/review/rerun-plan/route.ts \
  src/app/api/admin/review/rerun-plan/route.test.ts \
  src/app/api/admin/review/cost-summary/route.ts \
  src/app/api/admin/review/cost-summary/route.test.ts \
  src/app/api/admin/review/cost-comparison/route.ts \
  src/app/api/admin/review/cost-comparison/route.test.ts \
  scripts/review-regression/compare-rerun-costs.ts
pnpm type-check
```

Expected: both commands pass.

- [ ] **Step 5: Update task doc and runbook**

Only after all validation passes:

- mark all T19 execution checkpoints complete in `19-incremental-rerun-cost-controls.md`
- append the T19 execution record with:
  - changed files
  - validation commands
  - result
  - follow-up risks
  - next task
- mark T19 complete in the runbook

- [ ] **Step 6: Commit T19**

Run:

```bash
git add \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner \
  src/server/modules/review/evidence-review/costs \
  src/app/api/admin/review/rerun-plan \
  src/app/api/admin/review/cost-summary \
  src/app/api/admin/review/cost-comparison \
  scripts/review-regression/compare-rerun-costs.ts \
  docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md \
  docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat(review): add incremental rerun planner and cost controls"
```

Expected: one commit contains the full T19 implementation and documentation closure.

## Final Validation Matrix

Run these before closing T19:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner \
  src/server/modules/review/evidence-review/costs \
  src/app/api/admin/review/rerun-plan/route.test.ts \
  src/app/api/admin/review/cost-summary/route.test.ts \
  src/app/api/admin/review/cost-comparison/route.test.ts \
  --coverage=false
pnpm exec eslint \
  src/server/modules/analysis/pipelines/evidence-review/rerun-planner \
  src/server/modules/review/evidence-review/costs \
  src/app/api/admin/review/rerun-plan/route.ts \
  src/app/api/admin/review/rerun-plan/route.test.ts \
  src/app/api/admin/review/cost-summary/route.ts \
  src/app/api/admin/review/cost-summary/route.test.ts \
  src/app/api/admin/review/cost-comparison/route.ts \
  src/app/api/admin/review/cost-comparison/route.test.ts \
  scripts/review-regression/compare-rerun-costs.ts
pnpm type-check
pnpm exec ts-node --esm scripts/review-regression/compare-rerun-costs.ts --help
```

## Review Checkpoints

- After Task 5: planner package is complete, no orchestration or Prisma drift
- After Task 8: new admin routes are additive and legacy `analysis-jobs` cost route is untouched
- After Task 9: docs are closed, validations are green, one commit is ready

## Next Step Execution Options

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, and keep T19 split cleanly across planner, costs, routes, and doc closure.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints. This keeps all T19 context centralized but the session will be heavier because it spans planner logic, aggregation services, routes, and docs.
