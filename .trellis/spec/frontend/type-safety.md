# Type Safety

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/type-safety.md
> Mirror: .trellis/spec/frontend/type-safety.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> Type safety patterns in this project.

---

## Overview

The project uses TypeScript strict mode and explicit interfaces for component
props, payload contracts, and parsed external data.

---

## Type Organization

- Shared contracts live in `src/types`.
  - Domain payloads: `src/types/analysis.ts`
  - API response contracts: `src/types/api.ts`
- Component-local prop types stay next to components.

Examples:
- `AnalysisActionState` in `src/server/actions/analysis.ts`
- `ButtonProps` in `src/components/ui/Button.tsx`

---

## Runtime Validation

Use type guards and normalization for untrusted payloads.

Example:
- `parseChapterAnalysisResponse` in `src/types/analysis.ts` validates and
  normalizes AI JSON output before usage.

For request body parsing, validate unknown input before passing into services.

Example:
- `POST` handler in `src/app/api/analyze/route.ts`

---

## Common Patterns

- `as const` literal arrays to build narrow union types.
- Dedicated `isRecord` / predicate guards for unknown values.
- Generic response wrappers for API success/error unions.

Examples:
- `BIO_CATEGORY_VALUES as const` in `src/types/analysis.ts`
- `ApiResponse<T>` in `src/types/api.ts`

---

## Forbidden Patterns

- `any` in component props and shared contracts.
- Blind assertion from unknown input without checks.
- Returning inconsistent payload shapes from API/action handlers.
