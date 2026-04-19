# Evidence Review Superpowers TDD Execution Guide

> **For agentic workers:** REQUIRED SUB-SKILL by phase: planning uses `superpowers:writing-plans`, execution uses `superpowers:executing-plans`, and every production code change inside execution follows `superpowers:test-driven-development`.

**Goal:** Define the strict Superpowers-only operating model for the Evidence-first rewrite so planning, execution, validation, and task closure all happen in one consistent flow.

**Architecture:** Keep one stable architecture truth, one stable execution runbook, one stable task pack, and only one active task-level implementation plan at a time. Do not try to fully pre-script all 23 tasks in code-level detail up front, because T01-T04 will change the concrete file and contract landscape for later tasks.

**Tech Stack:** Superpowers skills, Next.js App Router, React 19, TypeScript strict, Prisma 7 with PostgreSQL, Vitest, local task-scoped verification

---

## Strict Source Of Truth Order

1. Architecture truth:
   `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
2. Execution order truth:
   `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
3. Task contract truth:
   `docs/superpowers/tasks/2026-04-18-evidence-review/*.md`
4. Active task implementation truth:
   one task-specific plan under `docs/superpowers/plans/`
5. Historical reference only:
   `.trellis/tasks/**`

## The Correct Planning Model

Do not use one giant code-level plan for the full rewrite as the live execution artifact.

Use two planning layers:

1. Stable planning layer:
   the architecture spec, the runbook, and the 00-22 task documents.
2. Rolling planning layer:
   one detailed implementation plan for the current task only, written immediately before executing that task.

Reason:

1. Later tasks depend on real schema, DTO, repository, and UI contracts created by earlier tasks.
2. If you fully script T12-T22 before T01-T04 land, the plan will drift and become false.
3. This rewrite is intentionally task-gated; task docs are stable, but code-level plans should be just-in-time.

## Required Skill Mapping

### Phase 1: Write Or Refresh The Current Task Plan

- Skill: `superpowers:writing-plans`
- Input source:
  - architecture spec
  - runbook
  - current task doc
  - current repository structure
- Output:
  - `docs/superpowers/plans/YYYY-MM-DD-tXX-<task-slug>-implementation-plan.md`

### Phase 2: Execute The Current Task

- Skill: `superpowers:executing-plans`
- Input source:
  - current task implementation plan
  - current task doc
  - upstream outputs already merged in repository
- Execution mode:
  - one checkbox step at a time
  - stop only on task stop conditions or validation blockers

### Phase 3: Enforce TDD Inside Execution

- Skill: `superpowers:test-driven-development`
- Rule:
  - no production code before a failing test exists and is observed failing

This is not a separate planning layer. It is the coding discipline inside each execution step.

## Standard Task Cycle

For every code task `T01` through `T22`, use this exact sequence:

1. Read the runbook and identify the first unchecked task.
2. Read that task document.
3. Read the spec sections referenced by that task.
4. Use `writing-plans` to generate or refresh the task-specific implementation plan.
5. Execute the implementation plan with `executing-plans`.
6. Inside execution, enforce TDD for every behavior change:
   - write one failing test
   - run the test and confirm expected failure
   - write the minimum production code
   - rerun the test and confirm pass
   - refactor only while green
7. Run task-scoped validation commands from the task doc.
8. Run broader validation if the task touched schema, shared contracts, routes, or UI.
9. Update the task doc `Execution Record`.
10. Mark the task complete in the runbook.
11. Stop and wait for the next `下一步`.

## TDD Rules For This Rewrite

Apply TDD at the smallest useful unit inside each task:

1. Schema/state tasks:
   write unit tests for transition helpers, repositories, validators, and contract utilities before implementation.
2. Pipeline tasks:
   write stage-level tests and fixture-based behavior tests before stage code.
3. API tasks:
   write handler or service tests before mutation/query code.
4. UI tasks:
   write component/page interaction tests before component behavior code.
5. Regression/acceptance tasks:
   write fixture parser and metric tests before runner/report code.

Never use TDD as a slogan. The minimum compliant cycle is:

1. red
2. verify red
3. green
4. verify green
5. refactor

## What To Create Up Front Versus Just In Time

Create up front once:

1. architecture spec
2. runbook
3. task pack `00-22`
4. this execution guide

Create just in time:

1. `T01` implementation plan before `T01`
2. `T02` implementation plan before `T02`
3. continue the same pattern through `T22`

Do not pre-create 23 code-level implementation plans unless you explicitly want a documentation-only exercise and accept that many later plans will need rewrite.

## Recommended File Naming

Use one implementation plan file per task:

- `docs/superpowers/plans/2026-04-18-t01-schema-and-state-foundation-implementation-plan.md`
- `docs/superpowers/plans/2026-04-18-t02-text-evidence-layer-implementation-plan.md`
- `docs/superpowers/plans/2026-04-18-t03-claim-storage-contracts-implementation-plan.md`
- continue the same naming pattern through `T22`

## Current Recommended Starting Point

Current task status says:

1. `T00` is complete.
2. The next live task is `T01`.

So the strict next move is not to start coding T01 directly.

The strict next move is:

1. generate the `T01` implementation plan with `writing-plans`
2. then execute that plan with `executing-plans`
3. while enforcing `test-driven-development`

## Exact Prompt Sequence

Use these prompts in order.

### Prompt A: Generate The Current Task Plan

```text
严格按照 docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md、
docs/superpowers/tasks/2026-04-18-evidence-review/01-schema-and-state-foundation.md、
docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md，
使用 writing-plans 技能，为 T01 编写可直接执行的 implementation plan。
要求严格 TDD，按一个小步骤一个 checkbox，输出到 docs/superpowers/plans/2026-04-18-t01-schema-and-state-foundation-implementation-plan.md。
```

### Prompt B: Execute The Current Task Plan

```text
严格按照 docs/superpowers/plans/2026-04-18-t01-schema-and-state-foundation-implementation-plan.md 执行 T01。
使用 executing-plans，整个过程严格 TDD，不允许先写生产代码再补测试。
完成后更新 T01 task doc 的 Execution Record，并在 runbook 里勾选 T01。
```

### Prompt C: Continue To The Next Task

```text
下一步
```

The runbook then determines the next unchecked task automatically.

## Decision Rule: Inline Versus Subagent

For this project, default recommendation is:

1. plan with `writing-plans`
2. execute inline with `executing-plans`

Use subagent-driven execution only if you explicitly want parallel workers and are willing to pay the coordination cost.

Reason:

1. T01-T04 change shared foundations and are poor candidates for uncontrolled parallelism.
2. A single inline executor better preserves contract continuity in early waves.
3. Parallelism becomes safer after core contracts stabilize.

## Stop Conditions That Must Interrupt Execution

Stop instead of pushing through when any of these happen:

1. a migration would delete or destructively rewrite existing data
2. the repository already contains an incompatible contract not covered by the current task
3. validation fails and the fix would spill into the next task boundary
4. the product needs a decision on review semantics, relation governance, or cutover
5. external data, credentials, or services are required but unavailable locally

## Completion Discipline

A task is complete only when all five are true:

1. task doc checkpoints are complete
2. task-scoped validation commands pass, or blockers are explicitly recorded
3. task doc `Execution Record` is updated
4. runbook task checkbox is updated
5. the agent stops and waits for the next task boundary

## Anti-Patterns

Do not do these:

1. write one giant all-task implementation plan and treat it as executable truth
2. skip the per-task implementation plan and code directly from the task doc
3. write production code before observing a failing test
4. continue to the next task without updating the current task doc and runbook
5. use `.trellis/tasks/**` as the live execution controller

## Bottom-Line Recommendation

If you want the strictest and least error-prone Superpowers workflow for this rewrite, follow this exact rhythm:

1. one stable runbook
2. one stable task pack
3. one active task plan
4. one task executed at a time
5. strict TDD inside the task
6. checkpoint update at task end

That is the operating model this rewrite should use.
