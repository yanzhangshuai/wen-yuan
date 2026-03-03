<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: AGENTS.md
> Mirror: AGENTS.zh.md
> Last synced: 2026-03-03
> Sync owner: codex

## Project Rules (Codex & Gemini)

### Mandatory Workflow

1. Start session with `/trellis:start` before development.
2. Non-trivial tasks use a dual-strategy model:
   - Strict Strategy (prove completeness): `/speckit.specify` -> `/speckit.clarify` -> `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement`.
   - Speed Strategy (speed-first): `/trellis:start` -> `ff-fast+n|ff-fast=c` -> `bash .trellis/scripts/flow_feature_init.sh --strategy fast "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]` -> `python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8` -> `/speckit.implement` -> `$finish-work`.
3. Upgrade rule (mandatory): if ambiguity appears, cross-layer contracts change (API/Action/DB signature/payload/env), or delivery risk increases, immediately switch from Speed Strategy to Strict Strategy.
4. Before implementation, run Trellis confirmation gate:
   `python3 ./.trellis/scripts/task.py flow-confirm` and wait for explicit approval.
5. For `flow-feature`, docs gate is mandatory before finish/archive:
   `python3 ./.trellis/scripts/task.py flow-guard --verify` must pass.
6. Speed Strategy uses only essential checks before handoff:
   - One success-path verification
   - One failure-path verification (readable stable error)
   - One boundary/edge verification
7. In `spec.md` / `plan.md` / `tasks.md`, explicitly include constraints for:
   frontend reuse/readability/performance, props typing, naming consistency, and
   detailed comments.
8. Spec-Kit tasks are iterative: if requirements/scope change mid-implementation,
   you MUST pause coding and update `spec.md` / `clarify.md` / `plan.md` /
   `tasks.md` first, then continue implementation.
9. Flow-feature shorthand is enabled:
   - `ff+n: <requirement>` = flow-feature with new branch
   - `ff=c: <requirement>` = flow-feature on current branch
   - `ff: <requirement>` (or `flow-feature: <requirement>`) requires an explicit
     branch-choice confirmation before proceeding.
   - `ff-fast: <requirement>` = force Speed Strategy (speed-first, essential checks only)
   - `ff-full: <requirement>` = force Strict Strategy (completeness proof + full checks)
   - `ff-fast+n: <requirement>` = Speed Strategy + new branch
   - `ff-fast=c: <requirement>` = Speed Strategy + current branch
   - `ff-full+n: <requirement>` = Strict Strategy + new branch
   - `ff-full=c: <requirement>` = Strict Strategy + current branch
   - If both are available, `ff-fast` and `ff-full` take precedence over generic `ff`.
10. Flow-lite / flow-bug shorthand follows the same branch-choice rule:
   - `fl+n` / `fl=c` / `fl`
   - `fb+n` / `fb=c` / `fb`
   - If no suffix is provided, branch choice must be confirmed first.
11. After implementation/check is done, the assistant MUST explicitly ask whether
    to run `$record-session`. Do not silently skip this prompt.
12. Default interaction style is conversational confirmation:
   - After task breakdown, list tasks and wait for user input (`执行` / `修改...`)
   - Continue implementation only after explicit user confirmation.
13. Task-list modification input should support two modes:
   - Natural language: `修改：...` (default, flexible)
   - Structured edits: `+` add / `-` remove / `~` rewrite / `>` reorder / `!` reopen
   - Structured edits should be applied via:
     `python3 ./.trellis/scripts/task.py flow-edit-tasks "<ops>"`
14. For `ff+n` (new branch), if auto-generated Spec-Kit branch short-name is empty
   or invalid, the assistant should fall back to a valid deterministic short-name
   (for example `feature-<hash>`), and ask user to override only when needed.
   Recommended helper:
   `bash .trellis/scripts/flow_feature_create.sh "<requirement>" [short-name]`

### Backend Contract Rules

1. API Route / Server Action responses MUST follow unified shape:
   `success`, `code`, `message`, `data|error`, `meta`.
2. Reuse shared contracts/helpers:
   - `src/types/api.ts`
   - `src/server/http/api-response.ts`
3. Error responses MUST provide stable machine-readable `code`; never rely on
   message text only.
4. Multi-entity DB writes MUST be wrapped in Prisma transactions.

### Code Style Rules

1. Backend/service exported declarations SHOULD use Chinese JSDoc template:
   `功能 / 输入 / 输出 / 异常 / 副作用`.
2. Preserve strict TypeScript boundaries; avoid `any` in business logic.
3. Do not manually edit generated files under `src/generated/prisma/**`.

### Frontend Component Rules

1. React components MUST prioritize high reuse, high readability, and practical
   performance.
2. Do not over-split components; split only when there is clear domain
   boundary, reuse value, or significant readability/testability gain.
3. All component props MUST define a type ahead of implementation and use
   `<ComponentName>Props` naming.
4. Default to Server Components; only use Client Components for real
   interactivity/browser APIs.
5. Avoid ternary operators in JSX whenever possible; prefer:
   - early return
   - well-named boolean variables
   - helper render functions
6. If ternary is unavoidable, keep only single-level and very short ternaries.
7. Do not nest ternary operators.
8. For large lists, ensure stable keys and prefer pagination/virtualization over
   full rendering.

### State and Complexity Rules

1. Separate UI local state, server data state, and form/action state; do not
   overload one state model for all concerns.
2. When global client state is needed, use Zustand as the default store;
   keep server data in Server Components/Actions instead of long-lived client
   caches.
3. Zustand stores should be feature-scoped with typed selectors; avoid one
   giant monolithic store.
4. Functions with high complexity (e.g., very long body or deep nesting) MUST
   be split into named helpers to improve readability and maintainability.

### Testing Baseline Rules

1. Changes should cover at least: one success path, one failure path, and one
   boundary/edge case validation (test or equivalent explicit verification).

### Naming Rules (Frontend + Backend)

1. Names must stay readable while being concise:
   - avoid overly long names unless needed for disambiguation
   - avoid meaningless short names (`a`, `tmp`, `val`) in business logic
2. Prefer domain terms plus role suffixes, e.g. `chapterStats`,
   `analysisState`, `parseResult`.
3. Keep naming consistent across layers for the same concept (UI, action, API,
   service, DB mapping).

### Comment and Reproducibility Rules

1. When generating code, include detailed comments for:
   - business intent
   - key input/output constraints
   - error and edge-case handling
   - side effects (DB write, network call, cache revalidation)
2. Public functions/classes SHOULD include structured JSDoc.
3. Non-trivial logic MUST include enough context so another engineer can
   reproduce and debug behavior quickly.
