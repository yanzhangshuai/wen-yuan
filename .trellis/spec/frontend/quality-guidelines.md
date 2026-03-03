# Quality Guidelines

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/quality-guidelines.md
> Mirror: .trellis/spec/frontend/quality-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> Code quality standards for frontend development.

---

## Overview

Frontend quality means predictable rendering boundaries, consistent UI
primitives, and clear error/loading feedback.

---

## Forbidden Patterns

- Adding `"use client"` to full pages when only leaf widgets need interactivity.
- Duplicating design primitives instead of reusing `components/ui`.
- Silent failure states in async actions.
- Importing generated backend files into client components.

---

## Required Patterns

- Keep Server Components as the default route layer.
- Use typed props/interfaces for every shared component.
- Include dark mode class pairing for new UI blocks.
- Prefer semantic HTML (`main`, `header`, `table`, etc.).
- Separate local UI state, server data state, and form/action state to avoid
  mixed responsibilities.
- Keep naming concise but readable; avoid both unclear short names (`a`, `tmp`)
  and overly long names without disambiguation value.
- Add intent-focused comments for non-trivial UI state transitions, async
  interaction flows, and edge-case handling.
- For list-heavy screens, ensure stable `key` usage and prefer
  pagination/virtualization when dataset size can grow.

---

## Testing and Validation Requirements

Current baseline before handoff:
1. Run `pnpm lint`.
2. Manually check key flows changed by UI work.
3. Verify both light and dark mode display for modified components.
4. Verify loading and error message paths for action-triggered operations.
5. Validate one success path, one failure path, and one boundary case for the
   changed behavior.

---

## Code Review Checklist

- Are server/client boundaries minimal and intentional?
- Are prop types explicit and narrow?
- Are className condition branches readable and maintainable?
- Is empty/loading/error state present where needed?
- Do imports follow project aliases (`@/...`) consistently?
- Are names concise, readable, and consistent with backend/domain terms?
- Are complex blocks commented clearly enough for quick debugging?
- Is state ownership split clearly (UI vs server data vs form/action)?
- Do list render paths avoid unstable keys and obvious over-render risks?
- Are long/deeply nested render/control blocks split into readable helpers?

---

## Real References

- Server/client split: `src/app/(admin)/analyze/page.tsx` and
  `src/app/(admin)/analyze/AnalyzeButton.tsx`
- UI primitive reuse: `src/components/ui/*`
- Theme-safe rendering: `src/components/ThemeToggle.tsx`
