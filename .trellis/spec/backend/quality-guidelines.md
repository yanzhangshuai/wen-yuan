# Backend Quality Guidelines

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/quality-guidelines.md
> Mirror: .trellis/spec/backend/quality-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## Pre-Handoff Checklist

- `pnpm lint` passes.
- Response contract remains consistent with `src/types/api.ts`.
- Error branches return stable machine-readable `code` values, not only text
  messages.
- Transaction boundaries are explicit for multi-table writes.
- Public service/action functions include team JSDoc template.
- Added/changed env contracts are documented.
- Naming is concise, readable, and consistent with frontend/domain terminology.
- Complex business logic includes enough comments to explain intent, constraints,
  error branches, and side effects.
- High-complexity functions are split into readable helpers instead of deep
  nesting/oversized single blocks.
- Validate at least one success path, one failure path, and one boundary case
  for changed backend behavior.

## Review Focus

- Cross-layer type drift (action -> service -> DB).
- Error path consistency (`code/message/error/meta`).
- Retry and failure behavior for AI/external integrations.
- Naming clarity and cross-layer term consistency.
- Comment quality on non-trivial branches and transaction flows.
- Function complexity and readability (length, nesting, helper extraction).
