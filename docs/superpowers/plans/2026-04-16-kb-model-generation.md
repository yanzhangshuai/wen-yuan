# Knowledge Base Model Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add async model-generation flows for NER lexicon rules and prompt extraction rules, and migrate generic title generation from sync review to async job polling.

**Architecture:** Reuse the existing surnames async-job contract end-to-end. Backend generation modules will build prompts and persist inactive `LLM_SUGGESTED` records through Prisma, route handlers will submit/poll in-memory jobs, and admin dialogs will poll every 2 seconds until results are ready.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma, Zod, Vitest

---

### Task 1: Lock Down Contracts With Failing Tests

**Files:**
- Create: `src/app/api/admin/knowledge/ner-rules/generate/routes.test.ts`
- Create: `src/app/api/admin/knowledge/prompt-extraction-rules/generate/routes.test.ts`
- Modify: `src/lib/services/ner-rules.test.ts`
- Modify: `src/lib/services/prompt-extraction-rules.test.ts`
- Modify: `src/lib/services/title-filters.test.ts` (if missing, create it)
- Modify: `src/server/modules/knowledge/generateCatalogCandidates.test.ts`

- [ ] Add tests for service-layer request shapes for `generate*`, `poll*`, and `preview*` APIs.
- [ ] Add route tests that prove `POST /generate` returns `{ jobId }`, `GET /generate?jobId=...` returns job status, and preview routes return prompt payloads.
- [ ] Extend backend generation tests to prove dedupe, inactive persistence, `LLM_SUGGESTED` source, and sort-order increment rules.
- [ ] Run targeted tests and confirm they fail for the expected missing exports/routes/behavior.

Run:
```bash
pnpm vitest run \
  src/server/modules/knowledge/generateCatalogCandidates.test.ts \
  src/lib/services/ner-rules.test.ts \
  src/lib/services/prompt-extraction-rules.test.ts \
  src/lib/services/title-filters.test.ts \
  src/app/api/admin/knowledge/ner-rules/generate/routes.test.ts \
  src/app/api/admin/knowledge/prompt-extraction-rules/generate/routes.test.ts
```

Expected: failing assertions and/or missing module errors for the new generation flows.

### Task 2: Implement Backend Generation Modules

**Files:**
- Create: `src/server/modules/knowledge/generateNerLexiconRules.ts`
- Create: `src/server/modules/knowledge/generatePromptExtractionRules.ts`
- Modify: `src/server/modules/knowledge/index.ts`

- [ ] Implement prompt preview helpers that load reference book type and sample active rules.
- [ ] Implement JSON-generation functions using `executeKnowledgeJsonGeneration()`.
- [ ] Persist generated rows with `isActive: false`, `source: "LLM_SUGGESTED"` semantics where applicable, dedupe against existing `ruleType + bookTypeId + content`, and assign increasing `sortOrder`.
- [ ] Export the new functions from the knowledge module barrel.
- [ ] Run the backend generation tests and make them pass before touching routes.

Run:
```bash
pnpm vitest run src/server/modules/knowledge/generateCatalogCandidates.test.ts
```

Expected: pass.

### Task 3: Implement Async Route Layer

**Files:**
- Modify: `src/app/api/admin/knowledge/_shared.ts`
- Modify: `src/app/api/admin/knowledge/title-filters/generate/route.ts`
- Create: `src/app/api/admin/knowledge/ner-rules/generate/route.ts`
- Create: `src/app/api/admin/knowledge/ner-rules/generate/preview-prompt/route.ts`
- Create: `src/app/api/admin/knowledge/prompt-extraction-rules/generate/route.ts`
- Create: `src/app/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt/route.ts`

- [ ] Add `generateNerRulesSchema` and `generatePromptRulesSchema`.
- [ ] Convert generic-title generation route to the same submit/poll job pattern as surnames.
- [ ] Implement NER and prompt generation submit/poll routes with auth checks, schema validation, and job-store integration.
- [ ] Implement preview-prompt routes for NER and prompt generation.
- [ ] Run route tests and make them pass before touching the page components.

Run:
```bash
pnpm vitest run \
  src/app/api/admin/knowledge/ner-rules/generate/routes.test.ts \
  src/app/api/admin/knowledge/prompt-extraction-rules/generate/routes.test.ts
```

Expected: pass.

### Task 4: Implement Client Service APIs

**Files:**
- Modify: `src/lib/services/title-filters.ts`
- Modify: `src/lib/services/ner-rules.ts`
- Modify: `src/lib/services/prompt-extraction-rules.ts`

- [ ] Change generic-title generation to return `{ jobId }` and add polling types/helpers.
- [ ] Add preview/generate/poll helpers and result/job types for NER generation.
- [ ] Add preview/generate/poll helpers and result/job types for prompt-rule generation.
- [ ] Run service tests and make them pass.

Run:
```bash
pnpm vitest run \
  src/lib/services/ner-rules.test.ts \
  src/lib/services/prompt-extraction-rules.test.ts \
  src/lib/services/title-filters.test.ts
```

Expected: pass.

### Task 5: Update Admin Pages To Use Polling Generation

**Files:**
- Modify: `src/app/admin/knowledge-base/title-filters/page.tsx`
- Modify: `src/app/admin/knowledge-base/ner-rules/page.tsx`
- Modify: `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx`

- [ ] Migrate the generic-title generation dialog from sync review to async polling, mirroring the surnames UX.
- [ ] Add a generation dialog and review flow to the NER rules page.
- [ ] Add a generation dialog and review flow to the prompt extraction rules page.
- [ ] Keep the UI pattern aligned with existing admin pages: same toast behavior, same model picker contract, same preview block, same progress state.

### Task 6: Verification And Cleanup

**Files:**
- Verify touched files only

- [ ] Run the targeted Vitest suite again after integration.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm type-check`.
- [ ] Review diffs for accidental contract drift or unrelated changes.

Run:
```bash
pnpm vitest run \
  src/server/modules/knowledge/generateCatalogCandidates.test.ts \
  src/lib/services/ner-rules.test.ts \
  src/lib/services/prompt-extraction-rules.test.ts \
  src/lib/services/title-filters.test.ts \
  src/app/api/admin/knowledge/ner-rules/generate/routes.test.ts \
  src/app/api/admin/knowledge/prompt-extraction-rules/generate/routes.test.ts
pnpm lint
pnpm type-check
```

Expected: all commands exit 0.
