# T15 Persona Time Matrix UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on `dev_2`; do not create a new branch and do not start T19/T20/T21/T22.

**Goal:** Build `/admin/review/[bookId]/time` as a claim-first `persona x time` review surface that preserves imprecise time expressions, supports reviewer-friendly time normalization edits, and reuses the shared T16 claim detail panel end-to-end.

**Architecture:** T15 is a review-surface task with one new read-model route, not a new storage design. The first screen reads T11 `persona_time_facts` plus linked `time_claim`/`chapter` metadata through a dedicated persona-time DTO, while all claim drill-down, claim detail, and reviewer edits continue to reuse the T12 claim list/detail/mutation APIs and the T16 shared `ReviewClaimDetailPanel`. T15 also absorbs the two carry-over closure items from T16: the persona-time view must adopt the shared panel contract directly, and the relation editor must gain one real non-mocked shared-panel wiring integration test.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript strict, Prisma 7/PostgreSQL, Zod, existing T11/T12/T13/T16 review contracts, Vitest + Testing Library, existing shadcn-style UI primitives.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §5.3, §7.7, §8.1, §8.2, §13.2, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/15-persona-time-matrix-ui.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Projection/read contracts from T11/T12/T16:
  - `src/server/modules/review/evidence-review/projections/types.ts`
  - `src/server/modules/review/evidence-review/projections/persona-time.ts`
  - `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - `src/server/modules/review/evidence-review/review-query-service.ts`
  - `src/app/api/admin/review/claims/**`
- Existing review surfaces to extend rather than bypass:
  - `src/app/admin/review/[bookId]/page.tsx`
  - `src/app/admin/review/[bookId]/relations/page.tsx`
  - `src/components/review/shared/review-mode-nav.tsx`
  - `src/components/review/persona-chapter-matrix/**`
  - `src/components/review/relation-editor/**`
  - `src/components/review/evidence-panel/**`

## Execution Rules

- Follow strict TDD for every task: test first, confirm RED, implement the minimum code, confirm GREEN, then refactor while still green.
- T15 must stay claim-first. The matrix screen is a projection-backed summary, but drill-down, detail, edit, defer, reject, relink, and manual review state changes must continue to use T12 claim APIs.
- Do not add a new persistence model, Prisma enum, or migration for time review. T15 should be satisfied by existing projection tables plus existing claim tables.
- Preserve both raw and normalized time expressions. The UI may group by normalized slices, but it must still surface original `rawTimeText` values and never force uncertain labels into exact years.
- Reuse T16 `ReviewClaimDetailPanel` directly inside the time-cell drill-down. Do not fork a second evidence/audit panel just for the time view.
- T15 owns two carry-over closure items from T16:
  - persona-time drill-down must adopt the shared panel contract directly
  - add one real `RelationClaimSheet -> ReviewClaimDetailPanel` wiring integration test while keeping the lighter mock-based suite
- Keep `relationTypeKey` open-string everywhere. T15 must not introduce relation enums while wiring time-linked event/relation edits.
- Prefer a dedicated browser service file `src/lib/services/review-time-matrix.ts` instead of overloading `review-matrix.ts` with a third page-specific fetch contract.
- Keep the time axis reviewer-facing. Group by the six supported time types, sort stably, and provide jump/filter controls suitable for long works like `三国演义`.
- Cross-page navigation between `人物 x 章节` and `人物 x 时间` must use stable URL query state rather than hidden in-memory state so reviewers can refresh/share deep links.
- Perform one T15 commit only after all T15 validation passes and the task doc/runbook are updated.

## File Structure

- Modify `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - Add persona-time matrix query schema and exported request type.
- Modify `src/server/modules/review/evidence-review/review-api-schemas.test.ts`
  - Cover persona-time query parsing and invalid time-type input.
- Modify `src/server/modules/review/evidence-review/review-query-service.ts`
  - Add persona-time DTO types and `getPersonaTimeMatrix`.
- Modify `src/server/modules/review/evidence-review/review-query-service.test.ts`
  - Cover time-slice grouping, type grouping, sorting, chapter backlink metadata, persona filtering, and empty-state behavior.
- Create `src/app/api/admin/review/persona-time-matrix/route.ts`
  - Read-only route for persona-time matrix refresh.
- Create `src/app/api/admin/review/persona-time-matrix/route.test.ts`
  - Route validation/auth/service delegation tests.
- Create `src/lib/services/review-time-matrix.ts`
  - Browser-safe client DTOs and fetch wrappers for the time review page, time-cell claim list, and shared detail/mutation reuse.
- Create `src/lib/services/review-time-matrix.test.ts`
  - Query-string and wrapper behavior tests.
- Modify `src/components/review/shared/review-mode-nav.tsx`
  - Add the third review mode.
- Modify `src/components/review/shared/review-mode-nav.test.tsx`
  - Lock the third mode and current-page highlighting behavior.
- Create `src/components/review/persona-time-matrix/types.ts`
  - UI-local selection, filter, and axis-group types.
- Create `src/components/review/persona-time-matrix/time-axis.ts`
  - Pure helpers for time-group collapse, slice sorting, and deep-link selection resolution.
- Create `src/components/review/persona-time-matrix/time-axis.test.ts`
- Create `src/components/review/persona-time-matrix/persona-time-review-page.tsx`
- Create `src/components/review/persona-time-matrix/persona-time-review-page.test.tsx`
- Create `src/components/review/persona-time-matrix/time-toolbar.tsx`
- Create `src/components/review/persona-time-matrix/time-toolbar.test.tsx`
- Create `src/components/review/persona-time-matrix/time-matrix-grid.tsx`
- Create `src/components/review/persona-time-matrix/time-matrix-cell.tsx`
- Create `src/components/review/persona-time-matrix/time-cell-drilldown-sheet.tsx`
- Create `src/components/review/persona-time-matrix/time-cell-drilldown-sheet.test.tsx`
- Create `src/components/review/persona-time-matrix/time-cell-claim-list.tsx`
- Create `src/components/review/persona-time-matrix/time-cell-claim-list.test.tsx`
- Create `src/components/review/persona-time-matrix/time-claim-action-panel.tsx`
- Create `src/components/review/persona-time-matrix/time-claim-action-panel.test.tsx`
- Create `src/app/admin/review/[bookId]/time/page.tsx`
  - Create the new server page for initial load.
- Create `src/app/admin/review/[bookId]/time/page.test.tsx`
- Modify `src/app/admin/review/[bookId]/page.tsx`
  - Accept time-view backlink query state and pass initial matrix selection into the existing T13 page.
- Modify `src/app/admin/review/[bookId]/page.test.tsx`
- Modify `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx`
  - Support URL-seeded selection and backlink handoff from the time view.
- Modify `src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx`
- Modify `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.tsx`
  - Add stable time-view deep links for selected claims/cells.
- Modify `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx`
- Create `src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx`
  - Real shared-panel wiring test without mocking `../evidence-panel`.
- Modify `src/components/review/index.ts`
  - Export the persona-time review entry if the barrel remains the shared path.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/15-persona-time-matrix-ui.md`
  - Reflect the T16 carry-over closure items in the task scope.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Move the prior T16 carry-over wording into a T15-owned closure note.

## DTO Decisions

The new read DTO should stay reviewer-oriented and keep the time axis explicit:

```ts
export type ReviewTimeAxisType =
  | "CHAPTER_ORDER"
  | "RELATIVE_PHASE"
  | "NAMED_EVENT"
  | "HISTORICAL_YEAR"
  | "BATTLE_PHASE"
  | "UNCERTAIN";

export interface PersonaTimeMatrixDto {
  bookId: string;
  personas: PersonaTimeMatrixPersonaDto[];
  timeGroups: PersonaTimeAxisGroupDto[];
  cells: PersonaTimeMatrixCellDto[];
  generatedAt: string;
}

export interface PersonaTimeMatrixPersonaDto {
  personaId: string;
  displayName: string;
  aliases: string[];
  primaryPersonaCandidateId: string | null;
  personaCandidateIds: string[];
  firstTimeSortKey: number | null;
  totalEventCount: number;
  totalRelationCount: number;
  totalTimeClaimCount: number;
}

export interface PersonaTimeAxisGroupDto {
  timeType: ReviewTimeAxisType;
  label: string;
  defaultCollapsed: boolean;
  slices: PersonaTimeSliceDto[];
}

export interface PersonaTimeSliceDto {
  timeKey: string;
  timeType: ReviewTimeAxisType;
  normalizedLabel: string;
  rawLabels: string[];
  timeSortKey: number | null;
  chapterRangeStart: number | null;
  chapterRangeEnd: number | null;
  linkedChapters: Array<{
    chapterId: string;
    chapterNo: number;
    label: string;
  }>;
  sourceTimeClaimIds: string[];
}

export interface PersonaTimeMatrixCellDto {
  bookId: string;
  personaId: string;
  timeKey: string;
  normalizedLabel: string;
  eventCount: number;
  relationCount: number;
  timeClaimCount: number;
  sourceTimeClaimIds: string[];
  latestUpdatedAt: string | null;
}
```

Modeling rules:

- `timeGroups` must always include the six supported axis types in a stable order, even when some groups are empty.
- `timeKey` must be deterministic and browser-safe. Build it from `timeType + normalizedLabel + timeSortKey + chapterRangeStart + chapterRangeEnd`, not from ephemeral client indexes.
- `rawLabels` must be deduplicated, sorted, and exposed so reviewers can see imprecise expressions before editing normalization.
- `linkedChapters` should be derived from the slice range and source time-claim chapters so the time view can jump back into the chapter matrix without extra fetches.
- `cells` stay lightweight. They summarize counts only; full claim rows still load lazily through the claim list endpoint.
- Persona ordering should follow first time appearance, then display name, mirroring the T13 reviewer experience.
- `defaultCollapsed` should be `true` for every group except the first non-empty group or the group containing the URL-selected slice.

## Route And Page Decisions

- Add `GET /api/admin/review/persona-time-matrix`.
- Required query:
  - `bookId`
- Optional query:
  - `personaId`
  - `timeTypes`
  - `limitPersonas`
  - `offsetPersonas`
- Keep time-cell claim drill-down on the existing T12 claim list route:
  - `GET /api/admin/review/claims?bookId=...&personaId=...&timeLabel=...&claimKinds=TIME,EVENT,RELATION,CONFLICT_FLAG`
- Keep claim detail on the existing T12 detail route:
  - `GET /api/admin/review/claims/[claimKind]/[claimId]?bookId=...`
- Keep all reviewer actions on the existing T12 mutation routes:
  - `POST /api/admin/review/claims/[claimKind]/[claimId]/actions`
  - `POST /api/admin/review/claims`
- Add page route:
  - `/admin/review/[bookId]/time`
- Page query state decisions:
  - time page accepts `personaId` and `timeKey` to preselect a time cell
  - chapter page accepts `personaId` and `chapterId` to preselect a chapter cell
  - chapter drill-down may emit a time-page deep link when the selected claim exposes `timeLabel`
  - time drill-down must emit chapter-page deep links from linked chapter chips

## Time Edit Rules

- `TIME` claims get a dedicated edit form in `time-claim-action-panel.tsx`.
- Editable fields:
  - `rawTimeText`
  - `normalizedLabel`
  - `timeType`
  - `relativeOrderWeight`
  - `chapterRangeStart`
  - `chapterRangeEnd`
  - `evidenceSpanIds`
- `EVENT` and `RELATION` rows opened from a time cell continue to use existing T12 edit flows for `timeHintId` reassignment and other supported fields.
- Do not create a second mutation endpoint or a projection-table write path for time edits.

## Carry-Over Closure From T16

T15 must close these items explicitly:

1. Persona-time drill-down uses the real shared `ReviewClaimDetailPanel` contract, not a temporary adapter.
2. `relation-claim-sheet.test.tsx` may keep its lightweight shared-panel mock, but T15 adds one real integration test proving `RelationClaimSheet` renders the actual shared panel contract successfully.

---

### Task 1: Persona-Time Query Schema And Query Service

**Files:**
- Modify: `src/server/modules/review/evidence-review/review-api-schemas.ts`
- Modify: `src/server/modules/review/evidence-review/review-api-schemas.test.ts`
- Modify: `src/server/modules/review/evidence-review/review-query-service.ts`
- Modify: `src/server/modules/review/evidence-review/review-query-service.test.ts`

- [x] **Step 1: Write failing schema tests**

Add tests proving that the persona-time query schema:

- requires `bookId`
- accepts `personaId`, `timeTypes`, `limitPersonas`, and `offsetPersonas`
- rejects invalid UUIDs
- rejects unsupported time types
- coerces numeric pagination fields

Run RED:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts --coverage=false
```

- [x] **Step 2: Implement the minimum schema**

Add:

- `reviewPersonaTimeMatrixQuerySchema`
- exported `ReviewPersonaTimeMatrixQueryRequest`

Run GREEN:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts --coverage=false
```

- [x] **Step 3: Write failing query service tests**

Add tests for `createReviewQueryService().getPersonaTimeMatrix(...)` covering:

- all six time groups are returned in stable order
- slices merge `persona_time_facts` with `timeClaim` metadata and preserve `rawTimeText`
- slices are sorted by `timeSortKey`, then chapter range, then label
- `linkedChapters` are derived correctly from range/source chapter data
- personas are sorted by first time appearance then display name
- filtering by `personaId` and `timeTypes`
- empty-state output when the book has chapters/personas but no time facts

Run RED:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

- [x] **Step 4: Implement `getPersonaTimeMatrix`**

Implementation notes:

- read `personaTimeFact`, `timeClaim`, `chapter`, and `persona`
- reuse the accepted persona-candidate mapping approach from T13 so manual edit flows still have stable persona context
- build deterministic `timeKey` values on the server
- compute `rawLabels`, `linkedChapters`, `timeClaimCount`, and `latestUpdatedAt` server-side
- do not fetch claim detail rows here

Run GREEN:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

- [x] **Step 5: Refactor while green**

Extract small pure helpers if needed:

- `buildPersonaTimeAxisGroups`
- `buildTimeKey`
- `sortPersonaTimeSlices`
- `resolveLinkedChapters`

Re-run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

---

### Task 2: Persona-Time Route And Browser Service

**Files:**
- Create: `src/app/api/admin/review/persona-time-matrix/route.ts`
- Create: `src/app/api/admin/review/persona-time-matrix/route.test.ts`
- Create: `src/lib/services/review-time-matrix.ts`
- Create: `src/lib/services/review-time-matrix.test.ts`

- [x] **Step 1: Write failing route tests**

Add route tests covering:

- admin auth success path
- bad request on invalid query
- delegation to `getPersonaTimeMatrix`
- response shape and success code

Run RED:

```bash
pnpm exec vitest run src/app/api/admin/review/persona-time-matrix/route.test.ts --coverage=false
```

- [x] **Step 2: Implement the read-only route**

Add `GET /api/admin/review/persona-time-matrix` and parse repeated `timeTypes` params the same way T14 parses repeated relation params.

Run GREEN:

```bash
pnpm exec vitest run src/app/api/admin/review/persona-time-matrix/route.test.ts --coverage=false
```

- [x] **Step 3: Write failing browser-service tests**

Add tests proving `review-time-matrix.ts`:

- builds the expected query string for `bookId`, `personaId`, `timeTypes`, pagination
- fetches the persona-time matrix DTO from the new route
- fetches time-cell claim rows from the existing T12 list route with `TIME,EVENT,RELATION,CONFLICT_FLAG`
- reuses T12 detail and mutation wrappers instead of redefining them

Run RED:

```bash
pnpm exec vitest run src/lib/services/review-time-matrix.test.ts --coverage=false
```

- [x] **Step 4: Implement the browser service**

Implementation notes:

- keep page-specific DTOs in `review-time-matrix.ts`
- reuse `clientFetch`
- re-export T12 detail/mutation wrappers from `review-matrix.ts`
- avoid introducing server-only imports

Run GREEN:

```bash
pnpm exec vitest run src/lib/services/review-time-matrix.test.ts --coverage=false
```

- [x] **Step 5: Re-run the route plus service tests together**

```bash
pnpm exec vitest run src/app/api/admin/review/persona-time-matrix/route.test.ts src/lib/services/review-time-matrix.test.ts --coverage=false
```

---

### Task 3: Review Mode Navigation And Time Server Page

**Files:**
- Modify: `src/components/review/shared/review-mode-nav.tsx`
- Modify: `src/components/review/shared/review-mode-nav.test.tsx`
- Create: `src/app/admin/review/[bookId]/time/page.tsx`
- Create: `src/app/admin/review/[bookId]/time/page.test.tsx`
- Modify: `src/components/review/index.ts`

- [x] **Step 1: Write failing navigation and page tests**

Add tests covering:

- `ReviewModeNav` renders `人物 x 时间`
- current-page highlighting works for `activeMode="time"`
- the new server page validates `bookId`, loads books plus initial persona-time DTO, and passes them to the page component

Run RED:

```bash
pnpm exec vitest run src/components/review/shared/review-mode-nav.test.tsx 'src/app/admin/review/[bookId]/time/page.test.tsx' --coverage=false
```

- [x] **Step 2: Implement the third review mode and server page**

Implementation notes:

- add `activeMode: "time"` support
- new page route is `/admin/review/[bookId]/time`
- keep the same left-side book switcher layout as T13/T14
- initial load should call `getPersonaTimeMatrix({ bookId })`

Run GREEN:

```bash
pnpm exec vitest run src/components/review/shared/review-mode-nav.test.tsx 'src/app/admin/review/[bookId]/time/page.test.tsx' --coverage=false
```

- [x] **Step 3: Refactor exports while green**

If the review barrel is still used, export the time review entry now and re-run the same tests.

---

### Task 4: Time Axis Helpers And Toolbar

**Files:**
- Create: `src/components/review/persona-time-matrix/types.ts`
- Create: `src/components/review/persona-time-matrix/time-axis.ts`
- Create: `src/components/review/persona-time-matrix/time-axis.test.ts`
- Create: `src/components/review/persona-time-matrix/time-toolbar.tsx`
- Create: `src/components/review/persona-time-matrix/time-toolbar.test.tsx`

- [x] **Step 1: Write failing pure-helper tests**

Cover:

- resolving the selected slice from URL query state
- expanding the selected group even when defaults are collapsed
- local label filtering without losing stable group order
- jump-to-next-slice behavior for long books

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-axis.test.ts --coverage=false
```

- [x] **Step 2: Implement the time-axis helpers**

Keep these helpers pure and browser-only:

- `resolveInitialTimeSelection`
- `buildExpandedTimeGroupState`
- `filterTimeGroupsByLabel`
- `findNextTimeSliceKey`

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-axis.test.ts --coverage=false
```

- [x] **Step 3: Write failing toolbar tests**

Cover:

- persona filter
- time-type multi-select or checkbox filter
- time-label search
- jump control
- reset behavior

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-toolbar.test.tsx --coverage=false
```

- [x] **Step 4: Implement the toolbar**

Keep the toolbar reviewer-facing and compact. It should support long-book navigation without introducing global app state.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-toolbar.test.tsx --coverage=false
```

---

### Task 5: Persona-Time Review Page And Matrix Grid

**Files:**
- Create: `src/components/review/persona-time-matrix/persona-time-review-page.tsx`
- Create: `src/components/review/persona-time-matrix/persona-time-review-page.test.tsx`
- Create: `src/components/review/persona-time-matrix/time-matrix-grid.tsx`
- Create: `src/components/review/persona-time-matrix/time-matrix-cell.tsx`

- [x] **Step 1: Write failing page tests**

Cover:

- rendering the initial server DTO
- local persona/time-type/label filters
- matrix refresh via `fetchPersonaTimeMatrix`
- selecting a time cell from the grid
- preserving the selected slice when filters still contain it
- empty and error states

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/persona-time-review-page.test.tsx --coverage=false
```

- [x] **Step 2: Implement the page shell and grid**

Implementation notes:

- keep the first screen summary-only
- group rows by time type with collapsed defaults
- show `eventCount`, `relationCount`, and `timeClaimCount` in each cell
- use stable `timeKey` selection state

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/persona-time-review-page.test.tsx --coverage=false
```

- [x] **Step 3: Refactor small view helpers while green**

If needed, extract display helpers from the page component rather than letting it own all row/cell formatting logic.

---

### Task 6: Time Cell Drill-Down And Shared Panel Integration

**Files:**
- Create: `src/components/review/persona-time-matrix/time-cell-drilldown-sheet.tsx`
- Create: `src/components/review/persona-time-matrix/time-cell-drilldown-sheet.test.tsx`
- Create: `src/components/review/persona-time-matrix/time-cell-claim-list.tsx`
- Create: `src/components/review/persona-time-matrix/time-cell-claim-list.test.tsx`

- [x] **Step 1: Write failing drill-down tests**

Cover:

- lazy loading of time-cell claims
- claim kinds include `TIME`, `EVENT`, `RELATION`, `CONFLICT_FLAG`
- lazy loading of claim detail
- rendering the real shared `ReviewClaimDetailPanel`
- displaying linked raw time labels and chapter backlinks
- retaining T16 evidence selection/highlight props

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-cell-claim-list.test.tsx src/components/review/persona-time-matrix/time-cell-drilldown-sheet.test.tsx --coverage=false
```

- [x] **Step 2: Implement the drill-down components**

Implementation notes:

- do not fork T16 panel logic
- keep claim detail loading race-safe like T13/T14
- group claim rows reviewer-first: time claims first, then events/relations, then conflict flags
- show both normalized label and raw labels in the sheet header

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-cell-claim-list.test.tsx src/components/review/persona-time-matrix/time-cell-drilldown-sheet.test.tsx --coverage=false
```

---

### Task 7: Time Normalization Edit Flow And Chapter Backlinks

**Files:**
- Create: `src/components/review/persona-time-matrix/time-claim-action-panel.tsx`
- Create: `src/components/review/persona-time-matrix/time-claim-action-panel.test.tsx`
- Modify: `src/app/admin/review/[bookId]/page.tsx`
- Modify: `src/app/admin/review/[bookId]/page.test.tsx`
- Modify: `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx`
- Modify: `src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx`
- Modify: `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.tsx`
- Modify: `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx`

- [x] **Step 1: Write failing time-edit tests**

Cover:

- editing a `TIME` claim through T12 `EDIT`
- preserving raw and normalized labels separately
- validating chapter range and order-weight inputs
- keeping event/relation edits on existing T12 flows

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-claim-action-panel.test.tsx --coverage=false
```

- [x] **Step 2: Implement the time-claim action panel**

Use the existing T12 mutation route. Do not add a page-specific write endpoint.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-time-matrix/time-claim-action-panel.test.tsx --coverage=false
```

- [x] **Step 3: Write failing chapter/time backlink tests**

Cover:

- chapter page can seed an initial matrix selection from `searchParams`
- time view can deep-link back to a specific chapter cell
- chapter drill-down can deep-link to the time page when a claim exposes `timeLabel`
- refresh/reload keeps the selection stable

Run RED:

```bash
pnpm exec vitest run 'src/app/admin/review/[bookId]/page.test.tsx' src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx --coverage=false
```

- [x] **Step 4: Implement URL-backed cross-navigation**

Implementation notes:

- use search params, not hidden singleton state
- keep query keys stable and page-local (`personaId`, `chapterId`, `timeKey`)
- do not break existing matrix behavior when query params are absent

Run GREEN:

```bash
pnpm exec vitest run 'src/app/admin/review/[bookId]/page.test.tsx' src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx --coverage=false
```

---

### Task 8: Relation Sheet Real Shared-Panel Wiring Test

**Files:**
- Create: `src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx`
- Modify: `src/components/review/relation-editor/relation-claim-sheet.test.tsx` (only if fixture extraction is needed)

- [x] **Step 1: Write the failing real-wiring test**

Add one integration test that:

- does not mock `../evidence-panel`
- lazy-loads relation claim detail
- proves the real shared `ReviewClaimDetailPanel` renders evidence, AI basis, and audit history content for relation claims

Run RED:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx --coverage=false
```

- [x] **Step 2: Implement the minimum support**

Only extract shared fixtures/helpers if needed. Keep the existing mocked suite fast.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx --coverage=false
```

---

### Task 9: Full T15 Validation And Docs Closure

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/15-persona-time-matrix-ui.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [x] **Step 1: Run targeted T15 validation**

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-time-matrix/route.test.ts src/lib/services/review-time-matrix.test.ts src/components/review/shared/review-mode-nav.test.tsx 'src/app/admin/review/[bookId]/time/page.test.tsx' src/components/review/persona-time-matrix/time-axis.test.ts src/components/review/persona-time-matrix/time-toolbar.test.tsx src/components/review/persona-time-matrix/persona-time-review-page.test.tsx src/components/review/persona-time-matrix/time-cell-claim-list.test.tsx src/components/review/persona-time-matrix/time-cell-drilldown-sheet.test.tsx src/components/review/persona-time-matrix/time-claim-action-panel.test.tsx src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx 'src/app/admin/review/[bookId]/page.test.tsx' src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx --coverage=false
pnpm type-check
pnpm lint
```

- [x] **Step 2: Update task doc and runbook**

Only after validation passes:

- mark T15 checkpoints complete
- append the T15 execution record
- mark T15 complete in the runbook
- record that the prior T16 carry-over closure is now resolved inside T15

- [x] **Step 3: Final sanity sweep**

Before handing back:

- confirm there is no temporary time-specific evidence panel
- confirm chapter/time deep links are URL-backed
- confirm relation mock-only coverage gap is closed by the new integration test

---

## Self-Review Coverage

- Time axis types: covered by Task 1 DTO/query work and Task 4 axis helpers.
- Hierarchical time-axis display with collapsed defaults: covered by Task 4 and Task 5.
- Event/relation/conflict/time display inside selected cells: covered by Task 6.
- Time normalization and time-slice association editing through T12: covered by Task 7.
- Stable chapter/time two-way navigation: covered by Task 7.
- Shared evidence/audit panel reuse: covered by Task 6.
- T16 carry-over real relation-sheet wiring test: covered by Task 8.
- Task/runbook closure: covered by Task 9.

Plan complete and saved to `docs/superpowers/plans/2026-04-22-t15-persona-time-matrix-ui-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
