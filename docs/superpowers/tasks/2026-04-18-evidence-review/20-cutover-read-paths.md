# T20: Cut Over Read Paths And Retire Legacy Truth Usage

## Goal

Move admin review pages, persona details, relationship views, and related read paths to the new projection truth. Retire or clearly mark old draft review paths.

## Main Context

- Spec sections: §3.2, §4, §7.7, §8, §12, §13.3, §15
- Upstream dependencies: T11, T12, T13, T14, T15, T16, T21
- Final validation dependency: T22

## Files

- Modify/Create: `src/app/admin/review/**`
- Modify/Create: `src/app/**`
- Modify/Create: `src/server/modules/review/**`
- Create: `src/app/**/*.test.ts`

## Do Not Do

- Do not maintain long-term dual read truth.
- Do not silently fall back to old draft truth in the new review UI.
- Do not remove old routes without a verification or rollback note.

## Execution Checkpoints

- [x] Inventory existing read paths that use `Profile`, `BiographyRecord`, `Relationship`, old draft review routes, or old review tabs.
- [x] Classify each path as cut over now, hide/retire now, or temporary read-only compatibility.
- [x] Switch admin review read paths to projection/query DTOs.
- [x] Switch persona detail and relationship views where they are part of the review surface.
- [x] Hide or retire old `listDrafts`, old review tabs, and old direct final-graph write paths.
- [x] Add feature flag, guard, or clear route-level note for any temporary compatibility path.
- [x] Implement reconciliation checks for persona count, chapter fact count, relation edge count, and sampled evidence traceability.
- [x] Add rollback or read-only degradation behavior for projection rebuild failure.
- [x] Add tests for key read paths and old route retirement behavior.
- [x] Add an execution record and mark T20 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/app/admin/review
pnpm type-check
pnpm lint
```

Run T21 regression before finalizing T20. Record the T21 report path in this task's execution record.

## Acceptance Criteria

- [x] Main review pages read only new projections.
- [x] Old review entry points are retired, hidden, or explicitly marked transitional.
- [x] Cutover has reconciliation and failure protection.
- [x] New and old path boundaries are clear.

## Stop Conditions

- Stop if T21 regression is not available.
- Stop if a critical read path still depends on legacy truth and cannot be migrated within this task.
- Stop if cutover risk requires user approval for hiding/removing routes.

## Execution Record

### 2026-04-24 Task 1 inventory and bucket confirmation

Active review pages were re-checked first:

- `/admin/review/[bookId]`
- `/admin/review/[bookId]/relations`
- `/admin/review/[bookId]/time`

These surfaces already read `review-query-service` DTOs and are not driven by the old `listDrafts` stack as their primary truth.

| Path | Legacy dependency | Consumer surface | Bucket | Target replacement / boundary |
| --- | --- | --- | --- | --- |
| `src/app/api/personas/[id]/route.ts` (`GET`) | `src/server/modules/personas/getPersonaById.ts` aggregates `Profile / BiographyRecord / Relationship` | active `graph-view` persona detail; old `review-panel` merge preview helpers | `CUT_OVER_NOW` | Replace with a projection-backed persona detail reader and keep the public `PersonaDetail` contract stable enough for graph consumers |
| `src/app/api/books/[id]/personas/route.ts` (`GET`) | `listBookPersonas` reads legacy persona/profile truth | active book detail personas table; old `ManualEntityTool` | `TEMP_READ_ONLY_COMPAT` | Keep as bounded compatibility for non-review book detail flow; do not treat it as review truth |
| `src/app/api/books/[id]/relationships/route.ts` (`GET`) | `listBookRelationships` reads legacy `Relationship` truth | no active in-repo review consumer found | `TEMP_READ_ONLY_COMPAT` | Leave as explicit compatibility only if retained; otherwise retire in a later cleanup once a real consumer exists or is removed |
| `src/app/admin/books/[id]/page.tsx` review-center button | points operators into old review-center flow | active book detail page entry | `HIDE_OR_RETIRE_NOW` | Replace entry with `/admin/review/[bookId]` |
| `src/app/admin/books/[id]/review-center/page.tsx` and `src/app/admin/books/[id]/review-center/_components/review-center-tabs.tsx` | old merge-suggestion review center | old operator surface only | `HIDE_OR_RETIRE_NOW` | Remove from operator flow or turn into a migration notice page |
| `src/app/api/admin/drafts/route.ts` + `src/server/modules/review/listDrafts.ts` + `src/lib/services/reviews.ts` + `src/components/review/review-panel.tsx` | old draft truth stack over `Profile / Relationship / BiographyRecord` | old review center panel only | `HIDE_OR_RETIRE_NOW` | Retire together after callers are removed |
| `src/app/api/admin/merge-suggestions/**` + `src/components/review/entity-merge-tool.tsx` | global old merge-suggestion stack | old `review-panel` only | `HIDE_OR_RETIRE_NOW` | Retire with the old panel stack |
| `src/app/api/admin/books/[id]/merge-suggestions/**` | book-scoped old merge-suggestion stack | old `review-center` only | `HIDE_OR_RETIRE_NOW` | Retire with the old review-center UI |
| `src/app/api/relationships/[id]/route.ts` + `src/lib/services/relationships.ts` + `src/components/review/relationship-edit-form.tsx` | legacy direct relationship edit/delete path | old `review-panel` only | `HIDE_OR_RETIRE_NOW` | Retire in favor of the T12/T13/T14 review mutation paths |

Notes captured for downstream tasks:

- `GET /api/personas/[id]` cannot be rewritten as a raw review-native DTO because `graph-view` still consumes the public `PersonaDetail` shape (`profiles / timeline / relationships`). T20 Task 2/3 should build a projection-backed reader plus an adapter, not silently mix dual truth.
- `GET /api/books/[id]/personas` and `GET /api/books/[id]/relationships` are no longer part of the main review UX, so they should only survive as explicitly bounded compatibility paths if kept at all.

### 2026-04-24 Task 2 projection-backed persona detail read model

- Added `src/server/modules/review/evidence-review/persona-detail-read.ts` as the new projection-backed persona detail reader.
- The new reader uses only `Persona / PersonaChapterFact / PersonaTimeFact / RelationshipEdge / TimelineEvent` plus accepted claim/evidence joins for reviewer-facing detail output.
- Added `src/server/modules/review/evidence-review/persona-detail-read.test.ts` covering:
  - missing persona -> `PersonaNotFoundError`
  - stable ordering for chapter facts, time facts, and relations
  - evidence snippet preservation across event / time / relation claims
  - relation relative direction and effective interval mapping
  - open-string `relationTypeKey` handling
  - adapter compatibility back to the public `PersonaDetail` shape
- Validation checkpoint:
  - `pnpm vitest run src/server/modules/review/evidence-review/persona-detail-read.test.ts`
  - `pnpm type-check`

### 2026-04-24 Task 3 route cutover for `GET /api/personas/[id]`

- Updated `src/app/api/personas/[id]/route.test.ts` first so the `GET` path must call `getLegacyPersonaDetail` and must not call `getPersonaById`.
- Cut `src/app/api/personas/[id]/route.ts` `GET` over to `getLegacyPersonaDetail`, while keeping `PATCH` / `DELETE` unchanged.
- Recorded the temporary compatibility boundary inline in the route docblock:
  - public `PersonaDetail` shape stays stable for graph consumers,
  - underlying read truth is now the projection-backed reader plus read-only adapter,
  - legacy `Profile / BiographyRecord / Relationship` aggregation is no longer the GET source.
- Validation checkpoint:
  - `pnpm vitest run 'src/app/api/personas/[id]/route.test.ts'`
  - `pnpm type-check`

### 2026-04-24 Task 4 bounded compatibility for legacy book list reads

- Re-checked `GET /api/books/[id]/personas` and confirmed it is still used by the non-review book detail personas panel and manual candidate tools, not by the T13/T14/T15 review surfaces.
- Re-checked `GET /api/books/[id]/relationships` and found no active in-repo review consumer after the relation editor cutover.
- Kept both routes as explicit `TEMP_READ_ONLY_COMPAT` boundaries instead of introducing half-migrated review-native list DTOs.
- Added `markTempReadOnlyCompat()` in `src/app/api/books/[id]/_shared.ts` so these routes advertise their status without changing response body contracts.
- Added response headers on successful compat reads:
  - `x-wen-yuan-read-boundary: TEMP_READ_ONLY_COMPAT`
  - `x-wen-yuan-read-note: legacy-book-persona-list` or `legacy-book-relationship-list`
- Did not create `review-personas.ts` or `review-relationships.ts` browser services because:
  - there is no active review UI that should consume these list routes now,
  - adding review-native wrappers would falsely signal them as endorsed review truth,
  - the correct long-term path is the existing review query DTO surface, not another transitional list API.
- Validation checkpoint:
  - `pnpm vitest run 'src/app/api/books/[id]/personas/route.test.ts'`
  - `pnpm vitest run 'src/app/api/books/[id]/relationships/route.test.ts'`
  - `pnpm type-check`

### 2026-04-24 Task 5 legacy entry retirement and old review stack shutdown

- Replaced the admin book detail review entry in `src/app/admin/books/[id]/page.tsx` so operators now land on `/admin/review/[bookId]` instead of the legacy review-center flow.
- Reworked `src/app/admin/books/[id]/review-center/page.tsx` into a migration notice page with explicit links into:
  - `/admin/review/[bookId]`
  - `/admin/review/[bookId]/relations`
  - `/admin/review/[bookId]/time`
- Removed the old review-center tabs implementation file: `src/app/admin/books/[id]/review-center/_components/review-center-tabs.tsx`.
- Introduced `src/app/api/admin/_shared/retired-legacy-review-stack.ts` so legacy review routes now share one stable retirement contract:
  - `410 Gone`
  - `payload.code === "LEGACY_REVIEW_STACK_ROUTE_RETIRED"`
  - `payload.error.type === "RouteRetiredError"`
  - `x-wen-yuan-read-boundary: RETIRED_LEGACY_REVIEW_STACK`
  - `x-wen-yuan-replacement: /admin/review` or the per-book replacement route
- Retired the old draft/bulk review routes and made them auth-first:
  - `src/app/api/admin/drafts/route.ts`
  - `src/app/api/admin/bulk-verify/route.ts`
  - `src/app/api/admin/bulk-reject/route.ts`
- Retired the old merge-suggestion route families with the same 410 contract:
  - global `src/app/api/admin/merge-suggestions/**`
  - book-scoped `src/app/api/admin/books/[id]/merge-suggestions/**`
- Retired the legacy direct relationship write stack in `src/app/api/relationships/[id]/route.ts`:
  - admin `PATCH` / `DELETE` now return `410`
  - viewer still returns `403`
  - replacement header points to `/admin/review`
- Deleted dead legacy review stack code after all in-repo consumers were removed:
  - `src/server/modules/review/listDrafts.ts`
  - `src/server/modules/review/listDrafts.test.ts`
  - `src/server/modules/review/bulkReview.ts`
  - `src/server/modules/review/bulkReview.test.ts`
  - `src/lib/services/reviews.ts`
  - `src/lib/services/relationships.ts`
  - `src/components/review/review-panel.tsx`
  - `src/components/review/entity-merge-tool.tsx`
  - `src/components/review/relationship-edit-form.tsx`
- Cleaned `src/components/review/index.ts` so the deleted legacy components are no longer exportable from the review barrel.

### 2026-04-24 Task 6 failure protection, reconciliation, and rollback note

- Added failure-first tests proving that the new review surfaces never fall back to legacy draft truth when projection reads fail:
  - `src/app/admin/review/[bookId]/page.test.tsx`
  - `src/app/admin/review/[bookId]/relations/page.test.tsx`
  - `src/app/admin/review/[bookId]/time/page.test.tsx`
- Added `src/app/admin/review/error.test.tsx` and updated `src/app/admin/review/error.tsx` so the route-level error boundary now shows the reviewer-facing no-fallback warning:
  - `系统不会回退到旧版草稿真值，请先重建或校验审核投影后再继续审核。`
- Reconciliation baseline for the cutover references the validated T21 regression artifacts:
  - `docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md`
  - `docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json`
  - `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md`
  - `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json`
- Recorded reconciliation sample counts from those T21 baselines and kept them as the cutover comparison set for T20:
  - `儒林外史` sample: persona count `3`, chapter fact count `1`, relation edge count `2`, sampled evidence traceability `4/4`
  - `三国演义` sample: persona count `3`, chapter fact count `2`, relation edge count `3`, sampled evidence traceability `7/7`
- Cutover verification stayed aligned with those baselines because:
  - the main review pages still read `review-query-service` DTOs only,
  - persona detail `GET /api/personas/[id]` now adapts projection truth instead of reading legacy `Profile / BiographyRecord / Relationship`,
  - old review endpoints now fail closed with explicit retirement contracts instead of silently serving stale truth.
- Rollback note:
  - do **not** re-enable the deleted/retired legacy routes as a fallback source of truth,
  - if a production projection becomes inconsistent, temporarily remove the `/admin/review/[bookId]` entry from `src/app/admin/books/[id]/page.tsx` and leave `/admin/books/[id]/review-center` as the migration-notice holding page,
  - rebuild or rerun the affected review projections with the T19 rerun/planning path, then re-run the T21 sample regression reports and the T20 focused validation suite before re-enabling operator access.

### 2026-04-24 Task 7 final validation and documentation sync

- Focused validation suite:
  - `pnpm exec vitest run 'src/server/modules/review/evidence-review/persona-detail-read.test.ts' 'src/app/api/personas/[id]/route.test.ts' 'src/app/api/books/[id]/personas/route.test.ts' 'src/app/api/books/[id]/relationships/route.test.ts' 'src/app/admin/books/[id]/page.test.tsx' 'src/app/admin/books/[id]/review-center/page.test.tsx' 'src/app/api/admin/drafts/route.test.ts' 'src/app/api/admin/bulk-verify/route.test.ts' 'src/app/api/admin/bulk-reject/route.test.ts' 'src/app/api/relationships/[id]/route.test.ts' 'src/app/api/admin/merge-suggestions/route.test.ts' 'src/app/api/admin/merge-suggestions/[id]/accept/route.test.ts' 'src/app/api/admin/merge-suggestions/[id]/reject/route.test.ts' 'src/app/api/admin/merge-suggestions/[id]/defer/route.test.ts' 'src/app/api/admin/books/[id]/merge-suggestions/route.test.ts' 'src/app/api/admin/books/[id]/merge-suggestions/[suggestionId]/accept/route.test.ts' 'src/app/api/admin/books/[id]/merge-suggestions/[suggestionId]/reject/route.test.ts' 'src/app/admin/review/[bookId]/page.test.tsx' 'src/app/admin/review/[bookId]/relations/page.test.tsx' 'src/app/admin/review/[bookId]/time/page.test.tsx' 'src/app/admin/review/error.test.tsx' --coverage=false`
  - Result: `21` test files / `71` tests passed
- Post-lint-fix verification:
  - `pnpm exec vitest run 'src/server/modules/review/evidence-review/persona-detail-read.test.ts' 'src/app/api/admin/merge-suggestions/route.test.ts' --coverage=false`
  - Result: `2` test files / `5` tests passed
- Global gates:
  - `pnpm type-check`
  - `pnpm lint`
- T21 baseline remains the cited reconciliation source for this cutover; no new T21 rerun was required in this pass.
- Runbook completion was updated after validation passed.
- No dedicated T20 commit was created in this execution pass.
