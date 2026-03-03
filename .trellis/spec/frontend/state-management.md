# State Management

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/state-management.md
> Mirror: .trellis/spec/frontend/state-management.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> How state is managed in this project.

---

## Overview

State is intentionally lightweight:
- Server state resolved in Server Components.
- Local UI state handled with React hooks in client components.
- Mutation status handled with `useActionState` for Server Actions.
- Global client state standard: use **Zustand** when global store is required.

---

## State Categories

### Local UI state

- `mounted` flag in `src/components/ThemeToggle.tsx`
- Pending/feedback state from `useActionState` in
  `src/app/(admin)/analyze/AnalyzeButton.tsx`

### Server state

- Chapter list loaded in `src/app/(admin)/analyze/page.tsx`
- Home static content rendered in `src/app/page.tsx`

### Theme state

- Provided globally by `src/providers/ThemeProvider.tsx`
- Consumed via `useTheme` in `src/components/ThemeToggle.tsx`

---

## When to Use Global State

Introduce dedicated global state only if all conditions are true:
1. Shared by many distant client components.
2. Cannot be handled cleanly through props/context.
3. Updates are frequent enough to justify central store complexity.

If global state is needed, use Zustand as the default store solution.

---

## Store Standard (Zustand)

### Why Zustand

- Small API surface, low boilerplate, and good readability for React teams.
- Fine-grained selector subscriptions help avoid unnecessary rerenders.
- Works well with Next.js App Router when limited to client global UI state.

### Dependency

- Install when first store use is introduced: `pnpm add zustand`.
- Use project template: `.trellis/spec/frontend/zustand-store-template.md`.

### Scope Rules

- Zustand store is for **client global UI/app state only**.
- Do not use Zustand to replace server data fetching or caching concerns.
- Server-owned data should stay in Server Components / Server Actions first.

### Store Shape Rules

- Prefer feature-scoped stores over one giant app store.
- Store state should be flat and explicit; avoid deep nested mutable structures.
- Actions must be named by domain intent (`setFilters`, `openPanel`,
  `resetSelection`) and keep side effects predictable.
- Export typed selectors/hooks to minimize rerenders and improve readability.

### Forbidden Patterns

- Putting raw server entity lists as long-lived global cache in Zustand.
- Triggering network/database side effects directly inside random UI handlers
  without explicit action boundaries.
- Reading whole store objects in components when a small selector is enough.

---

## Server State Rules

- Read in server route/page when possible.
- Mutate through Server Actions or API routes.
- Revalidate relevant path after successful mutation (`revalidatePath`).

Example:
- `startChapterAnalysis` in `src/server/actions/analysis.ts` calls
  `revalidatePath("/analyze")`.

---

## Common Mistakes to Avoid

- Mirroring server data into local state without need.
- Using global store for one-page local interactions.
- Missing loading/error display for long-running action state.
- Using a single monolithic store for unrelated feature domains.
