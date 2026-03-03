# Speed & Token Optimization Guide

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/guides/spec-kit-trellis-speed-token-optimization.md
> Mirror: .trellis/spec/guides/spec-kit-trellis-speed-token-optimization.zh.md
> Last synced: 2026-03-03
> Sync owner: codex

## 1) Prefer Speed Strategy First

- Default to Speed Strategy: `ff-fast+n` / `ff-fast=c`
- Run only essential checks: success / failure / boundary

## 2) Reduce Output Volume

Use compact confirmation for large task lists:

```bash
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
```

## 3) Enforce Context Budget

Per turn recommendation:

- At most 3 files
- At most 120 lines per file

Helper command:

```bash
bash .trellis/scripts/context_budget_read.sh --max-files 3 --max-lines 120 <file1> <file2> <file3>
```

## 4) Use Differential Init/Upgrade

- Fast init:

```bash
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
```

- Full init (when Strict Strategy is required):

```bash
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
```

Compatibility input (not default): `"<requirement> || <tech-stack>"`.

- Differential upgrade (append missing sections only):

```bash
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
```

## 5) When Strict Strategy Is Mandatory

Switch to Strict Strategy when any condition is true:

- Requirement ambiguity
- Cross-layer contract change (API/Action/DB signature, payload, env)
- High-risk change

Then use: `ff-full+n` / `ff-full=c`.
