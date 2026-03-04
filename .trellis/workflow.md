# Development Workflow

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/workflow.md
> Mirror: .trellis/workflow.zh.md
> Last synced: 2026-03-04
> Sync owner: codex

## Quick Start
1. `python3 ./.trellis/scripts/get_context.py`
2. Read indexes:
   - `.trellis/spec/frontend/index.md`
   - `.trellis/spec/backend/index.md`
   - `.trellis/spec/guides/index.md`
3. Select/create task:
   - `python3 ./.trellis/scripts/task.py list`
   - `python3 ./.trellis/scripts/task.py create "<title>" --slug <name>`

## Default Stack: OpenSpec + Trellis
- OpenSpec is the specification layer.
- Trellis is the execution and gate layer.

### OpenSpec Artifact Rule
For each flow-feature task, create:
- `openspec/changes/<change>/proposal.md`
- `openspec/changes/<change>/design.md`
- `openspec/changes/<change>/tasks.md`
- `openspec/changes/<change>/spec-delta.md`

## Flow-Feature (Speed)
```text
/trellis:start
bash .trellis/scripts/flow_feature_init_openspec.sh --strategy fast "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# wait for explicit user approval
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# ask whether to run $record-session
```

## Flow-Feature (Strict)
```text
/trellis:start
bash .trellis/scripts/flow_feature_init_openspec.sh --strategy strict "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
# complete proposal/design/tasks/spec-delta
python3 ./.trellis/scripts/task.py flow-confirm
# wait for explicit user approval
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# ask whether to run $record-session
```

## Upgrade Rule (mandatory)
Switch speed -> strict immediately when:
- requirement ambiguity appears
- cross-layer contracts change (API/Action/DB/env)
- delivery risk increases

Command:
```bash
bash .trellis/scripts/flow_feature_upgrade_docs_openspec.sh [task-dir]
```

## Gating Rules
- Before implementation: `flow-confirm`
- Before finish/archive: `flow-guard --verify`
- Verify at least success + failure + boundary

## Workspace Rule
- All new work must be authored under `openspec/changes/*`.
