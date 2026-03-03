# Backend Type Safety

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/type-safety.md
> Mirror: .trellis/spec/backend/type-safety.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## Required Patterns

- Define reusable contracts in `src/types/**`.
- Service interfaces and action return types must be explicit.
- Prefer discriminated union response types for success/error branches.

## Existing References

- `src/types/api.ts`
- `src/types/analysis.ts`
- `src/server/actions/analysis.ts`

## Forbidden Patterns

- `any` in business logic.
- Unsafe assertions like `as unknown as X` without guard/validation.
- Implicit `unknown` propagation from external payloads.
