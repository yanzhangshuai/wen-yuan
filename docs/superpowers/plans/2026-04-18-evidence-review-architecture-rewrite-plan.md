# Evidence-first Review Architecture Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy classical-literature parsing and review stack with an evidence-first architecture built around evidence spans, atomic claims, human review control, and projection-driven read models, then cut the admin review experience over to that new truth model.

**Architecture:** The rewrite uses a strict four-layer split: `Text & Evidence Layer -> Candidate Claim Layer -> Review Control Layer -> Projection Layer`. Parsing runs through Stage `0 / A / A+ / B / B.5 / C / D`, every AI or rule output must bind to evidence, manual review never overwrites original claims, and all review pages read from projection tables rebuilt from claims plus review state.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Prisma 7 with PostgreSQL, existing AI provider abstraction, Vitest, route/integration tests

---

## Contract Source

- Primary spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- This plan maps one-to-one to `.trellis/tasks/04-18-evidence-review-00-umbrella` through `.trellis/tasks/04-18-evidence-review-22-e2e-acceptance`
- No backward-compatibility contract is required for legacy `Profile / BiographyRecord / Relationship` truth paths

## File Structure

- Modify: `prisma/schema.prisma`
  Purpose: define the new evidence, claim, review, projection, and KB v2 schema
- Create: `src/server/modules/analysis/pipelines/evidence-review/`
  Purpose: host Stage 0/A/A+/B/B.5/C/D pipeline services and shared contracts
- Create: `src/server/modules/analysis/evidence/`
  Purpose: centralize offsets, spans, quote reconstruction, and evidence persistence
- Create: `src/server/modules/analysis/claims/`
  Purpose: unify claim DTOs, validation, storage contracts, and idempotent write helpers
- Create: `src/server/modules/review/evidence-review/`
  Purpose: expose review queries, mutations, projection rebuild orchestration, and audit history services
- Modify/Create: `src/app/api/admin/review/`
  Purpose: replace legacy draft-review APIs with claim-centric review APIs
- Modify/Create: `src/app/admin/review/` and `src/components/review/`
  Purpose: deliver persona-chapter matrix, relation editor, time matrix, and evidence/audit side panels
- Create: `src/server/modules/knowledge-v2/` or equivalent unified knowledge module
  Purpose: implement KB v2 scope model, review state, promotion flow, and relation type catalog
- Create: `scripts/review-regression/`
  Purpose: run gold-set and acceptance validation against `儒林外史` and `三国演义`

## Execution Order

### Wave 1: Core Contracts

- [ ] `00` umbrella governance and success bar
- [ ] `01` schema and review state foundation
- [ ] `02` text and evidence layer
- [ ] `03` claim storage contracts
- [ ] `04` run observability and retry
- [ ] `17` KB v2 foundation

### Wave 2: Extraction Write Path

- [ ] `05` Stage 0 segmentation
- [ ] `06` Stage A extraction
- [ ] `07` Stage A+ knowledge recall
- [ ] `18` relation types catalog

### Wave 3: Resolution And Projection

- [ ] `08` Stage B identity resolution
- [ ] `09` Stage B.5 conflict detection
- [ ] `10` Stage C fact attribution
- [ ] `11` Stage D projection builder

### Wave 4: Review Surface

- [ ] `12` review APIs and mutations
- [ ] `13` persona x chapter matrix UI
- [ ] `14` relation editor UI
- [ ] `16` audit history and evidence panel

### Wave 5: Scale, Time, And Cutover

- [ ] `15` persona x time matrix UI
- [ ] `19` incremental rerun and cost controls
- [ ] `20` cut over read paths and retire legacy truth usage
- [ ] `21` gold-set regression

### Wave 6: Final Acceptance

- [ ] `22` end-to-end acceptance and launch checklist

## Task Map

### T00-T04 Foundation

- [ ] `T00` `04-18-evidence-review-00-umbrella`
  Outcome: one owner task with final acceptance criteria across evidence, review, projection, KB, and cutover.
- [ ] `T01` `04-18-evidence-review-01-schema-and-state-foundation`
  Outcome: unified schema and status machine for claims, review, audit, and projection tables.
- [ ] `T02` `04-18-evidence-review-02-text-evidence-layer`
  Outcome: stable offset, segment, and evidence span infrastructure with quote reconstruction for UI and APIs.
- [ ] `T03` `04-18-evidence-review-03-claim-storage-contracts`
  Outcome: claim DTOs, schema validation, idempotent writes, manual override model, and relation key rules.
- [ ] `T04` `04-18-evidence-review-04-run-observability-retry`
  Outcome: per-stage run logs, raw output retention, retry boundaries, and failure isolation.

### T05-T11 Parsing And Projection

- [ ] `T05` `04-18-evidence-review-05-stage-0-segmentation`
  Outcome: chapter segmentation and narrative region labeling persisted into evidence tables.
- [ ] `T06` `04-18-evidence-review-06-stage-a-extraction`
  Outcome: conservative per-chapter extraction of mentions, events, relations, and time claims.
- [ ] `T07` `04-18-evidence-review-07-stage-a-plus-knowledge-recall`
  Outcome: rule/knowledge-assisted recall and normalization suggestions without bypassing review.
- [ ] `T08` `04-18-evidence-review-08-stage-b-identity-resolution`
  Outcome: full-book persona candidate clustering, alias handling, split/merge suggestions, impersonation modeling.
- [ ] `T09` `04-18-evidence-review-09-stage-b5-conflict-detection`
  Outcome: explicit conflict flags for post-mortem, location, alias, relation, and time inconsistencies.
- [ ] `T10` `04-18-evidence-review-10-stage-c-fact-attribution`
  Outcome: claims are attributed to resolved persona candidates with alternatives preserved when uncertain.
- [ ] `T11` `04-18-evidence-review-11-stage-d-projection-builder`
  Outcome: rebuildable projection tables for persona-chapter, persona-time, relationships, and timelines.

### T12-T16 Review And Audit

- [ ] `T12` `04-18-evidence-review-12-review-api-mutations`
  Outcome: claim-centric review API for accept/reject/edit/defer/manual-create/merge/split/relink.
- [ ] `T13` `04-18-evidence-review-13-persona-chapter-matrix-ui`
  Outcome: main review matrix for persona x chapter with cell drill-down and evidence-backed edits.
- [ ] `T14` `04-18-evidence-review-14-relation-editor-ui`
  Outcome: simple relation review surface with presets plus custom relation input and interval editing.
- [ ] `T15` `04-18-evidence-review-15-persona-time-matrix-ui`
  Outcome: persona x time review view for imprecise and relative time structures, especially `三国演义`.
- [ ] `T16` `04-18-evidence-review-16-audit-history-evidence-panel`
  Outcome: reusable side panel for raw evidence, AI basis, audit history, and change diffs.

### T17-T22 Knowledge, Scale, And Launch

- [ ] `T17` `04-18-evidence-review-17-kb-v2-foundation`
  Outcome: unified review-native knowledge model with scope, versioning, promotion, and negative knowledge.
- [ ] `T18` `04-18-evidence-review-18-relation-types-catalog`
  Outcome: relation type governance layer using string keys, preset seeds, synonym mapping, and promotion flow.
- [ ] `T19` `04-18-evidence-review-19-incremental-rerun-cost-controls`
  Outcome: dirty-set planning, stage skip rules, projection-only rebuild, and cost summary instrumentation.
- [ ] `T20` `04-18-evidence-review-20-cutover-read-paths`
  Outcome: admin read paths move to the new projection truth and legacy draft truth usage is retired.
- [ ] `T21` `04-18-evidence-review-21-gold-set-regression`
  Outcome: reproducible gold-set metrics and regression scripts for `儒林外史` and `三国演义` samples.
- [ ] `T22` `04-18-evidence-review-22-e2e-acceptance`
  Outcome: final acceptance report covering evidence loop, review loop, projection rebuild, cutover, and regression.

## Milestone Sequencing

### MVP

- [ ] Complete `T01-T14`, `T16`, `T17`, and the `儒林外史` subset of `T21`
- [ ] Parse one target book end-to-end through Stage `0/A/A+/B/B.5/C/D`
- [ ] Ship persona x chapter review and minimal relation editing
- [ ] Prove evidence traceability and projection rebuild on `儒林外史`

### Standard

- [ ] Complete `T15`, `T18`, `T19`, and expand `T21` to `三国演义`
- [ ] Ship persona x time review, richer relation taxonomy handling, and cost-aware reruns
- [ ] Validate dynamic relation changes and imprecise time review

### Complete

- [ ] Complete `T20` and `T22`
- [ ] Remove legacy truth read paths and legacy review entry points
- [ ] Close the `claim -> review -> projection -> knowledge promotion` loop for multi-book reuse

## Verification Gates

- [ ] `Evidence loop`: any accepted event, relation, or time fact can jump back to source chapter span
- [ ] `Review loop`: accept, reject, edit, defer, merge, split, and relink all write audit logs and rebuild only affected projections
- [ ] `Projection loop`: persona x chapter, persona x time, and relation editor never query legacy draft truth tables
- [ ] `Knowledge loop`: verified knowledge influences candidate generation and normalization but never bypasses review
- [ ] `Rebuild loop`: deleting projection tables and rebuilding from claims plus review state yields the same accepted truth

## Execution Notes

- [ ] Keep each implementation PR or session aligned to one Trellis task directory
- [ ] Avoid mixing write-path tasks with cutover tasks in the same PR until `T21` regression is green
- [ ] Do not delete old tables or routes before `T20` and `T22` confirm the new read path is stable
- [ ] Use `儒林外史` for MVP correctness and `三国演义` for time/relation standardization pressure tests
