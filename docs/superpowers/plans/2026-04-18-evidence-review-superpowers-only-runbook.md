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
- [ ] T03: `docs/superpowers/tasks/2026-04-18-evidence-review/03-claim-storage-contracts.md`
- [ ] T04: `docs/superpowers/tasks/2026-04-18-evidence-review/04-run-observability-retry.md`
- [ ] T17: `docs/superpowers/tasks/2026-04-18-evidence-review/17-kb-v2-foundation.md`
- [ ] T05: `docs/superpowers/tasks/2026-04-18-evidence-review/05-stage-0-segmentation.md`
- [ ] T06: `docs/superpowers/tasks/2026-04-18-evidence-review/06-stage-a-extraction.md`
- [ ] T07: `docs/superpowers/tasks/2026-04-18-evidence-review/07-stage-a-plus-knowledge-recall.md`
- [ ] T18: `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
- [ ] T08: `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`
- [ ] T09: `docs/superpowers/tasks/2026-04-18-evidence-review/09-stage-b5-conflict-detection.md`
- [ ] T10: `docs/superpowers/tasks/2026-04-18-evidence-review/10-stage-c-fact-attribution.md`
- [ ] T11: `docs/superpowers/tasks/2026-04-18-evidence-review/11-stage-d-projection-builder.md`
- [ ] T12: `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`
- [ ] T13: `docs/superpowers/tasks/2026-04-18-evidence-review/13-persona-chapter-matrix-ui.md`
- [ ] T14: `docs/superpowers/tasks/2026-04-18-evidence-review/14-relation-editor-ui.md`
- [ ] T16: `docs/superpowers/tasks/2026-04-18-evidence-review/16-audit-history-evidence-panel.md`
- [ ] T15: `docs/superpowers/tasks/2026-04-18-evidence-review/15-persona-time-matrix-ui.md`
- [ ] T19: `docs/superpowers/tasks/2026-04-18-evidence-review/19-incremental-rerun-cost-controls.md`
- [ ] T21: `docs/superpowers/tasks/2026-04-18-evidence-review/21-gold-set-regression.md`
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
