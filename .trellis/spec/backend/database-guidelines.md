# Database Guidelines

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/database-guidelines.md
> Mirror: .trellis/spec/backend/database-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## Current Stack

- Primary ORM: Prisma (`src/server/db/prisma.ts`)
- Generated client/models: `src/generated/prisma/**` (read-only)

## Required Patterns

- Multi-entity writes must use `prisma.$transaction(...)`.
- Idempotent re-run flow should clear stale draft rows before insert.
- Large write batches should prefer `createMany` and dedupe keys in memory first.

## Existing References

- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## Anti-Patterns

- Editing `src/generated/prisma/**` manually.
- Partial writes across related tables without transaction boundaries.
