# Directory Structure

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/directory-structure.md
> Mirror: .trellis/spec/frontend/directory-structure.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> How frontend code is organized in this project.

---

## Overview

The project uses App Router with clear layer boundaries:
- `app` for routes and route-local UI.
- `components` for reusable UI/layout building blocks.
- `features` for feature-level composition and re-export boundaries.
- `providers` for global React providers.
- `types` for shared frontend/backend-safe contracts.

---

## Directory Layout

```text
src/
|- app/
|  |- layout.tsx
|  |- page.tsx
|  |- globals.css
|  |- (admin)/analyze/
|  |  |- page.tsx
|  |  |- AnalyzeButton.tsx
|  \- api/analyze/route.ts
|- components/
|  |- layout/Navbar.tsx
|  |- ui/{Button,Card,Badge,Table}.tsx
|  |- ThemeToggle.tsx
|  \- system/ThemeToggle.tsx
|- features/
|  \- analyze/components/AnalyzeButton.tsx
|- providers/ThemeProvider.tsx
\- types/{analysis,api}.ts
```

---

## Module Organization Rules

1. Route entry files stay in `src/app/**/page.tsx` and default to Server
   Components.
2. Route-specific interactive pieces are colocated under the route folder first.
3. Shared primitives belong in `src/components/ui`.
4. If a route component must be imported outside `app`, add a re-export under
   `src/features/**`.

---

## Naming Conventions

- React component files: PascalCase (`AnalyzeButton.tsx`, `ThemeProvider.tsx`).
- Route files: Next.js convention (`page.tsx`, `layout.tsx`, `route.ts`).
- Utility/type files: lower kebab or concise noun (`analysis.ts`, `api.ts`).
- One exported component per file for `components/ui` and route action widgets.

---

## Real Examples

- Server route page with DB read: `src/app/(admin)/analyze/page.tsx`
- Reusable layout component: `src/components/layout/Navbar.tsx`
- Feature re-export boundary: `src/features/analyze/components/AnalyzeButton.tsx`
