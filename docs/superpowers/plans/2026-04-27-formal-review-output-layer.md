# Formal Review Output Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote unified review output into the formal analysis-job architecture boundary so every pipeline submits review data through the same output layer before a job can succeed.

**Architecture:** Add a first-class `review-output` layer with typed writers, a writer registry, and a coordinator. `runAnalysisJob` calls one coordinator for every architecture; writers handle architecture-specific submission details while projection rebuild remains architecture-neutral and always FULL_BOOK. The current sequential legacy-to-claims conversion becomes the sequential writer implementation, and threestage gets a writer that validates its claim-first output before projection.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7, Vitest, existing claim repository/write service, existing evidence-review projection builder.

---

## File Structure

- Create: `src/server/modules/analysis/review-output/types.ts`
  - Owns the formal output-layer contracts shared by all pipeline writers.
  - Defines `ReviewOutputWriteInput`, `ReviewOutputWriterResult`, `ReviewOutputCoordinatorResult`, and `AnalysisReviewOutputWriter`.
- Create: `src/server/modules/analysis/review-output/threestage-review-output.ts`
  - Implements the threestage writer.
  - Does not duplicate threestage claim creation; validates the claim-first source rows needed for review projection.
- Create: `src/server/modules/analysis/review-output/coordinator.ts`
  - Owns writer selection by architecture and the mandatory writer → FULL_BOOK projection sequence.
  - Produces one result/log payload for all architectures.
- Modify: `src/server/modules/analysis/review-output/sequential-review-output.ts`
  - Rename public semantics from adapter to writer while preserving backward-compatible aliases for existing backfill/tests.
  - Export `createSequentialReviewOutputWriter`.
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
  - Remove direct `architecture === "sequential"` output branch.
  - Inject/call `writeReviewOutput` coordinator instead of separate sequential writer and projection hooks.
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
  - Replace tests that assert sequential-only output behavior with coordinator contract tests.
  - Add a regression test proving both `sequential` and `threestage` jobs call the same output hook shape.
- Modify: `src/server/modules/analysis/review-output/sequential-review-output.test.ts`
  - Rename describe blocks and assertions to writer language.
  - Keep legacy alias coverage for backfill compatibility.
- Create: `src/server/modules/analysis/review-output/threestage-review-output.test.ts`
  - Cover validation success and failure.
- Create: `src/server/modules/analysis/review-output/coordinator.test.ts`
  - Cover writer registry, projection sequencing, error propagation, and FULL_BOOK projection for partial scopes.
- Modify: `scripts/backfill-unified-review-output.ts`
  - Import the sequential writer alias or new writer factory without changing CLI behavior.
- Modify: `.trellis/spec/backend/analysis-pipeline.md`
  - Add executable signatures for the formal output layer after implementation details settle.

---

## Task 1: Formal Output Layer Types

**Files:**
- Create: `src/server/modules/analysis/review-output/types.ts`
- Test: `src/server/modules/analysis/review-output/coordinator.test.ts` will consume these types in Task 3.

- [ ] **Step 1: Create the shared type file**

Create `src/server/modules/analysis/review-output/types.ts`:

```ts
import type { AnalysisArchitecture } from "@/server/modules/analysis/pipelines/types";

export type ReviewOutputProjectionKind = "FULL_BOOK";

export interface ReviewOutputWriteInput {
  architecture: AnalysisArchitecture;
  bookId      : string;
  runId       : string;
  chapterIds  : string[];
  jobId       : string;
  scope       : string;
}

export interface ReviewOutputWriterResult {
  architecture              : AnalysisArchitecture;
  personaCandidates         : number;
  entityMentions            : number;
  eventClaims               : number;
  relationClaims            : number;
  identityResolutionClaims  : number;
  timeClaims                : number;
  validatedExistingClaims   : number;
}

export interface ReviewOutputProjectionResult {
  kind  : ReviewOutputProjectionKind;
  bookId: string;
  result: unknown;
}

export interface ReviewOutputCoordinatorResult {
  writerResult    : ReviewOutputWriterResult;
  projectionResult: ReviewOutputProjectionResult;
}

export interface AnalysisReviewOutputWriter {
  readonly architecture: AnalysisArchitecture;
  write(input: ReviewOutputWriteInput): Promise<ReviewOutputWriterResult>;
}
```

- [ ] **Step 2: Run type-check for the new standalone type file**

Run:

```bash
pnpm type-check
```

Expected: PASS. The file only imports existing public pipeline types.

- [ ] **Step 3: Commit Task 1**

```bash
git add src/server/modules/analysis/review-output/types.ts
git commit -m "feat(review-output): add formal output layer contracts" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Promote Sequential Adapter to Formal Writer

**Files:**
- Modify: `src/server/modules/analysis/review-output/sequential-review-output.ts`
- Modify: `src/server/modules/analysis/review-output/sequential-review-output.test.ts`
- Modify: `scripts/backfill-unified-review-output.ts`

- [ ] **Step 1: Write the failing writer alias test**

In `src/server/modules/analysis/review-output/sequential-review-output.test.ts`, update the import:

```ts
import {
  createSequentialReviewOutputAdapter,
  createSequentialReviewOutputWriter
} from "@/server/modules/analysis/review-output/sequential-review-output";
```

Add this test near the top of the existing `describe` block:

```ts
it("exposes sequential review output as a formal writer", async () => {
  const tx = makeTx();
  const prismaClient = makePrisma(tx);
  const writer = createSequentialReviewOutputWriter(prismaClient as unknown as PrismaClient);

  expect(writer.architecture).toBe("sequential");

  const result = await writer.write({
    architecture: "sequential",
    bookId      : BOOK_ID,
    runId       : RUN_ID,
    chapterIds  : [CHAPTER_ID_1],
    jobId       : JOB_ID,
    scope       : "FULL_BOOK"
  });

  expect(result.architecture).toBe("sequential");
  expect(result.personaCandidates).toBe(1);
  expect(result.entityMentions).toBe(1);
  expect(result.eventClaims).toBe(1);
  expect(result.relationClaims).toBe(1);
  expect(result.identityResolutionClaims).toBe(1);
  expect(result.timeClaims).toBe(1);
  expect(result.validatedExistingClaims).toBe(0);
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts -t "formal writer"
```

Expected: FAIL with `createSequentialReviewOutputWriter` not exported.

- [ ] **Step 3: Implement the writer factory while preserving adapter compatibility**

In `src/server/modules/analysis/review-output/sequential-review-output.ts`, import the new types:

```ts
import type {
  AnalysisReviewOutputWriter,
  ReviewOutputWriterResult
} from "@/server/modules/analysis/review-output/types";
```

Rename the existing result interface to extend the shared writer result:

```ts
export interface SequentialReviewOutputResult extends Omit<ReviewOutputWriterResult, "architecture" | "validatedExistingClaims"> {}
```

Add this helper after `createSequentialReviewOutputAdapter`:

```ts
function toSequentialWriterResult(result: SequentialReviewOutputResult): ReviewOutputWriterResult {
  return {
    architecture             : "sequential",
    personaCandidates        : result.personaCandidates,
    entityMentions           : result.entityMentions,
    eventClaims              : result.eventClaims,
    relationClaims           : result.relationClaims,
    identityResolutionClaims : result.identityResolutionClaims,
    timeClaims               : result.timeClaims,
    validatedExistingClaims  : 0
  };
}

export function createSequentialReviewOutputWriter(
  prismaClient: PrismaClient = prisma
): AnalysisReviewOutputWriter {
  const adapter = createSequentialReviewOutputAdapter(prismaClient);

  return {
    architecture: "sequential",
    async write(input) {
      if (input.architecture !== "sequential") {
        throw new Error(`Sequential review output writer received architecture ${input.architecture}`);
      }

      const result = await adapter.writeBookReviewOutput({
        bookId    : input.bookId,
        runId     : input.runId,
        chapterIds: input.chapterIds
      });

      return toSequentialWriterResult(result);
    }
  };
}
```

- [ ] **Step 4: Update backfill import without changing CLI behavior**

In `scripts/backfill-unified-review-output.ts`, keep backfill on the existing adapter because backfill needs `backfillLatestSucceededSequentialJob`:

```ts
import { createSequentialReviewOutputAdapter } from "../src/server/modules/analysis/review-output/sequential-review-output.ts";
```

No behavior change is required. If this import already exists exactly as above, leave the file unchanged.

- [ ] **Step 5: Run sequential writer tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/server/modules/analysis/review-output/sequential-review-output.ts src/server/modules/analysis/review-output/sequential-review-output.test.ts scripts/backfill-unified-review-output.ts
git commit -m "feat(review-output): promote sequential output to writer" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Threestage Review Output Writer

**Files:**
- Create: `src/server/modules/analysis/review-output/threestage-review-output.ts`
- Create: `src/server/modules/analysis/review-output/threestage-review-output.test.ts`

- [ ] **Step 1: Write failing tests for threestage validation**

Create `src/server/modules/analysis/review-output/threestage-review-output.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createThreeStageReviewOutputWriter } from "@/server/modules/analysis/review-output/threestage-review-output";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID = "44444444-4444-4444-8444-444444444444";

function makePrismaMock(counts: {
  personaCandidates?: number;
  eventClaims?: number;
  relationClaims?: number;
  timeClaims?: number;
  identityResolutionClaims?: number;
}) {
  return {
    personaCandidate: { count: vi.fn().mockResolvedValue(counts.personaCandidates ?? 1) },
    eventClaim: { count: vi.fn().mockResolvedValue(counts.eventClaims ?? 1) },
    relationClaim: { count: vi.fn().mockResolvedValue(counts.relationClaims ?? 1) },
    timeClaim: { count: vi.fn().mockResolvedValue(counts.timeClaims ?? 1) },
    identityResolutionClaim: { count: vi.fn().mockResolvedValue(counts.identityResolutionClaims ?? 1) }
  };
}

describe("createThreeStageReviewOutputWriter", () => {
  it("validates existing claim-first output for threestage jobs", async () => {
    const prismaMock = makePrismaMock({});
    const writer = createThreeStageReviewOutputWriter(prismaMock as never);

    const result = await writer.write({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    });

    expect(result).toEqual({
      architecture             : "threestage",
      personaCandidates        : 1,
      entityMentions           : 0,
      eventClaims              : 1,
      relationClaims           : 1,
      identityResolutionClaims : 1,
      timeClaims               : 1,
      validatedExistingClaims  : 4
    });
    expect(prismaMock.personaCandidate.count).toHaveBeenCalledWith({
      where: { bookId: BOOK_ID, runId: RUN_ID }
    });
    expect(prismaMock.identityResolutionClaim.count).toHaveBeenCalledWith({
      where: { bookId: BOOK_ID, runId: RUN_ID }
    });
  });

  it("fails when threestage produced no identity resolution claims", async () => {
    const writer = createThreeStageReviewOutputWriter(makePrismaMock({
      identityResolutionClaims: 0
    }) as never);

    await expect(writer.write({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    })).rejects.toThrow("ThreeStage review output is missing identity_resolution_claims");
  });
});
```

- [ ] **Step 2: Run the new tests and verify failure**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/threestage-review-output.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the threestage writer**

Create `src/server/modules/analysis/review-output/threestage-review-output.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type {
  AnalysisReviewOutputWriter,
  ReviewOutputWriterResult
} from "@/server/modules/analysis/review-output/types";

interface ThreeStageReviewOutputPrisma {
  personaCandidate: { count(args: { where: { bookId: string; runId: string } }): Promise<number> };
  eventClaim: { count(args: { where: { bookId: string; runId: string } }): Promise<number> };
  relationClaim: { count(args: { where: { bookId: string; runId: string } }): Promise<number> };
  timeClaim: { count(args: { where: { bookId: string; runId: string } }): Promise<number> };
  identityResolutionClaim: { count(args: { where: { bookId: string; runId: string } }): Promise<number> };
}

export function createThreeStageReviewOutputWriter(
  prismaClient: PrismaClient = prisma
): AnalysisReviewOutputWriter {
  const db = prismaClient as unknown as ThreeStageReviewOutputPrisma;

  return {
    architecture: "threestage",
    async write(input): Promise<ReviewOutputWriterResult> {
      if (input.architecture !== "threestage") {
        throw new Error(`ThreeStage review output writer received architecture ${input.architecture}`);
      }

      const where = { bookId: input.bookId, runId: input.runId };
      const [
        personaCandidates,
        eventClaims,
        relationClaims,
        timeClaims,
        identityResolutionClaims
      ] = await Promise.all([
        db.personaCandidate.count({ where }),
        db.eventClaim.count({ where }),
        db.relationClaim.count({ where }),
        db.timeClaim.count({ where }),
        db.identityResolutionClaim.count({ where })
      ]);

      if (personaCandidates === 0) {
        throw new Error("ThreeStage review output is missing persona_candidates");
      }
      if (identityResolutionClaims === 0) {
        throw new Error("ThreeStage review output is missing identity_resolution_claims");
      }
      if (eventClaims + relationClaims + timeClaims === 0) {
        throw new Error("ThreeStage review output is missing reviewable claims");
      }

      return {
        architecture: "threestage",
        personaCandidates,
        entityMentions: 0,
        eventClaims,
        relationClaims,
        identityResolutionClaims,
        timeClaims,
        validatedExistingClaims: eventClaims + relationClaims + timeClaims + identityResolutionClaims
      };
    }
  };
}
```

- [ ] **Step 4: Run threestage writer tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/threestage-review-output.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/server/modules/analysis/review-output/threestage-review-output.ts src/server/modules/analysis/review-output/threestage-review-output.test.ts
git commit -m "feat(review-output): add threestage output writer" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Review Output Coordinator

**Files:**
- Create: `src/server/modules/analysis/review-output/coordinator.ts`
- Create: `src/server/modules/analysis/review-output/coordinator.test.ts`

- [ ] **Step 1: Write failing coordinator tests**

Create `src/server/modules/analysis/review-output/coordinator.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createReviewOutputCoordinator } from "@/server/modules/analysis/review-output/coordinator";
import type { AnalysisReviewOutputWriter } from "@/server/modules/analysis/review-output/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID = "44444444-4444-4444-8444-444444444444";

function makeWriter(architecture: "sequential" | "threestage"): AnalysisReviewOutputWriter {
  return {
    architecture,
    write: vi.fn().mockResolvedValue({
      architecture,
      personaCandidates        : 1,
      entityMentions           : architecture === "sequential" ? 1 : 0,
      eventClaims              : 1,
      relationClaims           : 0,
      identityResolutionClaims : 1,
      timeClaims               : 1,
      validatedExistingClaims  : architecture === "threestage" ? 3 : 0
    })
  };
}

describe("createReviewOutputCoordinator", () => {
  it("runs the selected architecture writer then rebuilds FULL_BOOK projection", async () => {
    const sequentialWriter = makeWriter("sequential");
    const projection = vi.fn().mockResolvedValue({ personaChapterFacts: 1 });
    const coordinator = createReviewOutputCoordinator({
      writers: [sequentialWriter],
      rebuildProjection: projection
    });

    const result = await coordinator.writeReviewOutput({
      architecture: "sequential",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "CHAPTER_RANGE"
    });

    expect(sequentialWriter.write).toHaveBeenCalledWith({
      architecture: "sequential",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "CHAPTER_RANGE"
    });
    expect(projection).toHaveBeenCalledWith({ kind: "FULL_BOOK", bookId: BOOK_ID });
    expect(result.projectionResult).toEqual({
      kind  : "FULL_BOOK",
      bookId: BOOK_ID,
      result: { personaChapterFacts: 1 }
    });
  });

  it("fails before projection when no writer is registered for the architecture", async () => {
    const projection = vi.fn();
    const coordinator = createReviewOutputCoordinator({
      writers: [],
      rebuildProjection: projection
    });

    await expect(coordinator.writeReviewOutput({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    })).rejects.toThrow("No review output writer registered for architecture threestage");
    expect(projection).not.toHaveBeenCalled();
  });

  it("does not rebuild projection when the writer fails", async () => {
    const writer = makeWriter("threestage");
    vi.mocked(writer.write).mockRejectedValueOnce(new Error("missing claims"));
    const projection = vi.fn();
    const coordinator = createReviewOutputCoordinator({
      writers: [writer],
      rebuildProjection: projection
    });

    await expect(coordinator.writeReviewOutput({
      architecture: "threestage",
      bookId      : BOOK_ID,
      runId       : RUN_ID,
      chapterIds  : [CHAPTER_ID],
      jobId       : JOB_ID,
      scope       : "FULL_BOOK"
    })).rejects.toThrow("missing claims");
    expect(projection).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run coordinator tests and verify failure**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/coordinator.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement coordinator**

Create `src/server/modules/analysis/review-output/coordinator.ts`:

```ts
import type { AnalysisArchitecture } from "@/server/modules/analysis/pipelines/types";
import {
  type AnalysisReviewOutputWriter,
  type ReviewOutputCoordinatorResult,
  type ReviewOutputWriteInput
} from "@/server/modules/analysis/review-output/types";

export interface ReviewOutputCoordinatorDependencies {
  writers: AnalysisReviewOutputWriter[];
  rebuildProjection(input: { kind: "FULL_BOOK"; bookId: string }): Promise<unknown>;
}

export interface ReviewOutputCoordinator {
  writeReviewOutput(input: ReviewOutputWriteInput): Promise<ReviewOutputCoordinatorResult>;
}

function buildWriterMap(writers: AnalysisReviewOutputWriter[]): Map<AnalysisArchitecture, AnalysisReviewOutputWriter> {
  return new Map(writers.map(writer => [writer.architecture, writer]));
}

export function createReviewOutputCoordinator(
  dependencies: ReviewOutputCoordinatorDependencies
): ReviewOutputCoordinator {
  const writers = buildWriterMap(dependencies.writers);

  return {
    async writeReviewOutput(input) {
      const writer = writers.get(input.architecture);
      if (!writer) {
        throw new Error(`No review output writer registered for architecture ${input.architecture}`);
      }

      const writerResult = await writer.write(input);
      const projectionRawResult = await dependencies.rebuildProjection({
        kind  : "FULL_BOOK",
        bookId: input.bookId
      });

      return {
        writerResult,
        projectionResult: {
          kind  : "FULL_BOOK",
          bookId: input.bookId,
          result: projectionRawResult
        }
      };
    }
  };
}
```

- [ ] **Step 4: Run coordinator tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/coordinator.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/server/modules/analysis/review-output/coordinator.ts src/server/modules/analysis/review-output/coordinator.test.ts
git commit -m "feat(review-output): add output coordinator" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Route Analysis Jobs Through the Coordinator

**Files:**
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`

- [ ] **Step 1: Write failing job-runner tests for architecture-neutral output**

In `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`, replace the `writeSequentialReviewOutput`/`rebuildReviewProjection` option setup in `createRunnerContext` with:

```ts
const writeReviewOutput = vi.fn().mockResolvedValue({});
```

Return it from `createRunnerContext`.

Add this test near the review output test group:

```ts
it("routes both architectures through the formal review output coordinator", async () => {
  const jobId = "job-formal-output";
  const bookId = "book-1";
  const {
    prismaMock,
    runner,
    writeReviewOutput
  } = createRunnerContext();

  prismaMock.analysisJob.findFirst.mockResolvedValueOnce({
    id            : jobId,
    bookId,
    status        : AnalysisJobStatus.QUEUED,
    architecture  : "threestage",
    scope         : "FULL_BOOK",
    chapterStart  : null,
    chapterEnd    : null,
    chapterIndices: []
  });

  await runner(jobId);

  expect(writeReviewOutput).toHaveBeenCalledWith({
    architecture: "threestage",
    bookId,
    runId       : expect.any(String),
    chapterIds  : ["chapter-1"],
    jobId,
    scope       : "FULL_BOOK"
  });
});
```

Update the existing sequential test to expect `writeReviewOutput` with `architecture: "sequential"` and remove assertions against `writeSequentialReviewOutput` and direct `rebuildReviewProjection`.

- [ ] **Step 2: Run job-runner tests and verify failure**

Run:

```bash
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts -t "formal review output|review output|projection"
```

Expected: FAIL because the runner still accepts old output hooks and branches on sequential.

- [ ] **Step 3: Refactor runner options to accept the coordinator hook**

In `src/server/modules/analysis/jobs/runAnalysisJob.ts`, replace `AnalysisJobRunnerReviewOutputOptions` with:

```ts
export interface AnalysisJobRunnerReviewOutputOptions {
  /**
   * Formal review output layer. It must submit architecture-specific output and rebuild FULL_BOOK projection.
   */
  writeReviewOutput?: (input: {
    architecture: AnalysisArchitecture;
    bookId      : string;
    runId       : string;
    chapterIds  : string[];
    jobId       : string;
    scope       : string;
  }) => Promise<unknown>;
}
```

Add imports:

```ts
import { createReviewOutputCoordinator } from "@/server/modules/analysis/review-output/coordinator";
import { createSequentialReviewOutputWriter } from "@/server/modules/analysis/review-output/sequential-review-output";
import { createThreeStageReviewOutputWriter } from "@/server/modules/analysis/review-output/threestage-review-output";
```

Replace the old resolved output hooks with:

```ts
const resolvedWriteReviewOutput =
  options.writeReviewOutput
  ?? createReviewOutputCoordinator({
    writers: [
      createSequentialReviewOutputWriter(prismaClient),
      createThreeStageReviewOutputWriter(prismaClient)
    ],
    rebuildProjection: createProjectionBuilder({
      repository: createProjectionRepository(prismaClient)
    }).rebuildProjection
  }).writeReviewOutput;
```

- [ ] **Step 4: Replace architecture-specific output code**

Replace the current block:

```ts
if (architecture === "sequential") {
  if (analysisRunId === null) {
    throw new Error(`解析任务 ${runningJob.id} 缺少 analysisRunId，无法生成审核输出`);
  }
  await resolvedWriteSequentialReviewOutput({
    bookId    : runningJob.bookId,
    runId     : analysisRunId,
    chapterIds: chapters.map(chapter => chapter.id)
  });
}
await resolvedRebuildReviewProjection({ kind: "FULL_BOOK", bookId: runningJob.bookId });
```

with:

```ts
if (analysisRunId === null) {
  throw new Error(`解析任务 ${runningJob.id} 缺少 analysisRunId，无法生成审核输出`);
}

const reviewOutputResult = await resolvedWriteReviewOutput({
  architecture,
  bookId    : runningJob.bookId,
  runId     : analysisRunId,
  chapterIds: chapters.map(chapter => chapter.id),
  jobId     : runningJob.id,
  scope     : runningJob.scope
});
```

Update the log payload:

```ts
console.info(
  "[analysis.runner] review.output.completed",
  JSON.stringify({
    jobId       : runningJob.id,
    bookId      : runningJob.bookId,
    scope       : runningJob.scope,
    architecture,
    chapterCount: chapters.length,
    result      : reviewOutputResult
  })
);
```

- [ ] **Step 5: Remove stale imports and old tests**

Remove:

```ts
import { createSequentialReviewOutputAdapter } from "@/server/modules/analysis/review-output/sequential-review-output";
```

Keep projection imports because the default coordinator factory still needs them.

In tests, remove all `writeSequentialReviewOutput` and `rebuildReviewProjection` mock fields from `createRunnerContext`. Replace with a single `writeReviewOutput` mock.

- [ ] **Step 6: Run job-runner tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/server/modules/analysis/jobs/runAnalysisJob.ts src/server/modules/analysis/jobs/runAnalysisJob.test.ts
git commit -m "feat(analysis): route jobs through review output coordinator" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Spec and Documentation Update

**Files:**
- Modify: `.trellis/spec/backend/analysis-pipeline.md`
- Modify: `docs/superpowers/specs/2026-04-26-unified-review-output-design.md`

- [ ] **Step 1: Update code-spec with executable signatures**

In `.trellis/spec/backend/analysis-pipeline.md`, under the unified review output contract, add:

```md
### Formal Review Output Layer Signatures

```ts
interface ReviewOutputWriteInput {
  architecture: AnalysisArchitecture;
  bookId      : string;
  runId       : string;
  chapterIds  : string[];
  jobId       : string;
  scope       : string;
}

interface AnalysisReviewOutputWriter {
  readonly architecture: AnalysisArchitecture;
  write(input: ReviewOutputWriteInput): Promise<ReviewOutputWriterResult>;
}
```

`runAnalysisJob` must call only the coordinator-level `writeReviewOutput(input)` after pipeline success and before job/book success. It must not branch on `architecture` to decide whether review output should be written.
```

- [ ] **Step 2: Update design doc language**

In `docs/superpowers/specs/2026-04-26-unified-review-output-design.md`, replace language that describes the sequential adapter as a standalone special path with:

```md
The formal output layer owns the final review submission contract. Each architecture registers one writer. Sequential currently implements its writer by normalizing legacy sequential rows into claims; threestage implements its writer by validating the claim-first stage output. The job runner calls the output coordinator for all architectures.
```

- [ ] **Step 3: Run markdown-free validation**

Run:

```bash
pnpm type-check
```

Expected: PASS. There is no markdown lint command in this project.

- [ ] **Step 4: Commit Task 6**

```bash
git add .trellis/spec/backend/analysis-pipeline.md docs/superpowers/specs/2026-04-26-unified-review-output-design.md
git commit -m "docs: document formal review output layer" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Final Validation

**Files:**
- No new production files unless prior tasks require small fixes.

- [ ] **Step 1: Run focused review-output tests**

Run:

```bash
pnpm vitest run \
  src/server/modules/analysis/review-output/sequential-review-output.test.ts \
  src/server/modules/analysis/review-output/threestage-review-output.test.ts \
  src/server/modules/analysis/review-output/coordinator.test.ts \
  src/server/modules/analysis/jobs/runAnalysisJob.test.ts \
  src/server/modules/books/startBookAnalysis.test.ts \
  src/server/modules/review/evidence-review/review-query-service.test.ts
```

Expected: PASS with all focused test files passing.

- [ ] **Step 2: Run type-check**

Run:

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 3: Run focused lint on touched files**

Run:

```bash
pnpm exec eslint \
  src/server/modules/analysis/review-output/types.ts \
  src/server/modules/analysis/review-output/sequential-review-output.ts \
  src/server/modules/analysis/review-output/sequential-review-output.test.ts \
  src/server/modules/analysis/review-output/threestage-review-output.ts \
  src/server/modules/analysis/review-output/threestage-review-output.test.ts \
  src/server/modules/analysis/review-output/coordinator.ts \
  src/server/modules/analysis/review-output/coordinator.test.ts \
  src/server/modules/analysis/jobs/runAnalysisJob.ts \
  src/server/modules/analysis/jobs/runAnalysisJob.test.ts
```

Expected: PASS.

- [ ] **Step 4: Check full lint and document baseline if unrelated failures remain**

Run:

```bash
pnpm lint
```

Expected: PASS if the repository baseline has been fixed. If it fails only on unrelated existing frontend React/compiler issues, record the first unrelated file and error class in the final handoff and do not change unrelated UI files.

- [ ] **Step 5: Commit any validation-only fixes**

If Step 1-3 required fixes:

```bash
git add <fixed-files>
git commit -m "fix(review-output): address validation findings" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan implements the approved maximum-scope design: typed formal output layer, per-architecture writers, coordinator, job-runner integration, docs, and validation.
- Placeholder scan: No `TBD`, `TODO`, or “similar to” placeholders remain. Every implementation task names exact files, commands, expected outcomes, and code shapes.
- Type consistency: `ReviewOutputWriteInput`, `ReviewOutputWriterResult`, `AnalysisReviewOutputWriter`, and `writeReviewOutput` are defined once in Task 1 and used consistently in later tasks.
