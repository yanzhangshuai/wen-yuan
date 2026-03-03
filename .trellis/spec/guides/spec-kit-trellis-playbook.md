# Spec-Kit + Trellis Playbook (Concise)

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/guides/spec-kit-trellis-playbook.md
> Mirror: .trellis/spec/guides/spec-kit-trellis-playbook.zh.md
> Last synced: 2026-03-03
> Sync owner: codex

> Goal: speed first, quality controlled.  
> Principle: use Speed Strategy by default; auto-upgrade to Strict Strategy on risk.

## 1) Two Strategies

### Speed Strategy (default)
Use when requirements are clear, risk is low, and rollback is easy.

Command templates:

```text
ff-fast+n: <requirement>   # Speed Strategy + new branch
ff-fast=c: <requirement>   # Speed Strategy + current branch
```

Execution steps:

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# Wait for: Execute / Modify ...
/speckit.implement
# Essential checks: success + failure + boundary
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

### Strict Strategy (prove completeness)
Use when contracts change across layers, risk is high, or requirements are unclear.

Command templates:

```text
ff-full+n: <requirement>   # Strict Strategy + new branch
ff-full=c: <requirement>   # Strict Strategy + current branch
```

Execution steps:

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
# Wait for: Execute / Modify ...
/speckit.implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

Compatibility input (not default): `"<requirement> || <tech-stack>"` is still supported.

## 2) Upgrade Rule (Fast -> Full)

Upgrade is mandatory when any condition appears:

- Requirement or acceptance criteria is ambiguous
- API/Action/DB signature, payload, or env contract changes
- Delivery risk increases (high impact, hard rollback, uncertain dependency)

Upgrade command template:

```text
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
```

## 3) Without Predefined Triggers (Manual Mode)

You can run commands directly without `ff-fast` / `ff-full`:

- Manual Speed Strategy: `init --strategy fast -> flow-confirm --compact -> implement -> essential checks -> flow-guard --verify`
- Manual Strict Strategy: `init --strategy strict -> specify/clarify/plan/tasks -> flow-confirm -> implement -> flow-guard --verify`

## 4) Minimum Gates

- `flow-confirm` before implementation
- `flow-guard --verify` before finishing flow-feature
- Explicitly ask whether to run `$record-session` before ending
