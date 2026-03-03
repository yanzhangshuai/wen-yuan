<!--
Sync Impact Report
- Version change: 1.3.0 -> 1.4.0
- Modified principles:
  - I. Spec-First Delivery (upgraded to dual-strategy policy)
- Added sections:
  - Strategy Upgrade Rule (Delivery Workflow)
- Added principles: None
- Removed sections: None
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check remains compatible)
  - ✅ .specify/templates/spec-template.md (compatible, no schema change)
  - ✅ .specify/templates/tasks-template.md (compatible, no schema change)
- Deferred TODOs: None
-->

# Wen Yuan Constitution

## Core Principles

### I. Spec-First Delivery
All non-trivial changes MUST choose one of two compliant strategies before implementation:
- **Speed Strategy (default)**: minimal viable Spec-Kit path focused on delivery speed.
  Mandatory gates: `flow-confirm` + explicit evidence for success/failure/boundary checks.
- **Strict Strategy**: full Spec-Kit path
  (`/speckit.specify` -> `/speckit.clarify` (if needed) -> `/speckit.plan` -> `/speckit.tasks`)
  with `flow-confirm` and `flow-guard` before finish/archive.
Direct coding without spec artifacts is only allowed for trivial fixes
(typo/comment/single-line no-contract change).

### II. Contract-Driven Interfaces
API Route and Server Action outputs MUST use unified response shape:
`success`, `code`, `message`, `data|error`, `meta`.
Error paths MUST provide stable machine-readable `code` values and MUST NOT rely
on message text alone for control logic.
Implementations MUST reuse shared types in `src/types/api.ts` and helpers in
`src/server/http/api-response.ts`.

### III. Type-Safe Boundaries
Cross-layer payloads and service contracts MUST be explicit TypeScript types.
`any` and unsafe double assertions are prohibited in business logic.
Generated artifacts (e.g. `src/generated/prisma/**`) MUST NOT be manually edited.

### VI. Reusable, Readable Frontend Components
Frontend React components MUST prioritize reuse, readability, and practical
runtime performance.
Server Components are the default boundary; Client Components are introduced
only for true interactivity/browser dependencies.
Components MUST avoid over-splitting; extract only with clear domain boundary,
reuse value, or major readability gains.
All props types MUST be declared before component implementation and named
`<ComponentName>Props`.
JSX ternary operators SHOULD be avoided in favor of early returns, guard blocks,
or helper render functions; nested ternaries are prohibited.
List-heavy rendering MUST use stable keys and SHOULD prefer
pagination/virtualization when data can scale.

### VII. Concise and Consistent Naming
All frontend and backend naming MUST be concise and readable.
Names MUST stay consistent across layers for the same domain concept and avoid
vague placeholders (`a`, `tmp`, `data2`) in business logic.

### VIII. Reproducible Documentation
Generated code MUST include structured comments/JSDoc for intent, I/O
constraints, error handling, and side effects so behavior can be reproduced and
debugged by another engineer.
High-complexity logic MUST include detailed comments for business intent, key
constraints, edge cases, and failure branches.
Oversized or deeply nested functions MUST be refactored into named helpers to
preserve readability.

### IX. Layered State and Verification Baseline
Frontend state ownership MUST be explicit across UI local state, server data
state, and form/action state instead of overloading one model.
When global client state is needed, Zustand is the default store choice; stores
MUST remain feature-scoped and MUST NOT become long-lived caches for
server-owned data.
Changes MUST be validated with at least one success path, one failure path, and
one boundary/edge case (tests or equivalent explicit verification evidence).

### IV. Data Integrity First
Database writes that update multiple related entities MUST be wrapped in Prisma
transactions. Retry, idempotency, and cleanup logic MUST be explicit for AI or
batch workflows.

### V. Traceable, Team-Readable Code
Core backend/services MUST use team JSDoc template in Chinese:
`功能/输入/输出/异常/副作用`.
Non-trivial flows (AI calls, retries, transactions) MUST include concise logs or
comments to support debugging.

## Tech Constraints

- Runtime: Next.js App Router + TypeScript strict mode.
- Data: Prisma (PostgreSQL) as primary persistence; Neo4j allowed for graph use
  cases via dedicated modules.
- Generated code under `src/generated/` is read-only and refreshed by tooling.
- All new env dependencies MUST be documented before merge.

## Delivery Workflow

- Start each session with Trellis start flow and read relevant `.trellis/spec/*`
  guidelines before coding.
- Default to **Speed Strategy** unless upgrade conditions are hit.
- Strategy Upgrade Rule: implementation MUST switch to **Strict Strategy** when
  any of the following occurs: requirement ambiguity, cross-layer contract/API/DB
  change, or elevated risk (security/data integrity/high blast radius).
- For cross-layer changes, run cross-layer review before completion.
- Quality gate before handoff: lint pass + targeted runtime validation.
- AI should not commit automatically; human confirms final commit.

## Governance

This constitution overrides informal conventions. In conflicts, this document is
source of truth for implementation constraints.

Amendment policy:
1. Propose change with rationale and impacted templates.
2. Update this file and related templates in same change.
3. Record version bump using semantic rules below.

Versioning policy:
- MAJOR: remove or redefine a core principle.
- MINOR: add a new principle/mandatory gate.
- PATCH: wording clarifications without behavior change.

Compliance review:
- During planning: validate plan against all principles.
- During implementation review: verify contracts, transactions, and type safety.

**Version**: 1.4.0 | **Ratified**: 2026-03-03 | **Last Amended**: 2026-03-03
