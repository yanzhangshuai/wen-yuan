# Component Guidelines

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/component-guidelines.md
> Mirror: .trellis/spec/frontend/component-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> How components are built in this project.

---

## Overview

Components follow a simple split:
- Server Components for read-heavy pages.
- Client Components only when hooks/browser events are needed.
- Reusable UI primitives in `components/ui` with typed props.

---

## Component Structure

Standard order:
1. Directive (`"use client"`) when needed.
2. External imports.
3. Internal imports.
4. Props type/interface.
5. Constants.
6. Component implementation.

Examples:
- Client component with hooks: `src/components/ThemeToggle.tsx`
- Server page component: `src/app/(admin)/analyze/page.tsx`
- UI primitive: `src/components/ui/Button.tsx`

---

## Props Conventions

- Every component props type must be declared ahead of usage and named
  `<ComponentName>Props` (for example `ButtonProps`, `AnalyzeButtonProps`).
- Use explicit interfaces or type aliases, extending native HTML props when
  appropriate.
- Keep props small and focused.
- Use discriminated unions for variant-like props.

Examples:
- HTML prop extension: `ButtonProps` in `src/components/ui/Button.tsx`
- Small focused props: `AnalyzeButtonProps` in `src/app/(admin)/analyze/AnalyzeButton.tsx`
- Variant union: `variant?: "outline" | "ghost"` in `src/components/ui/Button.tsx`

---

## Reuse and Split Strategy

- Prioritize reusable, composable components when logic or styling is shared
  across 2+ places.
- Avoid over-splitting into tiny components with weak semantic meaning.
- Split a component only when one of these is true:
  - There is a clear domain boundary.
  - It is reused.
  - It improves testability/readability significantly.
- Keep one component responsible for one coherent UI concern.

---

## Readability and JSX Rules

- Prefer early returns, named booleans, and helper render functions.
- Avoid ternary operators in JSX whenever possible.
- Nested ternary operators are forbidden.
- If ternary is unavoidable, keep it single-level and very short.

---

## Performance Baseline

- Keep render trees stable: avoid recreating expensive objects/functions
  unnecessarily in hot render paths.
- Memoize only when profiling or clear render churn justifies it; readability
  comes first.
- Prefer moving heavy computation to server layer or dedicated hooks/utilities.

---

## Styling Patterns

- Tailwind utility classes are the default.
- Dark mode classes are paired with light mode classes in same element.
- Conditional classes use template literals with clear boolean branches.

Examples:
- Theme-aware layout shell: `src/app/layout.tsx`
- Active/inactive nav styles: `src/components/layout/Navbar.tsx`
- State-dependent button style: `src/app/(admin)/analyze/AnalyzeButton.tsx`

---

## Accessibility

- Interactive icons must have text alternative (`aria-label` or visible text).
- Buttons should define `type` explicitly.
- Keep semantic structure (`main`, `header`, table elements) for screen readers.

Examples:
- Labeled icon button: `src/components/ThemeToggle.tsx`
- Explicit button type: `src/components/ui/Button.tsx`
- Semantic table markup: `src/components/ui/Table.tsx`

---

## Common Mistakes to Avoid

- Marking large route trees as client components when only one child needs hooks.
- Duplicating utility style logic instead of reusing `components/ui` primitives.
- Passing untyped `any` props into shared components.
