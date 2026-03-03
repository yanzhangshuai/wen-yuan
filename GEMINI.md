# Wen Yuan Gemini Rules

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: GEMINI.md
> Mirror: GEMINI.zh.md
> Last synced: 2026-03-03
> Sync owner: codex

## Required Commands

- Start with `/trellis:start`.
- For medium/large work use Spec-Kit commands in order:
  `/speckit.specify`, `/speckit.clarify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`.
- After `/speckit.tasks`, run task confirmation gate before implementation:
  `python3 ./.trellis/scripts/task.py flow-confirm` and wait for explicit approval.
- For `flow-feature`, run docs gate before finish/archive:
  `python3 ./.trellis/scripts/task.py flow-guard` should pass.
- After implementation/check, explicitly ask whether to run `$record-session` (do not skip this prompt).

## Flow Shorthand

- `ff+n: <requirement>` = flow-feature with new branch
- `ff=c: <requirement>` = flow-feature on current branch
- `ff: <requirement>` = ask branch choice first
- `fl+n` / `fl=c` / `fl` = flow-lite with same branch-choice rules
- `fb+n` / `fb=c` / `fb` = flow-bug with same branch-choice rules
- Use conversational confirmation by default:
  - after task breakdown, ask user to confirm (`执行`) or request edits (`修改...`)
  - continue only after explicit confirmation.
- Task edit input supports:
  - Natural language: `修改：...`
  - Structured edits: `+` add / `-` remove / `~` rewrite / `>` reorder / `!` reopen
  - Command for structured edits:
    `python3 ./.trellis/scripts/task.py flow-edit-tasks "<ops>"`
- For `ff+n`, if generated short branch name is invalid/empty, ask user for a
  kebab-case short name before branch creation.
  You can use:
  `bash .trellis/scripts/flow_feature_create.sh "<requirement>" [short-name]`

## Implementation Constraints

- API/Action response payload must use unified schema:
  `success/code/message/data|error/meta`.
- Reuse `src/types/api.ts` and `src/server/http/api-response.ts`.
- Multi-table writes must use Prisma transactions.
- Keep strict TypeScript boundaries; avoid `any` in business logic.
- Do not edit generated files in `src/generated/prisma/**`.

## Team Style

- Prefer Chinese JSDoc template for backend/service exports:
  `功能 / 输入 / 输出 / 异常 / 副作用`.
- React components should prefer readable control flow; avoid ternary in JSX
  whenever possible.
- Naming should be concise and readable across frontend/backend.

## Frontend Rules

- Prefer early return, boolean guards, and helper render functions over ternary
  rendering.
- Do not use nested ternary operators in components.
- If a ternary must be used, keep it single-level and short.

## Naming Rules

- Keep names short but clear; avoid vague names (`a`, `tmp`, `data2`).
- Use consistent domain terms across UI, actions, API, and service layers.
- Do not use unnecessary abbreviations that hurt readability.

## Comment and Reproducibility Rules

- Generated code must include detailed comments/JSDoc for intent, I/O
  constraints, error handling, and side effects.
- Non-trivial logic should be annotated enough for another engineer to
  reproduce behavior and debug quickly.
