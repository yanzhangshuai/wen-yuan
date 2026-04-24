# Evidence Review Superpowers-Only Runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution, or `superpowers:subagent-driven-development` only when the user explicitly approves parallel/subagent execution. This runbook is the execution controller. Task details live under `docs/superpowers/tasks/2026-04-18-evidence-review/`.

**Goal:** Execute the Evidence-first review architecture rewrite without Trellis as an execution system.

**Architecture:** The architecture source remains `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`. This runbook converts the prior 00-22 task split into Superpowers-only execution documents and defines how to proceed when the user says `下一步`.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Prisma 7 with PostgreSQL, existing AI provider abstraction, Vitest, route/integration tests.

---

## Execution Truth Sources

1. Primary architecture truth: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`.
2. Primary execution order: this runbook.
3. Primary task details: `docs/superpowers/tasks/2026-04-18-evidence-review/*.md`.
4. Historical source only: `.trellis/tasks/04-18-evidence-review-*/prd.md`.

Do not use `.trellis/tasks/**` as live execution context after these Superpowers task documents exist. If a Superpowers task conflicts with an old Trellis PRD, follow the Superpowers task and record the difference in the task completion note.

## Next Step Protocol

When the user says `下一步`, execute this protocol:

1. Read this runbook.
2. Find the first unchecked task in `Task Status`.
3. Read that task document from `docs/superpowers/tasks/2026-04-18-evidence-review/`.
4. Read the referenced architecture spec sections and any task-specific upstream outputs.
5. Execute all unchecked checkpoints inside the task document unless a stopping condition is hit.
6. Run the validation commands listed in the task document.
7. Update the task document's `Execution Record` and the status checkbox in this runbook.
8. Report changed files, validation results, risks, and the next task.
9. Stop and wait for the user to say `下一步` again.

The user should only need to participate at task boundaries. Inside a task, the agent should execute checkpoint-by-checkpoint autonomously.

For the strict planning plus TDD operating model that sits on top of this runbook, follow:

`docs/superpowers/plans/2026-04-18-evidence-review-superpowers-tdd-guide.md`

## Stopping Conditions

Stop and ask the user before proceeding if any of these occur:

1. A migration would delete, rename, or destructively transform existing tables or data.
2. The implementation would contradict the primary architecture spec.
3. The current codebase has already implemented a different contract that cannot be reconciled inside the current task.
4. Verification fails and the fix would exceed the current task boundary.
5. A product decision is required for review UI behavior, relation governance, knowledge promotion, or cutover risk.
6. The next task requires credentials, external services, or data not available in the local workspace.

## Global Rules

1. Do not extend legacy `Profile / BiographyRecord / Relationship` as the new review truth source.
2. Do not let AI outputs overwrite original claims. Manual changes create new `MANUAL` claims, overrides, or audit records.
3. Do not write projection-only data that cannot be rebuilt from claims plus review state.
4. Keep `relationTypeKey` as a string column. Use code presets and database catalog rows for governance, not a database enum.
5. Every claim-level fact must bind to evidence or be rejected before persistence.
6. Review APIs and UI must read claim/projection DTOs, not legacy draft truth objects.
7. Prefer local, task-scoped tests before global validation.

## Execution Waves

### Wave 1: Core Contracts

- T00 umbrella governance
- T01 schema and review state foundation
- T02 text and evidence layer
- T03 claim storage contracts
- T04 run observability and retry
- T17 KB v2 foundation

### Wave 2: Extraction Write Path

- T05 Stage 0 segmentation
- T06 Stage A extraction
- T07 Stage A+ knowledge recall
- T18 relation types catalog

### Wave 3: Resolution And Projection

- T08 Stage B identity resolution
- T09 Stage B.5 conflict detection
- T10 Stage C fact attribution
- T11 Stage D projection builder

### Wave 4: Review Surface

- T12 review APIs and mutations
- T13 persona x chapter matrix UI
- T14 relation editor UI
- T16 audit history and evidence panel

### Wave 5: Scale, Time, And Cutover

- T15 persona x time matrix UI
- T19 incremental rerun and cost controls
- T21 gold-set regression
- T20 cutover read paths

### Wave 6: Final Acceptance

- T22 end-to-end acceptance

## Task Status

- [x] T00: `docs/superpowers/tasks/2026-04-18-evidence-review/00-umbrella.md`
- [x] T01: `docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md`
- [x] T02: `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`
- [x] T03: `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`
- [x] T04: `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`
- [x] T17: `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`
- [x] T05: `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`
- [x] T06: `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
- [x] T07: `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
- [x] T18: `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
- [x] T08: `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`
- [x] T09: `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`
- [x] T10: `docs/superpowers/tasks/2026-04-18-evidence-review/10-stage-c-fact-attribution.md`
- [x] T11: `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`
- [x] T12: `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`
- [x] T13: `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`
- [x] T14: `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`
- [x] T16: `docs/superpowers/tasks/2026-04-18-evidence-review/16-audit-history-evidence-panel.md`
- [x] T15: `docs/superpowers/tasks/2026-04-18-evidence-review/15-persona-time-matrix-ui.md`
- [x] T19: `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`
- [x] T21: `docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md`
- [ ] T20: `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
- [ ] T22: `docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`

## Default Validation Commands

Run the task-specific commands first. Use these as global gates when the task changes shared contracts, schema, routes, or UI:

```bash
pnpm prisma:generate
pnpm lint
pnpm type-check
pnpm test
```

If a command is unavailable or fails due to unrelated pre-existing issues, capture the exact command, failure summary, and why it is outside the current task.

## Completion Record

Append one entry after each task:

```markdown
### TXX Completion - YYYY-MM-DD

- Changed files:
- Validation commands:
- Result:
- Follow-up risks:
- Next task:
```

### T00 Completion - 2026-04-18

- Changed files: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`, `docs/superpowers/tasks/2026-04-18-evidence-review/00-umbrella.md`
- Validation commands: `test -f docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md && test -f docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`, task-order verification script, `rg -n "Trellis as the execution controller|active execution source|use Trellis as" docs/superpowers/plans docs/superpowers/tasks/2026-04-18-evidence-review`, `git branch --show-current`, runbook section grep, task count check
- Result: runbook and task pack are internally consistent, all 23 task docs exist, execution order matches the agreed sequence, and Superpowers is the only execution controller
- Follow-up risks: task documents are still unexecuted; T01 is the first schema-changing task and may expose codebase-specific integration gaps
- Next task: T01 `docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md`

### T01 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`, `src/generated/prisma/**`, `src/server/modules/review/evidence-review/review-state.ts`, `src/server/modules/review/evidence-review/review-state.test.ts`, `src/server/modules/analysis/claims/base-types.ts`, `src/server/modules/analysis/claims/base-types.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm prisma format --schema prisma/schema.prisma`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma migrate diff --from-schema /tmp/evidence_review_schema_foundation_baseline.prisma --to-schema prisma/schema.prisma --script --output prisma/migrations/20260418120000_evidence_review_schema_foundation/migration.sql`, destructive SQL grep, `pnpm prisma:generate`, `pnpm test src/server/modules/review/evidence-review/review-state.test.ts`, `pnpm test src/server/modules/analysis/claims/base-types.test.ts`, `pnpm type-check`
- Result: additive evidence-review foundation is in place, `relationTypeKey` remains a string field, and no legacy truth table was repurposed as the new review truth source.
- Follow-up risks: the new tables are intentionally relation-light until the write path lands in T02-T04, so later tasks must keep repository joins explicit; migration SQL was generated from the HEAD schema baseline because current Prisma CLI requires shadow database configuration for `--from-migrations`.
- Next task: T02 `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`

### T02 Completion - 2026-04-19

- Changed files: `src/server/modules/analysis/evidence/offset-map.ts`, `src/server/modules/analysis/evidence/offset-map.test.ts`, `src/server/modules/analysis/evidence/evidence-spans.ts`, `src/server/modules/analysis/evidence/evidence-spans.test.ts`, `src/server/modules/analysis/evidence/quote-reconstruction.ts`, `src/server/modules/analysis/evidence/quote-reconstruction.test.ts`, `src/server/modules/analysis/evidence/index.ts`, `src/server/modules/analysis/evidence/index.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/02-text-evidence-layer.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm test src/server/modules/analysis/evidence`, `pnpm type-check`
- Result: original-text-first evidence helpers are in place for offset lookup, span validation, quote reconstruction, jump metadata, and persistence access without introducing UI-specific logic into the server module.
- Follow-up risks: idempotent single-span writes still rely on read-before-create natural-key checks because `EvidenceSpan` has no schema-level unique constraint yet; later claim write paths must remain tolerant of duplicate historical spans until that constraint is explicitly approved.
- Next task: T03 `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`

### T03 Completion - 2026-04-19

- Changed files: `src/server/modules/analysis/claims/claim-schemas.ts`, `src/server/modules/analysis/claims/claim-schemas.test.ts`, `src/server/modules/analysis/claims/claim-repository.ts`, `src/server/modules/analysis/claims/claim-repository.test.ts`, `src/server/modules/analysis/claims/claim-write-service.ts`, `src/server/modules/analysis/claims/claim-write-service.test.ts`, `src/server/modules/analysis/claims/manual-override.ts`, `src/server/modules/analysis/claims/manual-override.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm test src/server/modules/analysis/claims/claim-schemas.test.ts`, `pnpm test src/server/modules/analysis/claims/claim-repository.test.ts`, `pnpm test src/server/modules/analysis/claims/claim-schemas.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts`, `pnpm test src/server/modules/analysis/claims/claim-schemas.test.ts src/server/modules/analysis/claims/manual-override.test.ts`, `pnpm test src/server/modules/analysis/claims`, `pnpm type-check`
- Result: claim validation, stage-aware rerun replacement, reviewable claim updates, and manual override lineage now flow through one shared contract layer before any later stage or review API touches the claim tables.
- Follow-up risks: stage ownership remains encoded in repository/service logic rather than schema constraints, so later extraction and review tasks must keep using this contract layer or idempotent reruns and manual supersede semantics can drift.
- Next task: T04 `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`

### T04 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419090000_analysis_run_observability_metrics/migration.sql`, `prisma/migrations/20260419143000_analysis_runs_active_job_identity_unique/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/runs/run-service.ts`, `src/server/modules/analysis/runs/run-service.test.ts`, `src/server/modules/analysis/runs/stage-run-service.ts`, `src/server/modules/analysis/runs/stage-run-service.test.ts`, `src/server/modules/analysis/runs/retry-planner.ts`, `src/server/modules/analysis/runs/retry-planner.test.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.ts`, `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm test src/server/modules/analysis/runs` (pass), `pnpm test src/server/modules/analysis/jobs/runAnalysisJob.test.ts` (34 tests passed, command failed on global coverage threshold), `pnpm exec vitest run src/server/modules/analysis/jobs/runAnalysisJob.test.ts --coverage.enabled=false` (pass), `pnpm prisma validate --schema prisma/schema.prisma` (pass), `pnpm prisma:generate` (pass), `pnpm type-check` (pass)
- Result: run observability contracts are available before Stage 0/A/A+/B/B.5/C/D implement fine-grained extraction writes, and job-level cancellation now preserves the expected terminal semantics when later chapter failures cascade.
- Follow-up risks: cost is token-first and nullable until model pricing is wired in T19; raw output security and retention policy may need tightening before production retention is enabled; repository-level `pnpm test` coverage gates currently make single-file job test commands fail even when assertions pass.
- Next task: T17 `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`

### T17 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419183000_knowledge_v2_foundation/migration.sql`, `src/generated/prisma/**`, `src/server/modules/knowledge-v2/base-types.ts`, `src/server/modules/knowledge-v2/base-types.test.ts`, `src/server/modules/knowledge-v2/payload-schemas.ts`, `src/server/modules/knowledge-v2/payload-schemas.test.ts`, `src/server/modules/knowledge-v2/repository.ts`, `src/server/modules/knowledge-v2/repository.test.ts`, `src/server/modules/knowledge-v2/runtime-loader.ts`, `src/server/modules/knowledge-v2/runtime-loader.test.ts`, `src/server/modules/knowledge-v2/promotion.ts`, `src/server/modules/knowledge-v2/promotion.test.ts`, `src/server/modules/knowledge-v2/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/knowledge-v2/runtime-loader.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/knowledge-v2/promotion.test.ts --coverage=false`, `pnpm test src/server/modules/knowledge-v2`, `pnpm exec eslint src/server/modules/knowledge-v2`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm type-check`
- Result: KB v2 now has one unified knowledge object, shared scope/review/source/version contracts, negative knowledge payloads, runtime loading semantics, and a reviewed-claim promotion foundation without cutting over legacy knowledge callers.
- Follow-up risks: runtime integration into Stage A+ is still pending T07; relation catalog governance/UI is still pending T18/T12/T14; old split knowledge tables still exist until T20 cutover.
- Next task: T05 `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`

### T05 Completion - 2026-04-19

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260419210000_stage0_chapter_segment_confidence/migration.sql`, `src/generated/prisma/**`, `src/server/modules/analysis/pipelines/evidence-review/stage0/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm prisma format --schema prisma/schema.prisma`, `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm test src/server/modules/analysis/pipelines/evidence-review/stage0` (19 Stage 0 assertions passed, command failed on global coverage thresholds), `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0 --coverage=false`, `pnpm type-check`
- Result: Stage 0 deterministic segmentation is available as the persisted evidence-review input layer for Stage A.
- Follow-up risks: Stage A must consume `chapter_segments` directly and preserve evidence offsets; relation/persona extraction remains out of scope until T06+.
- Next task: T06 `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`

### T06 Completion - 2026-04-19

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stage0/repository.ts`, `src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/types.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stage0/persisted-reader.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts --coverage=false`, `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.ts src/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline.test.ts src/server/modules/analysis/pipelines/evidence-review/stageA/index.ts`, `pnpm type-check`
- Result: Stage A extraction now consumes persisted Stage 0 segments, keeps raw output observability, materializes evidence-backed claims conservatively, and supports chapter-level rerun-safe persistence.
- Follow-up risks: Stage A+ recall and relation catalog governance are still pending T07/T18; long-chapter token pressure is still managed only by one-chapter prompts until T19 cost-control work lands.
- Next task: T07 `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`

### T07 Completion - 2026-04-20

- Changed files: `src/server/modules/analysis/claims/claim-repository.ts`, `src/server/modules/analysis/claims/claim-repository.test.ts`, `src/server/modules/analysis/claims/claim-write-service.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageAPlus --coverage=false`, `pnpm exec vitest run src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/claim-write-service.test.ts --coverage=false`, `pnpm type-check`, `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageAPlus src/server/modules/analysis/claims/claim-repository.ts`
- Result: Stage A+ rule and KB v2 recall now enrich each chapter with review-native `RULE` mention, alias, and derived relation claims while preserving original relation labels, surfacing negative knowledge explicitly, and recording cost-free rule execution through Stage Run observability.
- Follow-up risks: T18 still owns relation catalog governance and review-facing relation type management; T19 still owns skip/rerun policy; T08 still needs to consume Stage A+ mention and alias hints during identity resolution.
- Next task: T18 `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`

### T18 Completion - 2026-04-20

- Changed files: `src/server/modules/knowledge-v2/relation-types/**`, `src/server/modules/knowledge-v2/index.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/contracts.test.ts src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts src/server/modules/knowledge-v2/relation-types/catalog.test.ts src/server/modules/knowledge-v2/relation-types/loader.test.ts src/server/modules/knowledge-v2/relation-types/promotion.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts --coverage=false`, `pnpm type-check`, `git diff --exit-code -- prisma/schema.prisma prisma/migrations`
- Result: relation types are now governed by a KB v2 backed catalog that supports presets, custom relation promotion, synonym lookup, disabled suppression, and Stage A+ reuse without introducing a closed enum.
- Follow-up risks: review APIs and relation editor CRUD/UI still land in T12/T14; historical relation claims still keep raw labels and need review-side governance before projection.
- Next task: T08 `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`

### T08 Completion - 2026-04-20

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stageB/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageB --coverage=false`, `pnpm exec tsc --noEmit --pretty false --incremental false`, `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB/index.ts`
- Result: Stage B now deterministically resolves whole-book identity candidates from Stage A mentions and Stage A+ alias signals, persists review-native `persona_candidates` plus `IDENTITY_RESOLUTION` claims, preserves explicit split/unsure semantics for blocked merges, and records a cost-free Stage B run for observability.
- Follow-up risks: T09 still needs to turn Stage B conflict semantics into explicit cross-claim consistency flags; Stage C and projection layers still need to consume `persona_candidates` rather than legacy persona tables.
- Next task: T09 `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`

### T09 Completion - 2026-04-20

- Changed files: `prisma/schema.prisma`, `src/server/modules/analysis/claims/**`, `src/server/modules/analysis/pipelines/evidence-review/stageB5/**`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/**`, `src/server/modules/knowledge-v2/relation-types/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/claims/claim-schemas.test.ts src/server/modules/analysis/claims/claim-repository.test.ts src/server/modules/analysis/claims/manual-override.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/types.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/repository.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/persister.test.ts src/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector.test.ts --coverage=false`, `pnpm type-check`, `pnpm lint`, `pnpm exec vitest run --coverage=false`
- Result: Stage B.5 now deterministically detects whole-book conflict hot spots across identity, event, relation, time, location, and low-evidence claims, then persists additive `CONFLICT_FLAG` rows without mutating upstream review truth.
- Follow-up risks: Stage C still needs to consume `CONFLICT_FLAG` rows as attribution and ranking signals; review APIs and UI still need conflict-facing filters and mutation flows in T12/T13/T14.
- Next task: T10 `docs/superpowers/tasks/2026-04-18-evidence-review/10-stage-c-fact-attribution.md`

### T10 Completion - 2026-04-20

- Changed files: `src/server/modules/analysis/pipelines/evidence-review/stageC/**`, `docs/superpowers/plans/2026-04-20-t10-stage-c-fact-attribution-implementation-plan.md`, `docs/superpowers/tasks/2026-04-18-evidence-review/10-stage-c-fact-attribution.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking.test.ts src/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/repository.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/persister.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/stageC --coverage=false`, `pnpm test src/server/modules/analysis/pipelines/evidence-review/stageC`, `pnpm type-check`
- Result: Stage C fact attribution is implemented as a deterministic rule-engine stage that reads root facts plus persona candidates and conflict flags, preserves attribution alternatives as derived reviewable event/relation claims, keeps `timeHintId` links on derived facts, and records cost-free stage-run/raw-output observability.
- Follow-up risks: `pnpm test src/server/modules/analysis/pipelines/evidence-review/stageC` passed all 13 assertions but failed global coverage because imported shared modules (`claims`, `runs`, `db`) are included in coverage accounting; standalone time-person attribution is intentionally represented through derived facts because `TimeClaim` has no persona candidate field; T11 must treat derived Stage C rows as reviewable inputs, not final graph truth.
- Next task: T11 `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`

### T11 Completion - 2026-04-20

- Changed files: `docs/superpowers/plans/2026-04-20-t11-stage-d-projection-builder-implementation-plan.md`, `src/server/modules/review/evidence-review/projections/types.ts`, `src/server/modules/review/evidence-review/projections/projection-builder.ts`, `src/server/modules/review/evidence-review/projections/persona-chapter.ts`, `src/server/modules/review/evidence-review/projections/persona-time.ts`, `src/server/modules/review/evidence-review/projections/relationships.ts`, `src/server/modules/review/evidence-review/projections/index.ts`, `src/server/modules/review/evidence-review/projections/projection-builder.test.ts`, `src/server/modules/review/evidence-review/projections/persona-chapter.test.ts`, `src/server/modules/review/evidence-review/projections/persona-time.test.ts`, `src/server/modules/review/evidence-review/projections/relationships.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/review/evidence-review/projections --coverage=false`, `pnpm type-check`, `pnpm test src/server/modules/review/evidence-review/projections`, `pnpm exec eslint src/server/modules/review/evidence-review/projections/types.ts src/server/modules/review/evidence-review/projections/projection-builder.ts src/server/modules/review/evidence-review/projections/projection-builder.test.ts src/server/modules/review/evidence-review/projections/index.ts src/server/modules/review/evidence-review/projections/persona-chapter.ts src/server/modules/review/evidence-review/projections/persona-chapter.test.ts src/server/modules/review/evidence-review/projections/persona-time.ts src/server/modules/review/evidence-review/projections/persona-time.test.ts src/server/modules/review/evidence-review/projections/relationships.ts src/server/modules/review/evidence-review/projections/relationships.test.ts`
- Result: Stage D projection read models can now be deterministically rebuilt from accepted claims plus review state, including book/chapter/persona/time-slice/relation-edge scoped rebuilds and projection-only refreshes.
- Follow-up risks: focused `pnpm test src/server/modules/review/evidence-review/projections` still fails repository-wide coverage thresholds even though all 21 assertions pass; T12 must keep projections read-only and route review mutations back through claim/review-state APIs instead of treating projection rows as editable truth.
- Next task: T12 `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`

### T12 Completion - 2026-04-21

- Changed files: `prisma/schema.prisma`, `prisma/migrations/20260421103000_review_action_defer/migration.sql`, `src/generated/prisma/**`, `src/server/modules/auth/constants.ts`, `src/server/modules/auth/token.ts`, `src/server/modules/auth/index.ts`, `src/server/modules/auth/edge-token.ts`, `middleware.ts`, `src/app/api/auth/login/route.ts`, `src/server/modules/review/evidence-review/review-api-schemas.ts`, `src/server/modules/review/evidence-review/review-audit-service.ts`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-mutation-service.ts`, `src/app/api/admin/review/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`, `docs/superpowers/plans/2026-04-21-t12-review-api-mutations-implementation-plan.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm prisma validate --schema prisma/schema.prisma`, `pnpm prisma:generate`, `pnpm exec vitest run src/server/modules/auth/token.test.ts src/server/modules/auth/index.test.ts src/middleware.test.ts src/app/api/auth/login/route.test.ts src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-audit-service.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/server/modules/review/evidence-review/review-mutation-service.test.ts src/app/api/admin/review/claims/route.test.ts src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts src/app/api/admin/review/personas/merge/route.test.ts src/app/api/admin/review/personas/split/route.test.ts --coverage=false`, `pnpm lint`, `pnpm type-check`
- Result: T12 now provides claim-first admin review list/detail routes, manual override and relink flows, persona merge/split review mutations, audit-log persistence, admin actor attribution, and affected-scope projection rebuild orchestration. Validation passed across Prisma, Vitest, lint, and type-check.
- Follow-up risks: T13-T16 must reuse the normalized DTOs and avoid bypassing these mutation routes; T12 commit is intentionally deferred until you explicitly request it.
- Next task: T13 `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`

### T13 Completion - 2026-04-22

- Changed files: `docs/superpowers/plans/2026-04-21-t13-persona-chapter-matrix-ui-implementation-plan.md`, `src/server/modules/review/evidence-review/review-api-schemas.ts`, `src/server/modules/review/evidence-review/review-api-schemas.test.ts`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-query-service.test.ts`, `src/app/api/admin/review/persona-chapter-matrix/**`, `src/lib/services/review-matrix.ts`, `src/lib/services/review-matrix.test.ts`, `src/app/admin/review/[bookId]/page.tsx`, `src/app/admin/review/[bookId]/page.test.tsx`, `src/components/review/shared/**`, `src/components/review/persona-chapter-matrix/**`, `src/components/review/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`, and `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-chapter-matrix/route.test.ts src/lib/services/review-matrix.test.ts src/components/review/shared/review-state-badge.test.tsx src/components/review/shared/temporary-evidence-audit-panel.test.tsx src/components/review/persona-chapter-matrix src/app/admin/review/\[bookId\]/page.test.tsx --coverage=false`, `pnpm test src/app/admin/review` (3 assertions passed; command failed only on global coverage thresholds), `pnpm exec vitest run src/app/admin/review/\[bookId\]/page.test.tsx --coverage=false`, `pnpm type-check`, `pnpm lint`
- Result: `/admin/review/[bookId]` now renders the persona x chapter matrix as the primary review entry, keeps matrix summaries and drill-down flows on T11/T12 DTOs, supports evidence/AI basis inspection plus defer/edit/manual-create actions, and covers the 50 x 100 usability path with local windowing tests.
- Follow-up risks: `matrix-grid.tsx` still relies on local DOM windowing that should be observed under larger real-book datasets; `temporary-evidence-audit-panel` is still a temporary adapter that T16 must replace; `pnpm test src/app/admin/review` remains blocked by repository-wide coverage thresholds even though T13 assertions pass.
- Next task: T14 `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`

### T14 Completion - 2026-04-22

- Changed files: `docs/superpowers/plans/2026-04-22-t14-relation-editor-ui-implementation-plan.md`, `src/server/modules/review/evidence-review/review-api-schemas.ts`, `src/server/modules/review/evidence-review/review-api-schemas.test.ts`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-query-service.test.ts`, `src/app/api/admin/review/relations/**`, `src/lib/services/relation-editor.ts`, `src/lib/services/relation-editor.test.ts`, `src/app/admin/review/[bookId]/page.tsx`, `src/app/admin/review/[bookId]/page.test.tsx`, `src/app/admin/review/[bookId]/relations/**`, `src/components/review/relation-editor/**`, `src/components/review/shared/review-mode-nav.tsx`, `src/components/review/shared/review-mode-nav.test.tsx`, `src/components/review/persona-chapter-matrix/manual-claim-form.tsx`, `src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx`, `src/components/review/persona-chapter-matrix/claim-action-panel.tsx`, `src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx`, `src/components/review/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`, and `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/relations/route.test.ts src/lib/services/relation-editor.test.ts src/components/review/relation-editor/relation-draft.test.ts src/components/review/relation-editor/relation-pair-list.test.tsx src/components/review/relation-editor/relation-claim-list.test.tsx src/components/review/relation-editor/relation-warning-banner.test.tsx src/components/review/relation-editor/relation-claim-sheet.test.tsx src/components/review/relation-editor/relation-editor-page.test.tsx src/components/review/shared/review-mode-nav.test.tsx src/app/admin/review/\[bookId\]/page.test.tsx src/app/admin/review/\[bookId\]/relations/page.test.tsx src/components/review/persona-chapter-matrix/manual-claim-form.test.tsx src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx --coverage=false`, `pnpm exec eslint src/server/modules/review/evidence-review/review-api-schemas.ts src/server/modules/review/evidence-review/review-query-service.ts src/app/api/admin/review/relations/route.ts src/lib/services/relation-editor.ts src/components/review/relation-editor src/components/review/shared/review-mode-nav.tsx src/app/admin/review/\[bookId\]/page.tsx src/app/admin/review/\[bookId\]/relations/page.tsx src/components/review/persona-chapter-matrix/manual-claim-form.tsx src/components/review/persona-chapter-matrix/claim-action-panel.tsx`, `pnpm type-check`, `git diff -- prisma/schema.prisma prisma/migrations`
- Result: `/admin/review/[bookId]/relations` now provides a lightweight claim-first relation review surface with pair summaries, lazy claim detail loading, preset plus custom relation editing, direction/interval warnings, original extracted relation text visibility, and reuse of the existing T12 mutation/detail APIs.
- Follow-up risks: relation detail still uses `TemporaryEvidenceAuditPanel` until T16 replaces the temporary shared audit/evidence surface; richer persona x time review semantics remain in T15; git commit is intentionally left to the user in this execution flow.
- Next task: T16 `docs/superpowers/tasks/2026-04-18-evidence-review/16-audit-history-evidence-panel.md`

### T16 Completion - 2026-04-22

- Changed files: `docs/superpowers/plans/2026-04-22-t16-audit-history-evidence-panel-implementation-plan.md`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-query-service.test.ts`, `src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts`, `src/lib/services/review-matrix.ts`, `src/lib/services/review-matrix.test.ts`, `src/lib/services/relation-editor.ts`, `src/lib/services/relation-editor.test.ts`, `src/components/review/evidence-panel/**`, `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.tsx`, `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx`, `src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx`, `src/components/review/relation-editor/relation-claim-sheet.tsx`, `src/components/review/relation-editor/relation-claim-sheet.test.tsx`, `src/components/review/relation-editor/relation-editor-page.test.tsx`, `src/components/review/index.ts`, `src/components/review/shared/temporary-evidence-audit-panel.tsx`, `src/components/review/shared/temporary-evidence-audit-panel.test.tsx`, `docs/superpowers/tasks/2026-04-18-evidence-review/16-audit-history-evidence-panel.md`, and `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm vitest run src/server/modules/review/evidence-review/review-query-service.test.ts src/lib/services/review-matrix.test.ts src/lib/services/relation-editor.test.ts 'src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts' src/components/review/evidence-panel/review-evidence-list.test.tsx src/components/review/evidence-panel/review-ai-basis-card.test.tsx src/components/review/evidence-panel/review-audit-timeline.test.tsx src/components/review/evidence-panel/review-claim-diff-card.test.tsx src/components/review/evidence-panel/review-claim-detail-panel.test.tsx src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx src/components/review/persona-chapter-matrix/claim-action-panel.test.tsx src/components/review/relation-editor/relation-claim-sheet.test.tsx src/components/review/relation-editor/relation-editor-page.test.tsx --coverage=false --reporter=verbose`, `pnpm type-check`, `pnpm lint`, `rg -n "TemporaryEvidenceAuditPanel" src/components/review`, `git diff --name-only -- prisma src/server/db`
- Result: T16 replaced the temporary evidence adapter with one shared claim detail panel that renders typed evidence, AI basis, audit history, and reviewer-friendly diffs across both the persona-chapter matrix and relation editor while keeping the T12 detail/mutation APIs unchanged.
- Carry-over closure: T15 owns the remaining shared-panel adoption work for the persona-time matrix and adds one real `RelationClaimSheet -> ReviewClaimDetailPanel` wiring integration test while keeping the lighter mock-focused suite; these are planned T15 closure items, not T16 defects. No commit was created in this execution pass.
- Next task: T15 `docs/superpowers/tasks/2026-04-18-evidence-review/15-persona-time-matrix-ui.md`

### T15 Completion - 2026-04-23

- Changed files: `docs/superpowers/plans/2026-04-22-t15-persona-time-matrix-ui-implementation-plan.md`, `src/server/modules/review/evidence-review/review-api-schemas.ts`, `src/server/modules/review/evidence-review/review-api-schemas.test.ts`, `src/server/modules/review/evidence-review/review-query-service.ts`, `src/server/modules/review/evidence-review/review-query-service.test.ts`, `src/app/api/admin/review/persona-time-matrix/route.ts`, `src/app/api/admin/review/persona-time-matrix/route.test.ts`, `src/lib/services/review-time-matrix.ts`, `src/lib/services/review-time-matrix.test.ts`, `src/components/review/shared/review-mode-nav.tsx`, `src/components/review/shared/review-mode-nav.test.tsx`, `src/app/admin/review/[bookId]/time/page.tsx`, `src/app/admin/review/[bookId]/time/page.test.tsx`, `src/components/review/persona-time-matrix/**`, `src/app/admin/review/[bookId]/page.tsx`, `src/app/admin/review/[bookId]/page.test.tsx`, `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx`, `src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx`, `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.tsx`, `src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx`, `src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx`, `src/components/review/index.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/15-persona-time-matrix-ui.md`, and `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts src/server/modules/review/evidence-review/review-query-service.test.ts src/app/api/admin/review/persona-time-matrix/route.test.ts src/lib/services/review-time-matrix.test.ts src/components/review/shared/review-mode-nav.test.tsx 'src/app/admin/review/[bookId]/time/page.test.tsx' src/components/review/persona-time-matrix/time-axis.test.ts src/components/review/persona-time-matrix/time-toolbar.test.tsx src/components/review/persona-time-matrix/persona-time-review-page.test.tsx src/components/review/persona-time-matrix/time-cell-claim-list.test.tsx src/components/review/persona-time-matrix/time-cell-drilldown-sheet.test.tsx src/components/review/persona-time-matrix/time-claim-action-panel.test.tsx src/components/review/relation-editor/relation-claim-sheet.integration.test.tsx 'src/app/admin/review/[bookId]/page.test.tsx' src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx src/components/review/persona-chapter-matrix/cell-drilldown-sheet.test.tsx --coverage=false`, `pnpm type-check`, `pnpm lint`, `git diff --name-only -- prisma src/server/db`, `rg -n "TemporaryEvidenceAuditPanel" src/components/review`
- Result: `/admin/review/[bookId]/time` now provides a claim-first `人物 x 时间` review surface with six stable time-axis groups, reviewer-facing filter/jump controls, raw plus normalized time preservation, shared evidence/audit detail rendering, T12-backed time normalization edits, and URL-backed chapter/time deep links in both directions.
- Follow-up risks: none at the T15 task boundary; remaining roadmap work continues in T19/T21/T20/T22.
- Next task: T19 `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`

### T19 Completion - 2026-04-23

- Changed files: `docs/superpowers/plans/2026-04-23-t19-incremental-rerun-cost-controls-implementation-plan.md`, `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/**`, `src/server/modules/review/evidence-review/costs/**`, `src/app/api/admin/review/_cost-controls.ts`, `src/app/api/admin/review/rerun-plan/route.ts`, `src/app/api/admin/review/rerun-plan/route.test.ts`, `src/app/api/admin/review/cost-summary/route.ts`, `src/app/api/admin/review/cost-summary/route.test.ts`, `src/app/api/admin/review/cost-comparison/route.ts`, `src/app/api/admin/review/cost-comparison/route.test.ts`, `scripts/review-regression/compare-rerun-costs.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`, and `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec eslint src/server/modules/analysis/pipelines/evidence-review/rerun-planner src/server/modules/review/evidence-review/costs src/app/api/admin/review/_cost-controls.ts src/app/api/admin/review/rerun-plan/route.ts src/app/api/admin/review/rerun-plan/route.test.ts src/app/api/admin/review/cost-summary/route.ts src/app/api/admin/review/cost-summary/route.test.ts src/app/api/admin/review/cost-comparison/route.ts src/app/api/admin/review/cost-comparison/route.test.ts scripts/review-regression/compare-rerun-costs.ts`, `pnpm exec vitest run src/server/modules/analysis/pipelines/evidence-review/rerun-planner src/server/modules/review/evidence-review/costs src/app/api/admin/review/rerun-plan/route.test.ts src/app/api/admin/review/cost-summary/route.test.ts src/app/api/admin/review/cost-comparison/route.test.ts --coverage=false`, `pnpm type-check`, `pnpm lint`, `pnpm exec ts-node --esm scripts/review-regression/compare-rerun-costs.ts --help`, `git diff --name-only -- prisma src/server/db src/app/api/admin/analysis-jobs`
- Result: T19 adds an evidence-review-specific incremental rerun planner with explainable stage/range output, keeps review mutations on projection-only local rebuilds, derives review-native run cost summaries and baseline-vs-rerun comparisons from T04 observability, serializes bigint cost fields for admin routes, and ships a regression CLI while leaving the legacy retry planner and `/api/admin/analysis-jobs/**` cost surface unchanged.
- Follow-up risks: none at the T19 task boundary; remaining roadmap work continues in T21/T20/T22.
- Next task: T21 `docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md`

### T21 Completion - 2026-04-24

- Changed files: `src/server/modules/review/evidence-review/regression/**`, `scripts/review-regression/run-gold-set-regression.ts`, `scripts/review-regression/run-gold-set-regression.test.ts`, `tests/fixtures/review-regression/rulin-waishi.fixture.json`, `tests/fixtures/review-regression/sanguo-yanyi.fixture.json`, `docs/superpowers/reports/review-regression/rulin-waishi-sample/**`, `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md`, `docs/superpowers/plans/2026-04-23-t21-gold-set-regression-implementation-plan.md`, and `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/review/evidence-review/regression/contracts.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/review/evidence-review/regression/contracts.test.ts src/server/modules/review/evidence-review/regression/fixture-loader.test.ts src/server/modules/review/evidence-review/regression/review-action-harness.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/review/evidence-review/regression/snapshot-repository.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/review/evidence-review/regression/fixture-loader.test.ts --coverage=false`, `pnpm exec vitest run src/server/modules/review/evidence-review/regression scripts/review-regression/run-gold-set-regression.test.ts --coverage=false`, `pnpm type-check`, `pnpm exec eslint src/server/modules/review/evidence-review/regression scripts/review-regression/run-gold-set-regression.ts prisma/seed.ts`, `pnpm prisma:seed`, `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample`, `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/sanguo-yanyi.fixture.json --report-dir docs/superpowers/reports/review-regression/sanguo-yanyi-sample`
- Result: the gold-set regression package, fixtures, CLI, and citation-ready sample reports are all green; both `儒林外史` and `三国演义` baselines now report 100% metrics with no missing, unexpected, or changed natural keys.
- Follow-up risks: none at the T21 task boundary.
- Next task: T20 `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
