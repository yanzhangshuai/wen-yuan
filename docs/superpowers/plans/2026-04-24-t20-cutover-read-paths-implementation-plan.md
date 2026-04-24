# T20 Cut Over Read Paths And Retire Legacy Truth Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on `dev_2`; do not create a new branch and do not start T22.

**Goal:** Cut admin and review-adjacent read paths over to the evidence-first projection/query DTOs, retire the old draft-truth review surface, and make the new projection-backed read model the only supported review truth for the management flow.

**Architecture:** T20 is a read-path cutover task, not a new storage task. The admin review surfaces already read from `review-query-service`; T20 finishes the cutover by moving remaining review-adjacent persona/relationship reads away from `Profile / BiographyRecord / Relationship`-based aggregation, retiring the old draft review surface, and making all temporary compatibility paths explicit, read-only, and bounded. Any remaining legacy read path must be either migrated now, hidden now, or documented as a short-lived compatibility bridge with route-level messaging.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Prisma 7/PostgreSQL, existing T11/T12/T13/T14/T15/T16 review query + mutation contracts, T21 regression reports, Vitest, Testing Library.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §3.2, §4, §7.7, §8, §12, §13.3, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- T21 regression outputs to cite during cutover validation:
  - `docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md`
  - `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md`
- New read model contracts already in place:
  - `src/server/modules/review/evidence-review/review-query-service.ts`
  - `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - `src/app/api/admin/review/**`
  - `src/app/admin/review/[bookId]/page.tsx`
  - `src/app/admin/review/[bookId]/relations/page.tsx`
  - `src/app/admin/review/[bookId]/time/page.tsx`
- Known legacy read paths and legacy review surface still present:
  - `src/server/modules/personas/getPersonaById.ts`
  - `src/app/api/personas/[id]/route.ts`
  - `src/app/api/books/[id]/personas/route.ts`
  - `src/app/api/books/[id]/relationships/route.ts`
  - `src/app/api/relationships/[id]/route.ts`
  - `src/server/modules/review/listDrafts.ts`
  - `src/app/api/admin/drafts/route.ts`
  - `src/lib/services/reviews.ts`
  - `src/components/review/review-panel.tsx`
  - `src/server/modules/review/mergeSuggestions.ts`
  - `src/app/api/admin/merge-suggestions/**`
  - `src/app/admin/books/[id]/review-center/page.tsx`
  - `src/app/admin/books/[id]/page.tsx`

## Preconditions

- T11, T12, T13, T14, T15, T16, and T21 are complete and green.
- T20 must not introduce a second truth model, dual-write path, or Prisma migration.
- T20 may add temporary compatibility adapters only if they are explicitly read-only, route-bounded, and documented in code comments plus the task doc.
- T21 reports must be available before final validation. If they are missing or stale, stop and regenerate/verify T21 before finalizing T20.
- Existing untracked local artifacts unrelated to T20 must not be touched:
  - `prisma/migrations/20260424062310/`
  - `tmp/`

## Execution Rules

- Follow strict TDD for every task: write failing tests first, confirm RED, implement the minimum change, confirm GREEN, then refactor while staying green.
- Treat the current `review-query-service` DTOs and projection tables as the primary read truth for all review surfaces.
- Do not silently fall back from a new projection-backed screen to old `Profile / BiographyRecord / Relationship` reads.
- If a legacy read path cannot be migrated within T20, explicitly downgrade it to temporary read-only compatibility with route-level note or UI note and record the follow-up boundary in the T20 execution record.
- Prefer adding new review-native browser services or DTO builders instead of overloading legacy `reviews.ts`.
- Retirement is part of scope. Hiding or removing old entry points is required once the replacement path is verified.
- Keep reviewer affordances intact: evidence snippets, audit traceability, and claim drill-down must not regress during cutover.
- Final T20 completion requires:
  - read-path verification,
  - reconciliation checks,
  - lint/type-check/test pass,
  - task doc update,
  - runbook update,
  - one dedicated T20 commit on `dev_2`.

## File Structure

- Modify `src/server/modules/review/evidence-review/review-query-service.ts`
  - Add any missing projection-backed DTOs needed by persona detail and relationship review-adjacent reads.
- Modify `src/server/modules/review/evidence-review/review-query-service.test.ts`
  - Cover new DTO builders, ordering, evidence traceability, and empty-state behavior.
- Create `src/server/modules/review/evidence-review/persona-detail-read.ts`
  - Review-native persona detail read service if the DTO should not live directly inside the main query service file.
- Create `src/server/modules/review/evidence-review/persona-detail-read.test.ts`
- Modify `src/app/api/personas/[id]/route.ts`
  - Cut `GET` to the new projection-backed persona detail read path while leaving existing write handlers intact.
- Modify `src/app/api/personas/[id]/route.test.ts`
  - Assert `GET` no longer depends on legacy aggregation and still preserves response contract semantics.
- Modify `src/app/api/books/[id]/personas/route.ts`
  - Evaluate and cut `GET` to a projection-backed reviewer/persona list DTO if the route is part of the active review surface.
- Modify `src/app/api/books/[id]/personas/route.test.ts`
- Modify `src/app/api/books/[id]/relationships/route.ts`
  - Evaluate and cut `GET` to projection-backed relation-editor-compatible DTOs where it is part of the review surface.
- Modify `src/app/api/books/[id]/relationships/route.test.ts`
- Modify `src/app/api/relationships/[id]/route.ts`
  - Reassess whether read/edit/delete still expose legacy truth semantics that conflict with T20.
- Modify `src/app/api/relationships/[id]/route.test.ts`
- Modify/Create `src/lib/services/review-personas.ts`
  - Browser-safe fetch wrapper for any new projection-backed persona detail/list route used by active review UI.
- Modify/Create `src/lib/services/review-personas.test.ts`
- Modify/Create `src/lib/services/review-relationships.ts`
  - Browser-safe fetch wrapper for any new projection-backed relationship read route used by active review UI.
- Modify/Create `src/lib/services/review-relationships.test.ts`
- Modify `src/app/admin/books/[id]/page.tsx`
  - Replace the old “审核中心” entry with the new review route or explicit migration copy.
- Modify `src/app/admin/books/[id]/page.test.tsx`
- Modify `src/app/admin/books/[id]/review-center/page.tsx`
  - Hide, retire, or convert to explicit transitional notice.
- Modify/Create `src/app/admin/books/[id]/review-center/page.test.tsx`
- Modify `src/components/review/review-panel.tsx`
  - Retire or remove the old panel once no active route references it.
- Modify related `src/components/review/**/*.test.tsx`
- Modify `src/components/review/index.ts`
  - Remove legacy exports that should no longer be consumed.
- Modify `src/lib/services/reviews.ts`
  - Retire, shrink to compatibility shim, or delete once callers are removed.
- Modify/Create tests under `src/app/admin/review/**` and `src/components/review/**`
  - Guard no-regression behavior for main review surfaces and retired entry points.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
  - Mark checkpoints and append execution record after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Mark T20 complete only after validation passes.

## Cutover Decisions

### Legacy Inventory Classification

Classify each remaining legacy path into one of three buckets before touching implementation:

1. `CUT_OVER_NOW`
   - Active read surface used by current admin/review flow.
   - Must move to projection/query DTOs in T20.
2. `HIDE_OR_RETIRE_NOW`
   - Old review entry, old review service, or old panel no longer needed after T13/T14/T15/T16.
   - Should be removed from navigation and blocked from normal operator flow in T20.
3. `TEMP_READ_ONLY_COMPAT`
   - Not part of the main review surface, but still reachable by existing admin pages or utilities.
   - May remain only if it is explicitly read-only, visibly transitional, and recorded in the task doc with an exit note.

### Persona Detail Read Contract

T20 should not keep using `getPersonaById` as the read truth for review-adjacent persona detail because it aggregates:

- `Profile`
- `BiographyRecord`
- `Relationship`

Instead, the persona detail contract should read from projection/query truth and preserve review-facing fields:

```ts
interface ReviewPersonaDetailDto {
  personaId: string;
  displayName: string;
  aliases: string[];
  primaryPersonaCandidateId: string | null;
  personaCandidateIds: string[];
  summary: {
    firstChapterNo: number | null;
    firstTimeSortKey: number | null;
    totalEventCount: number;
    totalRelationCount: number;
    totalTimeClaimCount: number;
    totalConflictCount: number;
  };
  chapterFacts: Array<{
    chapterId: string;
    chapterNo: number;
    factLabel: string;
    evidenceSnippets: string[];
  }>;
  timeFacts: Array<{
    timeKey: string;
    normalizedLabel: string;
    timeType: string;
    chapterRangeStart: number | null;
    chapterRangeEnd: number | null;
    evidenceSnippets: string[];
  }>;
  relations: Array<{
    relationTypeKey: string;
    direction: string;
    counterpartPersonaId: string | null;
    counterpartDisplayName: string;
    effectiveChapterStart: number | null;
    effectiveChapterEnd: number | null;
    evidenceSnippets: string[];
  }>;
}
```

Rules:

- Evidence snippets must remain attached to facts/relations/time facts.
- `relationTypeKey` remains open-string; do not introduce a DB enum.
- This route is reviewer-facing, so ordering must be stable and diff-friendly.
- If existing non-review consumers still need the old public contract, add a review-native DTO instead of mutating a public contract blindly.

### Relationship Read Contract

For any route that powers active admin review or editor surfaces, the read DTO must align with:

- `getRelationEditorView`
- T18 relation-type catalog behavior
- evidence-first relation claims and relation edges

The route must expose:

- source / target persona display info
- `relationTypeKey`
- direction
- effective chapter interval
- evidence snippets or evidence span linkage
- audit-safe identifiers for drill-down

Do not rebuild relationship review pages from legacy `Relationship` rows once the new relation editor is available.

### Retirement Rules

- `src/app/admin/books/[id]/page.tsx`
  - The button should point to `/admin/review/[bookId]` or a clearer replacement route, not the old review center.
- `src/app/admin/books/[id]/review-center/page.tsx`
  - Either remove from operator flow or render a transitional “已迁移” page that links into the new review surfaces.
- `src/app/api/admin/drafts/route.ts`, `src/server/modules/review/listDrafts.ts`, `src/lib/services/reviews.ts`, `src/components/review/review-panel.tsx`
  - These should be treated as the old draft-review stack and retired together after callers are removed.
- `src/app/api/admin/merge-suggestions/**`
  - If still needed outside the retired review-center UI, mark the boundary explicitly; if not needed, hide/retire with tests.

### Reconciliation And Failure Protection

T20 must add a recorded reconciliation step comparing projection-backed reads against the validated T21 baseline.

Minimum reconciliation set:

- persona count
- chapter fact count
- relation edge count
- sampled evidence traceability

Failure-protection requirements:

- If projection rebuild/read fails, the route/page must fail loudly with a reviewer-readable error note or read-only degraded state.
- Do not auto-fallback to legacy truth.
- Record one rollback note in the T20 execution record:
  - what was switched,
  - how to temporarily hide the route if production data is inconsistent,
  - how to rebuild/revalidate projections before re-enabling.

---

### Task 1: Inventory Remaining Read Paths And Define Cutover Buckets

**Files:**
- Modify/Create: `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
- Optional temporary note during implementation: local scratch notes only, not committed if unnecessary

- [x] **Step 1: Write the inventory checklist before code changes**

Create a concrete inventory table in your working notes covering:

- route/component/service path
- current legacy dependency
- consumer surface
- bucket: `CUT_OVER_NOW` / `HIDE_OR_RETIRE_NOW` / `TEMP_READ_ONLY_COMPAT`
- target replacement

This step is design verification; no repo edit required yet if the task doc is updated only after validation.

- [x] **Step 2: Confirm current active review pages are already projection-backed**

Verify and note that:

- `/admin/review/[bookId]`
- `/admin/review/[bookId]/relations`
- `/admin/review/[bookId]/time`

already read `review-query-service` DTOs and do not load old drafts as primary truth.

- [x] **Step 3: Identify the remaining cutover scope**

At minimum, confirm classification for:

- `GET /api/personas/[id]`
- `GET /api/books/[id]/personas`
- `GET /api/books/[id]/relationships`
- old review-center entry/button
- old draft review stack
- merge-suggestion routes if still reachable from active admin UX

No implementation starts until the bucket list is explicit.

Task 1 bucket result:

- `CUT_OVER_NOW`
  - `GET /api/personas/[id]`
- `HIDE_OR_RETIRE_NOW`
  - book detail review-center button
  - `/admin/books/[id]/review-center`
  - old draft review stack (`/api/admin/drafts`, `listDrafts`, `reviews.ts`, `review-panel`)
  - old merge-suggestion stacks (global + book-scoped)
  - legacy direct relationship edit stack (`/api/relationships/[id]`, `relationships.ts`, `relationship-edit-form`)
- `TEMP_READ_ONLY_COMPAT`
  - `GET /api/books/[id]/personas`
  - `GET /api/books/[id]/relationships`

---

### Task 2: Add Projection-Backed Persona Detail Read Model

**Files:**
- Modify: `src/server/modules/review/evidence-review/review-query-service.ts`
- Modify: `src/server/modules/review/evidence-review/review-query-service.test.ts`
- Create or Modify: `src/server/modules/review/evidence-review/persona-detail-read.ts`
- Create or Modify: `src/server/modules/review/evidence-review/persona-detail-read.test.ts`

- [x] **Step 1: Write failing tests for the persona detail DTO**

Cover:

- stable ordering of chapter facts, time facts, and relations
- evidence snippets preserved in each projection family
- empty persona / missing persona behavior
- relation direction and effective interval mapping
- open-string `relationTypeKey` behavior

Run RED with the smallest relevant test target.

- [x] **Step 2: Implement the minimum projection-backed persona detail reader**

Use current review/projection truth only. Do not query old `Profile / BiographyRecord / Relationship` tables as the primary source.

- [x] **Step 3: Refactor for reuse**

If logic starts bloating `review-query-service.ts`, extract a focused `persona-detail-read.ts` module and keep the main service as an orchestrator/export surface.

---

### Task 3: Cut `GET /api/personas/[id]` To The New Read Path

**Files:**
- Modify: `src/app/api/personas/[id]/route.ts`
- Modify: `src/app/api/personas/[id]/route.test.ts`

- [x] **Step 1: Write failing route tests**

Cover:

- `GET` delegates to the new projection-backed reader
- `404` / validation behavior stays stable
- response still preserves the required reviewer-facing fields
- write handlers (`PATCH`, `DELETE`) remain untouched

- [x] **Step 2: Implement the route cutover**

Switch only the `GET` path first. Keep the public route stable unless a deliberate response-contract split is required.

- [x] **Step 3: Add contract note if compatibility is required**

If some non-review consumer still relies on old fields, either:

- add a review-native route/service, or
- keep the route transitional with an explicit compatibility comment and bounded scope.

Do not silently mix both truths in one DTO without documenting it.

---

### Task 4: Cut Review-Adjacent Persona And Relationship List Reads

**Files:**
- Modify: `src/app/api/books/[id]/personas/route.ts`
- Modify: `src/app/api/books/[id]/personas/route.test.ts`
- Modify: `src/app/api/books/[id]/relationships/route.ts`
- Modify: `src/app/api/books/[id]/relationships/route.test.ts`
- Modify/Create: `src/lib/services/review-personas.ts`
- Modify/Create: `src/lib/services/review-personas.test.ts`
- Modify/Create: `src/lib/services/review-relationships.ts`
- Modify/Create: `src/lib/services/review-relationships.test.ts`

- [x] **Step 1: Write failing tests for both list routes**

Cover:

- new projection-backed source selection
- stable list ordering
- evidence/summary fields needed by the active admin surface
- empty-state behavior
- preserved validation/auth semantics

- [x] **Step 2: Implement persona list cutover**

Only cut this route if it is still part of active admin/reviewer flow. If it is no longer part of that flow, move it to `TEMP_READ_ONLY_COMPAT` and document the reason.

- [x] **Step 3: Implement relationship list cutover**

Align the DTO with current relation editor semantics. Do not regress custom `relationTypeKey`, direction, or effective interval support.

- [x] **Step 4: Add browser-safe wrappers only where actively consumed**

Avoid reviving `src/lib/services/reviews.ts`. Add dedicated review-native client wrappers if a client component still needs these paths.

---

### Task 5: Retire Old Review Entry Points And Legacy Draft Stack

**Files:**
- Modify: `src/app/admin/books/[id]/page.tsx`
- Modify: `src/app/admin/books/[id]/page.test.tsx`
- Modify: `src/app/admin/books/[id]/review-center/page.tsx`
- Modify/Create: `src/app/admin/books/[id]/review-center/page.test.tsx`
- Modify: `src/app/api/admin/drafts/route.ts`
- Modify: `src/app/api/admin/drafts/route.test.ts`
- Modify: `src/server/modules/review/listDrafts.ts`
- Modify/Create related tests
- Modify: `src/lib/services/reviews.ts`
- Modify/Create related tests
- Modify: `src/components/review/review-panel.tsx`
- Modify related `src/components/review/**/*.test.tsx`
- Modify: `src/components/review/index.ts`
- Modify: `src/app/api/admin/merge-suggestions/**`
- Modify related tests as needed

- [x] **Step 1: Write failing UI/route retirement tests**

Cover:

- book detail page no longer exposes the old review-center button as the primary entry
- old review-center route either redirects, renders transitional messaging, or becomes intentionally inaccessible
- old drafts API/panel no longer acts as the main review path

- [x] **Step 2: Replace the old entry point**

Change `/admin/books/[id]` to point operators to the new review surface.

- [x] **Step 3: Retire the old review-center page**

Choose one explicit path and implement it consistently:

1. redirect to the new review page,
2. render a migration notice page with links into new review surfaces,
3. hard-retire and remove navigation.

Recommendation: use a migration notice or redirect if the URL may still exist in operator bookmarks.

- [x] **Step 4: Retire the old draft-review stack together**

Remove or explicitly neuter:

- old drafts route
- `listDrafts`
- `reviews.ts` review-center fetches
- `ReviewPanel`
- legacy export barrel references

Avoid leaving dead-but-importable code paths that can accidentally be revived.

- [x] **Step 5: Resolve merge-suggestion boundary**

If merge suggestions still serve a bounded admin utility outside the retired review-center flow, mark them as such in code and keep them out of the main review navigation. Otherwise retire/hide them in T20.

---

### Task 6: Reconciliation Checks And Failure Protection

**Files:**
- Modify/Create: tests around route/page failure handling
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [x] **Step 1: Write failing tests for degraded/failure behavior**

Cover:

- projection read failure does not auto-fallback to legacy truth
- route/page returns explicit error or read-only degraded state
- operator-facing message is clear enough to block unsafe review actions

- [x] **Step 2: Implement the minimum failure handling**

Add route-level or page-level handling that preserves debuggability and blocks silent truth switching.

- [x] **Step 3: Run and record reconciliation**

Using T21 as the baseline, record comparison results for at least:

- persona count
- chapter fact count
- relation edge count
- sampled evidence traceability

Store the report path and reconciliation note in the T20 execution record.

- [x] **Step 4: Write the rollback note**

Document:

- what entry points changed,
- how to temporarily disable/hide the new read path if projections are inconsistent,
- how to rebuild/revalidate before restoring access.

---

### Task 7: Final Validation, Docs, And Commit

**Files:**
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [x] **Step 1: Run the focused validation suite**

At minimum run the T20-relevant suites you changed, then run:

```bash
pnpm type-check
pnpm lint
```

- [x] **Step 2: Re-run or reference the required T21 baseline**

Confirm the cited T21 report paths are still the baseline for this cutover. If a new T21 run is needed, record the updated report path.

- [x] **Step 3: Update docs after validation passes**

Only after tests and validation pass:

- mark T20 checkpoints complete in the task doc
- append the execution record
- mark T20 complete in the runbook

- [x] **Step 4: Create one dedicated T20 commit**

Use a commit message clearly scoped to read-path cutover and legacy truth retirement.

Execution note:
- Validation, task doc sync, and runbook completion are done.
- This execution pass intentionally leaves the T20 commit to the next explicit submit step.

---

## Recommended Execution Order

1. Task 1 inventory and bucket confirmation
2. Task 2 persona detail read model
3. Task 3 `GET /api/personas/[id]`
4. Task 4 list-read cutovers
5. Task 5 legacy entry/stack retirement
6. Task 6 reconciliation and failure protection
7. Task 7 validation, docs, commit

This order keeps the highest-risk contract change first, then removes the old entry points only after the new reads are proven.

## Validation Matrix

Run the smallest RED/GREEN tests per task first, then finish with:

```bash
pnpm exec vitest run src/app/api/personas/[id]/route.test.ts --coverage=false
pnpm exec vitest run src/app/api/books/[id]/personas/route.test.ts --coverage=false
pnpm exec vitest run src/app/api/books/[id]/relationships/route.test.ts --coverage=false
pnpm exec vitest run src/app/admin/books/[id]/page.test.tsx --coverage=false
pnpm exec vitest run src/app/admin/books/[id]/review-center/page.test.tsx --coverage=false
pnpm type-check
pnpm lint
```

If retirement touches additional legacy suites, run those focused tests before the final matrix.

## Next Step Execution Options

1. **Subagent-Driven（推荐）**：按本计划逐 Task 派发执行，适合 T20 这种“读路径切流 + 旧入口退役 + 对账收尾”并行面较多、但又需要严格 checkpoint 的任务。
2. **Inline Execution**：在当前会话里顺序执行 Task 1 → Task 7，适合你希望上下文完全收拢、不启多个后台 worker 的情况。
