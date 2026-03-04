# Wen Yuan Gemini Rules

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: GEMINI.md
> Mirror: GEMINI.zh.md
> Last synced: 2026-03-04
> Sync owner: codex

## Required Workflow (OpenSpec + Trellis)

- Start each session with `/trellis:start`.
- For medium/large work, initialize flow-feature with OpenSpec docs:
  `bash .trellis/scripts/flow_feature_init.sh --strategy <fast|strict> "<requirement>" [task-dir]`.
- Before implementation, run confirmation gate:
  `python3 ./.trellis/scripts/task.py flow-confirm` and wait for explicit approval.
- Before finish/archive, run docs+verification gate:
  `python3 ./.trellis/scripts/task.py flow-guard --verify`.
- After implementation/check, ask whether to run `$record-session`.

## Flow Shorthand

- `ff+n` / `ff=c` / `ff` for flow-feature
- `ff-fast` / `ff-full` choose speed vs strict
- `fl+n` / `fl=c` / `fl` for flow-lite
- `fb+n` / `fb=c` / `fb` for flow-bug

## Core Constraints

- All new feature changes must be authored under `openspec/changes/*`.
- Business/feature specs in `openspec/specs/`, engineering standards in `.trellis/spec/`.
- API/Action responses must use: `success/code/message/data|error/meta`.
- Reuse `src/types/api.ts` and `src/server/http/api-response.ts`.
- Multi-table writes must use Prisma transactions.
- Keep strict TypeScript boundaries; avoid `any` in business logic.
- Do not edit generated files in `src/generated/prisma/**`.

## Verification Baseline

Every change should cover:
- one success path
- one failure path
- one boundary/edge path
