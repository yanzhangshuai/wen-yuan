# T04 Run Observability And Retry Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make analysis runs, stage runs, raw LLM outputs, retry boundaries, error categories, and token/cost summaries first-class contracts before Stage 0/A/B/C write paths land.

**Architecture:** Add a small observability layer under `src/server/modules/analysis/runs` and integrate it with `runAnalysisJob` only at safe orchestration boundaries. Keep raw model retention and retry planning reusable so later Stage 0/A/A+/B/B.5/C/D tasks can record precise stage attempts without rewriting job orchestration again.

**Tech Stack:** TypeScript strict, Prisma 7 generated client, PostgreSQL additive migration, Vitest delegate mocks, existing `AnalysisJobStatus` and `AnalysisStageRunStatus` enums

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Upstream completed tasks: T01 schema foundation, T02 evidence layer, T03 claim storage contracts

## Preconditions

- T01 already created `AnalysisRun`, `AnalysisStageRun`, and `LlmRawOutput`.
- Current schema is intentionally too lean for T04 acceptance: `AnalysisStageRun` lacks metric fields and `AnalysisRun` lacks an explicit `jobId` bridge.
- T04 is allowed to make additive schema changes because the task acceptance requires stage counts, failure category, token/cost summary, and retry planning by run/stage/chapter.
- T04 does not rewrite Stage 0/A/A+/B/B.5/C/D pipeline internals. Later stage tasks must call the services introduced here.
- T04 does not solve provider pricing. Cost is stored as nullable `estimatedCostMicros`; token aggregation must work even when cost is unavailable.

## File Structure

- Modify `prisma/schema.prisma`
  - Responsibility: add only the run observability fields required by §10/§11 without changing legacy truth tables.
- Create `prisma/migrations/<timestamp>_analysis_run_observability_metrics/migration.sql`
  - Responsibility: additive SQL migration for the new run/stage/raw-output fields and indexes.
- Create `src/server/modules/analysis/runs/run-service.ts`
  - Responsibility: create/start/succeed/fail/cancel `analysis_runs`, track current stage, aggregate run token/cost summary.
- Create `src/server/modules/analysis/runs/run-service.test.ts`
  - Responsibility: prove lifecycle transitions, idempotent job-run creation semantics, and summary aggregation.
- Create `src/server/modules/analysis/runs/stage-run-service.ts`
  - Responsibility: create/start/succeed/fail/skip `analysis_stage_runs`, classify errors, persist raw prompt/response/error retention records.
- Create `src/server/modules/analysis/runs/stage-run-service.test.ts`
  - Responsibility: prove metric persistence, raw output retention, parse/schema/discard metadata, and error classification.
- Create `src/server/modules/analysis/runs/retry-planner.ts`
  - Responsibility: produce explicit retry plans by run, stage, chapter, or projection rebuild without deleting successful upstream outputs.
- Create `src/server/modules/analysis/runs/retry-planner.test.ts`
  - Responsibility: prove Stage A chapter failure isolation, Stage B/C stage retry preservation, run retry, and projection rebuild plans.
- Modify `src/server/modules/analysis/jobs/runAnalysisJob.ts`
  - Responsibility: create an `AnalysisRun` per job execution, record orchestration-level stage runs, and mark run success/failure/cancellation.
- Modify `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
  - Responsibility: add observability delegate mocks and assert safe integration boundaries without changing existing job behavior.

## Modeling Decisions

- `AnalysisRun.jobId` is nullable and indexed, not unique. One legacy `analysis_jobs` row can have multiple execution attempts or retry runs.
- `AnalysisRun.trigger` remains a string because trigger values are operational and may expand: `ANALYSIS_JOB`, `RETRY_RUN`, `RETRY_STAGE`, `RETRY_CHAPTER`, `PROJECTION_REBUILD`.
- `AnalysisStageRun.stageKey` remains a string because later stages use open keys such as `STAGE_0`, `STAGE_A`, `STAGE_A_PLUS`, `STAGE_B`, `STAGE_B5`, `STAGE_C`, `STAGE_D`, and orchestration keys such as `JOB_CHAPTER_SELECTION`.
- `estimatedCostMicros` is nullable. Token summary is mandatory when provider usage exists; price calculation is deferred to T19 unless model pricing is already available.
- `LlmRawOutput` stores raw prompt/request payload, response text, parsed JSON, parse error, schema error, discard reason, token usage, duration, and nullable estimated cost. This is enough for T06/T16 to surface AI extraction basis.
- Existing `analysis_phase_logs` are not removed. They remain a legacy AI-call log; T04 introduces the new evidence-first run audit layer.

## Task 1: Add Run Observability Schema Fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_analysis_run_observability_metrics/migration.sql`
- Regenerate: `src/generated/prisma/**`

- [ ] **Step 1: Patch the Prisma schema additively**

Update `AnalysisRun`, `AnalysisStageRun`, and `LlmRawOutput` in `prisma/schema.prisma`:

```prisma
model AnalysisRun {
  id                String            @id @default(uuid()) @db.Uuid
  bookId            String            @map("book_id") @db.Uuid
  jobId             String?           @map("job_id") @db.Uuid
  trigger           String
  scope             String
  status            AnalysisJobStatus @default(QUEUED)
  currentStageKey   String?           @map("current_stage_key")
  requestedByUserId String?           @map("requested_by_user_id") @db.Uuid
  startedAt         DateTime?         @map("started_at") @db.Timestamptz(6)
  finishedAt        DateTime?         @map("finished_at") @db.Timestamptz(6)
  errorMessage      String?           @map("error_message") @db.Text
  promptTokens      Int               @default(0) @map("prompt_tokens")
  completionTokens  Int               @default(0) @map("completion_tokens")
  totalTokens       Int               @default(0) @map("total_tokens")
  estimatedCostMicros BigInt          @default(0) @map("estimated_cost_micros")
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([bookId, createdAt], map: "analysis_runs_book_created_at_idx")
  @@index([jobId, createdAt], map: "analysis_runs_job_created_at_idx")
  @@index([status, createdAt], map: "analysis_runs_status_created_at_idx")
  @@map("analysis_runs")
}

model AnalysisStageRun {
  id                  String                 @id @default(uuid()) @db.Uuid
  runId               String                 @map("run_id") @db.Uuid
  bookId              String                 @map("book_id") @db.Uuid
  chapterId           String?                @map("chapter_id") @db.Uuid
  stageKey            String                 @map("stage_key")
  status              AnalysisStageRunStatus @default(PENDING)
  attempt             Int                    @default(1)
  inputHash           String?                @map("input_hash")
  outputHash          String?                @map("output_hash")
  inputCount          Int                    @default(0) @map("input_count")
  outputCount         Int                    @default(0) @map("output_count")
  skippedCount        Int                    @default(0) @map("skipped_count")
  failureCount        Int                    @default(0) @map("failure_count")
  errorClass          String?                @map("error_class")
  errorMessage        String?                @map("error_message") @db.Text
  promptTokens        Int                    @default(0) @map("prompt_tokens")
  completionTokens    Int                    @default(0) @map("completion_tokens")
  totalTokens         Int                    @default(0) @map("total_tokens")
  estimatedCostMicros BigInt                 @default(0) @map("estimated_cost_micros")
  chapterStartNo      Int?                   @map("chapter_start_no")
  chapterEndNo        Int?                   @map("chapter_end_no")
  startedAt           DateTime?              @map("started_at") @db.Timestamptz(6)
  finishedAt          DateTime?              @map("finished_at") @db.Timestamptz(6)
  createdAt           DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([runId, stageKey], map: "analysis_stage_runs_run_stage_idx")
  @@index([chapterId, stageKey], map: "analysis_stage_runs_chapter_stage_idx")
  @@index([status, stageKey], map: "analysis_stage_runs_status_stage_idx")
  @@map("analysis_stage_runs")
}

model LlmRawOutput {
  id                  String   @id @default(uuid()) @db.Uuid
  runId               String   @map("run_id") @db.Uuid
  stageRunId          String?  @map("stage_run_id") @db.Uuid
  bookId              String   @map("book_id") @db.Uuid
  chapterId           String?  @map("chapter_id") @db.Uuid
  provider            String
  model               String
  requestPayload      Json     @map("request_payload")
  responseText        String   @map("response_text") @db.Text
  responseJson        Json?    @map("response_json")
  parseError          String?  @map("parse_error") @db.Text
  schemaError         String?  @map("schema_error") @db.Text
  discardReason       String?  @map("discard_reason") @db.Text
  promptTokens        Int?     @map("prompt_tokens")
  completionTokens    Int?     @map("completion_tokens")
  totalTokens         Int?     @map("total_tokens")
  estimatedCostMicros BigInt?  @map("estimated_cost_micros")
  durationMs          Int?     @map("duration_ms")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([runId], map: "llm_raw_outputs_run_idx")
  @@index([stageRunId], map: "llm_raw_outputs_stage_run_idx")
  @@index([chapterId], map: "llm_raw_outputs_chapter_idx")
  @@map("llm_raw_outputs")
}
```

- [ ] **Step 2: Format and validate schema**

Run:

```bash
pnpm prisma format --schema prisma/schema.prisma
pnpm prisma validate --schema prisma/schema.prisma
```

Expected: both commands pass.

- [ ] **Step 3: Generate the additive migration**

Run:

```bash
pnpm prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script --output prisma/migrations/20260419090000_analysis_run_observability_metrics/migration.sql
```

Expected: the migration creates only additive `ALTER TABLE ... ADD COLUMN` and `CREATE INDEX` statements for `analysis_runs`, `analysis_stage_runs`, and `llm_raw_outputs`.

- [ ] **Step 4: Guard against destructive SQL**

Run:

```bash
rg -n "DROP TABLE|DROP COLUMN|ALTER COLUMN .* TYPE|TRUNCATE|DELETE FROM" prisma/migrations/20260419090000_analysis_run_observability_metrics/migration.sql
```

Expected: no matches.

- [ ] **Step 5: Regenerate Prisma client**

Run:

```bash
pnpm prisma:generate
```

Expected: generated Prisma client includes the new fields.

- [ ] **Step 6: Commit schema foundation**

```bash
git add prisma/schema.prisma prisma/migrations/20260419090000_analysis_run_observability_metrics/migration.sql src/generated/prisma
git commit -m "feat: add analysis run observability metrics"
```

## Task 2: Analysis Run Lifecycle Service

**Files:**
- Create: `src/server/modules/analysis/runs/run-service.test.ts`
- Create: `src/server/modules/analysis/runs/run-service.ts`

- [ ] **Step 1: Write the failing run service tests**

Create `src/server/modules/analysis/runs/run-service.test.ts`:

```ts
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAnalysisRunService } from "@/server/modules/analysis/runs/run-service";

function createPrismaMock() {
  const analysisRunCreate = vi.fn().mockResolvedValue({
    id: "run-1",
    bookId: "book-1",
    jobId: "job-1",
    trigger: "ANALYSIS_JOB",
    scope: "FULL_BOOK",
    status: AnalysisJobStatus.RUNNING
  });
  const analysisRunUpdate = vi.fn().mockResolvedValue({});
  const analysisRunFindFirst = vi.fn();
  const llmRawOutputAggregate = vi.fn().mockResolvedValue({
    _sum: {
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
      estimatedCostMicros: BigInt(4500)
    }
  });

  return {
    prisma: {
      analysisRun: {
        create: analysisRunCreate,
        update: analysisRunUpdate,
        findFirst: analysisRunFindFirst
      },
      llmRawOutput: {
        aggregate: llmRawOutputAggregate
      }
    } as never,
    analysisRunCreate,
    analysisRunUpdate,
    analysisRunFindFirst,
    llmRawOutputAggregate
  };
}

describe("analysis run service", () => {
  it("creates a running run for a legacy analysis job", async () => {
    const { prisma, analysisRunCreate } = createPrismaMock();
    const service = createAnalysisRunService(prisma);

    const run = await service.createJobRun({
      jobId: "job-1",
      bookId: "book-1",
      scope: "FULL_BOOK",
      trigger: "ANALYSIS_JOB"
    });

    expect(run.id).toBe("run-1");
    expect(analysisRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job-1",
        bookId: "book-1",
        scope: "FULL_BOOK",
        trigger: "ANALYSIS_JOB",
        status: AnalysisJobStatus.RUNNING,
        startedAt: expect.any(Date),
        finishedAt: null,
        currentStageKey: null,
        errorMessage: null
      })
    });
  });

  it("tracks current stage without changing run status", async () => {
    const { prisma, analysisRunUpdate } = createPrismaMock();
    const service = createAnalysisRunService(prisma);

    await service.markCurrentStage("run-1", "STAGE_A");

    expect(analysisRunUpdate).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { currentStageKey: "STAGE_A" }
    });
  });

  it("marks success and writes token and cost summary from raw outputs", async () => {
    const { prisma, analysisRunUpdate, llmRawOutputAggregate } = createPrismaMock();
    const service = createAnalysisRunService(prisma);

    await service.succeedRun("run-1");

    expect(llmRawOutputAggregate).toHaveBeenCalledWith({
      where: { runId: "run-1" },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        estimatedCostMicros: true
      }
    });
    expect(analysisRunUpdate).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: AnalysisJobStatus.SUCCEEDED,
        finishedAt: expect.any(Date),
        currentStageKey: null,
        errorMessage: null,
        promptTokens: 120,
        completionTokens: 80,
        totalTokens: 200,
        estimatedCostMicros: BigInt(4500)
      })
    });
  });

  it("marks failure with a bounded error message", async () => {
    const { prisma, analysisRunUpdate } = createPrismaMock();
    const service = createAnalysisRunService(prisma);

    await service.failRun("run-1", new Error("x".repeat(1200)));

    expect(analysisRunUpdate).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: AnalysisJobStatus.FAILED,
        finishedAt: expect.any(Date),
        currentStageKey: null,
        errorMessage: "x".repeat(1000)
      })
    });
  });

  it("marks cancellation as terminal without an error message", async () => {
    const { prisma, analysisRunUpdate } = createPrismaMock();
    const service = createAnalysisRunService(prisma);

    await service.cancelRun("run-1");

    expect(analysisRunUpdate).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: AnalysisJobStatus.CANCELED,
        finishedAt: expect.any(Date),
        currentStageKey: null,
        errorMessage: null
      })
    });
  });

  it("returns null-object results when run delegates are unavailable in old unit tests", async () => {
    const service = createAnalysisRunService({} as never);

    const run = await service.createJobRun({
      jobId: "job-1",
      bookId: "book-1",
      scope: "FULL_BOOK",
      trigger: "ANALYSIS_JOB"
    });

    expect(run.id).toBeNull();
    await expect(service.succeedRun(run.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/server/modules/analysis/runs/run-service.test.ts
```

Expected: FAIL because `run-service.ts` does not exist.

- [ ] **Step 3: Implement the run service**

Create `src/server/modules/analysis/runs/run-service.ts`:

```ts
import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export type AnalysisRunTrigger =
  | "ANALYSIS_JOB"
  | "RETRY_RUN"
  | "RETRY_STAGE"
  | "RETRY_CHAPTER"
  | "PROJECTION_REBUILD";

export interface CreateJobRunInput {
  jobId: string;
  bookId: string;
  scope: string;
  trigger: AnalysisRunTrigger;
  requestedByUserId?: string | null;
}

export interface CreatedAnalysisRun {
  id: string | null;
}

function hasAnalysisRunDelegate(prismaClient: PrismaClient): boolean {
  return typeof prismaClient.analysisRun?.create === "function";
}

function hasRawOutputDelegate(prismaClient: PrismaClient): boolean {
  return typeof prismaClient.llmRawOutput?.aggregate === "function";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return String(error).slice(0, 1000);
}

function normalizeSum(value: number | bigint | null | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return value ?? 0;
}

function normalizeBigIntSum(value: number | bigint | null | undefined): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  return BigInt(value ?? 0);
}

export function createAnalysisRunService(prismaClient: PrismaClient = prisma) {
  async function createJobRun(input: CreateJobRunInput): Promise<CreatedAnalysisRun> {
    if (!hasAnalysisRunDelegate(prismaClient)) {
      return { id: null };
    }

    const row = await prismaClient.analysisRun.create({
      data: {
        jobId: input.jobId,
        bookId: input.bookId,
        scope: input.scope,
        trigger: input.trigger,
        status: AnalysisJobStatus.RUNNING,
        requestedByUserId: input.requestedByUserId ?? null,
        startedAt: new Date(),
        finishedAt: null,
        currentStageKey: null,
        errorMessage: null
      }
    });

    return { id: row.id };
  }

  async function markCurrentStage(runId: string | null, stageKey: string): Promise<void> {
    if (!runId || !hasAnalysisRunDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data: { currentStageKey: stageKey }
    });
  }

  async function summarizeRun(runId: string | null): Promise<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostMicros: bigint;
  }> {
    if (!runId || !hasRawOutputDelegate(prismaClient)) {
      return {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostMicros: BigInt(0)
      };
    }

    const summary = await prismaClient.llmRawOutput.aggregate({
      where: { runId },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        estimatedCostMicros: true
      }
    });

    return {
      promptTokens: normalizeSum(summary._sum.promptTokens),
      completionTokens: normalizeSum(summary._sum.completionTokens),
      totalTokens: normalizeSum(summary._sum.totalTokens),
      estimatedCostMicros: normalizeBigIntSum(summary._sum.estimatedCostMicros)
    };
  }

  async function succeedRun(runId: string | null): Promise<void> {
    if (!runId || !hasAnalysisRunDelegate(prismaClient)) {
      return;
    }

    const summary = await summarizeRun(runId);
    await prismaClient.analysisRun.update({
      where: { id: runId },
      data: {
        status: AnalysisJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        currentStageKey: null,
        errorMessage: null,
        promptTokens: summary.promptTokens,
        completionTokens: summary.completionTokens,
        totalTokens: summary.totalTokens,
        estimatedCostMicros: summary.estimatedCostMicros
      }
    });
  }

  async function failRun(runId: string | null, error: unknown): Promise<void> {
    if (!runId || !hasAnalysisRunDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data: {
        status: AnalysisJobStatus.FAILED,
        finishedAt: new Date(),
        currentStageKey: null,
        errorMessage: toErrorMessage(error)
      }
    });
  }

  async function cancelRun(runId: string | null): Promise<void> {
    if (!runId || !hasAnalysisRunDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisRun.update({
      where: { id: runId },
      data: {
        status: AnalysisJobStatus.CANCELED,
        finishedAt: new Date(),
        currentStageKey: null,
        errorMessage: null
      }
    });
  }

  return {
    createJobRun,
    markCurrentStage,
    summarizeRun,
    succeedRun,
    failRun,
    cancelRun
  };
}

export type AnalysisRunService = ReturnType<typeof createAnalysisRunService>;
export const analysisRunService = createAnalysisRunService();
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test src/server/modules/analysis/runs/run-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit run service**

```bash
git add src/server/modules/analysis/runs/run-service.ts src/server/modules/analysis/runs/run-service.test.ts
git commit -m "feat: add analysis run lifecycle service"
```

## Task 3: Stage Run And Raw Output Service

**Files:**
- Create: `src/server/modules/analysis/runs/stage-run-service.test.ts`
- Create: `src/server/modules/analysis/runs/stage-run-service.ts`

- [ ] **Step 1: Write the failing stage run tests**

Create `src/server/modules/analysis/runs/stage-run-service.test.ts`:

```ts
import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  classifyStageRunError,
  createAnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";

function createPrismaMock() {
  const analysisStageRunCreate = vi.fn().mockResolvedValue({ id: "stage-run-1" });
  const analysisStageRunUpdate = vi.fn().mockResolvedValue({});
  const llmRawOutputCreate = vi.fn().mockResolvedValue({ id: "raw-1" });

  return {
    prisma: {
      analysisStageRun: {
        create: analysisStageRunCreate,
        update: analysisStageRunUpdate
      },
      llmRawOutput: {
        create: llmRawOutputCreate
      }
    } as never,
    analysisStageRunCreate,
    analysisStageRunUpdate,
    llmRawOutputCreate
  };
}

describe("analysis stage run service", () => {
  it("creates a running stage run with chapter range and input count", async () => {
    const { prisma, analysisStageRunCreate } = createPrismaMock();
    const service = createAnalysisStageRunService(prisma);

    const stageRun = await service.startStageRun({
      runId: "run-1",
      bookId: "book-1",
      chapterId: "chapter-1",
      stageKey: "STAGE_A",
      attempt: 2,
      inputHash: "input-hash",
      inputCount: 3,
      chapterStartNo: 1,
      chapterEndNo: 3
    });

    expect(stageRun.id).toBe("stage-run-1");
    expect(analysisStageRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: "run-1",
        bookId: "book-1",
        chapterId: "chapter-1",
        stageKey: "STAGE_A",
        attempt: 2,
        inputHash: "input-hash",
        inputCount: 3,
        chapterStartNo: 1,
        chapterEndNo: 3,
        status: AnalysisStageRunStatus.RUNNING,
        startedAt: expect.any(Date),
        finishedAt: null
      })
    });
  });

  it("marks a stage run as succeeded with output metrics and usage", async () => {
    const { prisma, analysisStageRunUpdate } = createPrismaMock();
    const service = createAnalysisStageRunService(prisma);

    await service.succeedStageRun("stage-run-1", {
      outputHash: "output-hash",
      outputCount: 7,
      skippedCount: 2,
      promptTokens: 100,
      completionTokens: 50,
      estimatedCostMicros: BigInt(3000)
    });

    expect(analysisStageRunUpdate).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data: expect.objectContaining({
        status: AnalysisStageRunStatus.SUCCEEDED,
        outputHash: "output-hash",
        outputCount: 7,
        skippedCount: 2,
        failureCount: 0,
        errorClass: null,
        errorMessage: null,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatedCostMicros: BigInt(3000),
        finishedAt: expect.any(Date)
      })
    });
  });

  it("marks a failed stage run with error class and bounded message", async () => {
    const { prisma, analysisStageRunUpdate } = createPrismaMock();
    const service = createAnalysisStageRunService(prisma);

    await service.failStageRun("stage-run-1", new Error("schema validation failed"), {
      failureCount: 4,
      errorClass: "SCHEMA_VALIDATION"
    });

    expect(analysisStageRunUpdate).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data: expect.objectContaining({
        status: AnalysisStageRunStatus.FAILED,
        failureCount: 4,
        errorClass: "SCHEMA_VALIDATION",
        errorMessage: "schema validation failed",
        finishedAt: expect.any(Date)
      })
    });
  });

  it("records raw prompt response and parse metadata for later evidence review", async () => {
    const { prisma, llmRawOutputCreate } = createPrismaMock();
    const service = createAnalysisStageRunService(prisma);

    const raw = await service.recordRawOutput({
      runId: "run-1",
      stageRunId: "stage-run-1",
      bookId: "book-1",
      chapterId: "chapter-1",
      provider: "openai-compatible",
      model: "model-x",
      requestPayload: { messages: [{ role: "user", content: "extract" }] },
      responseText: "{\"items\":[]}",
      responseJson: { items: [] },
      parseError: null,
      schemaError: "missing evidenceSpanIds",
      discardReason: "schema_error",
      promptTokens: 10,
      completionTokens: 6,
      durationMs: 123,
      estimatedCostMicros: null
    });

    expect(raw.id).toBe("raw-1");
    expect(llmRawOutputCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: "run-1",
        stageRunId: "stage-run-1",
        bookId: "book-1",
        chapterId: "chapter-1",
        provider: "openai-compatible",
        model: "model-x",
        requestPayload: { messages: [{ role: "user", content: "extract" }] },
        responseText: "{\"items\":[]}",
        responseJson: { items: [] },
        parseError: null,
        schemaError: "missing evidenceSpanIds",
        discardReason: "schema_error",
        promptTokens: 10,
        completionTokens: 6,
        totalTokens: 16,
        durationMs: 123,
        estimatedCostMicros: null
      })
    });
  });

  it("classifies common retry and validation failures", () => {
    expect(classifyStageRunError(new Error("429 rate limit"))).toBe("RETRYABLE_PROVIDER");
    expect(classifyStageRunError(new Error("JSON parse error"))).toBe("PARSE_ERROR");
    expect(classifyStageRunError(new Error("schema validation failed"))).toBe("SCHEMA_VALIDATION");
    expect(classifyStageRunError(new Error("operation canceled by user"))).toBe("CANCELED");
    expect(classifyStageRunError(new Error("unknown"))).toBe("UNKNOWN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/server/modules/analysis/runs/stage-run-service.test.ts
```

Expected: FAIL because `stage-run-service.ts` does not exist.

- [ ] **Step 3: Implement the stage run service**

Create `src/server/modules/analysis/runs/stage-run-service.ts`:

```ts
import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export type StageRunErrorClass =
  | "RETRYABLE_PROVIDER"
  | "PROVIDER_EXHAUSTED"
  | "PARSE_ERROR"
  | "SCHEMA_VALIDATION"
  | "CANCELED"
  | "UNKNOWN";

export interface StartStageRunInput {
  runId: string | null;
  bookId: string;
  chapterId?: string | null;
  stageKey: string;
  attempt?: number;
  inputHash?: string | null;
  inputCount?: number;
  chapterStartNo?: number | null;
  chapterEndNo?: number | null;
}

export interface SucceedStageRunInput {
  outputHash?: string | null;
  outputCount?: number;
  skippedCount?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  estimatedCostMicros?: bigint | null;
}

export interface RecordRawOutputInput {
  runId: string | null;
  stageRunId?: string | null;
  bookId: string;
  chapterId?: string | null;
  provider: string;
  model: string;
  requestPayload: unknown;
  responseText: string;
  responseJson?: unknown | null;
  parseError?: string | null;
  schemaError?: string | null;
  discardReason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  estimatedCostMicros?: bigint | null;
}

function hasStageRunDelegate(prismaClient: PrismaClient): boolean {
  return typeof prismaClient.analysisStageRun?.create === "function";
}

function hasRawOutputDelegate(prismaClient: PrismaClient): boolean {
  return typeof prismaClient.llmRawOutput?.create === "function";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return String(error).slice(0, 1000);
}

function toTotalTokens(promptTokens?: number | null, completionTokens?: number | null): number {
  return (promptTokens ?? 0) + (completionTokens ?? 0);
}

export function classifyStageRunError(error: unknown): StageRunErrorClass {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (message.includes("canceled") || message.includes("cancelled")) {
    return "CANCELED";
  }
  if (message.includes("schema") || message.includes("validation")) {
    return "SCHEMA_VALIDATION";
  }
  if (message.includes("json") || message.includes("parse")) {
    return "PARSE_ERROR";
  }
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("socket")
  ) {
    return "RETRYABLE_PROVIDER";
  }
  if (message.includes("exhausted") || message.includes("fallback")) {
    return "PROVIDER_EXHAUSTED";
  }

  return "UNKNOWN";
}

export function createAnalysisStageRunService(prismaClient: PrismaClient = prisma) {
  async function startStageRun(input: StartStageRunInput): Promise<{ id: string | null }> {
    if (!input.runId || !hasStageRunDelegate(prismaClient)) {
      return { id: null };
    }

    const row = await prismaClient.analysisStageRun.create({
      data: {
        runId: input.runId,
        bookId: input.bookId,
        chapterId: input.chapterId ?? null,
        stageKey: input.stageKey,
        status: AnalysisStageRunStatus.RUNNING,
        attempt: input.attempt ?? 1,
        inputHash: input.inputHash ?? null,
        inputCount: input.inputCount ?? 0,
        chapterStartNo: input.chapterStartNo ?? null,
        chapterEndNo: input.chapterEndNo ?? null,
        startedAt: new Date(),
        finishedAt: null
      }
    });

    return { id: row.id };
  }

  async function succeedStageRun(stageRunId: string | null, input: SucceedStageRunInput = {}): Promise<void> {
    if (!stageRunId || !hasStageRunDelegate(prismaClient)) {
      return;
    }

    const promptTokens = input.promptTokens ?? 0;
    const completionTokens = input.completionTokens ?? 0;
    await prismaClient.analysisStageRun.update({
      where: { id: stageRunId },
      data: {
        status: AnalysisStageRunStatus.SUCCEEDED,
        outputHash: input.outputHash ?? null,
        outputCount: input.outputCount ?? 0,
        skippedCount: input.skippedCount ?? 0,
        failureCount: 0,
        errorClass: null,
        errorMessage: null,
        promptTokens,
        completionTokens,
        totalTokens: toTotalTokens(promptTokens, completionTokens),
        estimatedCostMicros: input.estimatedCostMicros ?? BigInt(0),
        finishedAt: new Date()
      }
    });
  }

  async function failStageRun(
    stageRunId: string | null,
    error: unknown,
    input: { failureCount?: number; errorClass?: StageRunErrorClass } = {}
  ): Promise<void> {
    if (!stageRunId || !hasStageRunDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisStageRun.update({
      where: { id: stageRunId },
      data: {
        status: AnalysisStageRunStatus.FAILED,
        failureCount: input.failureCount ?? 1,
        errorClass: input.errorClass ?? classifyStageRunError(error),
        errorMessage: toErrorMessage(error),
        finishedAt: new Date()
      }
    });
  }

  async function skipStageRun(stageRunId: string | null, skippedCount = 1): Promise<void> {
    if (!stageRunId || !hasStageRunDelegate(prismaClient)) {
      return;
    }

    await prismaClient.analysisStageRun.update({
      where: { id: stageRunId },
      data: {
        status: AnalysisStageRunStatus.SKIPPED,
        skippedCount,
        finishedAt: new Date()
      }
    });
  }

  async function recordRawOutput(input: RecordRawOutputInput): Promise<{ id: string | null }> {
    if (!input.runId || !hasRawOutputDelegate(prismaClient)) {
      return { id: null };
    }

    const row = await prismaClient.llmRawOutput.create({
      data: {
        runId: input.runId,
        stageRunId: input.stageRunId ?? null,
        bookId: input.bookId,
        chapterId: input.chapterId ?? null,
        provider: input.provider,
        model: input.model,
        requestPayload: input.requestPayload,
        responseText: input.responseText,
        responseJson: input.responseJson ?? null,
        parseError: input.parseError ?? null,
        schemaError: input.schemaError ?? null,
        discardReason: input.discardReason ?? null,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        totalTokens:
          input.promptTokens == null && input.completionTokens == null
            ? null
            : toTotalTokens(input.promptTokens, input.completionTokens),
        estimatedCostMicros: input.estimatedCostMicros ?? null,
        durationMs: input.durationMs ?? null
      }
    });

    return { id: row.id };
  }

  return {
    startStageRun,
    succeedStageRun,
    failStageRun,
    skipStageRun,
    recordRawOutput
  };
}

export type AnalysisStageRunService = ReturnType<typeof createAnalysisStageRunService>;
export const analysisStageRunService = createAnalysisStageRunService();
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test src/server/modules/analysis/runs/stage-run-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit stage service**

```bash
git add src/server/modules/analysis/runs/stage-run-service.ts src/server/modules/analysis/runs/stage-run-service.test.ts
git commit -m "feat: add analysis stage run service"
```

## Task 4: Retry Planner

**Files:**
- Create: `src/server/modules/analysis/runs/retry-planner.test.ts`
- Create: `src/server/modules/analysis/runs/retry-planner.ts`

- [ ] **Step 1: Write the failing retry planner tests**

Create `src/server/modules/analysis/runs/retry-planner.test.ts`:

```ts
import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAnalysisRetryPlanner } from "@/server/modules/analysis/runs/retry-planner";

function createPrismaMock(rows: unknown[]) {
  const analysisStageRunFindMany = vi.fn().mockResolvedValue(rows);

  return {
    prisma: {
      analysisStageRun: {
        findMany: analysisStageRunFindMany
      }
    } as never,
    analysisStageRunFindMany
  };
}

describe("analysis retry planner", () => {
  it("plans isolated chapter retry for failed Stage A chapter runs", async () => {
    const { prisma } = createPrismaMock([
      {
        id: "stage-run-1",
        runId: "run-1",
        bookId: "book-1",
        chapterId: "chapter-3",
        stageKey: "STAGE_A",
        status: AnalysisStageRunStatus.FAILED,
        attempt: 1,
        errorClass: "RETRYABLE_PROVIDER",
        chapterStartNo: 3,
        chapterEndNo: 3
      }
    ]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planRunRetry("run-1");

    expect(plan.retryKind).toBe("CHAPTER");
    expect(plan.items).toEqual([
      {
        stageKey: "STAGE_A",
        chapterId: "chapter-3",
        chapterStartNo: 3,
        chapterEndNo: 3,
        nextAttempt: 2,
        preservePreviousOutputs: false
      }
    ]);
  });

  it("plans stage retry that preserves previous outputs for Stage B and Stage C failures", async () => {
    const { prisma } = createPrismaMock([
      {
        id: "stage-run-2",
        runId: "run-1",
        bookId: "book-1",
        chapterId: null,
        stageKey: "STAGE_B",
        status: AnalysisStageRunStatus.FAILED,
        attempt: 2,
        errorClass: "SCHEMA_VALIDATION",
        chapterStartNo: 1,
        chapterEndNo: 20
      }
    ]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planRunRetry("run-1");

    expect(plan.retryKind).toBe("STAGE");
    expect(plan.items).toEqual([
      {
        stageKey: "STAGE_B",
        chapterId: null,
        chapterStartNo: 1,
        chapterEndNo: 20,
        nextAttempt: 3,
        preservePreviousOutputs: true
      }
    ]);
  });

  it("plans projection rebuild without requiring failed stage rows", async () => {
    const { prisma } = createPrismaMock([]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planProjectionRebuild({
      runId: "run-1",
      bookId: "book-1",
      reason: "manual review accepted claims"
    });

    expect(plan).toEqual({
      retryKind: "PROJECTION",
      runId: "run-1",
      bookId: "book-1",
      reason: "manual review accepted claims",
      items: [
        {
          stageKey: "STAGE_D",
          chapterId: null,
          chapterStartNo: null,
          chapterEndNo: null,
          nextAttempt: 1,
          preservePreviousOutputs: true
        }
      ]
    });
  });

  it("returns a no-op plan when there are no failed stages", async () => {
    const { prisma } = createPrismaMock([]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planRunRetry("run-1");

    expect(plan).toEqual({
      retryKind: "NONE",
      runId: "run-1",
      items: []
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/server/modules/analysis/runs/retry-planner.test.ts
```

Expected: FAIL because `retry-planner.ts` does not exist.

- [ ] **Step 3: Implement the retry planner**

Create `src/server/modules/analysis/runs/retry-planner.ts`:

```ts
import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export type RetryKind = "NONE" | "RUN" | "STAGE" | "CHAPTER" | "PROJECTION";

export interface RetryPlanItem {
  stageKey: string;
  chapterId: string | null;
  chapterStartNo: number | null;
  chapterEndNo: number | null;
  nextAttempt: number;
  preservePreviousOutputs: boolean;
}

export interface RetryPlan {
  retryKind: RetryKind;
  runId: string;
  bookId?: string;
  reason?: string;
  items: RetryPlanItem[];
}

interface FailedStageRunRow {
  stageKey: string;
  chapterId: string | null;
  attempt: number;
  chapterStartNo: number | null;
  chapterEndNo: number | null;
}

function hasStageRunDelegate(prismaClient: PrismaClient): boolean {
  return typeof prismaClient.analysisStageRun?.findMany === "function";
}

function shouldPreservePreviousOutputs(stageKey: string): boolean {
  return stageKey !== "STAGE_A";
}

function classifyRetryKind(rows: FailedStageRunRow[]): RetryKind {
  if (rows.length === 0) {
    return "NONE";
  }

  const onlyChapterScopedStageA = rows.every((row) => row.stageKey === "STAGE_A" && row.chapterId);
  if (onlyChapterScopedStageA) {
    return "CHAPTER";
  }

  const onlyKnownStages = rows.every((row) => row.stageKey.startsWith("STAGE_"));
  return onlyKnownStages ? "STAGE" : "RUN";
}

export function createAnalysisRetryPlanner(prismaClient: PrismaClient = prisma) {
  async function loadFailedStageRuns(runId: string): Promise<FailedStageRunRow[]> {
    if (!hasStageRunDelegate(prismaClient)) {
      return [];
    }

    return await prismaClient.analysisStageRun.findMany({
      where: {
        runId,
        status: AnalysisStageRunStatus.FAILED
      },
      orderBy: [
        { stageKey: "asc" },
        { chapterStartNo: "asc" },
        { createdAt: "asc" }
      ],
      select: {
        stageKey: true,
        chapterId: true,
        attempt: true,
        chapterStartNo: true,
        chapterEndNo: true
      }
    });
  }

  async function planRunRetry(runId: string): Promise<RetryPlan> {
    const rows = await loadFailedStageRuns(runId);

    return {
      retryKind: classifyRetryKind(rows),
      runId,
      items: rows.map((row) => ({
        stageKey: row.stageKey,
        chapterId: row.chapterId,
        chapterStartNo: row.chapterStartNo,
        chapterEndNo: row.chapterEndNo,
        nextAttempt: row.attempt + 1,
        preservePreviousOutputs: shouldPreservePreviousOutputs(row.stageKey)
      }))
    };
  }

  async function planProjectionRebuild(input: {
    runId: string;
    bookId: string;
    reason: string;
  }): Promise<RetryPlan> {
    return {
      retryKind: "PROJECTION",
      runId: input.runId,
      bookId: input.bookId,
      reason: input.reason,
      items: [
        {
          stageKey: "STAGE_D",
          chapterId: null,
          chapterStartNo: null,
          chapterEndNo: null,
          nextAttempt: 1,
          preservePreviousOutputs: true
        }
      ]
    };
  }

  return {
    planRunRetry,
    planProjectionRebuild
  };
}

export type AnalysisRetryPlanner = ReturnType<typeof createAnalysisRetryPlanner>;
export const analysisRetryPlanner = createAnalysisRetryPlanner();
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test src/server/modules/analysis/runs/retry-planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit retry planner**

```bash
git add src/server/modules/analysis/runs/retry-planner.ts src/server/modules/analysis/runs/retry-planner.test.ts
git commit -m "feat: add analysis retry planner"
```

## Task 5: Integrate Run Observability With `runAnalysisJob`

**Files:**
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`

- [ ] **Step 1: Write failing integration tests**

Append these tests to `src/server/modules/analysis/jobs/runAnalysisJob.test.ts` inside the existing `describe("analysis job runner", () => { ... })` block:

```ts
  it("creates analysis run and orchestration stage runs around a successful job", async () => {
    const jobId = "job-observable";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      prismaMock
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id: jobId,
        bookId,
        status: AnalysisJobStatus.QUEUED,
        architecture: "sequential",
        scope: "FULL_BOOK",
        chapterStart: null,
        chapterEnd: null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id: jobId,
        bookId,
        status: AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope: "FULL_BOOK",
        chapterStart: null,
        chapterEnd: null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await runner.runAnalysisJobById(jobId);

    expect(prismaMock?.analysisRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId,
        bookId,
        trigger: "ANALYSIS_JOB",
        scope: "FULL_BOOK",
        status: AnalysisJobStatus.RUNNING
      })
    });
    expect(prismaMock?.analysisStageRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: "run-observable",
        bookId,
        stageKey: "JOB_CHAPTER_SELECTION",
        inputCount: 0,
        outputCount: 0
      })
    });
    expect(prismaMock?.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-observable" },
      data: expect.objectContaining({
        status: AnalysisJobStatus.SUCCEEDED,
        currentStageKey: null
      })
    });
  });

  it("marks the analysis run failed when job execution fails", async () => {
    const jobId = "job-observable-fail";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      prismaMock
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id: jobId,
        bookId,
        status: AnalysisJobStatus.QUEUED,
        architecture: "sequential",
        scope: "FULL_BOOK",
        chapterStart: null,
        chapterEnd: null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id: jobId,
        bookId,
        status: AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope: "FULL_BOOK",
        chapterStart: null,
        chapterEnd: null,
        chapterIndices: []
      });
    chapterFindMany.mockResolvedValueOnce([]);

    await expect(runner.runAnalysisJobById(jobId)).rejects.toThrow("未找到可执行章节");

    expect(prismaMock?.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-observable" },
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: expect.stringContaining("未找到可执行章节")
      })
    });
    expect(prismaMock?.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-observable" },
      data: expect.objectContaining({
        status: AnalysisJobStatus.FAILED,
        errorMessage: expect.stringContaining("未找到可执行章节")
      })
    });
  });
```

Then extend `createRunnerContext()` with observability delegates:

```ts
  const analysisRunCreate = vi.fn().mockResolvedValue({ id: "run-observable" });
  const analysisRunUpdate = vi.fn().mockResolvedValue({});
  const analysisRunFindFirst = vi.fn().mockResolvedValue(null);
  const analysisStageRunCreate = vi.fn().mockResolvedValue({ id: "stage-run-observable" });
  const analysisStageRunUpdate = vi.fn().mockResolvedValue({});
  const llmRawOutputAggregate = vi.fn().mockResolvedValue({
    _sum: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostMicros: BigInt(0)
    }
  });
  const llmRawOutputCreate = vi.fn().mockResolvedValue({ id: "raw-observable" });
```

And include these delegates in the mocked Prisma object passed to `createAnalysisJobRunner`:

```ts
    analysisRun: {
      create: analysisRunCreate,
      update: analysisRunUpdate,
      findFirst: analysisRunFindFirst
    },
    analysisStageRun: {
      create: analysisStageRunCreate,
      update: analysisStageRunUpdate
    },
    llmRawOutput: {
      aggregate: llmRawOutputAggregate,
      create: llmRawOutputCreate
    },
```

Return the mock object from `createRunnerContext()` so the new assertions can read the delegate spies directly:

```ts
    prismaMock: {
      analysisRun: {
        create: analysisRunCreate,
        update: analysisRunUpdate,
        findFirst: analysisRunFindFirst
      },
      analysisStageRun: {
        create: analysisStageRunCreate,
        update: analysisStageRunUpdate
      },
      llmRawOutput: {
        aggregate: llmRawOutputAggregate,
        create: llmRawOutputCreate
      }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/server/modules/analysis/jobs/runAnalysisJob.test.ts
```

Expected: FAIL because `runAnalysisJob.ts` does not yet create analysis runs or stage runs.

- [ ] **Step 3: Add observability imports and dependency creation**

Modify `src/server/modules/analysis/jobs/runAnalysisJob.ts` imports:

```ts
import {
  createAnalysisRunService,
  type AnalysisRunService
} from "@/server/modules/analysis/runs/run-service";
import {
  createAnalysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
```

Inside `createAnalysisJobRunner(...)`, after `resolvedAnalyzerFactory`, add:

```ts
  const runService: AnalysisRunService = createAnalysisRunService(prismaClient);
  const stageRunService: AnalysisStageRunService = createAnalysisStageRunService(prismaClient);
```

- [ ] **Step 4: Create the run after the job is confirmed RUNNING**

Inside `runAnalysisJobById`, after:

```ts
    const runningJob: AnalysisJobRow = job;
```

add:

```ts
    const analysisRun = await runService.createJobRun({
      jobId: runningJob.id,
      bookId: runningJob.bookId,
      scope: runningJob.scope,
      trigger: "ANALYSIS_JOB"
    });
    const analysisRunId = analysisRun.id;
```

- [ ] **Step 5: Record chapter selection as an orchestration stage**

Replace the first chapter loading block:

```ts
      chapters = await loadChaptersForJob(prismaClient, runningJob);
      if (chapters.length === 0) {
        throw new Error(`解析任务 ${runningJob.id} 未找到可执行章节`);
      }
```

with:

```ts
      await runService.markCurrentStage(analysisRunId, "JOB_CHAPTER_SELECTION");
      const chapterSelectionStage = await stageRunService.startStageRun({
        runId: analysisRunId,
        bookId: runningJob.bookId,
        stageKey: "JOB_CHAPTER_SELECTION",
        inputCount: 0
      });

      try {
        chapters = await loadChaptersForJob(prismaClient, runningJob);
        if (chapters.length === 0) {
          throw new Error(`解析任务 ${runningJob.id} 未找到可执行章节`);
        }
        await stageRunService.succeedStageRun(chapterSelectionStage.id, {
          outputCount: chapters.length,
          skippedCount: 0
        });
      } catch (error) {
        await stageRunService.failStageRun(chapterSelectionStage.id, error);
        throw error;
      }
```

- [ ] **Step 6: Record pipeline execution as an orchestration stage**

Around the existing `pipeline.run(...)` call, add:

```ts
      await runService.markCurrentStage(analysisRunId, `PIPELINE_${architecture.toUpperCase()}`);
      const pipelineStage = await stageRunService.startStageRun({
        runId: analysisRunId,
        bookId: runningJob.bookId,
        stageKey: `PIPELINE_${architecture.toUpperCase()}`,
        inputCount: chapters.length,
        chapterStartNo: chapters[0]?.no ?? null,
        chapterEndNo: chapters.at(-1)?.no ?? null
      });

      try {
        const result = await pipeline.run({
          jobId: runningJob.id,
          bookId: runningJob.bookId,
          chapters,
          isCanceled: async () => await isJobCanceled(prismaClient, runningJob.id),
          onProgress: async (update) => {
            completedChapters = update.doneCount;
            await updateBookProgressSafely(prismaClient, {
              bookId: runningJob.bookId,
              progress: update.progress,
              completedText: update.stage,
              doneCount: update.doneCount,
              totalChapters: update.totalChapters,
              jobId: runningJob.id
            });
          }
        });

        await stageRunService.succeedStageRun(pipelineStage.id, {
          outputCount: result.completedChapters,
          skippedCount: 0
        });
```

Then in the matching `catch` for this pipeline block, add:

```ts
        await stageRunService.failStageRun(pipelineStage.id, error, {
          failureCount: Math.max(1, chapters.length - completedChapters)
        });
        throw error;
```

Important: keep all existing final `analysisJob` and `book` status updates intact. This step only wraps the existing pipeline call; it must not rewrite pipeline internals.

- [ ] **Step 7: Mark analysis run terminal with the existing job terminal state**

In the existing success path after the job/book success updates, add:

```ts
      await runService.succeedRun(analysisRunId);
```

In the existing cancellation path, add:

```ts
      await runService.cancelRun(analysisRunId);
```

In the existing failure path after failure status writes, add:

```ts
      await runService.failRun(analysisRunId, error);
```

- [ ] **Step 8: Run focused job tests**

Run:

```bash
pnpm test src/server/modules/analysis/jobs/runAnalysisJob.test.ts
```

Expected: PASS. If older assertions fail because the new observability writes add extra calls to `analysisRun.update` or `analysisStageRun.update`, fix only the affected expectations. Do not change existing job status semantics.

- [ ] **Step 9: Commit job integration**

```bash
git add src/server/modules/analysis/jobs/runAnalysisJob.ts src/server/modules/analysis/jobs/runAnalysisJob.test.ts
git commit -m "feat: record analysis run observability from jobs"
```

## Task 6: Validation And Execution Records

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Run the task validation commands**

Run:

```bash
pnpm test src/server/modules/analysis/runs
pnpm test src/server/modules/analysis/jobs/runAnalysisJob.test.ts
pnpm type-check
```

Expected: all commands pass.

- [ ] **Step 2: Run Prisma validation after generated client changes**

Run:

```bash
pnpm prisma validate --schema prisma/schema.prisma
pnpm prisma:generate
```

Expected: both commands pass and generated client is stable.

- [ ] **Step 3: Update the T04 task execution record**

Append this block to `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md` under `## Execution Record`:

```markdown
### T04 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419090000_analysis_run_observability_metrics/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/runs/run-service.ts`, `src/server/modules/analysis/runs/run-service.test.ts`, `src/server/modules/analysis/runs/stage-run-service.ts`, `src/server/modules/analysis/runs/stage-run-service.test.ts`, `src/server/modules/analysis/runs/retry-planner.ts`, `src/server/modules/analysis/runs/retry-planner.test.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
- Validation commands: `pnpm test src/server/modules/analysis/runs`, `pnpm test src/server/modules/analysis/jobs/runAnalysisJob.test.ts`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm type-check`
- Result: analysis runs, stage runs, raw output retention, retry planning, and job-level observability boundaries are in place for later extraction stages.
- Follow-up risks: provider-specific cost calculation remains nullable until T19; Stage 0/A/A+/B/B.5/C/D still need to call `stage-run-service` directly for fine-grained raw output retention.
- Next task: T17 `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`
```

- [ ] **Step 4: Mark T04 complete in the runbook**

In `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`, change:

```markdown
- [ ] T04: `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`
```

to:

```markdown
- [x] T04: `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`
```

Append this completion block under `## Completion Record`:

```markdown
### T04 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419090000_analysis_run_observability_metrics/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/runs/run-service.ts`, `src/server/modules/analysis/runs/run-service.test.ts`, `src/server/modules/analysis/runs/stage-run-service.ts`, `src/server/modules/analysis/runs/stage-run-service.test.ts`, `src/server/modules/analysis/runs/retry-planner.ts`, `src/server/modules/analysis/runs/retry-planner.test.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm test src/server/modules/analysis/runs`, `pnpm test src/server/modules/analysis/jobs/runAnalysisJob.test.ts`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm type-check`
- Result: run observability contracts are available before Stage 0/A/A+/B/B.5/C/D implement fine-grained extraction writes.
- Follow-up risks: cost is token-first and nullable until model pricing is wired in T19; raw output security/storage policy may need tightening before production retention is enabled.
- Next task: T17 `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`
```

- [ ] **Step 5: Commit execution record**

```bash
git add docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: record T04 completion"
```

## Self-Review Checklist

- Spec coverage:
  - §10.1 run objects: Tasks 1-3 create explicit services for `analysis_runs`, `analysis_stage_runs`, and `llm_raw_outputs`.
  - §10.2 observability fields: Task 1 adds input/output/skipped/failure counts, error class, token/cost summary, and chapter range.
  - §10.3 failure isolation: Task 4 encodes Stage A chapter-local retry and Stage B/C preservation.
  - §11.2 cost control: Tasks 2-3 aggregate tokens and nullable cost without blocking on provider pricing.
  - §15 traceability: Task 3 keeps raw prompt/response/parse/schema/discard metadata for review evidence panels.
- Placeholder scan:
  - No `TBD`, `TODO`, `implement later`, or “similar to” placeholders are used.
- Type consistency:
  - Service names are `createAnalysisRunService`, `createAnalysisStageRunService`, and `createAnalysisRetryPlanner`.
  - Stage status enum is `AnalysisStageRunStatus`; run status enum reuses `AnalysisJobStatus`.
  - Cost field is consistently named `estimatedCostMicros`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-t04-run-observability-retry-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
