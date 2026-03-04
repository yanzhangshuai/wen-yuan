# OpenSpec + Trellis Playbook

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/guides/openspec-trellis-playbook.md
> Mirror: .trellis/spec/guides/openspec-trellis-playbook.zh.md
> Last synced: 2026-03-04
> Sync owner: codex

## Goal
Use OpenSpec for business/feature specifications, while Trellis provides technical/code standards and execution gates.

## Speed Strategy
```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# wait for explicit approval
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

## Strict Strategy
```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
# complete proposal/design/tasks/spec-delta under openspec/changes/<change>
python3 ./.trellis/scripts/task.py flow-confirm
# wait for explicit approval
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

## Required OpenSpec Files
- `proposal.md`
- `design.md`
- `tasks.md`
- `spec-delta.md`

## Upgrade Rule
If ambiguity, cross-layer contract changes, or high delivery risk appear:
```bash
bash .trellis/scripts/flow_feature_upgrade_docs_openspec.sh [task-dir]
```

## Workspace Rule
- Business/feature specs: `openspec/specs/` (domain, features, constraints)
- Feature changes: `openspec/changes/*`
- Technical/code standards: `.trellis/spec/` (frontend, backend, guides)
