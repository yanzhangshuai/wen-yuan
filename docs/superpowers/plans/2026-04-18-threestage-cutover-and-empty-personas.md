# Threestage Cutover And Empty Personas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `threestage` the single full-book source of truth, fix the `persona/profile` read-write mismatch that causes empty character lists, and add enough stage observability to diagnose sparse full-book runs.

**Architecture:** Keep `sequential` untouched. Move full-book read paths to a `persona`-backed projection layer, then add explicit `threestage` stage logging and warning summaries inside the pipeline/job runner so a successful job can no longer be operationally opaque.

**Tech Stack:** TypeScript, Prisma, Vitest, existing server modules under `src/server/modules`

---

## File Structure

- Modify: `src/server/modules/personas/listBookPersonas.ts`
  Purpose: stop reading three-stage books from `profiles` as the primary source.
- Modify: `src/server/modules/personas/listBookPersonas.test.ts`
  Purpose: lock the new persona-backed list behavior.
- Modify: `src/server/modules/books/getBookById.ts`
  Purpose: compute `personaCount` from `persona` when the latest full-book job is `threestage`.
- Modify: `src/server/modules/books/getBookById.test.ts`
  Purpose: verify book detail count no longer depends on `profiles` for `threestage`.
- Modify: `src/server/modules/books/listBooks.ts`
  Purpose: align library-card `personaCount` with the same source-of-truth rule.
- Modify: `src/server/modules/books/listBooks.test.ts`
  Purpose: verify the list card count follows the latest architecture.
- Create: `src/server/modules/personas/bookPersonaProjection.ts`
  Purpose: centralize the `persona` projection used by read paths so count/list logic does not drift.
- Create: `src/server/modules/personas/bookPersonaProjection.test.ts`
  Purpose: isolate projection mapping rules from route-facing services.
- Create: `src/server/modules/analysis/pipelines/threestage/phaseLogging.ts`
  Purpose: provide a thin helper for stage/chapter phase-log writes from `threestage`.
- Create: `src/server/modules/analysis/pipelines/threestage/phaseLogging.test.ts`
  Purpose: lock log payload format and warning summaries.
- Modify: `src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.ts`
  Purpose: emit Stage A/B.5/B/C logs, stage summaries, and warning signals.
- Modify: `src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.test.ts`
  Purpose: verify log ordering, warning generation, and no-op behavior on cancel.
- Modify: `src/server/modules/analysis/pipelines/types.ts`
  Purpose: widen pipeline result from chapter counters to include warnings and stage summaries.
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
  Purpose: persist warning summaries into job/book state and avoid reporting opaque success.
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
  Purpose: verify warning propagation for sparse `threestage` runs.

### Task 1: Create A Persona Projection Source Of Truth

**Files:**
- Create: `src/server/modules/personas/bookPersonaProjection.ts`
- Test: `src/server/modules/personas/bookPersonaProjection.test.ts`

- [ ] **Step 1: Write the failing projection test**

```ts
import { describe, expect, it } from "vitest";

import { mapPersonaProjectionRows } from "@/server/modules/personas/bookPersonaProjection";

describe("bookPersonaProjection", () => {
  it("maps promoted persona rows into book persona list items", () => {
    const result = mapPersonaProjectionRows("book-1", [
      {
        id: "persona-1",
        name: "鲍廷玺",
        aliases: ["鲍二"],
        gender: "男",
        hometown: null,
        nameType: "NAMED",
        globalTags: ["盐商"],
        confidence: 0.93,
        recordSource: "AI",
        status: "CONFIRMED",
        mentionCount: 4,
        effectiveBiographyCount: 2,
        distinctChapters: 3
      }
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        id: "persona-1",
        profileId: null,
        bookId: "book-1",
        name: "鲍廷玺",
        localName: "鲍廷玺",
        aliases: ["鲍二"]
      })
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/modules/personas/bookPersonaProjection.test.ts`
Expected: FAIL with `Cannot find module "@/server/modules/personas/bookPersonaProjection"`.

- [ ] **Step 3: Write the minimal projection module**

```ts
import type { NameType, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import type { BookPersonaListItem } from "@/server/modules/personas/listBookPersonas";

export interface PersonaProjectionRow {
  id: string;
  name: string;
  aliases: string[];
  gender: string | null;
  hometown: string | null;
  nameType: NameType;
  globalTags: string[];
  confidence: number;
  recordSource: RecordSource;
  status: string;
  mentionCount: number;
  effectiveBiographyCount: number;
  distinctChapters: number;
}

function resolveProjectionStatus(status: string, recordSource: RecordSource): ProcessingStatus {
  if (status === "CONFIRMED") return "VERIFIED";
  if (recordSource === "MANUAL") return "VERIFIED";
  return "DRAFT";
}

export function mapPersonaProjectionRows(bookId: string, rows: readonly PersonaProjectionRow[]): BookPersonaListItem[] {
  return rows.map((row) => ({
    id: row.id,
    profileId: null,
    bookId,
    name: row.name,
    localName: row.name,
    aliases: row.aliases,
    gender: row.gender,
    hometown: row.hometown,
    nameType: row.nameType,
    globalTags: row.globalTags,
    localTags: [],
    officialTitle: null,
    localSummary: null,
    ironyIndex: 0,
    confidence: row.confidence,
    recordSource: row.recordSource,
    status: resolveProjectionStatus(row.status, row.recordSource)
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/modules/personas/bookPersonaProjection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/personas/bookPersonaProjection.ts src/server/modules/personas/bookPersonaProjection.test.ts
git commit -m "test: add persona projection source-of-truth mapper"
```

### Task 2: Move Read Paths Off `profiles` For Threestage Books

**Files:**
- Modify: `src/server/modules/personas/listBookPersonas.ts`
- Modify: `src/server/modules/personas/listBookPersonas.test.ts`
- Modify: `src/server/modules/books/getBookById.ts`
- Modify: `src/server/modules/books/getBookById.test.ts`
- Modify: `src/server/modules/books/listBooks.ts`
- Modify: `src/server/modules/books/listBooks.test.ts`
- Reuse: `src/server/modules/personas/bookPersonaProjection.ts`

- [ ] **Step 1: Write the failing service tests**

```ts
it("returns personas from persona projection when the latest full-book job uses threestage", async () => {
  const service = createListBookPersonasService({
    book: { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
    analysisJob: {
      findFirst: vi.fn().mockResolvedValue({
        architecture: "threestage",
        scope: "FULL_BOOK"
      })
    },
    persona: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "persona-1",
          name: "鲍廷玺",
          aliases: [],
          gender: null,
          hometown: null,
          nameType: "NAMED",
          globalTags: [],
          confidence: 0.88,
          recordSource: "AI",
          status: "CONFIRMED",
          mentionCount: 3,
          effectiveBiographyCount: 1,
          distinctChapters: 2
        }
      ])
    },
    profile: {
      findMany: vi.fn().mockResolvedValue([])
    }
  } as never);

  const result = await service.listBookPersonas("book-1");
  expect(result).toHaveLength(1);
  expect(result[0]?.id).toBe("persona-1");
  expect(result[0]?.profileId).toBeNull();
});
```

```ts
it("uses persona count instead of profile count for latest threestage book detail", async () => {
  const findFirst = vi.fn().mockResolvedValue({
    id: "book-1",
    title: "儒林外史",
    author: "吴敬梓",
    dynasty: "清",
    description: null,
    coverUrl: null,
    status: "COMPLETED",
    typeCode: "CLASSICAL_NOVEL",
    errorLog: null,
    createdAt: new Date("2026-04-18T00:00:00.000Z"),
    updatedAt: new Date("2026-04-18T00:00:00.000Z"),
    sourceFileKey: null,
    sourceFileUrl: null,
    sourceFileName: null,
    sourceFileMime: null,
    sourceFileSize: null,
    chapters: [{ id: "c-1" }],
    profiles: [],
    personas: [{ id: "persona-1" }, { id: "persona-2" }],
    analysisJobs: [{
      updatedAt: new Date("2026-04-18T00:00:00.000Z"),
      finishedAt: new Date("2026-04-18T00:01:00.000Z"),
      errorLog: null,
      architecture: "threestage",
      scope: "FULL_BOOK",
      phaseLogs: []
    }]
  });

  const service = createGetBookByIdService({ book: { findFirst } } as never);
  const result = await service.getBookById("book-1");
  expect(result.personaCount).toBe(2);
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm vitest run src/server/modules/personas/listBookPersonas.test.ts src/server/modules/books/getBookById.test.ts src/server/modules/books/listBooks.test.ts`
Expected: FAIL because the services still read `profile(s)` as the primary count/list source.

- [ ] **Step 3: Update the read services**

```ts
// src/server/modules/personas/listBookPersonas.ts
const latestJob = await prismaClient.analysisJob.findFirst({
  where: { bookId },
  orderBy: { updatedAt: "desc" },
  select: { architecture: true, scope: true }
});

if (latestJob?.architecture === "threestage" && latestJob.scope === "FULL_BOOK") {
  const personas = await prismaClient.persona.findMany({
    where: {
      deletedAt: null,
      personaMentions: {
        some: { bookId, promotedPersonaId: { not: null }, deletedAt: null }
      }
    },
    orderBy: [{ mentionCount: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      aliases: true,
      gender: true,
      hometown: true,
      nameType: true,
      globalTags: true,
      confidence: true,
      recordSource: true,
      status: true,
      mentionCount: true,
      effectiveBiographyCount: true,
      distinctChapters: true
    }
  });

  return mapPersonaProjectionRows(bookId, personas);
}
```

```ts
// src/server/modules/books/getBookById.ts
const usePersonaProjection =
  book.analysisJobs[0]?.architecture === "threestage"
  && book.analysisJobs[0]?.scope === "FULL_BOOK";

return {
  ...baseDto,
  personaCount: usePersonaProjection ? book.personas.length : book.profiles.length
};
```

```ts
// src/server/modules/books/listBooks.ts
const usePersonaProjection =
  book.analysisJobs[0]?.architecture === "threestage"
  && book.analysisJobs[0]?.scope === "FULL_BOOK";

personaCount: usePersonaProjection ? book._count.personas : book._count.profiles,
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `pnpm vitest run src/server/modules/personas/listBookPersonas.test.ts src/server/modules/books/getBookById.test.ts src/server/modules/books/listBooks.test.ts`
Expected: PASS.

- [ ] **Step 5: Run a small integration smoke for route-facing modules**

Run: `pnpm vitest run src/app/api/books/[id]/route.test.ts src/app/api/books/[id]/personas/route.test.ts`
Expected: PASS with no contract drift.

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/personas/listBookPersonas.ts src/server/modules/personas/listBookPersonas.test.ts src/server/modules/books/getBookById.ts src/server/modules/books/getBookById.test.ts src/server/modules/books/listBooks.ts src/server/modules/books/listBooks.test.ts src/server/modules/personas/bookPersonaProjection.ts
git commit -m "fix: read threestage books from persona projection"
```

### Task 3: Add Threestage Phase Logs And Warning Summaries

**Files:**
- Create: `src/server/modules/analysis/pipelines/threestage/phaseLogging.ts`
- Create: `src/server/modules/analysis/pipelines/threestage/phaseLogging.test.ts`
- Modify: `src/server/modules/analysis/pipelines/types.ts`
- Modify: `src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.ts`
- Modify: `src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.test.ts`

- [ ] **Step 1: Write the failing tests for logs and warnings**

```ts
it("emits Stage A/B.5/B/C phase logs and returns warnings for sparse output", async () => {
  const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
  const stageA = {
    extract: vi.fn()
      .mockResolvedValueOnce({ mentionCount: 0, mentions: [], overrideHits: {}, preprocessorConfidence: "LOW", regionBreakdown: { NARRATIVE: 0, POEM: 0, DIALOGUE: 0, COMMENTARY: 0 } })
      .mockResolvedValueOnce({ mentionCount: 10, mentions: [], overrideHits: {}, preprocessorConfidence: "HIGH", regionBreakdown: { NARRATIVE: 10, POEM: 0, DIALOGUE: 0, COMMENTARY: 0 } })
  };
  const stageB5 = { check: vi.fn().mockResolvedValue({ created: 0 }) };
  const stageB = { resolve: vi.fn().mockResolvedValue({ bookId: "book-1", candidateGroupsTotal: 1, llmInvocations: 1, merges: [], suggestions: [], b5Consumed: [], aliasEntryDegraded: false }) };
  const stageC = { attribute: vi.fn().mockResolvedValue({ bookId: "book-1", chaptersProcessed: 1, llmInvocations: 1, biographiesCreated: 12, effectiveBiographies: 12, overrideHits: {}, deathChapterUpdates: [], feedbackSuggestions: [], biographies: [] }) };

  const pipeline = createThreeStagePipeline({
    prisma: {
      book: { findUnique: vi.fn().mockResolvedValue({ id: "book-1", typeCode: "CLASSICAL_NOVEL" }) },
      chapter: { findUnique: vi.fn().mockImplementation(async ({ where: { id } }) => ({ id, no: id === "chapter-1" ? 1 : 31, content: "正文" })) },
      analysisPhaseLog: { create: phaseLogCreate }
    } as never,
    aiClient: fakeAiClient(),
    chapterConcurrency: 1,
    chapterMaxRetries: 0,
    chapterRetryBaseMs: 1,
    stageAFactory: () => stageA,
    stageB5Factory: () => stageB5,
    stageBFactory: () => stageB,
    stageCFactory: () => stageC
  });

  const result = await pipeline.run(buildRunParams());
  expect(phaseLogCreate).toHaveBeenCalled();
  expect(result.warnings).toContain("STAGE_A_SPARSE_COVERAGE");
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm vitest run src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.test.ts src/server/modules/analysis/pipelines/threestage/phaseLogging.test.ts`
Expected: FAIL because the pipeline result has no warnings and no manual phase-log helper exists.

- [ ] **Step 3: Extend the pipeline result contract**

```ts
// src/server/modules/analysis/pipelines/types.ts
export interface PipelineWarning {
  code: "STAGE_A_SPARSE_COVERAGE" | "STAGE_C_SPARSE_COVERAGE" | "PERSONA_ZERO_AFTER_STAGE_B";
  message: string;
}

export interface AnalysisPipelineResult {
  completedChapters: number;
  failedChapters: number;
  warnings: PipelineWarning[];
  stageSummaries: Record<string, Record<string, number>>;
}
```

- [ ] **Step 4: Add the phase-log helper**

```ts
// src/server/modules/analysis/pipelines/threestage/phaseLogging.ts
import type { PrismaClient } from "@/generated/prisma/client";

export async function writePipelinePhaseLog(
  prisma: Pick<PrismaClient, "analysisPhaseLog">,
  input: {
    jobId: string;
    chapterId?: string | null;
    stage: string;
    status: "STARTED" | "SUCCESS" | "FAILED" | "WARNING";
    errorMessage?: string | null;
  }
): Promise<void> {
  await prisma.analysisPhaseLog.create({
    data: {
      jobId: input.jobId,
      chapterId: input.chapterId ?? null,
      stage: input.stage,
      modelId: null,
      modelSource: "SYSTEM_DEFAULT",
      isFallback: false,
      promptTokens: null,
      completionTokens: null,
      durationMs: null,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      chunkIndex: null
    }
  });
}
```

- [ ] **Step 5: Instrument `ThreeStagePipeline`**

```ts
await writePipelinePhaseLog(deps.prisma, {
  jobId: params.jobId,
  stage: "THREESTAGE_STAGE_A",
  status: "STARTED"
});

// after Stage A loop
const sparseStageA = completedChapters < totalChapters || stageAChapterMentions.filter((count) => count > 0).length <= 1;
if (sparseStageA) {
  warnings.push({
    code: "STAGE_A_SPARSE_COVERAGE",
    message: `Stage A mention coverage is sparse: ${stageAChapterMentions.filter((count) => count > 0).length}/${totalChapters}`
  });
}

await writePipelinePhaseLog(deps.prisma, {
  jobId: params.jobId,
  stage: "THREESTAGE_STAGE_A",
  status: sparseStageA ? "WARNING" : "SUCCESS",
  errorMessage: sparseStageA ? warnings[warnings.length - 1]?.message : null
});
```

```ts
// after Stage C
if (stageBResult.merges.length === 0 && stageBResult.suggestions.length === 0) {
  warnings.push({
    code: "PERSONA_ZERO_AFTER_STAGE_B",
    message: "Stage B produced no promoted personas or merge suggestions"
  });
}

return {
  completedChapters,
  failedChapters,
  warnings,
  stageSummaries: {
    stageA: { totalChapters, succeededChapters: completedChapters, chaptersWithMentions },
    stageB: { candidateGroupsTotal: stageBResult.candidateGroupsTotal, llmInvocations: stageBResult.llmInvocations, merges: stageBResult.merges.length, suggestions: stageBResult.suggestions.length },
    stageC: { chaptersProcessed: stageCResult.chaptersProcessed, biographiesCreated: stageCResult.biographiesCreated, effectiveBiographies: stageCResult.effectiveBiographies }
  }
};
```

- [ ] **Step 6: Run the targeted tests to verify they pass**

Run: `pnpm vitest run src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.test.ts src/server/modules/analysis/pipelines/threestage/phaseLogging.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/modules/analysis/pipelines/types.ts src/server/modules/analysis/pipelines/threestage/phaseLogging.ts src/server/modules/analysis/pipelines/threestage/phaseLogging.test.ts src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.ts src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.test.ts
git commit -m "feat: add threestage phase logs and warning summaries"
```

### Task 4: Propagate Warnings Into Job State And Regression Coverage

**Files:**
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
- Reuse: `src/server/modules/analysis/pipelines/types.ts`

- [ ] **Step 1: Write the failing runner test**

```ts
it("keeps threestage success but writes warning summary for sparse pipeline output", async () => {
  const pipelineRun = vi.fn().mockResolvedValue({
    completedChapters: 56,
    failedChapters: 0,
    warnings: [
      {
        code: "STAGE_A_SPARSE_COVERAGE",
        message: "Stage A mention coverage is sparse: 1/56"
      }
    ],
    stageSummaries: {
      stageA: { totalChapters: 56, chaptersWithMentions: 1 }
    }
  });

  // inject createPipeline(...).run = pipelineRun
  await runner.runAnalysisJobById("job-1");

  expect(bookUpdate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      errorLog: expect.stringContaining("STAGE_A_SPARSE_COVERAGE")
    })
  }));
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts -t "writes warning summary"`
Expected: FAIL because `runAnalysisJobById` ignores pipeline warnings.

- [ ] **Step 3: Update the runner to persist warnings**

```ts
const warningSummary = pipelineResult.warnings
  .map((warning) => `${warning.code}: ${warning.message}`)
  .join("\n");

await prismaClient.$transaction([
  prismaClient.analysisJob.update({
    where: { id: runningJob.id },
    data: {
      status: AnalysisJobStatus.SUCCEEDED,
      finishedAt: new Date(),
      errorLog: warningSummary || null
    }
  }),
  prismaClient.book.update({
    where: { id: runningJob.bookId },
    data: {
      status: "COMPLETED",
      parseProgress: 100,
      parseStage: pipelineResult.warnings.length > 0 ? "完成（带告警）" : "完成",
      errorLog: warningSummary || null
    }
  })
]);
```

- [ ] **Step 4: Run targeted tests for the runner**

Run: `pnpm vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
Expected: PASS, including the new warning-persistence branch.

- [ ] **Step 5: Run the full focused verification set**

Run: `pnpm vitest run src/server/modules/personas/bookPersonaProjection.test.ts src/server/modules/personas/listBookPersonas.test.ts src/server/modules/books/getBookById.test.ts src/server/modules/books/listBooks.test.ts src/server/modules/analysis/pipelines/threestage/phaseLogging.test.ts src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.test.ts src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/analysis/jobs/runAnalysisJob.ts src/server/modules/analysis/jobs/runAnalysisJob.test.ts
git commit -m "fix: persist threestage warning summaries in analysis jobs"
```

### Task 5: Manual Regression For Book `61c34092-5295-4438-af28-46b5b0e9d558`

**Files:**
- No code changes required
- Read: `docs/superpowers/specs/2026-04-18-threestage-cutover-and-empty-personas-design.md`

- [ ] **Step 1: Verify local tests are green before DB checks**

Run: `pnpm vitest run src/server/modules/personas/listBookPersonas.test.ts src/server/modules/books/getBookById.test.ts src/server/modules/books/listBooks.test.ts src/server/modules/analysis/pipelines/threestage/ThreeStagePipeline.test.ts src/server/modules/analysis/jobs/runAnalysisJob.test.ts`
Expected: PASS.

- [ ] **Step 2: Inspect the target book before rerun**

Run: `psql "$DATABASE_URL" -c "select id, title from books where id = '61c34092-5295-4438-af28-46b5b0e9d558';"`
Expected: one row for `儒林外史`.

- [ ] **Step 3: Verify persona-facing counts now come from the correct source**

Run: `psql "$DATABASE_URL" -c "select (select count(*) from personas p where exists (select 1 from persona_mentions pm where pm.book_id = '61c34092-5295-4438-af28-46b5b0e9d558' and pm.promoted_persona_id = p.id and pm.deleted_at is null)) as promoted_personas, (select count(*) from profiles where book_id = '61c34092-5295-4438-af28-46b5b0e9d558' and deleted_at is null) as profiles;"`
Expected: `promoted_personas > 0` and `profiles` may remain `0`.

- [ ] **Step 4: Check phase logs for stage visibility**

Run: `psql "$DATABASE_URL" -c "select stage, status, count(*) from analysis_phase_logs where job_id = '1d45726b-b91a-4738-a613-231b74e21653' group by stage, status order by stage, status;"`
Expected: rows for `THREESTAGE_STAGE_A`, `THREESTAGE_STAGE_B5`, `THREESTAGE_STAGE_B`, `THREESTAGE_STAGE_C` after rerun or after replaying the job on fixed code.

- [ ] **Step 5: Record the business conclusion**

```md
- 页面“0 角色”根因已消除：读取口径不再依赖 `profiles`
- 若仍只有 chapter 31 出数，问题已从“黑盒成功”转为“可由 Stage A/Stage C 日志继续定位”
```

## Self-Review

- Spec coverage:
  - Source-of-truth migration is covered by Task 1 and Task 2.
  - Stage-level observability is covered by Task 3.
  - Warning propagation and “successful but abnormal” visibility is covered by Task 4.
  - Regression on book `61c34092-5295-4438-af28-46b5b0e9d558` is covered by Task 5.
- Placeholder scan:
  - No `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- Type consistency:
  - `AnalysisPipelineResult.warnings` and `stageSummaries` are introduced in Task 3 and consumed in Task 4 with the same names.
  - `mapPersonaProjectionRows` is introduced in Task 1 and reused by Task 2 with the same signature.
