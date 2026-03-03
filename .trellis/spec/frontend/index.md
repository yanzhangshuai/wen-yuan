# Frontend Development Guidelines

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/index.md
> Mirror: .trellis/spec/frontend/index.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> Best practices for frontend development in this project.

---

## Overview

This directory documents how frontend code is currently implemented in Wen Yuan
(Next.js App Router + React + Tailwind CSS).

Use these files as executable rules for new frontend work.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Ready |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Ready |
| [Hook Guidelines](./hook-guidelines.md) | Client hooks and shared hook conventions | Ready |
| [State Management](./state-management.md) | Local state, server state, action state | Ready |
| [Zustand Store Template](./zustand-store-template.md) | Standard store directory, naming, selector, action patterns | Ready |
| [Quality Guidelines](./quality-guidelines.md) | Code standards and review checklist | Ready |
| [Type Safety](./type-safety.md) | Type patterns and runtime guards | Ready |

---

## Scope

- Covers files under `src/app`, `src/components`, `src/features`, and
  `src/providers`.
- Backend-only standards are documented in `.trellis/spec/backend`.

---

**Language**: Write guideline docs in English.
