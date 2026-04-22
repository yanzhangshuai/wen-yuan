# T14 Relation Editor UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on `dev_2`; do not create a new branch and do not start T15/T16.

**Goal:** Build a lightweight claim-first relation editor at `/admin/review/[bookId]/relations` so reviewers can inspect persona pairs, edit relation direction/type/interval/evidence, preserve original extracted text, and create custom or preset relations without touching legacy truth tables.

**Architecture:** T14 is a review-surface task, not a new storage task. The read path adds one relation-focused query DTO and one relation-focused route for pair summaries plus selected-pair claim lists, while all writes continue to reuse T12 claim detail, claim action, and manual create endpoints. The UI groups relation claims by unordered persona pair for review clarity, but direction and interval remain per-claim fields, and `relationship_edges` stays a projection-only output rather than an editable truth source.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript strict, Prisma 7/PostgreSQL, Zod, Vitest + Testing Library, existing shadcn-style UI primitives, existing T12/T13 review services and T18 relation catalog loader.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §5.3, §8.3, §9.4, §9.6, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- TDD guide: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`
- Existing review contracts from T12:
  - `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - `src/server/modules/review/evidence-review/review-query-service.ts`
  - `src/server/modules/review/evidence-review/review-mutation-service.ts`
  - `src/app/api/admin/review/claims/**`
- Existing matrix UI from T13:
  - `src/app/admin/review/[bookId]/page.tsx`
  - `src/components/review/persona-chapter-matrix/**`
  - `src/components/review/shared/temporary-evidence-audit-panel.tsx`
- Relation governance from T18:
  - `src/server/modules/knowledge-v2/relation-types/**`

## Execution Rules

- Follow strict TDD for every task: test first, RED, minimum implementation, GREEN, then refactor while still green.
- T14 must stay claim-first. Do not let the UI edit `relationship_edges` or any legacy `Relationship`/draft table directly.
- Keep `relationTypeKey` as an open string in API DTOs, forms, and storage payloads. Use presets only as suggestions.
- Do not require catalog promotion before saving a reviewer-entered custom relation.
- Keep original extracted relation text visible. The editable claim shows the current normalized relation, and the detail panel must surface the original extracted/basis relation text when available.
- First screen loads relation pair summaries and selected-pair claim summaries only. Claim detail, evidence, and audit history load lazily when one claim row is selected.
- Restrict T14 to persona-resolved relation claims. Candidate-only unresolved relation claims remain in T12/T13 claim workflows and are not the main object of this page.
- Warning states for direction conflict and interval conflict are reviewer hints only. They do not block edit or save.
- UI must remain lightweight: filters + pair list + claim list + detail sheet + evidence side panel. Do not add graph visualization, force-directed layouts, or a generic knowledge-graph console.
- Reuse T12 mutation/detail endpoints unless a gap is proven. T14 may add only relation-focused read endpoints.
- Perform one T14 commit after final validation plus task/runbook completion updates.

## File Structure

- Modify `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - Add relation-editor query schema and exported types.
- Modify `src/server/modules/review/evidence-review/review-api-schemas.test.ts`
  - Cover relation-editor query parsing and invalid pair selection inputs.
- Modify `src/server/modules/review/evidence-review/review-query-service.ts`
  - Add relation-editor DTO types and `getRelationEditorView`.
- Modify `src/server/modules/review/evidence-review/review-query-service.test.ts`
  - Cover pair aggregation, filtering, warning calculation, pair selection, and empty-state behavior.
- Create `src/app/api/admin/review/relations/route.ts`
  - Read-only relation-editor endpoint.
- Create `src/app/api/admin/review/relations/route.test.ts`
  - Route validation/auth/service delegation tests.
- Create `src/lib/services/relation-editor.ts`
  - Browser-safe client DTOs and fetch wrappers for relation-editor screens.
- Create `src/lib/services/relation-editor.test.ts`
  - Query-string and wrapper behavior tests.
- Create `src/components/review/relation-editor/types.ts`
  - UI-local selection, filter, and draft types.
- Create `src/components/review/relation-editor/relation-draft.ts`
  - Shared helpers to build manual/edit relation payloads and normalize relation type source.
- Create `src/components/review/relation-editor/relation-draft.test.ts`
  - Guard custom/preset payload behavior and interval normalization.
- Create `src/components/review/relation-editor/relation-editor-page.tsx`
  - Main client entry for the relation editor.
- Create `src/components/review/relation-editor/relation-editor-page.test.tsx`
  - Client state, lazy loading, refresh, and empty/error state tests.
- Create `src/components/review/relation-editor/relation-editor-toolbar.tsx`
- Create `src/components/review/relation-editor/relation-pair-list.tsx`
- Create `src/components/review/relation-editor/relation-pair-list.test.tsx`
- Create `src/components/review/relation-editor/relation-claim-list.tsx`
- Create `src/components/review/relation-editor/relation-claim-list.test.tsx`
- Create `src/components/review/relation-editor/relation-claim-sheet.tsx`
- Create `src/components/review/relation-editor/relation-claim-sheet.test.tsx`
- Create `src/components/review/relation-editor/relation-warning-banner.tsx`
- Create `src/components/review/relation-editor/relation-warning-banner.test.tsx`
- Create `src/components/review/shared/review-mode-nav.tsx`
  - Shared mode switcher between matrix and relation pages.
- Create `src/components/review/shared/review-mode-nav.test.tsx`
- Modify `src/components/review/persona-chapter-matrix/manual-claim-form.tsx`
  - Reuse shared relation draft helpers without changing T13 behavior.
- Modify `src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx`
  - Lock unchanged T13 behavior after helper extraction.
- Modify `src/components/review/persona-chapter-matrix/claim-action-panel.tsx`
  - Reuse shared relation edit helpers.
- Modify `src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx`
  - Lock unchanged edit payload behavior after helper extraction.
- Modify `src/app/admin/review/[bookId]/page.tsx`
  - Inject review mode navigation into the existing matrix page.
- Modify `src/app/admin/review/[bookId]/page.test.tsx`
  - Verify matrix page still loads the matrix DTO and now exposes mode navigation props.
- Create `src/app/admin/review/[bookId]/relations/page.tsx`
  - Server page for relation editor initial load.
- Create `src/app/admin/review/[bookId]/relations/page.test.tsx`
  - Verify book validation, initial relation DTO load, and mode navigation props.
- Modify `src/components/review/index.ts`
  - Export the relation editor entry if the barrel remains the shared import path.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`
  - Mark checkpoints complete and append execution record only after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Mark T14 complete only after validation passes.

## DTO Decisions

The new read DTO should stay reviewer-oriented and avoid exposing raw projection internals:

```ts
export interface ReviewRelationEditorDto {
  bookId: string;
  personaOptions: ReviewRelationPersonaOptionDto[];
  relationTypeOptions: ReviewRelationTypeOptionDto[];
  pairSummaries: ReviewRelationPairSummaryDto[];
  selectedPair: ReviewRelationSelectedPairDto | null;
  generatedAt: string;
}

export interface ReviewRelationPersonaOptionDto {
  personaId: string;
  displayName: string;
  aliases: string[];
}

export interface ReviewRelationPairSummaryDto {
  pairKey: string;
  leftPersonaId: string;
  rightPersonaId: string;
  leftPersonaName: string;
  rightPersonaName: string;
  totalClaims: number;
  activeClaims: number;
  latestUpdatedAt: string;
  relationTypeKeys: string[];
  reviewStateSummary: Record<string, number>;
  warningFlags: {
    directionConflict: boolean;
    intervalConflict: boolean;
  };
}

export interface ReviewRelationSelectedPairDto {
  pairKey: string;
  leftPersona: ReviewRelationPersonaOptionDto;
  rightPersona: ReviewRelationPersonaOptionDto;
  warnings: {
    directionConflict: boolean;
    intervalConflict: boolean;
  };
  claims: ReviewRelationClaimListItemDto[];
}

export interface ReviewRelationClaimListItemDto {
  claimId: string;
  reviewState: ClaimReviewState;
  source: ClaimSource;
  conflictState: ConflictState;
  relationTypeKey: string;
  relationLabel: string;
  relationTypeSource: RelationTypeSource | null;
  direction: RelationDirection;
  effectiveChapterStart: number | null;
  effectiveChapterEnd: number | null;
  chapterId: string | null;
  chapterLabel: string | null;
  timeLabel: string | null;
  evidenceSpanIds: string[];
}
```

Modeling rules:

- Pair grouping is unordered for navigation. `pairKey` must be built from the two persona ids sorted lexicographically so the same pair is stable regardless of claim direction.
- Direction is still per claim. A single pair may legitimately contain `teacher_of`, `enemy_of`, or multiple directional variants at the same time.
- `selectedPair.claims` should contain relation-claim summaries only. Do not duplicate `basisClaim`, `auditHistory`, or full evidence in this DTO; the detail sheet fetches them lazily from the T12 detail endpoint.
- `relationLabel` is the current editable label on the claim. Original extracted text should be surfaced from `basisClaim.relationLabel` or similar detail fields after lazy detail load.
- Only include relation claims that can be mapped to concrete personas on both sides. Unresolved candidate-only claims remain out of this page.
- `warningFlags.directionConflict` is `true` when the pair contains claims with inconsistent directions. `warningFlags.intervalConflict` is `true` when the pair contains overlapping or divergent effective intervals that a reviewer should inspect.
- `relationTypeOptions` must come from the T18 relation catalog in review mode and must remain compatible with custom keys not present in the catalog.
- All dates crossing the route boundary must be serialized as ISO strings.

## Route Decisions

- Add `GET /api/admin/review/relations`.
- Required query:
  - `bookId`
- Optional query:
  - `personaId` for “show pairs that include this persona”
  - `pairPersonaId` for selecting the other persona in the pair when `personaId` is present
  - `relationTypeKeys`
  - `reviewStates`
  - `conflictState=ACTIVE|NONE`
  - `limitPairs`
  - `offsetPairs`
- Validation rule: `pairPersonaId` without `personaId` is invalid.
- Read route returns `ReviewRelationEditorDto`.
- Keep claim detail on the existing T12 endpoint:
  - `GET /api/admin/review/claims/[claimKind]/[claimId]?bookId=...`
- Keep claim actions on the existing T12 endpoint:
  - `POST /api/admin/review/claims/[claimKind]/[claimId]/actions`
- Keep manual create on the existing T12 endpoint:
  - `POST /api/admin/review/claims`
- T14 should not add a dedicated relation mutation route unless the T12 contract proves insufficient during execution.

## Warning Semantics

- `directionConflict`
  - Same persona pair contains at least two active relation claims whose `direction` values are not all equivalent.
- `intervalConflict`
  - Same persona pair contains active relation claims whose `[effectiveChapterStart, effectiveChapterEnd]` windows are inconsistent enough that a reviewer should inspect them together.
- Both warnings are display-only. They should appear in pair list summaries and selected-pair banner, but must not block edits, accept, or custom relation creation.

## Server/Page Decisions

- T14 gets its own page route: `/admin/review/[bookId]/relations`.
- The existing `/admin/review/[bookId]` remains the persona x chapter matrix page.
- Add a shared `ReviewModeNav` so future T15 can attach a third mode without rewriting page shells.
- Both pages should keep the existing left-side book switcher layout for consistency.
- The relation page server component should load:
  - validated book metadata
  - book switcher list
  - initial relation-editor DTO with no pair selected or with query-selected pair
- The relation page should not preload claim detail records.

---

### Task 1: Relation Editor Query Schema And Query Service

**Files:**
- Modify: `src/server/modules/review/evidence-review/review-api-schemas.ts`
- Modify: `src/server/modules/review/evidence-review/review-api-schemas.test.ts`
- Modify: `src/server/modules/review/evidence-review/review-query-service.ts`
- Modify: `src/server/modules/review/evidence-review/review-query-service.test.ts`

- [x] **Step 1: Write failing schema tests**

Add tests proving that the relation-editor query schema:

- requires `bookId`
- accepts `personaId`, `pairPersonaId`, `relationTypeKeys`, `reviewStates`, `conflictState`, `limitPairs`, and `offsetPairs`
- rejects invalid UUIDs
- rejects `pairPersonaId` when `personaId` is absent
- coerces numeric pagination fields

Run RED:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts --coverage=false
```

- [x] **Step 2: Implement the minimum schema**

Add:

- `reviewRelationEditorQuerySchema`
- exported `ReviewRelationEditorQueryRequest`

Keep `relationTypeKeys` as `string[]`, not enum-backed.

Run GREEN:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts --coverage=false
```

- [x] **Step 3: Write failing query service tests**

Add tests for `createReviewQueryService().getRelationEditorView(...)` that prove it:

- groups relation claims by unordered persona pair
- returns pair summaries sorted by latest update descending, then pair label
- filters pairs by `personaId`
- filters relation claims/pairs by `relationTypeKeys`
- filters by `reviewStates`
- filters by `conflictState`
- paginates pair summaries without dropping filter option metadata
- resolves `selectedPair` only when both `personaId` and `pairPersonaId` are provided
- computes `directionConflict` and `intervalConflict`
- returns relation type options from the T18 loader
- degrades to deterministic empty options in test doubles that do not provide a catalog
- excludes claims that cannot resolve to two concrete personas

Run RED:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

- [x] **Step 4: Implement `getRelationEditorView`**

Implementation notes:

- Reuse existing claim read helpers where possible instead of adding a second relation-claim repository.
- Use accepted projection/persona mapping information already available in review-query code to resolve persona ids from persona candidate ids.
- Build a stable unordered `pairKey` from the two resolved persona ids.
- Load persona display data for any persona appearing in filtered pairs.
- Load relation catalog options in review mode using T18 loader.
- Keep selected-pair claim rows summary-only; do not embed detail/evidence/audit payloads.

Run GREEN:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

- [x] **Step 5: Refactor while green**

Extract small pure helpers if they improve readability:

- `buildRelationPairKey`
- `summarizeRelationPair`
- `computeRelationWarnings`
- `sortRelationPairs`
- `matchesRelationEditorFilters`

Re-run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

---

### Task 2: Relation Editor Route And Client Service

**Files:**
- Create: `src/app/api/admin/review/relations/route.ts`
- Create: `src/app/api/admin/review/relations/route.test.ts`
- Create: `src/lib/services/relation-editor.ts`
- Create: `src/lib/services/relation-editor.test.ts`

- [x] **Step 1: Write failing route tests**

Add route tests that prove:

- unauthenticated/non-admin access is rejected using the existing admin review guard pattern
- invalid query params return `400`
- valid requests call `getRelationEditorView` with parsed filters
- success response serializes the reviewer-facing DTO

Run RED:

```bash
pnpm exec vitest run src/app/api/admin/review/relations/route.test.ts --coverage=false
```

- [x] **Step 2: Implement the route**

Implementation notes:

- Follow the same auth/query parsing conventions used by `persona-chapter-matrix` and T12 review routes.
- Keep this route read-only.
- Do not add special mutation shortcuts here.

Run GREEN:

```bash
pnpm exec vitest run src/app/api/admin/review/relations/route.test.ts --coverage=false
```

- [x] **Step 3: Write failing client service tests**

Add tests that prove `src/lib/services/relation-editor.ts`:

- builds the correct query string for pair filters
- omits empty optional params
- appends repeated `relationTypeKeys` and `reviewStates`
- exposes a `fetchRelationEditorView` wrapper for the new route
- reuses existing T12 claim detail/action/manual create wrappers rather than re-implementing them inconsistently

Run RED:

```bash
pnpm exec vitest run src/lib/services/relation-editor.test.ts --coverage=false
```

- [x] **Step 4: Implement the client service**

Implementation notes:

- Keep browser-safe imports only.
- Prefer a focused service file for relation-editor screen types instead of overloading `review-matrix.ts`.
- If a shared wrapper from T13 is needed, re-export it explicitly rather than duplicating query-builder logic.

Run GREEN:

```bash
pnpm exec vitest run src/lib/services/relation-editor.test.ts --coverage=false
```

---

### Task 3: Extract Shared Relation Draft Helpers

**Files:**
- Create: `src/components/review/relation-editor/relation-draft.ts`
- Create: `src/components/review/relation-editor/relation-draft.test.ts`
- Modify: `src/components/review/persona-chapter-matrix/manual-claim-form.tsx`
- Modify: `src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx`
- Modify: `src/components/review/persona-chapter-matrix/claim-action-panel.tsx`
- Modify: `src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx`

- [x] **Step 1: Write failing helper tests**

Add tests that lock the shared relation draft behavior:

- preset relation selection uses preset `relationTypeKey`, `label`, and default `direction`
- custom relation selection keeps reviewer-entered `relationTypeKey` and `relationLabel`
- `relationTypeSource` resolves to `PRESET` or `CUSTOM` correctly
- empty chapter interval fields become `null`
- evidence span input text is normalized to string arrays

Run RED:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-draft.test.ts --coverage=false
```

- [x] **Step 2: Implement shared relation draft helpers**

Move or extract the T13 relation-only helper logic into one shared file. Expected helper surface:

- parsing evidence ids
- nullable interval normalization
- preset/custom source resolution
- manual relation create payload builder
- relation edit payload builder

Run GREEN:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-draft.test.ts --coverage=false
```

- [x] **Step 3: Write failing regression tests for T13 callers**

Adjust T13 tests so they fail until both matrix components consume the shared helper without behavior drift.

Run RED:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx --coverage=false
```

- [x] **Step 4: Switch T13 callers to the shared helper**

Implementation notes:

- Preserve current T13 UX and payload shapes.
- Do not move event-draft helpers into the relation module.
- Keep the shared file relation-specific so T14 can import it directly without dragging matrix-only state.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx src/components/review/relation-editor/relation-draft.test.ts --coverage=false
```

---

### Task 4: Mode Navigation And Relation Editor Server Page

**Files:**
- Create: `src/components/review/shared/review-mode-nav.tsx`
- Create: `src/components/review/shared/review-mode-nav.test.tsx`
- Modify: `src/app/admin/review/[bookId]/page.tsx`
- Modify: `src/app/admin/review/[bookId]/page.test.tsx`
- Create: `src/app/admin/review/[bookId]/relations/page.tsx`
- Create: `src/app/admin/review/[bookId]/relations/page.test.tsx`
- Modify: `src/components/review/index.ts`

- [x] **Step 1: Write failing mode-nav tests**

Add tests that prove:

- the navigation renders “人物 x 章节” and “人物关系” modes
- the current mode is highlighted
- links stay within the same `bookId`

Run RED:

```bash
pnpm exec vitest run src/components/review/shared/review-mode-nav.test.tsx --coverage=false
```

- [x] **Step 2: Implement `ReviewModeNav`**

Implementation notes:

- Keep it lightweight and reusable by T15 later.
- Inputs should be explicit (`bookId`, `activeMode`) and not depend on client routing hooks.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/shared/review-mode-nav.test.tsx --coverage=false
```

- [x] **Step 3: Write failing server page tests**

Add/adjust page tests that prove:

- `/admin/review/[bookId]` still loads the matrix DTO and now passes mode-nav props
- `/admin/review/[bookId]/relations` validates `bookId`, loads book switcher data, and loads the initial relation-editor DTO
- neither page loads legacy draft data

Run RED:

```bash
pnpm exec vitest run 'src/app/admin/review/[bookId]/page.test.tsx' 'src/app/admin/review/[bookId]/relations/page.test.tsx' --coverage=false
```

- [x] **Step 4: Implement server pages**

Implementation notes:

- Keep both pages using the existing left-side book switcher shell.
- The relation page should call `createReviewQueryService().getRelationEditorView({ bookId })` for its initial load.
- Export the relation editor from `src/components/review/index.ts` only if the existing project import style benefits from it.

Run GREEN:

```bash
pnpm exec vitest run 'src/app/admin/review/[bookId]/page.test.tsx' 'src/app/admin/review/[bookId]/relations/page.test.tsx' src/components/review/shared/review-mode-nav.test.tsx --coverage=false
```

---

### Task 5: Relation Editor Page Shell, Filters, And Pair Navigation

**Files:**
- Create: `src/components/review/relation-editor/types.ts`
- Create: `src/components/review/relation-editor/relation-editor-page.tsx`
- Create: `src/components/review/relation-editor/relation-editor-page.test.tsx`
- Create: `src/components/review/relation-editor/relation-editor-toolbar.tsx`
- Create: `src/components/review/relation-editor/relation-pair-list.tsx`
- Create: `src/components/review/relation-editor/relation-pair-list.test.tsx`
- Create: `src/components/review/relation-editor/relation-claim-list.tsx`
- Create: `src/components/review/relation-editor/relation-claim-list.test.tsx`

- [x] **Step 1: Write failing pair-list and toolbar tests**

Add tests that prove:

- pair list renders persona-pair rows, relation type chips, counts, and warning badges
- selected pair row is highlighted
- toolbar filters call back with persona/relation/review-state/conflict-state changes
- empty state is shown when no relation pairs match

Run RED:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-pair-list.test.tsx src/components/review/relation-editor/relation-claim-list.test.tsx --coverage=false
```

- [x] **Step 2: Implement toolbar, pair list, and claim list**

Implementation notes:

- Pair list is the primary navigation surface.
- Claim list should show one row per relation claim under the selected pair.
- Show multiple concurrent relations without collapsing them into one merged label.
- Do not load detail data here; only render summary fields already present in the DTO.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-pair-list.test.tsx src/components/review/relation-editor/relation-claim-list.test.tsx --coverage=false
```

- [x] **Step 3: Write failing page-shell tests**

Add tests proving the page component:

- initializes from the server-provided DTO
- refreshes the pair list when filters change
- keeps selected pair when it still exists after refresh
- clears the selection when the pair disappears after refresh
- shows error state when the route fetch fails

Run RED:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-editor-page.test.tsx --coverage=false
```

- [x] **Step 4: Implement the relation editor page shell**

Implementation notes:

- Use the new client service for route refetches.
- Keep filter and selection state local to the relation editor page.
- Do not introduce global store state for one review page.
- Prefer the same empty/error-state primitives already used by T13.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-editor-page.test.tsx --coverage=false
```

---

### Task 6: Claim Detail Sheet, Relation Editing, Custom Input, And Evidence/Audit Integration

**Files:**
- Create: `src/components/review/relation-editor/relation-warning-banner.tsx`
- Create: `src/components/review/relation-editor/relation-warning-banner.test.tsx`
- Create: `src/components/review/relation-editor/relation-claim-sheet.tsx`
- Create: `src/components/review/relation-editor/relation-claim-sheet.test.tsx`
- Modify: `src/components/review/relation-editor/relation-editor-page.tsx`
- Modify: `src/components/review/relation-editor/relation-editor-page.test.tsx`

- [x] **Step 1: Write failing warning-banner tests**

Add tests that prove:

- direction conflict warning is shown only when requested
- interval conflict warning is shown only when requested
- both warnings can appear together without blocking the sheet controls

Run RED:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-warning-banner.test.tsx --coverage=false
```

- [x] **Step 2: Implement the warning banner**

Keep it purely presentational. The banner should accept precomputed warning flags and reviewer-facing copy.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-warning-banner.test.tsx --coverage=false
```

- [x] **Step 3: Write failing detail-sheet tests**

Add tests proving the sheet:

- lazily fetches T12 claim detail when one claim row is selected
- shows current normalized relation fields plus original extracted relation text from `basisClaim`
- loads preset relation options from the relation-editor DTO
- allows switching between preset and custom relation input
- allows editing `relationTypeKey`, `relationLabel`, `direction`, `effectiveChapterStart`, `effectiveChapterEnd`, and evidence binding
- posts edit payloads through the existing T12 action endpoint
- supports creating a new relation claim for the selected pair through the existing T12 manual create endpoint
- refreshes the pair list and claim list after mutation success
- renders the temporary evidence/audit panel for detail data

Run RED:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-claim-sheet.test.tsx --coverage=false
```

- [x] **Step 4: Implement the detail sheet**

Implementation notes:

- Reuse T12 detail/action/manual-create wrappers rather than inventing T14-specific mutations.
- Use the shared relation draft helper from Task 3.
- Preserve custom relation strings exactly as entered by the reviewer.
- Allow reviewer mapping from custom input to a preset by changing the current claim fields, not by forcing catalog writes.
- Keep evidence binding at the current claim level; use the existing evidence span id input pattern until T16/T15 provide richer selectors.
- Show original extracted relation text and current normalized relation side by side when detail data exposes both.

Run GREEN:

```bash
pnpm exec vitest run src/components/review/relation-editor/relation-claim-sheet.test.tsx src/components/review/relation-editor/relation-editor-page.test.tsx --coverage=false
```

---

### Task 7: Task-Scoped Validation

**Files:**
- No new files beyond the implementation files above.

- [x] **Step 1: Run focused unit and route tests**

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/review-api-schemas.test.ts \
  src/server/modules/review/evidence-review/review-query-service.test.ts \
  src/app/api/admin/review/relations/route.test.ts \
  src/lib/services/relation-editor.test.ts \
  src/components/review/relation-editor/relation-draft.test.ts \
  src/components/review/relation-editor/relation-pair-list.test.tsx \
  src/components/review/relation-editor/relation-claim-list.test.tsx \
  src/components/review/relation-editor/relation-warning-banner.test.tsx \
  src/components/review/relation-editor/relation-claim-sheet.test.tsx \
  src/components/review/relation-editor/relation-editor-page.test.tsx \
  src/components/review/shared/review-mode-nav.test.tsx \
  'src/app/admin/review/[bookId]/page.test.tsx' \
  'src/app/admin/review/[bookId]/relations/page.test.tsx' \
  src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx \
  src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx \
  --coverage=false
```

Validation result (2026-04-22): passed, `15` files / `68` tests green.

- [x] **Step 2: Run task-scoped lint and type-check**

```bash
pnpm exec eslint \
  src/server/modules/review/evidence-review/review-api-schemas.ts \
  src/server/modules/review/evidence-review/review-query-service.ts \
  src/app/api/admin/review/relations/route.ts \
  src/lib/services/relation-editor.ts \
  src/components/review/relation-editor \
  src/components/review/shared/review-mode-nav.tsx \
  'src/app/admin/review/[bookId]/page.tsx' \
  'src/app/admin/review/[bookId]/relations/page.tsx' \
  src/components/review/persona-chapter-matrix/manual-claim-form.tsx \
  src/components/review/persona-chapter-matrix/claim-action-panel.tsx

pnpm type-check
```

Validation result (2026-04-22): `pnpm exec eslint ...` passed, `pnpm type-check` passed.

- [x] **Step 3: Run an implementation sanity scan**

Confirm all of the following before closing T14:

- no database schema or migration files changed
- no mutation route beyond existing T12 claim routes was added
- `relationTypeKey` remained string-based everywhere
- relation editor reads claim-first DTOs and never edits `relationship_edges`

Suggested checks:

```bash
git diff --stat
git diff -- prisma/schema.prisma prisma/migrations
rg -n "enum .*relation|relationTypeKey.*enum" src prisma docs/superpowers
rg -n "relationship_edges|Relationship\\b|drafts" src/components/review src/app/admin/review src/server/modules/review/evidence-review
```

Sanity result (2026-04-22):

- `git diff -- prisma/schema.prisma prisma/migrations` returned no output.
- `relationTypeKey` remains an open string key; no DB enum or DTO enum was introduced.
- T14 adds only `GET /api/admin/review/relations`; write paths still reuse T12 claim detail/action/manual-create APIs.
- T14 touched files stay claim-first and do not edit `relationship_edges`.

---

### Task 8: Task Docs, Runbook, And Commit Handoff

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [x] **Step 1: Update the T14 task doc**

After validation passes:

- check every completed execution checkpoint in `14-relation-editor-ui.md`
- fill in the `Execution Record`
- note any temporary limitations that still belong to T16/T15, not T14

- [x] **Step 2: Update the runbook**

After validation passes:

- mark T14 complete in `Task Status`
- append a `### T14 Completion - YYYY-MM-DD` record with changed files, validation commands, result, follow-up risks, and next task

- [x] **Step 3: Review final diff and prepare commit handoff**

Suggested flow:

```bash
git status --short
git diff --stat
git add src/app/api/admin/review/relations/route.ts \
  src/app/api/admin/review/relations/route.test.ts \
  src/lib/services/relation-editor.ts \
  src/lib/services/relation-editor.test.ts \
  src/components/review/relation-editor \
  src/components/review/shared/review-mode-nav.tsx \
  src/components/review/shared/review-mode-nav.test.tsx \
  src/components/review/persona-chapter-matrix/manual-claim-form.tsx \
  src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx \
  src/components/review/persona-chapter-matrix/claim-action-panel.tsx \
  src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx \
  'src/app/admin/review/[bookId]/page.tsx' \
  'src/app/admin/review/[bookId]/page.test.tsx' \
  'src/app/admin/review/[bookId]/relations/page.tsx' \
  'src/app/admin/review/[bookId]/relations/page.test.tsx' \
  src/server/modules/review/evidence-review/review-api-schemas.ts \
  src/server/modules/review/evidence-review/review-api-schemas.test.ts \
  src/server/modules/review/evidence-review/review-query-service.ts \
  src/server/modules/review/evidence-review/review-query-service.test.ts \
  src/components/review/index.ts \
  docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md \
  docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat: add relation editor review ui"
```

Execution note (2026-04-22): final diff review completed with `git status --short` and `git diff --stat`; git commit remains user-triggered in this Superpowers-only flow.

---

## Stop Conditions

- Stop if the existing T12 claim mutation contract cannot express a required T14 edit/create action without altering claim semantics.
- Stop if the current codebase cannot resolve both sides of a relation claim back to stable persona ids for the pair view.
- Stop if adding the relation page would require changing T15 time-axis contracts or inventing graph-visualization decisions outside this task.
- Stop if T18 relation catalog loading is unavailable in production code and there is no deterministic temporary preset source.

## Validation Matrix

- Relation-focused schema parsing: `review-api-schemas.test.ts`
- Pair aggregation and warning semantics: `review-query-service.test.ts`
- Read route contract: `src/app/api/admin/review/relations/route.test.ts`
- Browser query wrapper: `src/lib/services/relation-editor.test.ts`
- Shared relation draft helper: `src/components/review/relation-editor/relation-draft.test.ts`
- Mode navigation and page shell: `review-mode-nav.test.tsx`, relation page tests
- Pair list / claim list / sheet behavior: relation-editor component tests
- Regression coverage for T13 helper reuse: `manual-claim-form.test.tsx`, `claim-action-panel.test.tsx`
- Global task gates: targeted `eslint`, `pnpm type-check`

## Self-Review Checklist

- Every T14 execution checkpoint from the task doc maps to at least one task in this plan.
- The plan keeps `relationTypeKey` as an open string and never proposes a database enum.
- The plan keeps `relationship_edges` as projection-only and `relation_claims + audit_logs` as the editable truth path.
- The plan reuses T12 detail/mutation endpoints instead of introducing a second write path.
- The plan keeps the UI lightweight and reviewer-oriented rather than graph-first.

Plan complete and saved to `docs/superpowers/plans/2026-04-22-t14-relation-editor-ui-implementation-plan.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
