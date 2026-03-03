# Hook Guidelines

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/hook-guidelines.md
> Mirror: .trellis/spec/frontend/hook-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> How hooks are used in this project.

---

## Overview

Current codebase has no shared custom hooks yet. Built-in hooks are used inside
small client components.

Default rule: prefer Server Components first, then introduce client hooks only
for browser interactivity.

---

## Current Hook Usage Patterns

- Routing state hook in nav: `usePathname` in `src/components/layout/Navbar.tsx`
- Theme state hook: `useTheme` in `src/components/ThemeToggle.tsx`
- Mount guard with `useEffect` + `useState`: `src/components/ThemeToggle.tsx`
- Server action hook: `useActionState` in `src/app/(admin)/analyze/AnalyzeButton.tsx`

---

## When to Create a Custom Hook

Create `useXxx` only when logic is reused by 2 or more components and includes
state/effects, not just pure formatting.

Suggested location when introduced:
- Feature-specific hooks: `src/features/<feature>/hooks/`
- Generic hooks: `src/components/hooks/` or `src/lib/hooks/` (choose one and keep consistent)

---

## Data Fetching Guidance

- Prefer server-side data fetching in `page.tsx` and pass data down as props.
- Use hooks for mutation/status handling in client components.
- Keep network contract parsing in server/action layer, not directly in UI hooks.

Examples:
- Server fetch with Prisma: `src/app/(admin)/analyze/page.tsx`
- Client mutation state: `src/app/(admin)/analyze/AnalyzeButton.tsx`

---

## Naming Conventions

- Custom hooks must start with `use`.
- Hook names should describe domain action/state (`useAnalyzeChapter`, not `useData`).
- Keep hook return values typed and stable.

---

## Common Mistakes to Avoid

- Calling hooks conditionally.
- Pushing server-only logic into client hooks.
- Creating one-off custom hooks for single component usage without reuse value.
