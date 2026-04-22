# T13 Persona Chapter Matrix UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on `dev_2`; do not create a new branch and do not start T14/T15/T16.

**Goal:** Replace the legacy single-book review panel with the claim-first `persona x chapter` review matrix. Reviewers must be able to inspect one persona/chapter cell, see projection summaries, open related claims, view evidence and AI basis, then create/edit/reject-delete/defer facts through the T12 review APIs.

**Architecture:** T13 is a review-surface task, not a new truth-source task. The first screen reads T11 `persona_chapter_facts` projection rows through a dedicated matrix DTO, while all cell drill-down and mutations go through T12 claim-first APIs. The UI must not read legacy review drafts, must not expose raw claim table complexity, and must keep T16 evidence/audit display behind a temporary adapter that can be replaced by the shared T16 panel.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript strict, Prisma 7/PostgreSQL, Zod, Vitest + Testing Library, existing shadcn-style UI primitives, native CSS/DOM windowing instead of adding a virtualization dependency.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.3, §7.7, §8.1, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Review API contracts from T12:
  - `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - `src/server/modules/review/evidence-review/review-query-service.ts`
  - `src/server/modules/review/evidence-review/review-mutation-service.ts`
  - `src/app/api/admin/review/claims/**`
- Projection contracts from T11:
  - `src/server/modules/review/evidence-review/projections/types.ts`
  - Prisma model `PersonaChapterFact`
- Relation type governance from T18:
  - `src/server/modules/knowledge-v2/relation-types/**`
- Existing admin review entry:
  - `src/app/admin/review/[bookId]/page.tsx`
  - `src/components/review/review-panel.tsx`

## Execution Rules

- Follow strict TDD for every task: write the test first, run RED, implement the minimum code, run GREEN, then refactor while green.
- T13 must replace the main `/admin/review/[bookId]` experience with claim-first matrix UI. Do not extend legacy `ReviewPanel` or `/api/admin/drafts` as the main path.
- Do not change claim storage semantics. Manual corrections must keep using T12 mutation APIs.
- Do not mutate projection rows directly from UI code. Matrix summaries refresh after T12 mutations trigger scoped Stage D rebuilds.
- Do not load full-book claim details on first screen. First screen loads matrix summaries only; claim details load only after a cell/claim is selected.
- Do not implement the full relation editor from T14 or persona-time matrix from T15. T13 may include a lightweight relation claim form only for the selected cell.
- Do not promote the temporary evidence/audit adapter into a shared final component. Name it as temporary and leave a T16 replacement note.
- Keep `relationTypeKey` open-string in DTOs and forms. Use T18 presets/options for suggestion, but allow custom input.
- Keep UI reviewer-facing. Components should talk in terms of “人物、章节、事迹、关系、冲突、证据、状态”, not raw table names.
- Perform one T13 commit after final validation and task/runbook completion updates.

## File Structure

- Modify `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - Add matrix query schema and exported types.
- Modify `src/server/modules/review/evidence-review/review-api-schemas.test.ts`
  - Cover matrix query parsing.
- Modify `src/server/modules/review/evidence-review/review-query-service.ts`
  - Add `getPersonaChapterMatrix`.
- Modify `src/server/modules/review/evidence-review/review-query-service.test.ts`
  - Cover matrix row aggregation, filtering, sorting, persona candidate hints, and empty-state behavior.
- Create `src/app/api/admin/review/persona-chapter-matrix/route.ts`
  - Client refetch endpoint for matrix summaries.
- Create `src/app/api/admin/review/persona-chapter-matrix/route.test.ts`
  - Route validation/auth/service delegation tests.
- Create `src/lib/services/review-matrix.ts`
  - Client DTOs and fetch/mutation wrappers for matrix, claim list/detail, claim actions, and manual claim create.
- Create `src/lib/services/review-matrix.test.ts`
  - Query-string and action wrapper tests.
- Modify `src/app/admin/review/[bookId]/page.tsx`
  - Server page now loads book, book switcher data, and initial matrix DTO, then renders the new matrix page component.
- Create or modify `src/app/admin/review/[bookId]/page.test.tsx`
  - Verify the page no longer loads legacy drafts and passes initial matrix data.
- Create `src/components/review/shared/review-state-badge.tsx`
- Create `src/components/review/shared/review-state-badge.test.tsx`
- Create `src/components/review/shared/temporary-evidence-audit-panel.tsx`
- Create `src/components/review/shared/temporary-evidence-audit-panel.test.tsx`
- Create `src/components/review/persona-chapter-matrix/types.ts`
- Create `src/components/review/persona-chapter-matrix/matrix-windowing.ts`
- Create `src/components/review/persona-chapter-matrix/matrix-windowing.test.ts`
- Create `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx`
- Create `src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx`
- Create `src/components/review/persona-chapter-matrix/matrix-toolbar.tsx`
- Create `src/components/review/persona-chapter-matrix/matrix-grid.tsx`
- Create `src/components/review/persona-chapter-matrix/matrix-cell.tsx`
- Create `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.tsx`
- Create `src/components/review/persona-chapter-matrix/cell-claim-list.tsx`
- Create `src/components/review/persona-chapter-matrix/claim-action-panel.tsx`
- Create `src/components/review/persona-chapter-matrix/manual-claim-form.tsx`
- Create component tests under the same directory for toolbar, grid, drill-down, action panel, and manual form as needed.
- Modify `src/components/review/index.ts`
  - Export the new matrix page/component entry if the project uses the barrel for review components.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`
  - Mark checkpoints complete and append execution record after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Mark T13 complete only after validation passes.

## DTO Decisions

The matrix endpoint should return a reviewer-oriented DTO:

```ts
export interface PersonaChapterMatrixDto {
  bookId: string;
  personas: PersonaChapterMatrixPersonaDto[];
  chapters: PersonaChapterMatrixChapterDto[];
  cells: PersonaChapterMatrixCellDto[];
  relationTypeOptions: PersonaChapterRelationTypeOptionDto[];
  generatedAt: string;
}

export interface PersonaChapterMatrixPersonaDto {
  personaId: string;
  displayName: string;
  aliases: string[];
  primaryPersonaCandidateId: string | null;
  personaCandidateIds: string[];
  firstChapterNo: number | null;
  totalEventCount: number;
  totalRelationCount: number;
  totalConflictCount: number;
}

export interface PersonaChapterMatrixChapterDto {
  chapterId: string;
  chapterNo: number;
  title: string;
  label: string;
}

export interface PersonaChapterMatrixCellDto {
  bookId: string;
  personaId: string;
  chapterId: string;
  chapterNo: number;
  eventCount: number;
  relationCount: number;
  conflictCount: number;
  reviewStateSummary: Record<string, Record<string, number>>;
  latestUpdatedAt: string;
}
```

Modeling rules:

- `chapters` should include all non-abstract chapters for the book, sorted by `no`, so the vertical axis is stable even when a chapter has no facts.
- `personas` should be derived from `persona_chapter_facts.personaId` plus `Persona` display data, sorted by first appearance and name.
- `primaryPersonaCandidateId` and `personaCandidateIds` should be derived from accepted identity-resolution claims. This lets manual event/relation forms create claims against existing claim contracts without inventing persona-candidate mappings in the browser.
- If a persona lacks a candidate id, editing existing claims still works, but creating a new event/relation for that persona must be disabled with a clear message.
- `relationTypeOptions` should be loaded in review mode from T18 relation catalog. Presets are suggestions; custom relation keys remain valid.
- Matrix query filters should reduce returned personas/cells, not mutate the underlying projection semantics.
- Date values crossing the route boundary should be serialized as ISO strings.

## Route Decisions

- Add `GET /api/admin/review/persona-chapter-matrix`.
- Required query: `bookId`.
- Optional query:
  - `personaId`
  - `chapterId`
  - `reviewStates`
  - `conflictState=ACTIVE|NONE`
  - `limitPersonas`
  - `offsetPersonas`
- Keep claim drill-down on the existing T12 endpoint:
  - `GET /api/admin/review/claims?bookId=...&personaId=...&chapterId=...&claimKinds=EVENT,RELATION,CONFLICT_FLAG`
- Keep claim detail on the existing T12 endpoint:
  - `GET /api/admin/review/claims/[claimKind]/[claimId]?bookId=...`
- Keep actions on the existing T12 endpoint:
  - `POST /api/admin/review/claims/[claimKind]/[claimId]/actions`
- Keep manual create on the existing T12 endpoint:
  - `POST /api/admin/review/claims`

---

### Task 1: Matrix API Schema And Query Service

**Files:**
- Modify: `src/server/modules/review/evidence-review/review-api-schemas.ts`
- Modify: `src/server/modules/review/evidence-review/review-api-schemas.test.ts`
- Modify: `src/server/modules/review/evidence-review/review-query-service.ts`
- Modify: `src/server/modules/review/evidence-review/review-query-service.test.ts`

- [x] **Step 1: Write failing schema tests**

Add tests proving that the matrix query schema:

- requires `bookId`
- accepts `personaId`, `chapterId`, `reviewStates`, `conflictState`, `limitPersonas`, and `offsetPersonas`
- rejects invalid UUIDs and invalid `conflictState`
- coerces numeric pagination fields

Run RED:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts --coverage=false
```

- [x] **Step 2: Implement the minimum schema**

Add `reviewPersonaChapterMatrixQuerySchema` and exported `ReviewPersonaChapterMatrixQueryRequest`.

Run GREEN:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts --coverage=false
```

- [x] **Step 3: Write failing query service tests**

Add tests for `createReviewQueryService().getPersonaChapterMatrix(...)`:

- returns all chapters for a book even when some chapters have no cells
- returns only projection-backed personas and sorts them by first chapter number then display name
- serializes cell counts from `personaChapterFact`
- derives `primaryPersonaCandidateId` from accepted identity-resolution claims
- filters by `personaId`
- filters by `chapterId`
- filters by `conflictState=ACTIVE`
- applies persona pagination without dropping chapter metadata
- returns relation type options from the T18 catalog dependency or a deterministic empty list if unavailable in the test double

Run RED:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

- [x] **Step 4: Implement `getPersonaChapterMatrix`**

Implementation notes:

- Extend the query service dependencies carefully. Default production path can use `prisma`, but tests should still be able to inject a Prisma-like client.
- Query `chapter.findMany` by `bookId`, `isAbstract: false`, sorted by `no`.
- Query `personaChapterFact.findMany` by `bookId` and optional filters.
- Query `persona.findMany` for persona ids present in cells.
- Query accepted identity-resolution claims to map resolved persona ids back to persona candidate ids.
- Query or build relation type options using T18 relation catalog in review mode. If this dependency requires book type data, load the book's type key from the existing book model when available.
- Do not load claim detail rows here.

Run GREEN:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

- [x] **Step 5: Refactor while green**

Extract small pure helpers if needed:

- `sortMatrixPersonas`
- `summarizePersonaCells`
- `normalizeReviewStateSummary`
- `toMatrixChapterLabel`

Re-run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

---

### Task 2: Matrix Route Handler

**Files:**
- Create: `src/app/api/admin/review/persona-chapter-matrix/route.ts`
- Create: `src/app/api/admin/review/persona-chapter-matrix/route.test.ts`

- [x] **Step 1: Write failing route tests**

Cover:

- unauthenticated/admin guard follows existing T12 route conventions
- invalid query returns `400`
- valid query delegates to `createReviewQueryService().getPersonaChapterMatrix`
- response code/message are stable and success payload contains `data`
- comma-separated arrays and repeated params both work for `reviewStates`

Run RED:

```bash
pnpm exec vitest run src/app/api/admin/review/persona-chapter-matrix/route.test.ts --coverage=false
```

- [x] **Step 2: Implement route parser and handler**

Follow the T12 route style from `src/app/api/admin/review/claims/route.ts`:

- `randomUUID` request id
- `headers()` auth context
- `requireAdmin`
- schema parse
- `okJson`/`failJson`
- local `badRequestJson` helper reuse

Run GREEN:

```bash
pnpm exec vitest run src/app/api/admin/review/persona-chapter-matrix/route.test.ts --coverage=false
```

- [x] **Step 3: Refactor while green**

If query-array parsing duplicates T12 logic, either keep a tiny local helper or extract only if the extraction stays small and does not disturb T12 behavior.

Re-run:

```bash
pnpm exec vitest run src/app/api/admin/review/persona-chapter-matrix/route.test.ts --coverage=false
```

---

### Task 3: Client Service Layer

**Files:**
- Create: `src/lib/services/review-matrix.ts`
- Create: `src/lib/services/review-matrix.test.ts`

- [x] **Step 1: Write failing client service tests**

Mock `fetch` and cover:

- `fetchPersonaChapterMatrix` builds `bookId`, filters, and repeated array params correctly
- `fetchCellClaims` calls T12 claim list with `EVENT`, `RELATION`, and `CONFLICT_FLAG`
- `fetchReviewClaimDetail` calls the T12 detail URL
- `submitReviewClaimAction` posts `ACCEPT`, `REJECT`, `DEFER`, `EDIT`, and `RELINK_EVIDENCE` payloads to the T12 action URL
- `createManualReviewClaim` posts to `/api/admin/review/claims`
- failed API responses surface `clientFetch`/`clientMutate` errors

Run RED:

```bash
pnpm exec vitest run src/lib/services/review-matrix.test.ts --coverage=false
```

- [x] **Step 2: Implement typed client wrappers**

Implementation notes:

- Export DTO types used by components, or re-export server DTO types only if they are browser-safe.
- Keep this file browser-safe. Do not import Prisma, server modules, or Node-only code.
- Use `clientFetch` for reads.
- Use `clientMutate` only when response data is not needed; if an action needs returned data, add a small `clientPost` helper locally or use `fetch` with `readClientApiResponse`.

Run GREEN:

```bash
pnpm exec vitest run src/lib/services/review-matrix.test.ts --coverage=false
```

- [x] **Step 3: Refactor while green**

Keep query-string construction in one helper such as `appendRepeatedParams`.

Re-run:

```bash
pnpm exec vitest run src/lib/services/review-matrix.test.ts --coverage=false
```

---

### Task 4: Server Page Cutover To Matrix Entry

**Files:**
- Modify: `src/app/admin/review/[bookId]/page.tsx`
- Create or modify: `src/app/admin/review/[bookId]/page.test.tsx`
- Modify: `src/components/review/index.ts` if needed

- [x] **Step 1: Write failing page tests**

Cover:

- valid `bookId` loads book, book list, and initial persona-chapter matrix data
- invalid `bookId` calls `notFound`
- page does not call `listAdminDrafts` or `listMergeSuggestions`
- page renders the new matrix component with `bookId`, `bookTitle`, `allBooks`, and `initialMatrix`

Run RED:

```bash
pnpm exec vitest run 'src/app/admin/review/[bookId]/page.test.tsx' --coverage=false
```

- [x] **Step 2: Implement page cutover**

Implementation notes:

- Keep the existing book switcher behavior if useful, but the main panel must be the new `PersonaChapterReviewPage`.
- Use `createReviewQueryService().getPersonaChapterMatrix({ bookId })` for initial data.
- Remove legacy draft and merge-suggestion imports from this page.
- Preserve `generateMetadata` behavior.

Run GREEN:

```bash
pnpm exec vitest run 'src/app/admin/review/[bookId]/page.test.tsx' --coverage=false
```

- [x] **Step 3: Refactor while green**

Move only layout pieces that are needed by the new page. Avoid rewriting the whole admin layout.

Re-run:

```bash
pnpm exec vitest run 'src/app/admin/review/[bookId]/page.test.tsx' --coverage=false
```

---

### Task 5: Shared Review UI Primitives And Temporary Evidence/Audit Adapter

**Files:**
- Create: `src/components/review/shared/review-state-badge.tsx`
- Create: `src/components/review/shared/review-state-badge.test.tsx`
- Create: `src/components/review/shared/temporary-evidence-audit-panel.tsx`
- Create: `src/components/review/shared/temporary-evidence-audit-panel.test.tsx`

- [x] **Step 1: Write failing shared primitive tests**

Cover:

- each review state renders a stable Chinese label
- conflict state renders a visible warning style
- evidence panel shows evidence spans when claim detail contains evidence
- evidence panel shows AI basis / basis claim summary when available
- audit history renders newest-first or a clearly labeled chronological order
- empty evidence/audit states are explicit

Run RED:

```bash
pnpm exec vitest run src/components/review/shared --coverage=false
```

- [x] **Step 2: Implement shared primitives**

Implementation notes:

- Keep `temporary-evidence-audit-panel.tsx` named temporary.
- Add a short comment stating it must be replaced or extracted in T16.
- Do not overbuild. This adapter only displays the T12 detail DTO.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/shared --coverage=false
```

- [x] **Step 3: Refactor while green**

Keep labels/constants in the shared component file unless they are reused by multiple T13 components.

Re-run:

```bash
pnpm exec vitest run src/components/review/shared --coverage=false
```

---

### Task 6: Matrix Windowing And Grid Rendering

**Files:**
- Create: `src/components/review/persona-chapter-matrix/types.ts`
- Create: `src/components/review/persona-chapter-matrix/matrix-windowing.ts`
- Create: `src/components/review/persona-chapter-matrix/matrix-windowing.test.ts`
- Create: `src/components/review/persona-chapter-matrix/matrix-cell.tsx`
- Create: `src/components/review/persona-chapter-matrix/matrix-grid.tsx`
- Create tests for grid/cell rendering as needed.

- [x] **Step 1: Write failing windowing tests**

Cover:

- small matrices render all rows/columns
- large matrices calculate row and column windows from scroll offset
- overscan includes nearby rows/columns
- selected cell remains addressable even when outside current window
- helper returns stable `rowStart`, `rowEnd`, `columnStart`, and `columnEnd`

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/matrix-windowing.test.ts --coverage=false
```

- [x] **Step 2: Implement pure windowing helper**

Implementation notes:

- Do not add a virtualization package in T13.
- Keep the helper pure and unit-testable.
- Use fixed row height and column width constants in one place.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/matrix-windowing.test.ts --coverage=false
```

- [x] **Step 3: Write failing grid/cell tests**

Cover:

- renders persons as horizontal axis and chapters as vertical axis
- each populated cell shows event/relation/conflict counts
- review status summary is visible in compact form
- latest updated timestamp appears when present
- empty cells are still clickable for supported create flows
- conflict cells are visually distinguishable
- selecting a cell calls `onSelectCell`

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [x] **Step 4: Implement grid and cell components**

Implementation notes:

- `MatrixGrid` receives DTO data and selected cell id; it should not fetch.
- Use accessible `button` cells or a grid pattern that Testing Library can target reliably.
- Use sticky chapter/persona headers if simple; do not spend T13 on graph-style visuals.
- Prefer concise cells over dense raw JSON.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [x] **Step 5: Refactor while green**

Keep styling local to components and existing Tailwind/shadcn conventions.

Re-run:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

---

### Task 7: Toolbar Filtering, Chapter Jump, And Page State

**Files:**
- Create: `src/components/review/persona-chapter-matrix/matrix-toolbar.tsx`
- Create: `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx`
- Create: `src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx`

- [x] **Step 1: Write failing toolbar/page tests**

Cover:

- initial matrix renders book title and counts
- persona text filter narrows visible columns locally
- status filter triggers matrix refetch with `reviewStates`
- conflict filter triggers matrix refetch with `conflictState`
- chapter jump scrolls/selects the target chapter row
- reset filters restores initial query
- loading, error, and empty states are explicit

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx --coverage=false
```

- [x] **Step 2: Implement toolbar and page shell**

Implementation notes:

- `PersonaChapterReviewPage` is the main client component.
- It receives `initialMatrix` from the server page.
- It refetches matrix summaries through `fetchPersonaChapterMatrix` when server-side filters change.
- Local persona search can filter already-loaded persona columns without refetch.
- Avoid `useMemo`/`useCallback` unless the existing component pattern or React Compiler guidance requires it.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx --coverage=false
```

- [x] **Step 3: Refactor while green**

Separate state transitions into small functions only if tests become hard to read.

Re-run:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx --coverage=false
```

---

### Task 8: Cell Drill-Down Claim List And Evidence Detail

**Files:**
- Create: `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.tsx`
- Create: `src/components/review/persona-chapter-matrix/cell-claim-list.tsx`
- Add/modify tests under `src/components/review/persona-chapter-matrix/**`

- [x] **Step 1: Write failing drill-down tests**

Cover:

- clicking a matrix cell opens the sheet
- sheet title shows persona and chapter
- sheet fetches cell claims by `bookId`, `personaId`, and `chapterId`
- claim list groups or labels event, relation, and conflict claims clearly
- selecting a claim fetches claim detail
- evidence and AI basis appear through the temporary evidence/audit panel
- empty cell shows a create prompt instead of a raw empty table
- retry is available after claim-list fetch failure

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [x] **Step 2: Implement drill-down sheet and claim list**

Implementation notes:

- Fetch claim list lazily when a cell is selected.
- Fetch claim detail lazily when a claim is selected.
- Limit initial claim list request to a reasonable page size, such as 50.
- Keep raw claim ids visible only as secondary metadata or copyable debug text, not the main label.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [x] **Step 3: Refactor while green**

Keep a clear boundary:

- drill-down owns data fetching for the selected cell
- claim list renders summaries
- evidence panel renders detail DTOs

Re-run:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

---

### Task 9: Claim Actions, Manual Create, And Edit Flow

**Files:**
- Create: `src/components/review/persona-chapter-matrix/claim-action-panel.tsx`
- Create: `src/components/review/persona-chapter-matrix/manual-claim-form.tsx`
- Add/modify tests under `src/components/review/persona-chapter-matrix/**`

- [ ] **Step 1: Write failing action-panel tests**

Cover:

- accepted/pending/deferred/rejected states show valid next actions
- `ACCEPT` posts through `submitReviewClaimAction`
- `REJECT` is labeled as delete/reject for reviewer clarity but sends `REJECT`
- `DEFER` posts with optional note
- `EDIT` opens a structured draft editor for supported event/relation fields and posts `EDIT`
- mutation success refreshes selected cell claims and matrix summaries
- mutation failure leaves the sheet open and shows an error

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [ ] **Step 2: Implement claim action panel**

Implementation notes:

- Keep edit UI structured but minimal. Do not expose an arbitrary JSON editor as the primary path.
- For unsupported claim kinds, show accept/reject/defer and a message that full editing is out of scope.
- Use T12 action endpoint exactly; do not mutate local claim DTOs as truth.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [ ] **Step 3: Write failing manual-create tests**

Cover:

- empty or populated selected cell can open “新增事迹”
- event create pre-fills `bookId`, `chapterId`, selected persona candidate id, confidence `1`, and `evidenceSpanIds`
- relation create can select a target persona and relation type option
- custom relation type key/label can be entered when preset does not fit
- create is disabled with a clear message when selected persona has no candidate id
- create success refreshes selected cell claims and matrix summaries

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [ ] **Step 4: Implement manual claim form**

Implementation notes:

- Build payloads accepted by `reviewCreateManualClaimRequestSchema`.
- Event create should target `claimKind: "EVENT"`.
- Relation create should target `claimKind: "RELATION"`.
- Use selected cell `primaryPersonaCandidateId` as event subject or relation source.
- Require at least one evidence span id. If no evidence picker exists before T16, provide a small text field for evidence span id and label it as temporary.
- Use relation catalog options for presets and keep custom relation open-string.
- Do not implement persona merge/split or full relation edge editing here.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

- [ ] **Step 5: Refactor while green**

Extract draft-building helpers if needed:

- `buildManualEventDraft`
- `buildManualRelationDraft`

Keep helpers covered by tests if extracted.

Re-run:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix --coverage=false
```

---

### Task 10: Integration Polish, Accessibility, And Performance Acceptance

**Files:**
- Modify tests/components from previous tasks as needed.

- [ ] **Step 1: Write failing integration tests**

Cover the end-to-end component path with mocked services:

- page loads initial matrix
- user filters to conflict cells
- user opens one cell
- user opens evidence for a claim
- user defers a claim
- matrix refetch happens after mutation
- a generated 50-persona x 100-chapter fixture renders without creating 5,000 full-detail claim components

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx --coverage=false
```

- [ ] **Step 2: Implement integration polish**

Implementation notes:

- Add stable loading labels and empty states.
- Ensure keyboard users can tab into cells and close the sheet.
- Avoid rendering claim detail components for unselected cells.
- Keep cell count rendering cheap; expensive detail fetch only occurs after selection.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx --coverage=false
```

- [ ] **Step 3: Run T13 task-scoped validation**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-chapter-matrix/route.test.ts src/lib/services/review-matrix.test.ts 'src/app/admin/review/[bookId]/page.test.tsx' src/components/review/shared src/components/review/persona-chapter-matrix --coverage=false
pnpm type-check
pnpm lint
```

- [ ] **Step 4: Fix only T13-scoped failures**

If failures are caused by T13 changes, fix them using the same red/green discipline. If failures are unrelated pre-existing issues, capture exact command output and rationale in the T13 execution record.

- [ ] **Step 5: Run task doc validation commands**

Run:

```bash
pnpm test src/app/admin/review
pnpm type-check
pnpm lint
```

If `pnpm test` fails only because of global coverage thresholds while targeted tests pass, rerun the same target with `--coverage=false` and record both results.

---

### Task 11: Task Documentation, Runbook Update, And Commit

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Update T13 task checkboxes**

Mark completed checkpoints in `13-persona-chapter-matrix-ui.md` only after validation has passed or blockers are explicitly documented.

- [ ] **Step 2: Append T13 execution record**

Add:

- changed files
- validation commands
- result
- follow-up risks
- next task: T14 relation editor UI

- [ ] **Step 3: Update runbook**

Mark T13 complete in `Task Status` and append a `T13 Completion - 2026-04-21` entry.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
```

- [ ] **Step 5: Commit T13**

Run:

```bash
git add src/server/modules/review/evidence-review/review-api-schemas.ts src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-chapter-matrix/route.ts src/app/api/admin/review/persona-chapter-matrix/route.test.ts src/lib/services/review-matrix.ts src/lib/services/review-matrix.test.ts src/app/admin/review/[bookId]/page.tsx src/app/admin/review/[bookId]/page.test.tsx src/components/review/shared src/components/review/persona-chapter-matrix src/components/review/index.ts docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat(review): add persona chapter matrix"
```

If some optional files were not created, adjust `git add` to the actual changed paths.

---

## Stop Conditions

- Stop if `getPersonaChapterMatrix` cannot derive persona display names without using an incompatible legacy truth source.
- Stop if manual create requires a persona-candidate mapping that does not exist for selected personas and cannot be represented clearly in the UI.
- Stop if T12 claim action or manual create APIs reject a required T13 payload shape; do not alter T12 semantics without recording why.
- Stop if a full relation editing decision is needed. That belongs to T14.
- Stop if a full evidence picker or audit-history redesign is needed. That belongs to T16.
- Stop if large-matrix usability requires a third-party virtualization library or product decision.

## Review Checkpoints

After Task 4:

- Confirm `/admin/review/[bookId]` is cut over to the new matrix entry.
- Confirm legacy drafts are no longer loaded by the main page.

After Task 8:

- Confirm claim drill-down shows evidence/AI basis without loading full-book details.
- Confirm the temporary evidence/audit adapter is isolated for T16 replacement.

After Task 10:

- Confirm a 50 x 100 matrix remains usable with local windowing.
- Confirm all mutations refresh both cell claim list and matrix summaries.

## Final Validation Commands

Run task-scoped checks first:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-chapter-matrix/route.test.ts src/lib/services/review-matrix.test.ts 'src/app/admin/review/[bookId]/page.test.tsx' src/components/review/shared src/components/review/persona-chapter-matrix --coverage=false
pnpm type-check
pnpm lint
```

Then run task-doc checks:

```bash
pnpm test src/app/admin/review
pnpm type-check
pnpm lint
```

## Expected Outcome

- `/admin/review/[bookId]` opens the persona/chapter matrix instead of the legacy draft panel.
- Reviewers see people on the horizontal axis and chapters on the vertical axis.
- Each cell shows event count, relation count, conflict count, review state summary, and latest update time.
- Reviewers can filter, jump to chapters, select cells, inspect claims, open evidence/AI basis, and perform T12-backed actions.
- Manual event/relation creation is supported for selected cells when a persona candidate mapping exists.
- Large matrices use native windowing or equivalent rendering constraints.
- T13 task doc and runbook are updated only after validation passes.

## Execution Options

1. **Subagent-Driven (recommended):** Use `superpowers:subagent-driven-development` to execute this plan task-by-task with review checkpoints after Task 4, Task 8, and Task 10. This is recommended because T13 spans API, service, page, and multiple UI components, but each task has clear ownership.
2. **Inline Execution:** Use `superpowers:executing-plans` in the current session to execute the checkboxes sequentially. This keeps context centralized but will be a heavier session because T13 touches several layers.
