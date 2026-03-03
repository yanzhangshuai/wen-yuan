# API Response Standard

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/api-response-standard.md
> Mirror: .trellis/spec/backend/api-response-standard.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## Canonical Shape

All API Routes and Server Actions should return a unified payload:

```ts
{
  success: boolean;
  code: string;
  message: string;
  data?: T;
  error?: { type: string; detail?: string };
  meta: {
    requestId: string;
    timestamp: string;
    path: string;
    durationMs?: number;
  };
}
```

## Required Implementation Pattern

1. Shared contracts in `src/types/api.ts`.
2. Shared builders in `src/server/http/api-response.ts`.
3. Avoid ad-hoc `NextResponse.json(...)` payload structures.
4. Use stable business `code` constants for success and failure paths.

## Existing References

- `src/types/api.ts`
- `src/server/http/api-response.ts`
- `scripts/scaffold-api.mjs` (template generation)

## Anti-Patterns

- Returning raw thrown error objects to clients.
- Mixing multiple response shapes in one module.
- Omitting `meta.requestId` for request tracing.
