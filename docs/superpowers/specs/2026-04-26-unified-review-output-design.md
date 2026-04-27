# Unified Review Output for Sequential and Three-Stage Analysis

## Problem

Wen Yuan has two selectable character analysis architectures:

1. `sequential`
2. `threestage`

They must coexist, but the review center should not have architecture-specific data paths. A book analyzed with either architecture must produce the same final review output so `/admin/review/:bookId` can read one contract.

The current failure mode is that a `sequential` job can complete with legacy outputs (`profiles`, `mentions`, `biography_records`, `relationships`) while the claim-first review output (`persona_candidates`, `*_claims`, `identity_resolution_claims`, `persona_chapter_facts`) remains empty. The review center then correctly shows no roles, even though the graph/legacy data has personas.

## Goals

- Keep `sequential` and `threestage` as explicit selectable analysis architectures.
- Keep `sequential` and `threestage` as independent selectable architectures.
- Make the final review output identical for both architectures.
- Keep the review center simple: one query path, one DTO shape, one projection contract.
- Prevent jobs from reporting success when review output generation fails.

## Non-Goals

- Do not make the review center read `profiles` directly as a fallback.
- Do not remove legacy `sequential` graph outputs.
- Do not force every book to use `threestage`.

## Recommended Approach

Update the primary `sequential` path so it writes the unified claim-first output during analysis, then rebuilds projections at the end of the job.

This keeps the architecture choice at the analysis layer while keeping downstream review behavior architecture-neutral. The implementation must not make the review center branch on architecture; whichever architecture is selected must write the same review-output database shape.

## Architecture

```text
Admin selects architecture
  ├─ sequential
  │    ├─ existing legacy writes
  │    │    ├─ personas / profiles
  │    │    ├─ mentions
  │    │    ├─ biography_records
  │    │    └─ relationships
  │    ├─ new sequential claim adapter
  │    │    ├─ persona_candidates
  │    │    ├─ alias/event/relation/time claims
  │    │    └─ identity_resolution_claims
  │    └─ rebuildProjection(FULL_BOOK)
  │         ├─ persona_chapter_facts
  │         ├─ persona_time_facts
  │         ├─ relationship_edges
  │         └─ timeline_events
  │
   └─ threestage
       ├─ existing claim-first stages
       └─ rebuildProjection(FULL_BOOK)

Review center
  └─ reads only unified projections and claim APIs
```

## Data Contracts

### Architecture Selection

```ts
type AnalysisArchitecture = "sequential" | "threestage";
```

The selected architecture controls how analysis is performed, not what the review center reads.

Selection rule:

```ts
type AnalysisArchitecture = "sequential" | "threestage";
```

Architecture selection controls which pipeline runs. It must not control the final review-output database shape.

### Unified Review Output

Both architectures must produce:

| Table / Model | Required For | Notes |
|---------------|--------------|-------|
| `persona_candidates` | candidate identity layer | Sequential can derive one candidate per resolved persona/name occurrence group. |
| `alias_claims` | aliases and labels | Generated from aliases and resolver evidence where available. |
| `event_claims` | persona chapter facts | Generated from biography/event extraction. |
| `relation_claims` | relationship review and graph edges | Generated from relationship extraction. |
| `time_claims` | time matrix and timeline | Generated when sequential output has explicit time hints. |
| `identity_resolution_claims` | candidate-to-persona mapping | Sequential-created/reused personas should produce accepted mappings. |
| `persona_chapter_facts` | review role list and matrix | Built from accepted claim/projection input. |
| `persona_time_facts` | time review matrix | Built when time claims exist. |
| `relationship_edges` | relation editor | Built from relation claims. |
| `timeline_events` | evidence timeline | Built from event/time claims. |

## Sequential Claim Adapter

Add a focused adapter in the sequential path. It should translate existing per-chapter sequential results into claim drafts and persist them through the existing claim write service/repository, rather than bypassing claim validation.

Suggested boundary:

```ts
interface SequentialReviewOutputAdapter {
  writeChapterReviewOutput(input: {
    jobId: string;
    bookId: string;
    chapterId: string;
    chapterNo: number;
    analysisResult: ChapterAnalysisResult;
  }): Promise<void>;
}
```

Responsibilities:

- Create or reuse `persona_candidates` for personas detected by sequential analysis.
- Write `EVENT`, `RELATION`, `ALIAS`, and optionally `TIME` claims.
- Write `IDENTITY_RESOLUTION` claims that map candidates to the final persona IDs selected by sequential resolution.
- Use `source = "AI"` for pipeline-generated claims.
- Use `reviewState = "ACCEPTED"` only when sequential already committed the resolved persona/relationship as final output; otherwise use `PENDING`.

## Projection Rebuild

At the end of a successful analysis job, both architectures must rebuild the same projection scope:

```ts
await projectionBuilder.rebuildProjection({
  kind: "FULL_BOOK",
  bookId
});
```

This should happen after all claim writes are complete and before the job/book is marked successful.

## Error Handling

| Failure | Expected Behavior |
|---------|-------------------|
| Sequential legacy writes succeed but claim writes fail | Job fails or is marked error; do not report complete review output. |
| Claims exist but projection rebuild fails | Job fails or is marked error; review center cannot be considered ready. |
| Some claim families are unsupported by sequential data | Write supported families and record a warning; do not fake unsupported data. |
| Identity resolution cannot map a candidate to a single persona | Leave mapping unresolved/PENDING and surface warning; projection may skip that candidate. |

The system must not silently return `Book.status = COMPLETED` while review projections are missing for the selected architecture.

## Review Center Behavior

The review center remains architecture-neutral:

```ts
createReviewQueryService().getPersonaChapterMatrix({ bookId });
```

It should continue reading `persona_chapter_facts` and claim APIs only. It should not branch on `analysis_jobs.architecture`.

## Testing Requirements

1. `sequential` integration/unit coverage:
   - Given a sequential chapter result with personas/events/relations, claim rows are written.
   - Identity-resolution claims map sequential candidates to the final persona IDs.
   - Projection rebuild is invoked after claim writes.

2. Review query coverage:
   - `getPersonaChapterMatrix` returns roles for a sequential-produced projection.
   - `getPersonaChapterMatrix` does not read `profiles` as a fallback.

3. Architecture choice coverage:
   - `createPipeline("sequential")` and `createPipeline("threestage")` remain selectable.
   - Missing or unknown architecture values normalize to `sequential`.
   - Both architectures satisfy the same post-job review-output assertions.

4. Failure coverage:
   - Claim write failure prevents successful job completion.
   - Projection rebuild failure prevents successful job completion.

## Wrong vs Correct

### Wrong

```text
sequential -> profiles/relationships only
threestage -> claims/projections
review center -> tries to guess which structure to read
```

This leaks architecture differences into the UI and causes empty review pages for completed sequential jobs.

### Correct

```text
sequential -> legacy outputs + unified claims/projections
threestage -> unified claims/projections
review center -> unified claims/projections only
```

The architecture remains selectable, while downstream review behavior is consistent.

## Open Implementation Notes

- Existing completed sequential jobs may need a one-time backfill command if they should become reviewable without rerunning analysis.
- The adapter should be small and testable; avoid embedding claim conversion directly into large pipeline loops.
- Current code should be checked for architecture-specific review output gaps; do not fix review visibility by adding UI fallbacks or forcing one architecture over the other.
