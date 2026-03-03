# Spec-Kit + Trellis One-Page Decision Tree

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/guides/spec-kit-trellis-quick-decision.md
> Mirror: .trellis/spec/guides/spec-kit-trellis-quick-decision.zh.md
> Last synced: 2026-03-03
> Sync owner: codex

> Purpose: decide the correct workflow path in one minute.

## Quick Decision

```text
[Start]
  |
  v
Is this a tiny low-risk change (<5 minutes)?
  |-- Yes --> flow-lite
  |           /trellis:start
  |           /speckit.implement
  |           $finish-work
  |           Ask whether to run $record-session -> run only after user confirms
  |
  |-- No --> Any of these true?
              - multi-file or cross-layer changes
              - API/Action/DB contract changes
              - unclear requirements or acceptance
                |
                |-- Yes --> flow-feature (default)
                |           /trellis:start
                |           choose strategy:
                |           A) Speed Strategy (default)
                |              fast_init -> flow-confirm --compact -> implement
                |              essential checks: success/failure/boundary -> flow-guard --verify -> finish
                |           B) Strict Strategy
                |              full_init -> specify/clarify/plan/tasks
                |              flow-confirm -> implement -> check-phase -> flow-guard --verify -> finish
                |           [upgrade rule] if ambiguity/contract change/high risk -> switch to Strict
                |
                |-- No --> flow-bug (known issue fix)
                            /trellis:start
                            /speckit.specify -> /clarify -> /tasks
                            (recommended) task.py flow-confirm
                            /speckit.implement
                            /trellis:break-loop
                            $finish-work
                            Ask whether to run $record-session -> run only after user confirms
```

## Trigger Shortcuts

- `ff-fast+n: <requirement>`: Speed Strategy + new branch
- `ff-fast=c: <requirement>`: Speed Strategy + current branch
- `ff-full+n: <requirement>`: Strict Strategy + new branch
- `ff-full=c: <requirement>`: Strict Strategy + current branch
- `ff-fast: <requirement>`: force Speed Strategy (essential checks only)
- `ff-full: <requirement>`: force Strict Strategy (completeness + full checks)
- `ff+n: <requirement>`: flow-feature + new branch
- `ff=c: <requirement>`: flow-feature + current branch
- `ff: <requirement>`: ask branch choice first
- `fl+n` / `fl=c` / `fl`: flow-lite with same branch-choice rule
- `fb+n` / `fb=c` / `fb`: flow-bug with same branch-choice rule

> For `+n`, short branch names are auto-generated with deterministic fallback (`feature-<hash>`).

## Task Edit Inputs

- Natural language: `修改：...` (recommended)
- Structured ops: `+ / - / ~ / > / !`
- Command: `python3 ./.trellis/scripts/task.py flow-edit-tasks "<ops>"`

## Required Checkpoints

- Unified response shape: `success/code/message/data|error/meta`
- Stable machine-readable error `code`
- At least one success / one failure / one boundary validation
- For flow-feature, `confirm.md` must exist and `Confirmed: YES`
- Always ask before `$record-session`

## Command Templates (Two-Step Input Default)

### Speed Strategy (default)

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# Wait for: Execute / Modify ...
/speckit.implement
# Essential checks: success + failure + boundary
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# Ask first, then run:
$record-session
```

### Strict Strategy

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
# Full checks (including check-phase)
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

Compatibility input (not default): `"<requirement> || <tech-stack>"`.
