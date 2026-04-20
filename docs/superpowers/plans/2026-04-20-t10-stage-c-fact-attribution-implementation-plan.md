# T10 Stage C Fact Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This task is being executed inline on `dev_2`; do not create a new branch and do not start T11.

**Goal:** Build deterministic Stage C fact attribution that creates reviewable derived event and relation claims linked to resolved persona candidates while preserving alternatives, conflict context, time hints, and evidence.

**Architecture:** Stage C reads Stage A/A+ root event, relation, and time claims plus Stage B persona candidates and Stage B.5 conflict flags. It does not overwrite root claims and does not introduce schema changes. Since `TimeClaim` has no persona candidate field, person-time attribution is represented by derived event/relation claims that keep `timeHintId`; standalone time rows remain root time claims for later projection linking.

**Tech Stack:** TypeScript strict, Prisma repository adapters, existing claim schemas/write service, Vitest, deterministic rule engine, analysis stage-run observability.

---

## File Structure

- Create `src/server/modules/analysis/pipelines/evidence-review/stageC/types.ts`
  - Stage constants, row DTOs, attribution decision types, draft bundle types, run input/result types, and summary helper.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.ts`
  - Pure deterministic ranking rules for mention/persona alternatives and conflict penalties.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.ts`
  - Convert ranked alternatives into derived `EVENT` and `RELATION` claim drafts with `derivedFromClaimId`, `timeHintId`, evidence, confidence, and review notes.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageC/repository.ts`
  - Load only root source claims (`derivedFromClaimId: null`) for Stage C, persona candidates, conflict flags, and chapter numbers.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageC/persister.ts`
  - Transactionally replace Stage C derived event/relation rows per chapter scope using the existing claim write service.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.ts`
  - Whole-book orchestration, run observability, deterministic raw output, and error handling.
- Create `src/server/modules/analysis/pipelines/evidence-review/stageC/index.ts`
  - Public exports.
- Create tests beside each module:
  - `attribution-ranking.test.ts`
  - `draft-builder.test.ts`
  - `repository.test.ts`
  - `persister.test.ts`
  - `FactAttributor.test.ts`

## Invariants

- Root Stage A/A+ claims are never modified.
- Stage C derived rows always set `derivedFromClaimId` to the root event/relation claim id.
- Stage C derived rows use `source: "AI"` and `reviewState: "PENDING"` for usable alternatives.
- Low-confidence, missing-candidate, or conflict-influenced alternatives use `reviewState: "CONFLICTED"`.
- Multiple plausible alternatives are stored as multiple derived rows, not collapsed into a single hard `personaId`.
- Stage C repository must not read previously derived rows as input.
- Stage C must not create a new table or schema migration.

---

### Task 1: Ranking Contracts

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.ts`
- Test: `src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.test.ts`

- [x] **Step 1: Write failing ranking tests**

Create tests for these behaviors:

```ts
it("keeps a direct persona candidate as the strongest attribution", () => {
  const ranked = rankFactAttributionCandidates({
    directPersonaCandidateId: CANDIDATE_ID_1,
    evidenceSpanIds: [EVIDENCE_ID_1],
    personaCandidates: [candidate({ id: CANDIDATE_ID_1 }), candidate({ id: CANDIDATE_ID_2 })],
    conflictFlags: []
  });

  expect(ranked).toEqual([
    expect.objectContaining({
      personaCandidateId: CANDIDATE_ID_1,
      rank: 1,
      reviewState: "PENDING"
    })
  ]);
});

it("preserves multiple plausible alternatives when evidence overlaps conflict flags", () => {
  const ranked = rankFactAttributionCandidates({
    directPersonaCandidateId: CANDIDATE_ID_1,
    evidenceSpanIds: [EVIDENCE_ID_1],
    personaCandidates: [candidate({ id: CANDIDATE_ID_1 }), candidate({ id: CANDIDATE_ID_2 })],
    conflictFlags: [conflictFlag({ relatedPersonaCandidateIds: [CANDIDATE_ID_2] })]
  });

  expect(ranked.map((row) => row.personaCandidateId)).toEqual([CANDIDATE_ID_1, CANDIDATE_ID_2]);
  expect(ranked[1]).toEqual(expect.objectContaining({ reviewState: "CONFLICTED" }));
});

it("returns a no-safe-candidate conflicted placeholder when no candidate is defensible", () => {
  const ranked = rankFactAttributionCandidates({
    directPersonaCandidateId: null,
    evidenceSpanIds: [EVIDENCE_ID_1],
    personaCandidates: [],
    conflictFlags: []
  });

  expect(ranked).toEqual([
    expect.objectContaining({
      personaCandidateId: null,
      reviewState: "CONFLICTED",
      reason: expect.stringContaining("NO_SAFE_CANDIDATE")
    })
  ]);
});
```

- [x] **Step 2: Run the ranking tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.test.ts --coverage=false
```

Expected: fail because `stageC/attribution-ranking` and `stageC/types` do not exist.

- [x] **Step 3: Implement minimal ranking contracts**

Implement:

- `STAGE_C_STAGE_KEY = "stage_c_fact_attribution"`
- `STAGE_C_RULE_VERSION = "2026-04-20-stage-c-v1"`
- `STAGE_C_RULE_PROVIDER = "rule-engine"`
- `STAGE_C_RULE_MODEL = "stage-c-fact-attribution-v1"`
- row DTOs for persona candidates, root event/relation/time claims, and conflict flags
- `rankFactAttributionCandidates(input)`
- deterministic confidence clamp and sorting by score desc, then candidate id asc

Ranking rules:

- direct candidate gets base score `0.9`
- conflict-related alternative gets base score `0.62` and `reviewState: "CONFLICTED"`
- weak/no-candidate placeholder gets score `0.45`, `personaCandidateId: null`, and `reviewState: "CONFLICTED"`
- candidates below `0.55` are not kept except the no-safe placeholder

- [x] **Step 4: Run the ranking tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.test.ts --coverage=false
```

Expected: pass.

---

### Task 2: Derived Draft Builder

**Files:**
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stageC/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.ts`
- Test: `src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.test.ts`

- [x] **Step 1: Write failing draft-builder tests**

Create tests for these behaviors:

```ts
it("creates derived event drafts for each preserved subject alternative", () => {
  const bundle = buildStageCFactAttributionDrafts({
    bookId: BOOK_ID,
    runId: RUN_ID,
    payload: payloadWith({
      eventClaims: [eventClaim({ subjectPersonaCandidateId: CANDIDATE_ID_1, timeHintId: TIME_ID_1 })],
      relationClaims: [],
      timeClaims: [timeClaim({ id: TIME_ID_1 })],
      conflictFlags: []
    })
  });

  expect(bundle.eventDrafts).toEqual([
    expect.objectContaining({
      claimFamily: "EVENT",
      derivedFromClaimId: EVENT_ID_1,
      subjectPersonaCandidateId: CANDIDATE_ID_1,
      timeHintId: TIME_ID_1,
      reviewState: "PENDING"
    })
  ]);
});

it("creates relation drafts for source and target attribution alternatives", () => {
  const bundle = buildStageCFactAttributionDrafts({
    bookId: BOOK_ID,
    runId: RUN_ID,
    payload: payloadWith({
      eventClaims: [],
      relationClaims: [
        relationClaim({
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_2
        })
      ],
      timeClaims: [],
      conflictFlags: []
    })
  });

  expect(bundle.relationDrafts).toEqual([
    expect.objectContaining({
      claimFamily: "RELATION",
      derivedFromClaimId: RELATION_ID_1,
      sourcePersonaCandidateId: CANDIDATE_ID_1,
      targetPersonaCandidateId: CANDIDATE_ID_2
    })
  ]);
});

it("marks derived drafts conflicted when conflict flags touch the root claim", () => {
  const bundle = buildStageCFactAttributionDrafts({
    bookId: BOOK_ID,
    runId: RUN_ID,
    payload: payloadWith({
      eventClaims: [eventClaim({ subjectPersonaCandidateId: CANDIDATE_ID_1 })],
      relationClaims: [],
      timeClaims: [],
      conflictFlags: [conflictFlag({ relatedClaimIds: [EVENT_ID_1] })]
    })
  });

  expect(bundle.eventDrafts[0]).toEqual(expect.objectContaining({
    reviewState: "CONFLICTED",
    reviewNote: expect.stringContaining("conflictFlagIds")
  }));
});
```

- [x] **Step 2: Run the draft-builder tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.test.ts --coverage=false
```

Expected: fail because `draft-builder.ts` does not exist.

- [x] **Step 3: Implement minimal draft builder**

Implement:

- `buildStageCFactAttributionDrafts(input)`
- `StageCDraftBundle` with `eventDrafts`, `relationDrafts`, `scopedChapterIds`, `decisionRows`
- root-to-derived field copy for events and relations
- `reviewNote` format: `STAGE_C: rank=<n>; score=<score>; reasons=<reason1|reason2>; conflictFlagIds=<id1|id2>; timeHintId=<id|null>`
- one derived event row per subject alternative
- one derived relation row per endpoint-pair alternative
- no derived time rows

- [x] **Step 4: Run ranking and draft-builder tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.test.ts src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.test.ts --coverage=false
```

Expected: pass.

---

### Task 3: Stage C Repository

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/repository.ts`
- Test: `src/server/modules/analysis/pipelines/evidence-review/stageC/repository.test.ts`

- [x] **Step 1: Write failing repository tests**

Create tests for these behaviors:

```ts
it("loads root claims only and maps chapter numbers", async () => {
  const { client, eventClaimFindMany } = createRepositoryClient();
  const repository = createStageCRepository(client);

  const payload = await repository.loadFactAttributionInputs({ bookId: BOOK_ID, runId: RUN_ID });

  expect(payload.eventClaims[0]?.chapterNo).toBe(12);
  expect(payload.timeClaims[0]?.chapterNo).toBe(10);
  expect(eventClaimFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      bookId: BOOK_ID,
      runId: RUN_ID,
      source: { in: ["AI", "RULE"] },
      derivedFromClaimId: null
    })
  }));
});

it("loads conflict flags for ranking context", async () => {
  const { client } = createRepositoryClient();
  const repository = createStageCRepository(client);

  const payload = await repository.loadFactAttributionInputs({ bookId: BOOK_ID, runId: RUN_ID });

  expect(payload.conflictFlags).toEqual([
    expect.objectContaining({
      relatedClaimIds: [EVENT_ID_1],
      relatedPersonaCandidateIds: [CANDIDATE_ID_1]
    })
  ]);
});
```

- [x] **Step 2: Run the repository tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/repository.test.ts --coverage=false
```

Expected: fail because `repository.ts` does not exist.

- [x] **Step 3: Implement repository**

Implement `createStageCRepository(client?)` following Stage B.5 repository style:

- read `personaCandidate.findMany({ where: { bookId, runId } })`
- read event/relation/time claims with `source in ["AI", "RULE"]` and `derivedFromClaimId: null`
- read `conflictFlag.findMany({ where: { bookId, runId, source: "RULE" } })`
- resolve chapter numbers from `chapter.findMany`
- expose `loadFactAttributionInputs(scope)`
- expose `transaction(work)` for consistency

- [x] **Step 4: Run repository tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/repository.test.ts --coverage=false
```

Expected: pass.

---

### Task 4: Stage C Persister

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/persister.ts`
- Test: `src/server/modules/analysis/pipelines/evidence-review/stageC/persister.test.ts`

- [x] **Step 1: Write failing persister tests**

Create tests for these behaviors:

```ts
it("replaces derived event and relation rows per scoped chapter", async () => {
  const claimWriteService = {
    writeClaimBatch: vi.fn()
      .mockResolvedValueOnce({ deletedCount: 1, createdCount: 1 })
      .mockResolvedValueOnce({ deletedCount: 2, createdCount: 1 })
  };
  const persister = createStageCPersister({ claimWriteService: claimWriteService as never });

  const result = await persister.persistFactAttributionDrafts({
    bookId: BOOK_ID,
    runId: RUN_ID,
    scopedChapterIds: [CHAPTER_ID_1],
    eventDrafts: [eventDraft()],
    relationDrafts: [relationDraft()]
  });

  expect(claimWriteService.writeClaimBatch).toHaveBeenCalledWith(expect.objectContaining({
    family: "EVENT",
    scope: expect.objectContaining({ stageKey: "stage_c_fact_attribution", chapterId: CHAPTER_ID_1 })
  }));
  expect(claimWriteService.writeClaimBatch).toHaveBeenCalledWith(expect.objectContaining({
    family: "RELATION",
    scope: expect.objectContaining({ stageKey: "stage_c_fact_attribution", chapterId: CHAPTER_ID_1 })
  }));
  expect(result.createdCount).toBe(2);
});
```

- [x] **Step 2: Run the persister tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/persister.test.ts --coverage=false
```

Expected: fail because `persister.ts` does not exist.

- [x] **Step 3: Implement persister**

Implement:

- `createStageCPersister(dependencies?)`
- dependency injection for `claimWriteService`
- default path uses `createClaimRepository(prisma)` plus `createClaimWriteService`
- groups event and relation drafts by `chapterId`
- for every `scopedChapterIds` entry, calls `writeClaimBatch` for both `EVENT` and `RELATION`, including empty drafts to clear stale derived rows
- returns `{ createdCount, deletedCount }`

- [x] **Step 4: Run persister tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/persister.test.ts --coverage=false
```

Expected: pass.

---

### Task 5: FactAttributor Orchestration

**Files:**
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageC/index.ts`
- Test: `src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.test.ts`

- [x] **Step 1: Write failing orchestration tests**

Create tests for these behaviors:

```ts
it("runs Stage C, persists derived facts, and records deterministic raw output", async () => {
  const repository = { loadFactAttributionInputs: vi.fn().mockResolvedValue(payloadWithOneEvent()) };
  const persister = { persistFactAttributionDrafts: vi.fn().mockResolvedValue({ createdCount: 1, deletedCount: 0 }) };
  const stageRunService = createStageRunService();
  const attributor = createFactAttributor({
    repository: repository as never,
    persister: persister as never,
    stageRunService: stageRunService as never
  });

  const result = await attributor.runForBook({ bookId: BOOK_ID, runId: RUN_ID });

  expect(stageRunService.startStageRun).toHaveBeenCalledWith(expect.objectContaining({
    stageKey: "stage_c_fact_attribution",
    inputCount: 1
  }));
  expect(persister.persistFactAttributionDrafts).toHaveBeenCalledWith(expect.objectContaining({
    bookId: BOOK_ID,
    runId: RUN_ID
  }));
  expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
    provider: "rule-engine",
    model: "stage-c-fact-attribution-v1",
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostMicros: BigInt(0)
  }));
  expect(result.outputCount).toBe(1);
});

it("marks the stage run failed when persistence throws", async () => {
  const attributor = createFactAttributor({
    repository: { loadFactAttributionInputs: vi.fn().mockResolvedValue(emptyPayload()) } as never,
    persister: { persistFactAttributionDrafts: vi.fn().mockRejectedValue(new Error("persist failed")) } as never,
    stageRunService: stageRunService as never
  });

  await expect(attributor.runForBook({ bookId: BOOK_ID, runId: RUN_ID })).rejects.toThrow("persist failed");
  expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
});
```

- [x] **Step 2: Run the orchestration tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.test.ts --coverage=false
```

Expected: fail because `FactAttributor.ts` does not exist.

- [x] **Step 3: Implement orchestration**

Implement:

- `createFactAttributor(dependencies?)`
- `runForBook(input: StageCRunInput): Promise<StageCRunResult>`
- non-null `runId` requirement for persistence
- stable input/output hash using `crypto.createHash("sha256")`
- `startStageRun`, `recordRawOutput`, `succeedStageRun`, `failStageRun`
- raw output contains rule version, decision counts, draft counts, created/deleted counts
- public singleton `factAttributor`
- `index.ts` exports Stage C modules

- [x] **Step 4: Run orchestration tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.test.ts --coverage=false
```

Expected: pass.

---

### Task 6: Validation And Documentation

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/10-stage-c-fact-attribution.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [x] **Step 1: Run Stage C test suite**

Run:

```bash
pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC --coverage=false
```

Expected: pass.

- [x] **Step 2: Run task validation commands**

Run:

```bash
pnpm test src/server/modules/analysis/pipelines/evidence-review/stageC
pnpm type-check
```

Expected: Stage C tests pass or repository coverage threshold behavior is documented; type-check passes.

- [x] **Step 3: Mark T10 complete**

Update `10-stage-c-fact-attribution.md`:

- Check every completed execution checkpoint and acceptance criterion.
- Add execution record with changed files, validation commands, result, follow-up risks, and next task T11.

Update `2026-04-18-evidence-review-superpowers-only-runbook.md`:

- Mark T10 checkbox as `[x]`.
- Append `### T10 Completion - 2026-04-20` with validation results and risk note that standalone time-person attribution is represented through derived facts because `TimeClaim` has no persona candidate field.

- [x] **Step 4: Final git/status check**

Run:

```bash
git status --short
```

Expected: only T10 implementation/docs plus pre-existing untracked plan docs are changed.
