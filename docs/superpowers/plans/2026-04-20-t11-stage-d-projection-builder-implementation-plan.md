# T11 Stage D Projection Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This task is executed inline on `dev_2`; do not create a new branch and do not start T12.

**Goal:** Build deterministic, rebuildable Stage D projection read models for persona-chapter review cells, persona-time review rows, relationship edges, and timeline events from accepted claims plus review state.

**Architecture:** Stage D reads accepted claim rows, accepted identity-resolution rows, and chapter metadata, maps `personaCandidateId` to final `personaId`, builds projection rows with pure functions, then deletes and recreates only the requested projection slice inside one transaction. Projection rows are read models only; they are never editable review truth and can be deleted and rebuilt from claim + review state.

**Tech Stack:** TypeScript strict, Prisma repository adapter, Vitest, existing evidence-review review-state helper, deterministic pure builders.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.3, §7.7, §8, §11, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Review state helper: `src/server/modules/review/evidence-review/review-state.ts`
- Projection schema models: `PersonaChapterFact`, `PersonaTimeFact`, `RelationshipEdge`, `TimelineEvent` in `prisma/schema.prisma`

## Execution Rules

- Follow strict TDD for every task: write test, run RED, implement minimal code, run GREEN.
- Use `isProjectionEligibleReviewState(state)` for projection inclusion. Current contract: only `ACCEPTED` enters projection.
- Do not read legacy `Profile`, `BiographyRecord`, or `Relationship` as projection truth.
- Do not make `persona_chapter_facts`, `persona_time_facts`, `relationship_edges`, or `timeline_events` editable truth.
- Do not invent `Persona` rows or final `personaId` values in Stage D.
- Do not require full-book projection rebuild for every review mutation.
- Perform one T11 commit after final validation, not one commit per subtask, because the project has been committing one Superpowers task at a time.

## File Structure

- Create `src/server/modules/review/evidence-review/projections/types.ts`
  - Shared claim DTOs, projection row DTOs, rebuild scopes, repository contracts, and result contracts.
- Create `src/server/modules/review/evidence-review/projections/projection-builder.ts`
  - Candidate-to-persona mapping, rebuild orchestration, repository adapter, scope-specific delete filters, and transaction boundary.
- Create `src/server/modules/review/evidence-review/projections/persona-chapter.ts`
  - Pure builder for `persona_chapter_facts`.
- Create `src/server/modules/review/evidence-review/projections/persona-time.ts`
  - Pure builders for `persona_time_facts` and `timeline_events`.
- Create `src/server/modules/review/evidence-review/projections/relationships.ts`
  - Pure builder for `relationship_edges`.
- Create `src/server/modules/review/evidence-review/projections/index.ts`
  - Stable public exports for T12+ review APIs.
- Create tests beside modules:
  - `projection-builder.test.ts`
  - `persona-chapter.test.ts`
  - `persona-time.test.ts`
  - `relationships.test.ts`

## Modeling Decisions

- `reviewState === "ACCEPTED"` is the only projection-eligible claim state.
- A persona candidate enters projection only when accepted identity-resolution claims provide exactly one final `resolvedPersonaId`.
- Unmapped and ambiguous candidate mappings are skipped and reported in `ProjectionBuildResult.skipped`.
- `PersonaChapterFact.reviewStateSummary` stores counts by claim family and review state for included rows.
- `PersonaTimeFact.sourceTimeClaimIds` is the time-claim backlink supported by the current schema.
- `TimelineEvent.sourceClaimIds` stores event-claim backlinks.
- `RelationshipEdge.sourceClaimIds` stores relation-claim backlinks.
- `RelationshipEdge.latestClaimId` is the relation claim with the newest `updatedAt` among the merged source claims.
- `relationTypeKey` remains a string. `relationTypeSource` remains enum-like via existing review-state constants.

---

### Task 1: Projection Contracts And Persona Mapping

**Files:**
- Create: `src/server/modules/review/evidence-review/projections/types.ts`
- Create: `src/server/modules/review/evidence-review/projections/projection-builder.ts`
- Test: `src/server/modules/review/evidence-review/projections/projection-builder.test.ts`

- [x] **Step 1: Write failing mapping and contract tests**

Create `projection-builder.test.ts` with these behaviors:

```ts
it("maps accepted identity-resolution claims to final persona ids", () => {
  const mapping = buildAcceptedPersonaMapping({
    identityResolutionClaims: [
      identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1 }),
      identityClaim({
        id: CLAIM_ID_2,
        personaCandidateId: CANDIDATE_ID_2,
        resolvedPersonaId: PERSONA_ID_2,
        reviewState: "PENDING"
      })
    ],
    requiredPersonaCandidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2]
  });

  expect(mapping.personaIdByCandidateId.get(CANDIDATE_ID_1)).toBe(PERSONA_ID_1);
  expect(mapping.unmappedCandidateIds).toEqual([CANDIDATE_ID_2]);
  expect(mapping.ambiguousCandidateIds).toEqual([]);
});

it("skips candidates with multiple accepted final personas instead of guessing", () => {
  const mapping = buildAcceptedPersonaMapping({
    identityResolutionClaims: [
      identityClaim({ personaCandidateId: CANDIDATE_ID_3, resolvedPersonaId: PERSONA_ID_1 }),
      identityClaim({ id: CLAIM_ID_2, personaCandidateId: CANDIDATE_ID_3, resolvedPersonaId: PERSONA_ID_2 })
    ],
    requiredPersonaCandidateIds: [CANDIDATE_ID_3]
  });

  expect(mapping.personaIdByCandidateId.has(CANDIDATE_ID_3)).toBe(false);
  expect(mapping.unmappedCandidateIds).toEqual([]);
  expect(mapping.ambiguousCandidateIds).toEqual([CANDIDATE_ID_3]);
});

it("exports all rebuild scope modes needed by local projection rebuilds", () => {
  expect(PROJECTION_REBUILD_SCOPE_KIND_VALUES).toEqual([
    "FULL_BOOK",
    "CHAPTER",
    "PERSONA",
    "TIME_SLICE",
    "RELATION_EDGE",
    "PROJECTION_ONLY"
  ]);
});

it("returns skipped persona-candidate ids when rebuilding with unmapped accepted facts", async () => {
  const repository = createRepositoryMock(payloadWithAcceptedEventForUnmappedCandidate());
  const builder = createProjectionBuilder({ repository });

  const result = await builder.rebuildProjection({ kind: "FULL_BOOK", bookId: BOOK_ID });

  expect(result.skipped.unmappedPersonaCandidateIds).toEqual([CANDIDATE_ID_1]);
  expect(result.skipped.ambiguousPersonaCandidateIds).toEqual([]);
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/projection-builder.test.ts --coverage=false
```

Expected: fail because projection modules do not exist.

- [x] **Step 3: Implement minimal contracts and mapping helper**

Implement in `types.ts`:

```ts
export const PROJECTION_FAMILY_VALUES = Object.freeze([
  "persona_chapter_facts",
  "persona_time_facts",
  "relationship_edges",
  "timeline_events"
] as const);

export type ProjectionFamily = (typeof PROJECTION_FAMILY_VALUES)[number];

export type ProjectionRebuildScope =
  | { kind: "FULL_BOOK"; bookId: string; projectionFamilies?: readonly ProjectionFamily[] }
  | { kind: "CHAPTER"; bookId: string; chapterId: string; chapterNo?: number; projectionFamilies?: readonly ProjectionFamily[] }
  | { kind: "PERSONA"; bookId: string; personaId: string; projectionFamilies?: readonly ProjectionFamily[] }
  | { kind: "TIME_SLICE"; bookId: string; timeLabel: string; projectionFamilies?: readonly ProjectionFamily[] }
  | { kind: "RELATION_EDGE"; bookId: string; sourcePersonaId: string; targetPersonaId: string; relationTypeKey?: string; projectionFamilies?: readonly ProjectionFamily[] }
  | { kind: "PROJECTION_ONLY"; bookId: string; projectionFamilies: readonly ProjectionFamily[] };
```

Also define claim row DTOs for identity, event, relation, time, and conflict rows; projection row DTOs for all four projection tables; `ProjectionRowsByFamily`; `ProjectionPersistenceCounts`; `ProjectionBuildResult`; and `ProjectionRepository`.

Implement in `projection-builder.ts`:

```ts
export const PROJECTION_REBUILD_SCOPE_KIND_VALUES = Object.freeze([
  "FULL_BOOK",
  "CHAPTER",
  "PERSONA",
  "TIME_SLICE",
  "RELATION_EDGE",
  "PROJECTION_ONLY"
] as const);

export function buildAcceptedPersonaMapping(input: BuildAcceptedPersonaMappingInput): AcceptedPersonaMapping {
  const resolvedPersonaIdsByCandidateId = new Map<string, Set<string>>();

  for (const claim of input.identityResolutionClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState)) continue;
    if (claim.personaCandidateId === null || claim.resolvedPersonaId === null) continue;
    const resolvedPersonaIds = resolvedPersonaIdsByCandidateId.get(claim.personaCandidateId) ?? new Set<string>();
    resolvedPersonaIds.add(claim.resolvedPersonaId);
    resolvedPersonaIdsByCandidateId.set(claim.personaCandidateId, resolvedPersonaIds);
  }

  const personaIdByCandidateId = new Map<string, string>();
  const ambiguousCandidateIds: string[] = [];

  for (const [candidateId, resolvedPersonaIds] of resolvedPersonaIdsByCandidateId.entries()) {
    const sortedPersonaIds = Array.from(resolvedPersonaIds).sort();
    if (sortedPersonaIds.length === 1) personaIdByCandidateId.set(candidateId, sortedPersonaIds[0]);
    if (sortedPersonaIds.length > 1) ambiguousCandidateIds.push(candidateId);
  }

  const ambiguousSet = new Set(ambiguousCandidateIds);
  const required = Array.from(new Set(input.requiredPersonaCandidateIds ?? [])).sort();
  const unmappedCandidateIds = required.filter((id) => !personaIdByCandidateId.has(id) && !ambiguousSet.has(id));

  return {
    personaIdByCandidateId,
    unmappedCandidateIds,
    ambiguousCandidateIds: ambiguousCandidateIds.sort()
  };
}
```

- [x] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/projection-builder.test.ts --coverage=false
```

Expected: pass.

---

### Task 2: Persona Chapter Projection

**Files:**
- Modify: `src/server/modules/review/evidence-review/projections/types.ts`
- Create: `src/server/modules/review/evidence-review/projections/persona-chapter.ts`
- Test: `src/server/modules/review/evidence-review/projections/persona-chapter.test.ts`

- [x] **Step 1: Write failing persona-chapter tests**

Create tests for these behaviors:

```ts
it("aggregates accepted event, relation, and conflict counts per persona chapter", () => {
  const rows = buildPersonaChapterFacts({
    chapters: [{ id: CHAPTER_ID_1, no: 1 }, { id: CHAPTER_ID_2, no: 2 }],
    personaIdByCandidateId: new Map([
      [CANDIDATE_ID_1, PERSONA_ID_1],
      [CANDIDATE_ID_2, PERSONA_ID_2]
    ]),
    eventClaims: [
      eventClaim(),
      eventClaim({ id: EVENT_ID_2, subjectPersonaCandidateId: CANDIDATE_ID_UNMAPPED }),
      eventClaim({ id: EVENT_ID_3, reviewState: "PENDING" })
    ],
    relationClaims: [
      relationClaim(),
      relationClaim({ id: RELATION_ID_2, reviewState: "REJECTED" })
    ],
    conflictFlags: [
      conflictFlag(),
      conflictFlag({ id: CONFLICT_ID_2, reviewState: "CONFLICTED" })
    ]
  });

  expect(rows).toEqual([
    expect.objectContaining({
      personaId: PERSONA_ID_1,
      chapterId: CHAPTER_ID_1,
      eventCount: 1,
      relationCount: 1,
      conflictCount: 1,
      reviewStateSummary: {
        EVENT: { ACCEPTED: 1 },
        RELATION: { ACCEPTED: 1 },
        CONFLICT: { ACCEPTED: 1 }
      }
    }),
    expect.objectContaining({
      personaId: PERSONA_ID_2,
      chapterId: CHAPTER_ID_1,
      eventCount: 0,
      relationCount: 1,
      conflictCount: 0
    })
  ]);
});

it("uses the conflict primary chapter when related chapters are absent", () => {
  const rows = buildPersonaChapterFacts({
    chapters: [{ id: CHAPTER_ID_2, no: 2 }],
    personaIdByCandidateId: new Map([[CANDIDATE_ID_1, PERSONA_ID_1]]),
    eventClaims: [],
    relationClaims: [],
    conflictFlags: [conflictFlag({ chapterId: CHAPTER_ID_2, relatedChapterIds: [] })]
  });

  expect(rows).toEqual([
    expect.objectContaining({ personaId: PERSONA_ID_1, chapterId: CHAPTER_ID_2, chapterNo: 2, conflictCount: 1 })
  ]);
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/persona-chapter.test.ts --coverage=false
```

Expected: fail because `persona-chapter.ts` does not exist.

- [x] **Step 3: Implement minimal persona-chapter builder**

Implement `buildPersonaChapterFacts(input)`:

```ts
export function buildPersonaChapterFacts(input: BuildPersonaChapterFactsInput): PersonaChapterFactProjectionRow[] {
  const chapterNoById = new Map(input.chapters.map((chapter) => [chapter.id, chapter.no]));
  const cellByKey = new Map<string, PersonaChapterFactProjectionRow>();

  for (const claim of input.eventClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState) || claim.subjectPersonaCandidateId === null) continue;
    const personaId = input.personaIdByCandidateId.get(claim.subjectPersonaCandidateId);
    if (personaId === undefined) continue;
    const cell = getOrCreateCell(cellByKey, claim.bookId, personaId, claim.chapterId, claim.chapterNo);
    cell.eventCount += 1;
    incrementReviewStateSummary(cell.reviewStateSummary, "EVENT", claim.reviewState);
    touchLatestUpdatedAt(cell, claim.updatedAt);
  }

  for (const claim of input.relationClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState)) continue;
    const personaIds = uniqueResolvedPersonaIds([
      claim.sourcePersonaCandidateId,
      claim.targetPersonaCandidateId
    ], input.personaIdByCandidateId);
    for (const personaId of personaIds) {
      const cell = getOrCreateCell(cellByKey, claim.bookId, personaId, claim.chapterId, claim.chapterNo);
      cell.relationCount += 1;
      incrementReviewStateSummary(cell.reviewStateSummary, "RELATION", claim.reviewState);
      touchLatestUpdatedAt(cell, claim.updatedAt);
    }
  }

  for (const flag of input.conflictFlags) {
    if (!isProjectionEligibleReviewState(flag.reviewState)) continue;
    const chapterIds = flag.relatedChapterIds.length > 0 ? Array.from(new Set(flag.relatedChapterIds)).sort() : flag.chapterId === null ? [] : [flag.chapterId];
    const personaIds = uniqueResolvedPersonaIds(flag.relatedPersonaCandidateIds, input.personaIdByCandidateId);
    for (const chapterId of chapterIds) {
      const chapterNo = chapterNoById.get(chapterId);
      if (chapterNo === undefined) continue;
      for (const personaId of personaIds) {
        const cell = getOrCreateCell(cellByKey, flag.bookId, personaId, chapterId, chapterNo);
        cell.conflictCount += 1;
        incrementReviewStateSummary(cell.reviewStateSummary, "CONFLICT", flag.reviewState);
        touchLatestUpdatedAt(cell, flag.updatedAt);
      }
    }
  }

  return Array.from(cellByKey.values()).sort(comparePersonaChapterFacts);
}
```

Add helpers for `getOrCreateCell`, `uniqueResolvedPersonaIds`, `incrementReviewStateSummary`, `touchLatestUpdatedAt`, and deterministic sorting by `bookId`, `personaId`, `chapterNo`, `chapterId`.

- [x] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/persona-chapter.test.ts --coverage=false
```

Expected: pass.

---

### Task 3: Persona Time And Timeline Projection

**Files:**
- Modify: `src/server/modules/review/evidence-review/projections/types.ts`
- Create: `src/server/modules/review/evidence-review/projections/persona-time.ts`
- Test: `src/server/modules/review/evidence-review/projections/persona-time.test.ts`

- [x] **Step 1: Write failing persona-time and timeline tests**

Create tests for these behaviors:

```ts
it("aggregates accepted timed events and relations for resolved personas", () => {
  const rows = buildPersonaTimeFacts({
    personaIdByCandidateId: new Map([
      [CANDIDATE_ID_1, PERSONA_ID_1],
      [CANDIDATE_ID_2, PERSONA_ID_2]
    ]),
    eventClaims: [
      eventClaim(),
      eventClaim({ id: EVENT_ID_2, subjectPersonaCandidateId: CANDIDATE_ID_UNMAPPED }),
      eventClaim({ id: EVENT_ID_3, reviewState: "PENDING" }),
      eventClaim({ id: EVENT_ID_4, timeHintId: TIME_ID_REJECTED })
    ],
    relationClaims: [
      relationClaim(),
      relationClaim({ id: RELATION_ID_2, reviewState: "REJECTED" })
    ],
    timeClaims: [
      timeClaim(),
      timeClaim({ id: TIME_ID_REJECTED, reviewState: "REJECTED" })
    ]
  });

  expect(rows).toEqual([
    expect.objectContaining({
      personaId: PERSONA_ID_1,
      timeLabel: "赤壁之战前",
      timeSortKey: 208.1,
      chapterRangeStart: 43,
      chapterRangeEnd: 45,
      eventCount: 1,
      relationCount: 1,
      sourceTimeClaimIds: [TIME_ID_1]
    }),
    expect.objectContaining({
      personaId: PERSONA_ID_2,
      eventCount: 0,
      relationCount: 1,
      sourceTimeClaimIds: [TIME_ID_1]
    })
  ]);
});

it("builds accepted timeline events with source claim, chapter, time label, and narrative lens", () => {
  const rows = buildTimelineEvents({
    personaIdByCandidateId: new Map([[CANDIDATE_ID_1, PERSONA_ID_1]]),
    eventClaims: [
      eventClaim(),
      eventClaim({ id: EVENT_ID_2, reviewState: "EDITED" }),
      eventClaim({ id: EVENT_ID_3, timeHintId: TIME_ID_REJECTED })
    ],
    timeClaims: [
      timeClaim(),
      timeClaim({ id: TIME_ID_REJECTED, reviewState: "PENDING" })
    ]
  });

  expect(rows).toEqual([
    expect.objectContaining({
      personaId: PERSONA_ID_1,
      chapterId: CHAPTER_ID_1,
      chapterNo: 43,
      timeLabel: "赤壁之战前",
      eventLabel: "舌战：群儒",
      narrativeLens: "SELF",
      sourceClaimIds: [EVENT_ID_1]
    })
  ]);
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/persona-time.test.ts --coverage=false
```

Expected: fail because `persona-time.ts` does not exist.

- [x] **Step 3: Implement minimal persona-time and timeline builders**

Implement:

```ts
export function buildPersonaTimeFacts(input: BuildPersonaTimeFactsInput): PersonaTimeFactProjectionRow[] {
  const acceptedTimeClaimById = buildAcceptedTimeClaimById(input.timeClaims);
  const rowByKey = new Map<string, PersonaTimeFactProjectionRow>();

  for (const claim of input.eventClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState) || claim.subjectPersonaCandidateId === null) continue;
    const personaId = input.personaIdByCandidateId.get(claim.subjectPersonaCandidateId);
    const timeClaim = resolveAcceptedTimeClaim(acceptedTimeClaimById, claim.timeHintId);
    if (personaId === undefined || timeClaim === undefined) continue;
    const row = getOrCreatePersonaTimeFact(rowByKey, claim.bookId, personaId, timeClaim);
    row.eventCount += 1;
    addSourceTimeClaimId(row, timeClaim.id);
  }

  for (const claim of input.relationClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState)) continue;
    const timeClaim = resolveAcceptedTimeClaim(acceptedTimeClaimById, claim.timeHintId);
    const personaIds = resolveRelationPersonaIds(claim, input.personaIdByCandidateId);
    if (timeClaim === undefined || personaIds.length === 0) continue;
    for (const personaId of personaIds) {
      const row = getOrCreatePersonaTimeFact(rowByKey, claim.bookId, personaId, timeClaim);
      row.relationCount += 1;
      addSourceTimeClaimId(row, timeClaim.id);
    }
  }

  return Array.from(rowByKey.values()).sort(comparePersonaTimeFacts);
}
```

Implement `buildTimelineEvents(input)` using accepted event claims and accepted `timeHintId` rows only. Format `eventLabel` as `predicate` when `objectText` is null or blank, otherwise `predicate + "：" + objectText`. Sort timeline rows by `bookId`, `personaId`, accepted time sort key, `chapterNo`, `eventLabel`, and source claim id.

- [x] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/persona-time.test.ts --coverage=false
```

Expected: pass.

---

### Task 4: Relationship Edge Projection

**Files:**
- Modify: `src/server/modules/review/evidence-review/projections/types.ts`
- Create: `src/server/modules/review/evidence-review/projections/relationships.ts`
- Test: `src/server/modules/review/evidence-review/projections/relationships.test.ts`

- [x] **Step 1: Write failing relationship tests**

Create tests for these behaviors:

```ts
it("builds accepted relationship edges and merges matching claims", () => {
  const rows = buildRelationshipEdges({
    personaIdByCandidateId: new Map([
      [CANDIDATE_ID_1, PERSONA_ID_1],
      [CANDIDATE_ID_2, PERSONA_ID_2]
    ]),
    relationClaims: [
      relationClaim({ id: RELATION_ID_1, updatedAt: OLD_UPDATED_AT }),
      relationClaim({ id: RELATION_ID_2, updatedAt: NEW_UPDATED_AT }),
      relationClaim({ id: RELATION_ID_3, reviewState: "PENDING" }),
      relationClaim({ id: RELATION_ID_4, targetPersonaCandidateId: CANDIDATE_ID_UNMAPPED })
    ]
  });

  expect(rows).toEqual([
    {
      bookId: BOOK_ID,
      sourcePersonaId: PERSONA_ID_1,
      targetPersonaId: PERSONA_ID_2,
      relationTypeKey: "ally",
      relationLabel: "同盟",
      relationTypeSource: "CUSTOM",
      direction: "BIDIRECTIONAL",
      effectiveChapterStart: 43,
      effectiveChapterEnd: 45,
      sourceClaimIds: [RELATION_ID_1, RELATION_ID_2],
      latestClaimId: RELATION_ID_2
    }
  ]);
});

it("can select one relation edge by persona pair and relation type", () => {
  const rows = buildRelationshipEdges({
    personaIdByCandidateId: new Map([
      [CANDIDATE_ID_1, PERSONA_ID_1],
      [CANDIDATE_ID_2, PERSONA_ID_2]
    ]),
    relationClaims: [
      relationClaim({ relationTypeKey: "ally", relationLabel: "同盟" }),
      relationClaim({ id: RELATION_ID_2, relationTypeKey: "rival", relationLabel: "敌对" })
    ],
    selection: {
      sourcePersonaId: PERSONA_ID_1,
      targetPersonaId: PERSONA_ID_2,
      relationTypeKey: "rival"
    }
  });

  expect(rows).toHaveLength(1);
  expect(rows[0].relationTypeKey).toBe("rival");
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/relationships.test.ts --coverage=false
```

Expected: fail because `relationships.ts` does not exist.

- [x] **Step 3: Implement minimal relationship builder**

Implement `buildRelationshipEdges(input)`:

```ts
export function buildRelationshipEdges(input: BuildRelationshipEdgesInput): RelationshipEdgeProjectionRow[] {
  const edgeByKey = new Map<string, RelationshipEdgeAccumulator>();

  for (const claim of input.relationClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState)) continue;
    const sourcePersonaId = claim.sourcePersonaCandidateId === null ? undefined : input.personaIdByCandidateId.get(claim.sourcePersonaCandidateId);
    const targetPersonaId = claim.targetPersonaCandidateId === null ? undefined : input.personaIdByCandidateId.get(claim.targetPersonaCandidateId);
    if (sourcePersonaId === undefined || targetPersonaId === undefined) continue;
    if (!matchesRelationshipSelection(input.selection, sourcePersonaId, targetPersonaId, claim.relationTypeKey)) continue;

    const key = [
      claim.bookId,
      sourcePersonaId,
      targetPersonaId,
      claim.relationTypeKey,
      claim.direction,
      claim.effectiveChapterStart ?? "null",
      claim.effectiveChapterEnd ?? "null"
    ].join(":");
    const accumulator = edgeByKey.get(key) ?? createRelationshipEdgeAccumulator(claim, sourcePersonaId, targetPersonaId);
    accumulator.sourceClaimIds.add(claim.id);
    if (claim.updatedAt.getTime() > accumulator.latestUpdatedAt.getTime()) {
      accumulator.latestUpdatedAt = claim.updatedAt;
      accumulator.latestClaimId = claim.id;
    }
    edgeByKey.set(key, accumulator);
  }

  return Array.from(edgeByKey.values()).map(toRelationshipEdgeRow).sort(compareRelationshipEdges);
}
```

Sort by `bookId`, `sourcePersonaId`, `targetPersonaId`, `relationTypeKey`, `direction`, `effectiveChapterStart`, `effectiveChapterEnd`. Sort `sourceClaimIds` lexicographically.

- [x] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/relationships.test.ts --coverage=false
```

Expected: pass.

---

### Task 5: Repository Adapter And Delete-And-Rebuild Orchestration

**Files:**
- Modify: `src/server/modules/review/evidence-review/projections/projection-builder.ts`
- Create: `src/server/modules/review/evidence-review/projections/index.ts`
- Test: `src/server/modules/review/evidence-review/projections/projection-builder.test.ts`

- [x] **Step 1: Write failing orchestration tests**

Extend `projection-builder.test.ts` with these behaviors:

```ts
it("full-book rebuild deletes and recreates all projection families for one book", async () => {
  const repository = createRepositoryMock(payloadWithAcceptedResolvedFacts());
  const builder = createProjectionBuilder({ repository });

  const result = await builder.rebuildProjection({ kind: "FULL_BOOK", bookId: BOOK_ID });

  expect(repository.replaceProjectionRows).toHaveBeenCalledWith(
    { kind: "FULL_BOOK", bookId: BOOK_ID },
    expect.objectContaining({
      persona_chapter_facts: expect.any(Array),
      persona_time_facts: expect.any(Array),
      relationship_edges: expect.any(Array),
      timeline_events: expect.any(Array)
    })
  );
  expect(result.counts.created).toBeGreaterThan(0);
});

it("chapter rebuild only persists chapter-scoped projection families", async () => {
  const repository = createRepositoryMock(payloadWithAcceptedResolvedFacts());
  const builder = createProjectionBuilder({ repository });

  await builder.rebuildProjection({ kind: "CHAPTER", bookId: BOOK_ID, chapterId: CHAPTER_ID_1, chapterNo: 1 });

  expect(repository.replaceProjectionRows).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "CHAPTER", chapterId: CHAPTER_ID_1 }),
    expect.objectContaining({
      persona_chapter_facts: expect.arrayContaining([expect.objectContaining({ chapterId: CHAPTER_ID_1 })]),
      timeline_events: expect.arrayContaining([expect.objectContaining({ chapterId: CHAPTER_ID_1 })])
    })
  );
});

it("repository reads accepted claim tables and does not read legacy truth tables", async () => {
  const client = createPrismaClientMock();
  const repository = createProjectionRepository(client);

  await repository.loadProjectionSource({ kind: "FULL_BOOK", bookId: BOOK_ID });

  expect(client.eventClaim.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ bookId: BOOK_ID, reviewState: "ACCEPTED" })
  }));
  expect(client.relationClaim.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ bookId: BOOK_ID, reviewState: "ACCEPTED" })
  }));
  expect(client.biographyRecord).toBeUndefined();
  expect(client.relationship).toBeUndefined();
});

it("local rebuild after simulated review mutation changes only affected projection output", async () => {
  const repository = createMutableRepositoryMock(payloadWithAcceptedResolvedFacts());
  const builder = createProjectionBuilder({ repository });

  await builder.rebuildProjection({ kind: "PERSONA", bookId: BOOK_ID, personaId: PERSONA_ID_1 });
  repository.removeEventClaim(EVENT_ID_1);
  await builder.rebuildProjection({ kind: "PERSONA", bookId: BOOK_ID, personaId: PERSONA_ID_1 });

  expect(repository.persistedRows.persona_chapter_facts.every((row) => row.personaId === PERSONA_ID_1)).toBe(true);
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections/projection-builder.test.ts --coverage=false
```

Expected: fail because orchestration and repository behavior are incomplete.

- [x] **Step 3: Implement service orchestration**

Implement `createProjectionBuilder({ repository })`:

```ts
export function createProjectionBuilder(dependencies: { repository: ProjectionRepository }): ProjectionBuilder {
  async function rebuildProjection(scope: ProjectionRebuildScope): Promise<ProjectionBuildResult> {
    return dependencies.repository.transaction(async (repository) => {
      const payload = await repository.loadProjectionSource(scope);
      const mapping = buildAcceptedPersonaMapping({
        identityResolutionClaims: payload.identityResolutionClaims,
        requiredPersonaCandidateIds: collectRequiredPersonaCandidateIds(payload)
      });

      const allRows = {
        persona_chapter_facts: buildPersonaChapterFacts({
          chapters: payload.chapters,
          personaIdByCandidateId: mapping.personaIdByCandidateId,
          eventClaims: payload.eventClaims,
          relationClaims: payload.relationClaims,
          conflictFlags: payload.conflictFlags
        }),
        persona_time_facts: buildPersonaTimeFacts({
          personaIdByCandidateId: mapping.personaIdByCandidateId,
          eventClaims: payload.eventClaims,
          relationClaims: payload.relationClaims,
          timeClaims: payload.timeClaims
        }),
        relationship_edges: buildRelationshipEdges({
          personaIdByCandidateId: mapping.personaIdByCandidateId,
          relationClaims: payload.relationClaims,
          selection: scope.kind === "RELATION_EDGE"
            ? { sourcePersonaId: scope.sourcePersonaId, targetPersonaId: scope.targetPersonaId, relationTypeKey: scope.relationTypeKey }
            : undefined
        }),
        timeline_events: buildTimelineEvents({
          personaIdByCandidateId: mapping.personaIdByCandidateId,
          eventClaims: payload.eventClaims,
          timeClaims: payload.timeClaims
        })
      };

      const rows = filterRowsForScope(scope, filterRowsForFamilies(resolveProjectionFamilies(scope), allRows));
      const persistenceCounts = await repository.replaceProjectionRows(scope, rows);

      return {
        counts: persistenceCounts,
        rebuiltFamilies: resolveProjectionFamilies(scope),
        skipped: {
          unmappedPersonaCandidateIds: mapping.unmappedCandidateIds,
          ambiguousPersonaCandidateIds: mapping.ambiguousCandidateIds
        }
      };
    });
  }

  return { rebuildProjection };
}
```

Implement `collectRequiredPersonaCandidateIds(payload)` using only projection-eligible event/relation/conflict rows. Implement `resolveProjectionFamilies(scope)`, `filterRowsForFamilies(scope, rows)`, and `filterRowsForScope(scope, rows)`.

- [x] **Step 4: Implement Prisma repository adapter**

Implement `createProjectionRepository(prismaClient = prisma)` with these rules:

```ts
export function createProjectionRepository(prismaClient: ProjectionRepositoryPrismaClient = prisma): ProjectionRepository {
  function createFromClient(client: ProjectionRepositoryPrismaClient): ProjectionRepository {
    return {
      loadProjectionSource: async (scope) => loadProjectionSource(client, scope),
      replaceProjectionRows: async (scope, rows) => replaceProjectionRows(client, scope, rows),
      transaction: async (work) => await client.$transaction(async (tx) => work(createFromClient(tx)))
    };
  }

  return createFromClient(prismaClient);
}
```

`loadProjectionSource` must query:

- `chapter.findMany({ where: { bookId }, select: { id: true, no: true }, orderBy: { no: "asc" } })`
- `identityResolutionClaim.findMany({ where: { bookId, reviewState: "ACCEPTED" }, select: { id, bookId, personaCandidateId, resolvedPersonaId, reviewState, updatedAt } })`
- `eventClaim.findMany({ where: { bookId, reviewState: "ACCEPTED", ...scope filters }, select: { id, bookId, chapterId, subjectPersonaCandidateId, predicate, objectText, timeHintId, narrativeLens, reviewState, updatedAt } })`
- `relationClaim.findMany({ where: { bookId, reviewState: "ACCEPTED", ...scope filters }, select: { id, bookId, chapterId, sourcePersonaCandidateId, targetPersonaCandidateId, relationTypeKey, relationLabel, relationTypeSource, direction, effectiveChapterStart, effectiveChapterEnd, timeHintId, reviewState, updatedAt } })`
- `timeClaim.findMany({ where: { bookId, reviewState: "ACCEPTED", ...scope filters }, select: { id, bookId, chapterId, rawTimeText, normalizedLabel, relativeOrderWeight, chapterRangeStart, chapterRangeEnd, reviewState, updatedAt } })`
- `conflictFlag.findMany({ where: { bookId, reviewState: "ACCEPTED", ...scope filters }, select: { id, bookId, chapterId, relatedPersonaCandidateIds, relatedChapterIds, reviewState, updatedAt } })`

`replaceProjectionRows` must delete before create in this order:

- delete `personaChapterFact` with full-book, chapter, or persona filters
- delete `personaTimeFact` with full-book, persona, or time-slice filters
- delete `relationshipEdge` with full-book, persona, or relation-edge filters
- delete `timelineEvent` with full-book, chapter, persona, or time-slice filters
- create rows with `createMany({ data })` only when the corresponding row array is non-empty

- [x] **Step 5: Run projection tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections --coverage=false
```

Expected: all projection tests pass.

---

### Task 6: Validation, Documentation, And Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-04-20-t11-stage-d-projection-builder-implementation-plan.md`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [x] **Step 1: Run task validation**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/projections --coverage=false
pnpm type-check
pnpm test src/server/modules/review/evidence-review/projections
```

Expected:

- coverage-disabled projection tests pass
- type-check passes
- if `pnpm test ...` fails only because global coverage accounting includes unrelated files, record the exact caveat and targeted pass

- [x] **Step 2: Update T11 task document**

Update `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`:

- mark every Execution Checkpoint complete
- mark every Acceptance Criteria item complete
- append execution record with implemented files, validation commands, and any coverage caveat

- [x] **Step 3: Update runbook**

Update `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`:

- mark T11 as complete in the task checklist
- append a dated T11 completion record
- set next task to T12 review mutation APIs

- [x] **Step 4: Final git status review**

Run:

```bash
git status --short
```

Expected: only T11 projection files and T11 documentation changed.

- [x] **Step 5: Commit T11**

Run:

```bash
git add docs/superpowers/plans/2026-04-20-t11-stage-d-projection-builder-implementation-plan.md \
  docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md \
  docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md \
  src/server/modules/review/evidence-review/projections
git commit -m "feat: add evidence review projection builder"
```

Expected: one focused T11 commit on `dev_2`.

---

## Self-Review

- Spec coverage: T11 covers Stage D projection construction, persona-chapter matrix, persona-time matrix, relationship edge read model, timeline event read model, accepted review-state filtering, and rebuild-from-claims behavior.
- Placeholder scan: no `TBD`, no open-ended implementation tasks, no undefined future module names.
- Type consistency: plan uses `ProjectionRebuildScope`, `ProjectionRepository`, `ProjectionRowsByFamily`, `buildAcceptedPersonaMapping`, `buildPersonaChapterFacts`, `buildPersonaTimeFacts`, `buildTimelineEvents`, and `buildRelationshipEdges` consistently across tasks.
