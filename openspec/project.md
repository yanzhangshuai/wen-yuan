# Wen-Yuan OpenSpec Project Profile

## Product Scope
- MVP-first AI character analysis platform for Chinese classical novels.
- Start with 《儒林外史》 and expand to other novels.

## Engineering Priorities
1. Evidence-traceable AI conclusions.
2. Human review as final authority.
3. Low-cost, open-source friendly delivery.

## Quality Gates
- `python3 ./.trellis/scripts/task.py flow-confirm` approval before implementation.
- `python3 ./.trellis/scripts/task.py flow-guard --verify` before finish/archive.
- Every change records success/failure/boundary verification in `check.md`.

## Artifact Policy
- New feature changes MUST be authored under `openspec/changes/*`.
