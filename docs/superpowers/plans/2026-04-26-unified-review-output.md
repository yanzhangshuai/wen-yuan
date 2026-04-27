# Unified Review Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both `sequential` and `threestage` analysis jobs produce the same claim/projection output so the review center shows reviewable roles for either architecture.

**Architecture:** Keep `sequential` and `threestage` as independent selectable pipelines. Add a sequential review-output adapter that converts existing legacy sequential rows into unified claim rows, then rebuild the same review projections before marking an analysis job successful. The review center remains unchanged and continues reading projection tables only.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7, Vitest, existing claim write service and projection builder.

---

## File Structure

- Create: `src/server/modules/analysis/review-output/sequential-review-output.ts`
  - Converts sequential legacy rows (`mentions`, `biography_records`, `relationships`) into review claim rows.
  - Creates run-scoped `persona_candidates`, chapter segments, evidence spans, entity mentions, accepted identity-resolution claims, event claims, and relation claims.
  - Uses existing claim schemas/write service for validation instead of raw unchecked payloads.
- Create: `src/server/modules/analysis/review-output/sequential-review-output.test.ts`
  - Unit tests for conversion behavior, claim review states, identity mapping, and failure propagation.
- Create: `scripts/backfill-unified-review-output.ts`
  - One-off CLI for existing completed sequential books, including the currently broken review URL.
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
  - Run sequential adapter after successful pipeline output and before projection rebuild/job success.
  - Rebuild review projection for both architectures before marking job/book completed.
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
  - Cover sequential adapter invocation, projection invocation, architecture independence, and failure behavior.
- Modify: `src/server/modules/books/startBookAnalysis.ts`
  - Preserve explicit architecture selection without adding a cross-architecture fallback.
- Modify: `src/server/modules/books/startBookAnalysis.test.ts`
  - Cover explicit `sequential` and explicit `threestage` architecture behavior.
- Modify: `.trellis/spec/backend/analysis-pipeline.md`
  - Update only if implementation details differ from the existing unified-output spec.

---

## Task 1: Sequential Review Output Adapter

**Files:**
- Create: `src/server/modules/analysis/review-output/sequential-review-output.ts`
- Test: `src/server/modules/analysis/review-output/sequential-review-output.test.ts`

- [ ] **Step 1: Write the failing adapter test**

Create `src/server/modules/analysis/review-output/sequential-review-output.test.ts` with this first test:

```ts
import { describe, expect, it, vi } from "vitest";

import { createSequentialReviewOutputAdapter } from "@/server/modules/analysis/review-output/sequential-review-output";

describe("sequential review output adapter", () => {
  it("converts legacy sequential rows into accepted review claims with identity mappings", async () => {
    const state = {
      personaCandidates: [] as Array<{ id: string; canonicalLabel: string; runId: string }>,
      entityMentions   : [] as Array<{ id: string; surfaceText: string; evidenceSpanId: string }>,
      eventClaims      : [] as unknown[],
      relationClaims   : [] as unknown[],
      identityClaims   : [] as unknown[]
    };

    let candidateSeq = 0;
    let spanSeq = 0;
    let entityMentionSeq = 0;

    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      chapter: {
        findMany: vi.fn().mockResolvedValue([{
          id     : "11111111-1111-4111-8111-111111111111",
          no     : 1,
          title  : "第一回",
          content: "范进中了举，众人都称范进老爷。"
        }])
      },
      mention: {
        findMany: vi.fn().mockResolvedValue([{
          id       : "22222222-2222-4222-8222-222222222222",
          chapterId: "11111111-1111-4111-8111-111111111111",
          personaId: "33333333-3333-4333-8333-333333333333",
          rawText  : "范进",
          summary  : "范进出场",
          persona  : { id: "33333333-3333-4333-8333-333333333333", name: "范进" }
        }])
      },
      biographyRecord: {
        findMany: vi.fn().mockResolvedValue([{
          id         : "44444444-4444-4444-8444-444444444444",
          chapterId  : "11111111-1111-4111-8111-111111111111",
          chapterNo  : 1,
          personaId  : "33333333-3333-4333-8333-333333333333",
          category   : "EXAM",
          event      : "范进中了举",
          title      : "中举",
          location   : null,
          virtualYear: null
        }])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([{
          id         : "55555555-5555-4555-8555-555555555555",
          chapterId  : "11111111-1111-4111-8111-111111111111",
          sourceId   : "33333333-3333-4333-8333-333333333333",
          targetId   : "66666666-6666-4666-8666-666666666666",
          type       : "师生",
          description: "范进与周进有师承关系",
          evidence   : "周进赏识范进",
          source     : { id: "33333333-3333-4333-8333-333333333333", name: "范进" },
          target     : { id: "66666666-6666-4666-8666-666666666666", name: "周进" }
        }])
      },
      personaCandidate: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(async ({ data }: { data: { canonicalLabel: string; runId: string } }) => {
          const row = {
            id            : `77777777-7777-4777-8777-${String(++candidateSeq).padStart(12, "0")}`,
            canonicalLabel: data.canonicalLabel,
            runId         : data.runId
          };
          state.personaCandidates.push(row);
          return { id: row.id };
        })
      },
      chapterSegment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id            : "88888888-8888-4888-8888-888888888888",
          bookId        : "99999999-9999-4999-8999-999999999999",
          chapterId     : "11111111-1111-4111-8111-111111111111",
          segmentType   : "NARRATIVE",
          startOffset   : 0,
          endOffset     : 16,
          text          : "范进中了举，众人都称范进老爷。",
          normalizedText: "范进中了举，众人都称范进老爷。",
          speakerHint   : null
        })
      },
      evidenceSpan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: { data: { quotedText: string } }) => ({
          id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(++spanSeq).padStart(12, "0")}`,
          ...data
        }))
      },
      entityMention: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(async ({ data }: { data: { surfaceText: string; evidenceSpanId: string } }) => {
          const row = {
            id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(++entityMentionSeq).padStart(12, "0")}`,
            ...data
          };
          state.entityMentions.push(row);
          return row;
        })
      },
      aliasClaim: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      eventClaim: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
          state.eventClaims.push(...data);
          return { count: data.length };
        })
      },
      relationClaim: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
          state.relationClaims.push(...data);
          return { count: data.length };
        })
      },
      timeClaim: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      identityResolutionClaim: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
          state.identityClaims.push(...data);
          return { count: data.length };
        })
      },
      conflictFlag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 })
      }
    };

    const adapter = createSequentialReviewOutputAdapter(prisma as never);

    const result = await adapter.writeBookReviewOutput({
      bookId    : "99999999-9999-4999-8999-999999999999",
      runId     : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      chapterIds: ["11111111-1111-4111-8111-111111111111"]
    });

    expect(result).toEqual({
      personaCandidates       : 2,
      entityMentions          : 1,
      eventClaims             : 1,
      relationClaims          : 1,
      identityResolutionClaims: 1
    });
    expect(state.eventClaims).toMatchObject([{
      subjectPersonaCandidateId: state.personaCandidates[0]?.id,
      predicate                : "中举",
      objectText               : "范进中了举",
      eventCategory            : "EXAM",
      reviewState              : "ACCEPTED",
      source                   : "AI"
    }]);
    expect(state.relationClaims).toMatchObject([{
      relationTypeKey  : "师生",
      relationLabel    : "师生",
      relationTypeSource: "CUSTOM",
      direction         : "UNDIRECTED",
      reviewState       : "ACCEPTED",
      source            : "AI"
    }]);
    expect(state.identityClaims).toMatchObject([{
      mentionId         : state.entityMentions[0]?.id,
      resolvedPersonaId : "33333333-3333-4333-8333-333333333333",
      resolutionKind    : "RESOLVES_TO",
      reviewState       : "ACCEPTED",
      source            : "AI"
    }]);
  });
});
```

- [ ] **Step 2: Run the failing adapter test**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts
```

Expected: FAIL because `@/server/modules/analysis/review-output/sequential-review-output` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `src/server/modules/analysis/review-output/sequential-review-output.ts` with these exported APIs:

```ts
import { AliasType, MentionKind } from "@/generated/prisma/enums";
import { createClaimRepository } from "@/server/modules/analysis/claims/claim-repository";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";
import {
  toClaimCreateData,
  validateClaimDraftByFamily,
  type ClaimCreateDataByFamily,
  type ClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import {
  findOrCreateEvidenceSpan,
  type EvidenceSpanRow,
  type MaterializedEvidenceSpanData
} from "@/server/modules/analysis/evidence/evidence-spans";
import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";
import type { PrismaClient } from "@/generated/prisma/client";

export interface SequentialReviewOutputInput {
  bookId    : string;
  runId     : string;
  chapterIds: string[];
}

export interface SequentialReviewOutputResult {
  personaCandidates       : number;
  entityMentions          : number;
  eventClaims             : number;
  relationClaims          : number;
  identityResolutionClaims: number;
}
```

Implement `createSequentialReviewOutputAdapter(prismaClient: PrismaClient)` so `writeBookReviewOutput(input)` does all work inside `prismaClient.$transaction`.

Inside the transaction:

1. Load target chapters by `bookId` and `chapterIds`, selecting `id`, `no`, `title`, and `content`.
2. Load legacy `mention.findMany`, `biographyRecord.findMany`, and `relationship.findMany` for those chapters, including the related persona names needed for candidate labels.
3. Delete existing `personaCandidate` rows for `{ bookId, runId }`.
4. Create one `personaCandidate` per unique legacy persona id found in mentions, biography records, or relationships:

```ts
await tx.personaCandidate.create({
  data: {
    bookId,
    runId,
    canonicalLabel    : personaName,
    candidateStatus   : "CONFIRMED",
    firstSeenChapterNo: firstSeenChapterNo ?? null,
    lastSeenChapterNo : lastSeenChapterNo ?? null,
    mentionCount,
    evidenceScore     : Math.min(1, Math.max(0.1, mentionCount / 10))
  },
  select: { id: true }
});
```

5. Ensure a full-chapter `chapterSegment` exists for each chapter/run:

```ts
const segment = await tx.chapterSegment.findFirst({
  where: { runId, chapterId: chapter.id, segmentIndex: 0 }
});
```

Create it if missing with `segmentType: "NARRATIVE"`, `startOffset: 0`, `endOffset: chapter.content.length`, `text: chapter.content`, and `normalizedText: normalizeTextForEvidence(chapter.content)`.

6. For every legacy mention, create an evidence span using the first offset of `mention.rawText` in the chapter content. If the exact text is absent, use the first non-empty character range from the chapter content and do not pass `expectedText`.
7. Validate each entity mention draft with `validateClaimDraftByFamily("ENTITY_MENTION", draft)`, delete prior entity mentions for `{ bookId, chapterId, runId, source: "AI" }`, then create rows with `tx.entityMention.create` so their generated IDs can be used by identity-resolution claims.
8. Use `createClaimWriteService(createClaimRepository(tx))` for event, relation, and identity-resolution batches.
9. Write event claims with `reviewState: "ACCEPTED"`, `source: "AI"`, `predicate: biography.title ?? biography.category`, `objectText: biography.event`, `eventCategory: biography.category`, `narrativeLens: "SELF"`, and `subjectPersonaCandidateId` from the persona-to-candidate map.
10. Write relation claims with `reviewState: "ACCEPTED"`, `source: "AI"`, `relationTypeKey: relationship.type`, `relationLabel: relationship.type`, `relationTypeSource: "CUSTOM"`, `direction: "UNDIRECTED"`, and source/target candidate IDs.
11. Write identity-resolution claims with `reviewState: "ACCEPTED"`, `source: "AI"`, `mentionId` set to the new entity mention ID, `personaCandidateId` set to the matching candidate ID, `resolvedPersonaId` set to the legacy persona ID, `resolutionKind: "RESOLVES_TO"`, and `rationale: "sequential legacy resolver accepted this persona"`.
12. Return the created counts.

- [ ] **Step 4: Run the adapter test**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add the failure propagation test**

Add this test to the same file:

```ts
it("propagates claim write failures instead of returning successful counts", async () => {
  const prisma = createMinimalSequentialReviewOutputPrismaMock();
  prisma.eventClaim.createMany.mockRejectedValueOnce(new Error("event claim write failed"));

  const adapter = createSequentialReviewOutputAdapter(prisma as never);

  await expect(adapter.writeBookReviewOutput({
    bookId    : "99999999-9999-4999-8999-999999999999",
    runId     : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    chapterIds: ["11111111-1111-4111-8111-111111111111"]
  })).rejects.toThrow("event claim write failed");
});
```

Move the mock object from Step 1 into a local helper named `createMinimalSequentialReviewOutputPrismaMock()` so both tests use the same realistic setup.

- [ ] **Step 6: Run the adapter tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/server/modules/analysis/review-output/sequential-review-output.ts src/server/modules/analysis/review-output/sequential-review-output.test.ts
git commit -m "feat: convert sequential analysis to review claims"
```

---

## Task 2: Run Unified Output Before Job Success

**Files:**
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- Test: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`

- [ ] **Step 1: Write failing runner tests**

In `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`, extend `createRunnerContext()` with mock delegates for projection and sequential output:

```ts
const personaCandidateDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const projectionRebuild = vi.fn().mockResolvedValue({
  counts: {
    persona_chapter_facts: { deletedCount: 0, createdCount: 1 },
    persona_time_facts   : { deletedCount: 0, createdCount: 0 },
    relationship_edges   : { deletedCount: 0, createdCount: 0 },
    timeline_events      : { deletedCount: 0, createdCount: 0 }
  },
  rebuiltFamilies: ["persona_chapter_facts", "persona_time_facts", "relationship_edges", "timeline_events"],
  skipped        : { unmappedPersonaCandidateIds: [], ambiguousPersonaCandidateIds: [] }
});
```

Add a test that asserts a successful sequential full-book job writes unified output before the job is marked `SUCCEEDED`:

```ts
it("writes sequential review output and rebuilds projections before marking the job succeeded", async () => {
  const jobId = "job-1";
  const bookId = "book-1";
  const calls: string[] = [];
  const context = createRunnerContext({ withValidation: true });

  context.analysisJobFindUnique.mockResolvedValue({
    id: jobId,
    bookId,
    status: AnalysisJobStatus.QUEUED,
    architecture: "sequential",
    scope: "FULL_BOOK",
    chapterStart: null,
    chapterEnd: null,
    chapterIndices: []
  });
  context.chapterFindMany.mockResolvedValue([{ id: "chapter-1", no: 1 }]);
  context.writeSequentialReviewOutput.mockImplementation(async () => {
    calls.push("review-output");
    return {
      personaCandidates       : 1,
      entityMentions          : 1,
      eventClaims             : 1,
      relationClaims          : 0,
      identityResolutionClaims: 1
    };
  });
  context.rebuildProjection.mockImplementation(async () => {
    calls.push("projection");
    return {};
  });
  context.analysisJobUpdate.mockImplementation(async (args) => {
    if (args.data.status === AnalysisJobStatus.SUCCEEDED) calls.push("job-succeeded");
    return {};
  });

  await context.runner.runJob(jobId);

  expect(context.writeSequentialReviewOutput).toHaveBeenCalledWith({
    bookId,
    runId     : "run-observable",
    chapterIds: ["chapter-1"]
  });
  expect(context.rebuildProjection).toHaveBeenCalledWith({ kind: "FULL_BOOK", bookId });
  expect(calls).toEqual(["review-output", "projection", "job-succeeded"]);
});
```

Add a second test:

```ts
it("fails the job when projection rebuild fails", async () => {
  const jobId = "job-1";
  const context = createRunnerContext({ withValidation: true });

  context.analysisJobFindUnique.mockResolvedValue({
    id: jobId,
    bookId: "book-1",
    status: AnalysisJobStatus.QUEUED,
    architecture: "sequential",
    scope: "FULL_BOOK",
    chapterStart: null,
    chapterEnd: null,
    chapterIndices: []
  });
  context.chapterFindMany.mockResolvedValue([{ id: "chapter-1", no: 1 }]);
  context.rebuildProjection.mockRejectedValueOnce(new Error("projection failed"));

  await expect(context.runner.runJob(jobId)).rejects.toThrow("projection failed");
  expect(context.analysisJobUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
  }));
});
```

- [ ] **Step 2: Run the failing runner tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts -t "review output|projection rebuild"
```

Expected: FAIL because the runner does not yet inject or call sequential review output/projection rebuild.

- [ ] **Step 3: Modify runner dependencies**

In `src/server/modules/analysis/jobs/runAnalysisJob.ts`, import:

```ts
import { createSequentialReviewOutputAdapter } from "@/server/modules/analysis/review-output/sequential-review-output";
import {
  createProjectionBuilder,
  createProjectionRepository
} from "@/server/modules/review/evidence-review/projections/projection-builder";
```

Add injectable dependencies to `createAnalysisJobRunner()`:

```ts
interface AnalysisJobRunnerOptions {
  writeSequentialReviewOutput?: (input: {
    bookId    : string;
    runId     : string;
    chapterIds: string[];
  }) => Promise<unknown>;
  rebuildReviewProjection?: (input: { kind: "FULL_BOOK"; bookId: string }) => Promise<unknown>;
}
```

If the existing function currently accepts only `(prismaClient, chapterAnalyzer)`, change it to:

```ts
export function createAnalysisJobRunner(
  prismaClient: PrismaClient = prisma,
  chapterAnalyzer?: ChapterAnalyzer,
  options: AnalysisJobRunnerOptions = {}
) {
  const writeSequentialReviewOutput =
    options.writeSequentialReviewOutput
    ?? createSequentialReviewOutputAdapter(prismaClient).writeBookReviewOutput;
  const rebuildReviewProjection =
    options.rebuildReviewProjection
    ?? createProjectionBuilder({ repository: createProjectionRepository(prismaClient) }).rebuildProjection;
```

Update all test helper calls to pass the new options object.

- [ ] **Step 4: Call unified output before success**

In `runAnalysisJob.ts`, after pipeline success and cancellation check, before the transaction that marks job/book success:

```ts
const completedChapterIds = chapters.map((chapter) => chapter.id);

if (architecture === "sequential") {
  await writeSequentialReviewOutput({
    bookId    : runningJob.bookId,
    runId     : analysisRunId,
    chapterIds: completedChapterIds
  });
}

await rebuildReviewProjection({
  kind  : "FULL_BOOK",
  bookId: runningJob.bookId
});
```

Keep this outside the success-marking transaction. If either call throws, the existing catch path must mark the job failed and must not set the book to `COMPLETED`.

- [ ] **Step 5: Run the runner tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts -t "review output|projection rebuild"
```

Expected: PASS.

- [ ] **Step 6: Run the broader runner test file**

Run:

```bash
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/server/modules/analysis/jobs/runAnalysisJob.ts src/server/modules/analysis/jobs/runAnalysisJob.test.ts
git commit -m "feat: rebuild review output before analysis success"
```

---

## Task 3: Preserve Independent Architecture Selection

**Files:**
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- Modify: `src/server/modules/books/startBookAnalysis.ts`
- Test: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
- Test: `src/server/modules/books/startBookAnalysis.test.ts`

- [ ] **Step 1: Write architecture independence tests**

In `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`, add:

```ts
it("runs threestage jobs without invoking the sequential review adapter", async () => {
  const context = createRunnerContext({ withValidation: true });

  context.analysisJobFindUnique.mockResolvedValue({
    id: "job-1",
    bookId: "book-1",
    status: AnalysisJobStatus.QUEUED,
    architecture: "threestage",
    scope: "FULL_BOOK",
    chapterStart: null,
    chapterEnd: null,
    chapterIndices: []
  });
  context.chapterFindMany.mockResolvedValue([{ id: "chapter-1", no: 1 }]);

  await context.runner.runJob("job-1");

  expect(context.writeSequentialReviewOutput).not.toHaveBeenCalled();
  expect(context.rebuildProjection).toHaveBeenCalledWith({ kind: "FULL_BOOK", bookId: "book-1" });
});
```

In `src/server/modules/books/startBookAnalysis.test.ts`, add:

```ts
it("persists an explicit threestage architecture without rewriting it to sequential", async () => {
  const context = createStartBookAnalysisContext();

  await context.service.startBookAnalysis("book-1", { architecture: "threestage" });

  expect(context.analysisJobCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ architecture: "threestage" })
  }));
});
```

- [ ] **Step 2: Run the architecture independence tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts -t "threestage jobs"
pnpm vitest run src/server/modules/books/startBookAnalysis.test.ts -t "explicit threestage"
```

Expected: PASS after Task 2 has injectable projection/review-output hooks. If a test fails because code rewrites architecture, fix that behavior without adding a fallback.

- [ ] **Step 3: Keep runner dispatch explicit**

In `src/server/modules/analysis/jobs/runAnalysisJob.ts`, keep the architecture dispatch based on the persisted job value:

```ts
const architecture = normalizeAnalysisArchitecture(runningJob.architecture);
```

Do not add code that forces unknown or missing values to `sequential`. If the existing normalization maps unknown values to one architecture, leave that behavior unchanged unless a separate product decision defines invalid architecture handling.

- [ ] **Step 4: Keep startBookAnalysis explicit**

In `src/server/modules/books/startBookAnalysis.ts`, preserve explicit `input.architecture` values:

```ts
const requestedArchitecture = resolveArchitectureInput(input.architecture);
```

Do not change the selection UI or API into a one-architecture default as part of this task. The required behavior is that whichever architecture is selected later writes the same review-output database shape.

- [ ] **Step 5: Run architecture tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts -t "architecture|threestage jobs"
pnpm vitest run src/server/modules/books/startBookAnalysis.test.ts -t "architecture|explicit threestage"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/server/modules/analysis/jobs/runAnalysisJob.ts src/server/modules/books/startBookAnalysis.ts src/server/modules/analysis/jobs/runAnalysisJob.test.ts src/server/modules/books/startBookAnalysis.test.ts
git commit -m "test: preserve independent analysis architectures"
```

---

## Task 4: Existing Book Backfill Command

**Files:**
- Create: `scripts/backfill-unified-review-output.ts`
- Test: `src/server/modules/analysis/review-output/sequential-review-output.test.ts`

- [ ] **Step 1: Write failing test for latest-run resolution**

Add this test to `sequential-review-output.test.ts`:

```ts
it("can backfill a completed sequential book using the latest succeeded job run", async () => {
  const prisma = createMinimalSequentialReviewOutputPrismaMock();
  prisma.analysisJob = {
    findFirst: vi.fn().mockResolvedValue({
      id          : "job-1",
      bookId      : "99999999-9999-4999-8999-999999999999",
      architecture: "sequential",
      status      : "SUCCEEDED"
    })
  };
  prisma.analysisRun = {
    findFirst: vi.fn().mockResolvedValue({
      id   : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      jobId: "job-1"
    })
  };

  const adapter = createSequentialReviewOutputAdapter(prisma as never);

  await adapter.backfillLatestSucceededSequentialJob({
    bookId: "99999999-9999-4999-8999-999999999999"
  });

  expect(prisma.analysisJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      bookId      : "99999999-9999-4999-8999-999999999999",
      architecture: "sequential",
      status      : "SUCCEEDED"
    })
  }));
});
```

- [ ] **Step 2: Run the failing backfill test**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts -t "backfill"
```

Expected: FAIL because `backfillLatestSucceededSequentialJob` does not exist.

- [ ] **Step 3: Implement backfill method**

Add this method to the adapter:

```ts
async backfillLatestSucceededSequentialJob(input: { bookId: string }): Promise<SequentialReviewOutputResult> {
  const job = await prismaClient.analysisJob.findFirst({
    where: {
      bookId      : input.bookId,
      architecture: "sequential",
      status      : "SUCCEEDED"
    },
    orderBy: { finishedAt: "desc" },
    select : { id: true, bookId: true }
  });

  if (!job) {
    throw new Error(`No succeeded sequential analysis job found for book ${input.bookId}`);
  }

  const run = await prismaClient.analysisRun.findFirst({
    where  : { jobId: job.id },
    orderBy: { startedAt: "desc" },
    select : { id: true }
  });

  if (!run) {
    throw new Error(`No analysis run found for job ${job.id}`);
  }

  const chapters = await prismaClient.chapter.findMany({
    where : { bookId: input.bookId },
    select: { id: true }
  });

  return this.writeBookReviewOutput({
    bookId    : input.bookId,
    runId     : run.id,
    chapterIds: chapters.map((chapter) => chapter.id)
  });
}
```

Implement this method by closing over the `writeBookReviewOutput` function:

```ts
const writeBookReviewOutput = async (
  input: SequentialReviewOutputInput
): Promise<SequentialReviewOutputResult> => {
  // existing transaction implementation from Task 1
};

const backfillLatestSucceededSequentialJob = async (
  input: { bookId: string }
): Promise<SequentialReviewOutputResult> => {
  // latest-job lookup shown above, then call writeBookReviewOutput(...)
};

return {
  writeBookReviewOutput,
  backfillLatestSucceededSequentialJob
};
```

- [ ] **Step 4: Create the CLI script**

> **Convention note**: CLI scripts in this repo use `import "dotenv/config"`, `PrismaPg`, and
> `new PrismaClient({ adapter })` (not the global `@/server/db/prisma` singleton). The
> `isDirectExecution` guard ensures the script only runs when invoked directly (not when imported
> by tests). Errors from argument parsing and a missing `DATABASE_URL` propagate naturally through
> `main().catch(...)` so the process exits non-zero.

Create `scripts/backfill-unified-review-output.ts`:

```ts
import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { createSequentialReviewOutputAdapter } from "../src/server/modules/analysis/review-output/sequential-review-output.ts";
import {
  createProjectionBuilder,
  createProjectionRepository
} from "../src/server/modules/review/evidence-review/projections/projection-builder.ts";

function parseBookId(): string {
  const arg = process.argv.find(a => a.startsWith("--bookId="));
  const bookId = arg?.slice("--bookId=".length).trim();
  if (!bookId) {
    throw new Error("Usage: npx tsx scripts/backfill-unified-review-output.ts --bookId=<uuid>");
  }
  return bookId;
}

async function main() {
  const bookId = parseBookId();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in environment");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma  = new PrismaClient({ adapter });

  try {
    const reviewAdapter = createSequentialReviewOutputAdapter(prisma);
    const result = await reviewAdapter.backfillLatestSucceededSequentialJob({ bookId });

    const projectionResult = await createProjectionBuilder({
      repository: createProjectionRepository(prisma)
    }).rebuildProjection({ kind: "FULL_BOOK", bookId });

    console.info(JSON.stringify({ bookId, result, projectionResult }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectExecution = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run backfill tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts
```

Expected: PASS.

- [ ] **Step 6: Backfill the reported book locally**

Run:

```bash
pnpm tsx scripts/backfill-unified-review-output.ts --bookId=8168e0fb-ab41-441b-8ca5-71e19b2c4a99
```

Expected: JSON output shows `eventClaims > 0`, `identityResolutionClaims > 0`, and projection counts with `persona_chapter_facts.createdCount > 0`.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/backfill-unified-review-output.ts src/server/modules/analysis/review-output/sequential-review-output.ts src/server/modules/analysis/review-output/sequential-review-output.test.ts
git commit -m "chore: add sequential review output backfill"
```

---

## Task 5: Sequential Time Review Output

**Files:**
- Modify: `src/server/modules/analysis/review-output/sequential-review-output.ts`
- Test: `src/server/modules/analysis/review-output/sequential-review-output.test.ts`

- [ ] **Step 1: Write failing time-output test**

Add a test proving sequential review output writes accepted `TIME` claims and links event/relation claims through `timeHintId`:

```ts
it("writes time claims and links events and relations so personas can be reviewed by time", async () => {
  const tx = makeTx();
  tx.timeClaim.createMany.mockResolvedValueOnce({ count: 1 });
  const prismaClient = makePrisma(tx);
  const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

  const result = await adapter.writeBookReviewOutput({
    bookId    : BOOK_ID,
    runId     : RUN_ID,
    chapterIds: [CHAPTER_ID_1]
  });

  expect(result.timeClaims).toBe(1);
  expect(tx.timeClaim.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({
      bookId,
      chapterId          : CHAPTER_ID_1,
      runId              : RUN_ID,
      source             : "AI",
      reviewState        : "ACCEPTED",
      rawTimeText        : "第1章",
      normalizedLabel    : "第1章",
      timeType           : "CHAPTER_ORDER",
      relativeOrderWeight: 1,
      chapterRangeStart  : 1,
      chapterRangeEnd    : 1
    })]
  });
  expect(tx.eventClaim.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ timeHintId: expect.any(String) })]
  });
  expect(tx.relationClaim.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ timeHintId: expect.any(String) })]
  });
});
```

If the existing mocks need deterministic time claim IDs, adjust the repository mock to return created time claim rows using `create` or capture generated IDs in the adapter before `createMany`.

- [ ] **Step 2: Run the failing time-output test**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts -t "time claims"
```

Expected: FAIL because `timeClaims` is not returned and event/relation `timeHintId` is currently `null`.

- [ ] **Step 3: Implement time claim generation**

In `sequential-review-output.ts`:

1. Extend `SequentialReviewOutputResult` with:

```ts
timeClaims: number;
```

2. For each analyzed chapter, create accepted time claims before event/relation claims:
   - Prefer explicit legacy biography `virtualYear` when present:
     - `rawTimeText`: `virtualYear`
     - `normalizedLabel`: `virtualYear`
     - `timeType`: `"UNCERTAIN"` unless a stronger existing enum mapping already exists
     - `relativeOrderWeight`: `chapter.no`
     - `chapterRangeStart`: `chapter.no`
     - `chapterRangeEnd`: `chapter.no`
   - Always create a chapter-order fallback time claim:
     - `rawTimeText`: `第${chapter.no}章`
     - `normalizedLabel`: `第${chapter.no}章`
     - `timeType`: `"CHAPTER_ORDER"`
     - `relativeOrderWeight`: `chapter.no`
     - `chapterRangeStart`: `chapter.no`
     - `chapterRangeEnd`: `chapter.no`

3. Persist time claims through `claimService.writeClaimBatch({ family: "TIME", scope: { bookId, chapterId, runId, stageKey: "stage_a_extraction" }, drafts })`.

4. Link event claims:
   - If a biography has `virtualYear`, use the matching explicit time claim ID.
   - Otherwise use the chapter-order time claim ID.

5. Link relation claims to the chapter-order time claim ID.

6. Keep claims `ACCEPTED` because they are generated from legacy sequential committed output.

- [ ] **Step 4: Add projection-level confidence test**

Add a focused test using projection helpers or builder proving an accepted event with accepted identity and accepted time claim produces both:
- `persona_chapter_facts`
- `persona_time_facts` or `timeline_events`

Use existing projection tests if they already have helpers; otherwise keep this as an adapter test asserting `timeHintId` is non-null and time claim writes are accepted.

- [ ] **Step 5: Run adapter tests and type-check**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/server/modules/analysis/review-output/sequential-review-output.ts src/server/modules/analysis/review-output/sequential-review-output.test.ts docs/superpowers/plans/2026-04-26-unified-review-output.md
git commit -m "feat: add sequential time review output"
```

---

## Task 6: Review Center Verification

**Files:**
- Test: `src/server/modules/review/evidence-review/review-query-service.test.ts`
- No production UI changes unless the test exposes a real bug.

- [ ] **Step 1: Write or extend review query test**

Add a test proving the review center reads the projection produced by unified output:

```ts
it("returns personas from persona chapter facts without reading legacy profiles", async () => {
  const prisma = createReviewQueryPrismaMock({
    personaChapterFacts: [{
      bookId             : "book-1",
      chapterId          : "chapter-1",
      chapterNo          : 1,
      personaId          : "persona-1",
      personaName        : "范进",
      mentionCount       : 1,
      eventCount         : 1,
      relationCount      : 0,
      conflictCount      : 0,
      confidenceAggregate: 0.9,
      reviewStateSummary : { ACCEPTED: 1 },
      evidenceClaimIds   : ["event-1"],
      updatedAt          : new Date("2026-01-01T00:00:00.000Z")
    }]
  });

  const service = createReviewQueryService(prisma as never);

  const matrix = await service.getPersonaChapterMatrix({ bookId: "book-1" });

  expect(matrix.personas).toEqual([expect.objectContaining({
    personaId  : "persona-1",
    displayName: "范进"
  })]);
  expect(prisma.profile?.findMany).toBeUndefined();
});
```

- [ ] **Step 2: Run the review query test**

Run:

```bash
pnpm vitest run src/server/modules/review/evidence-review/review-query-service.test.ts -t "persona chapter facts"
```

Expected: PASS if existing behavior is already correct. If it fails, fix only the projection-query contract, not a legacy profile fallback.

- [ ] **Step 3: Commit Task 5 if files changed**

```bash
git add src/server/modules/review/evidence-review/review-query-service.test.ts
git commit -m "test: cover review center projection source"
```

---

## Task 7: Final Validation

**Files:**
- Modify: `.trellis/spec/backend/analysis-pipeline.md` only if code diverged from the existing spec.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run src/server/modules/analysis/review-output/sequential-review-output.test.ts
pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts
pnpm vitest run src/server/modules/books/startBookAnalysis.test.ts
pnpm vitest run src/server/modules/review/evidence-review/review-query-service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type-check and lint**

Run:

```bash
pnpm type-check
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Verify the reported review URL data path**

After running the backfill command from Task 4, query the database:

```bash
pnpm prisma:generate
node -e 'import("./src/server/db/prisma.ts").then(async ({ prisma }) => { const bookId = "8168e0fb-ab41-441b-8ca5-71e19b2c4a99"; const [candidates, events, identities, facts] = await Promise.all([prisma.personaCandidate.count({ where: { bookId } }), prisma.eventClaim.count({ where: { bookId } }), prisma.identityResolutionClaim.count({ where: { bookId } }), prisma.personaChapterFact.count({ where: { bookId } })]); console.log({ candidates, events, identities, facts }); await prisma.$disconnect(); })'
```

Expected: all four counts are greater than zero for a successfully backfilled sequential book.

- [ ] **Step 4: Verify the page manually**

Open:

```text
http://localhost:3000/admin/review/8168e0fb-ab41-441b-8ca5-71e19b2c4a99
```

Expected: the persona list is not empty, selecting a persona shows chapter evidence, and review actions operate on claim/projection data rather than legacy profiles.

- [ ] **Step 5: Commit final spec adjustment if needed**

If `.trellis/spec/backend/analysis-pipeline.md` changed:

```bash
git add .trellis/spec/backend/analysis-pipeline.md
git commit -m "docs: align analysis output spec with implementation"
```

---

## Self-Review Notes

- Spec coverage: The plan keeps both architectures independently selectable, creates unified claims/projections, keeps the review center projection-only, and fails jobs before success when unified output generation fails.
- Placeholder scan: No implementation step relies on an unspecified handler or an undefined future task.
- Type consistency: The central adapter API is `writeBookReviewOutput({ bookId, runId, chapterIds })`, and the runner/backfill tasks use the same shape.
- Scope boundary: The plan does not make the review center read `profiles` as a fallback and does not remove legacy sequential outputs.
